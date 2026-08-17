import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import AutomationBuilderPage from '../pages/AutomationBuilderPage';
import type { AutomationFlow, FlowAiMessage } from '../lib/api';
import type { FlowGraph } from '../lib/flowSchema';

/* The conversation survives the browser.
 *
 * The Ask Populr history used to live only in React state: a refresh, a
 * navigation, a closed tab — and the record of how the automation was built
 * was gone. The server now owns one thread per automation
 * (automation_ai_messages), and the builder hydrates it on open. What these
 * tests pin:
 *
 *   - opening an automation shows its stored conversation — the same one,
 *     after any number of "reloads" (mounts);
 *   - a stored answer shows what actually happened ("Added Wait · 2 days"),
 *     and a node-scoped exchange says which step it edited;
 *   - a new exchange joins the stored ones — nothing duplicates, nothing
 *     disappears;
 *   - "Show earlier" walks back one page at a time and disappears when the
 *     history runs dry;
 *   - a history fetch failure opens an empty chat, never a broken builder.
 */

vi.mock('../components/automation-builder/FlowCanvas', () => ({
  default: (props: Record<string, unknown>) => <div data-testid="canvas">{props.editorSlot as React.ReactNode}</div>,
}));

function graphFixture(): FlowGraph {
  return {
    schemaVersion: 1,
    nodes: [
      {
        id: 'trigger', type: 'trigger', position: { x: 0, y: 0 },
        config: { kind: 'comment', accountId: 'acc_1', platform: 'instagram', allPosts: true,
          keywords: ['guide'], matchMode: 'contains' },
      },
      { id: 'send', type: 'send', position: { x: 280, y: 0 }, config: { kind: 'dm', text: 'Here you go' } },
      { id: 'wait-1', type: 'wait', position: { x: 560, y: 0 }, config: { kind: 'duration', minutes: 2880 } },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'send', branch: 'next' },
      { id: 'e2', source: 'send', target: 'wait-1', branch: 'next' },
    ],
  };
}

function flowFixture(): AutomationFlow {
  return {
    id: 'flow_1', name: 'Free Creator Guide', status: 'draft',
    accountId: 'acc_1', platform: 'instagram', graph: graphFixture(),
    version: 1, legacyAutomationId: null, activatedAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } as unknown as AutomationFlow;
}

function message(partial: Partial<FlowAiMessage> & { id: string; role: 'user' | 'assistant'; content: string }): FlowAiMessage {
  return {
    nodeId: null, operationSummary: null, authorId: null, source: null,
    createdAt: new Date(2026, 7, 16, 12, Number(partial.id)).toISOString(),
    ...partial,
  };
}

/** The stored conversation: one whole-flow exchange, one node-scoped one. */
function storedPage(): { messages: FlowAiMessage[]; hasMore: boolean } {
  return {
    messages: [
      message({ id: '1', role: 'user', content: 'Add a wait after the first DM', authorId: 'aubin' }),
      message({ id: '2', role: 'assistant', content: 'Added a Wait step after the Message step.',
        nodeId: 'wait-1', operationSummary: 'Added Wait after Message · 2 days', source: 'intent' }),
      message({ id: '3', role: 'user', content: 'Make this message friendlier', nodeId: 'send', authorId: 'aubin' }),
      message({ id: '4', role: 'assistant', content: 'Updated the message.',
        nodeId: 'send', operationSummary: 'Updated Message', source: 'intent' }),
    ],
    hasMore: false,
  };
}

const aiMessagesMock = vi.fn(async (): Promise<{ messages: FlowAiMessage[]; hasMore: boolean }> =>
  ({ messages: [], hasMore: false }));

let finishPropose: ((result: unknown) => void) | null = null;
const proposeFlowMock = vi.fn(async () => new Promise((resolve) => { finishPropose = resolve; }));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchFlow: vi.fn(async () => flowFixture()),
    updateFlow: vi.fn(async () => ({ flow: flowFixture() })),
    fetchFlowValidation: vi.fn(async () => ({ ok: true, problems: [] })),
    fetchFlowAiMessages: (...args: unknown[]) => aiMessagesMock(...(args as [])),
    proposeFlow: (...args: unknown[]) => proposeFlowMock(...(args as [])),
    commitProposal: vi.fn(async () => ({
      applied: true, flow: flowFixture(), touchedNodeIds: [], operations: [],
      summary: "Built it — it's on your canvas.",
    })),
    discardProposal: vi.fn(async () => ({ ok: true })),
    fetchActiveProposal: vi.fn(async () => ({ proposal: null })),
    testFlow: vi.fn(async () => ({ matched: true, reason: null, steps: [], awaitingReply: false })),
    fetchConnectedAccounts: vi.fn(async () => []),
    fetchCapabilities: vi.fn(async () => []),
    fetchFlowBuilderMeta: vi.fn(async () => ({ aiConfigured: true, tags: [] })),
    fetchPostsLibrary: vi.fn(async () => []),
  };
});

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({ useApp: () => mockUseApp() }));

