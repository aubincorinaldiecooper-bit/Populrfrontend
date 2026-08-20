import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { render } from './render';
import { setViewportWidth } from './viewport';
import AutomationBuilderPage from '../pages/AutomationBuilderPage';
import { appContext } from './appContext.mock';
import type { AutomationFlow, CommentThread, WorkspaceAccess } from '../lib/api';
import type { FlowGraph } from '../lib/flowSchema';

/* Notes on a screen with no room to float them.
 *
 * A pin still belongs where the feedback was left — that is true of a phone
 * and a 30-inch monitor alike, and it is the whole point of putting notes on
 * the canvas. What cannot survive a narrow screen is the CONVERSATION: a
 * 300px card floating beside a pin, on a canvas a thumb can barely pan, hides
 * the thing being talked about.
 *
 * So the container changes and nothing else does. The thread and the composer
 * come up from the bottom — the same components, the same replies, the same
 * Resolve — and the canvas layer stops drawing them where they would not fit.
 */

const canvas = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));

vi.mock('../components/automation-builder/FlowCanvas', () => ({
  // React Flow needs a real viewport to measure, and what matters here is the
  // page's contract with it: which of the notes it is still asked to draw.
  default: (props: Record<string, unknown>) => {
    canvas.props = props;
    return <div data-testid="canvas" />;
  },
}));

const graph: FlowGraph = {
  schemaVersion: 1,
  nodes: [
    {
      id: 'trigger', type: 'trigger', position: { x: 0, y: 0 },
      config: { kind: 'comment', accountId: 'acc_1', platform: 'instagram', allPosts: true, keywords: ['guide'], matchMode: 'contains' },
    },
    { id: 'send', type: 'send', position: { x: 280, y: 0 }, config: { kind: 'dm', text: 'Here you go' } },
  ],
  edges: [{ id: 'e1', source: 'trigger', target: 'send', branch: 'next' }],
};

function thread(): CommentThread {
  return {
    id: 't1',
    body: 'This opens too abruptly — can we say who we are first?',
    by: { name: 'Robin', email: 'robin@example.com', avatarUrl: null },
    you: false,
    at: new Date().toISOString(),
    nodeId: 'send',
    place: { relX: 0.5, relY: 0.5 },
    nodeMissing: false,
    resolved: false,
    resolvedBy: null,
    replies: [],
  } as unknown as CommentThread;
}

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchFlow: vi.fn(async () => ({
      id: 'flow_1', name: 'Culture comments', status: 'draft',
      accountId: null, platform: null, graph, version: 1,
      legacyAutomationId: null, activatedAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as unknown as AutomationFlow)),
    updateFlow: vi.fn(async () => {}),
    fetchFlowValidation: vi.fn(async () => ({ ok: true, problems: [] })),
    fetchActiveProposal: vi.fn(async () => ({ proposal: null })),
    fetchConnectedAccounts: vi.fn(async () => []),
    fetchCapabilities: vi.fn(async () => []),
    fetchFlowBuilderMeta: vi.fn(async () => ({ aiConfigured: true, tags: [] })),
    fetchPostsLibrary: vi.fn(async () => []),
    fetchCollaborators: vi.fn(async () => []),
    announcePresence: vi.fn(async () => {}),
    fetchInbox: vi.fn(async () => ({ items: [] })),
    fetchNotifications: vi.fn(async () => ({ notifications: [], unread: 0 })),
    fetchComments: vi.fn(async () => [thread()]),
  };
});

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({ useApp: () => mockUseApp() }));

const owner: WorkspaceAccess = {
  id: 'w_1', name: 'My Studio', role: 'owner',
  permissions: { editAutomations: true, contactOutreach: true },
  canvasAutomation: null,
} as unknown as WorkspaceAccess;

function mountBuilder() {
  mockUseApp.mockReturnValue(appContext({ showToast: vi.fn(), workspaceAccess: owner }));
  return render(
    <MemoryRouter initialEntries={['/automations/flow_1']}>
      <Routes>
        <Route path="/automations/:flowId" element={<AutomationBuilderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Open the index and pick the one note in it. */
async function openTheNote(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Notes/ }));
  await user.click(await screen.findByText(/This opens too abruptly/));
}

beforeEach(() => {
  vi.clearAllMocks();
  canvas.props = null;
});

describe('on a narrow screen', () => {
  beforeEach(() => setViewportWidth(420));

  it('brings the conversation up from the bottom instead of onto the canvas', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());

    await openTheNote(user);

    // The thread itself — same component, same words — reached through the
    // sheet's own label rather than a card floating over the canvas.
    const sheet = await screen.findByRole('dialog', { name: 'Note from Robin · Message' });
    expect(within(sheet).getByText(/This opens too abruptly/)).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Reply to this note')).toBeInTheDocument();
  });

  it('stops the canvas drawing a card there is no room for, and keeps the pins', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());
    await openTheNote(user);

    const layer = (canvas.props?.notesLayer ?? null) as { props?: Record<string, unknown> } | null;
    // The layer is still handed every thread — a pin is where the feedback
    // is, and that is as true on a phone — but told not to draw the card.
    expect(layer?.props?.cards).toBe(false);
    expect((layer?.props?.threads as unknown[])?.length).toBe(1);
  });
});

describe('on a screen with room', () => {
  beforeEach(() => setViewportWidth(1440));

  it('leaves the conversation on the canvas, beside its pin', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeInTheDocument());
    await openTheNote(user);

    const layer = (canvas.props?.notesLayer ?? null) as { props?: Record<string, unknown> } | null;
    expect(layer?.props?.cards).toBe(true);
    expect(layer?.props?.openId).toBe('t1');
    // Nothing came up from the bottom: the card belongs at the pin here.
    expect(screen.queryByRole('dialog', { name: /Note from Robin/ })).not.toBeInTheDocument();
  });
});