function mountBuilder() {
  return render(
    <MemoryRouter initialEntries={['/automations/flow_1']}>
      <Routes>
        <Route path="/automations/:flowId" element={<AutomationBuilderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const COMPOSER_LABEL = 'Ask Populr to build or change anything…';

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Ask Populr/ }));
  return screen.findByRole('complementary', { name: 'Ask Populr' });
}

beforeEach(() => {
  vi.clearAllMocks();
  finishPropose = null;
  aiMessagesMock.mockImplementation(async () => ({ messages: [], hasMore: false }));
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  mockUseApp.mockReturnValue({ showToast: vi.fn() });
});

describe('the conversation survives a reload', () => {
  it('opening the automation shows its stored history', async () => {
    aiMessagesMock.mockImplementation(async () => storedPage());
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);

    expect(await screen.findByText('Add a wait after the first DM')).toBeInTheDocument();
    expect(screen.getByText('Added a Wait step after the Message step.')).toBeInTheDocument();
    expect(screen.getByText('Make this message friendlier')).toBeInTheDocument();
    expect(screen.getByText('Updated the message.')).toBeInTheDocument();
    // What actually happened, not prose — from the server's permanent record.
    expect(screen.getByText('Added Wait after Message · 2 days')).toBeInTheDocument();
    // The node-scoped exchange says which step it was about.
    expect(screen.getByText('Editing: Message')).toBeInTheDocument();
    // Idle on open: stored history never replays the working state.
    expect(screen.queryByText('Drafting your automation…')).not.toBeInTheDocument();
  });

  it('a second mount — a refresh — shows the same conversation', async () => {
    aiMessagesMock.mockImplementation(async () => storedPage());
    const user = userEvent.setup();
    const first = mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);
    await screen.findByText('Add a wait after the first DM');
    first.unmount();

    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);
    expect(await screen.findByText('Add a wait after the first DM')).toBeInTheDocument();
    expect(screen.getByText('Updated the message.')).toBeInTheDocument();
  });

  it('a new exchange joins the stored ones without duplicating them', async () => {
    aiMessagesMock.mockImplementation(async () => storedPage());
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);
    await screen.findByText('Add a wait after the first DM');

    await user.type(screen.getByLabelText(COMPOSER_LABEL), 'Add an If after this{Enter}');
    act(() => {
      finishPropose?.({
        proposal: {
          id: 'p1', status: 'awaiting_confirmation', prompt: '', revision: 1,
          plan: [{ id: 'item-1', label: 'If they reply', operationIds: [0] }],
          operations: [], assumptions: [],
          summary: 'Drafted an If step.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        clarification: false, summary: 'Drafted an If step.', source: 'intent', progress: [],
      });
    });

    expect(await screen.findByText('Drafted an If step.')).toBeInTheDocument();
    expect(screen.getAllByText('Add a wait after the first DM')).toHaveLength(1);
    expect(screen.getAllByText('Add an If after this')).toHaveLength(1);
  });

  it('history that fails to load opens an empty chat, not a broken builder', async () => {
    aiMessagesMock.mockImplementation(async () => { throw new Error('offline'); });
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);
    expect(screen.getByLabelText(COMPOSER_LABEL)).toBeInTheDocument();
    expect(screen.queryByText('Show earlier')).not.toBeInTheDocument();
  });
});

describe('pagination', () => {
  it('Show earlier walks back a page, then disappears when the history runs dry', async () => {
    const newest = {
      messages: [
        message({ id: '3', role: 'user' as const, content: 'Make this message friendlier', nodeId: 'send' }),
        message({ id: '4', role: 'assistant' as const, content: 'Updated the message.', nodeId: 'send', operationSummary: 'Updated Message' }),
      ],
      hasMore: true,
    };
    const earlier = {
      messages: [
        message({ id: '1', role: 'user' as const, content: 'Add a wait after the first DM' }),
        message({ id: '2', role: 'assistant' as const, content: 'Added a Wait step after the Message step.', operationSummary: 'Added Wait · 2 days' }),
      ],
      hasMore: false,
    };
    aiMessagesMock.mockImplementation(async (...args: unknown[]) => {
      const opts = args[1] as { before?: string } | undefined;
      return opts?.before ? earlier : newest;
    });

    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);
    await screen.findByText('Updated the message.');
    expect(screen.queryByText('Add a wait after the first DM')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show earlier' }));
    expect(await screen.findByText('Add a wait after the first DM')).toBeInTheDocument();
    // The cursor was the oldest loaded id, so the next page came before it.
    expect(aiMessagesMock).toHaveBeenLastCalledWith('flow_1', { before: '3' });
    // Still in order: earlier exchange above the newer one.
    const prompts = screen.getAllByText(/Add a wait after the first DM|Make this message friendlier/);
    expect(prompts[0]).toHaveTextContent('Add a wait after the first DM');
    // Dry — the button goes away.
    expect(screen.queryByText('Show earlier')).not.toBeInTheDocument();
  });
});
