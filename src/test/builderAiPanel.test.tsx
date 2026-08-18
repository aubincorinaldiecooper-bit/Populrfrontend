import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { render } from './render';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import AutomationBuilderPage from '../pages/AutomationBuilderPage';
import type { AutomationFlow } from '../lib/api';
import type { FlowGraph } from '../lib/flowSchema';

/* Ask Populr, as a collapsible conversation.
 *
 * The AI used to be a floating composer parked over the bottom of the canvas —
 * always present, always costing attention. It is now a small launcher in the
 * canvas's bottom-right corner and a right-side chat panel the creator opens
 * and closes on demand. What these tests pin:
 *
 *   - collapsed is the default, and collapsed means GONE: no composer, no
 *     panel, just the launcher — the canvas has every pixel;
 *   - the conversation is real history — the creator's words, then what
 *     Populr did in its own words, never the operation JSON;
 *   - the panel knows which step is selected, says so, and sends the
 *     selection along so "make this warmer" lands on the right step;
 *   - work that finishes while the panel is collapsed earns a quiet dot on
 *     the launcher — news, not noise;
 *   - an empty canvas opens on the conversation, because "describe it in
 *     your own words" IS the first-run experience.
 */

const canvas = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));

vi.mock('../components/automation-builder/FlowCanvas', () => ({
  default: (props: Record<string, unknown>) => {
    canvas.props = props;
    return <div data-testid="canvas">{props.editorSlot as React.ReactNode}</div>;
  },
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
    ],
    edges: [{ id: 'e1', source: 'trigger', target: 'send', branch: 'next' }],
  };
}

const fixtures = vi.hoisted(() => ({ empty: false }));

function flowFixture(): AutomationFlow {
  return {
    id: 'flow_1', name: 'Free Creator Guide', status: 'draft',
    accountId: 'acc_1', platform: 'instagram',
    graph: fixtures.empty ? { schemaVersion: 1, nodes: [], edges: [] } : graphFixture(),
    version: 1, legacyAutomationId: null, activatedAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } as unknown as AutomationFlow;
}

/** Held open so a test can look at the builder mid-draft. */
let finishPropose: ((result: unknown) => void) | null = null;
let rejectPropose: ((err: unknown) => void) | null = null;
const proposeFlowMock = vi.fn(async () =>
  new Promise((resolve, reject) => { finishPropose = resolve; rejectPropose = reject; }));
const commitProposalMock = vi.fn(async () => ({
  applied: true, flow: flowFixture(), touchedNodeIds: ['wait-1'], operations: [],
  summary: "Built it — it's on your canvas.",
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchFlow: vi.fn(async () => flowFixture()),
    updateFlow: vi.fn(async () => ({ flow: flowFixture() })),
    fetchFlowValidation: vi.fn(async () => ({ ok: true, problems: [] })),
    proposeFlow: (...args: unknown[]) => proposeFlowMock(...(args as [])),
    commitProposal: (...args: unknown[]) => commitProposalMock(...(args as [])),
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

function selectNode(id: string | null) {
  act(() => {
    (canvas.props?.onSelect as (id: string | null) => void)(id);
  });
}

function setViewportWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true });
}

const COMPOSER_LABEL = 'Ask Populr to build or change anything…';

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Ask Populr/ }));
  return screen.findByRole('complementary', { name: 'Ask Populr' });
}

/** The agent answers with a DRAFT — the canvas does not move here. */
function answer(result: Record<string, unknown>) {
  const summary = (result.summary as string) ?? 'Drafted 1 step.';
  act(() => {
    finishPropose?.({
      proposal: {
        id: 'p1', status: 'awaiting_confirmation', prompt: '', revision: 1,
        plan: [{ id: 'item-1', label: 'Wait 1 day', operationIds: [0], proposedNodeId: 'wait-1' }],
        operations: [], assumptions: [],
        summary, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
      clarification: false, summary, source: 'intent', progress: [],
      ...result,
    });
  });
}

/** Draft, then Build this — the two-step path that changes the canvas. */
async function answerAndBuild(user: ReturnType<typeof userEvent.setup>, result: Record<string, unknown>) {
  answer(result);
  await user.click(await screen.findByRole('button', { name: 'Build this' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  canvas.props = null;
  finishPropose = null;
  rejectPropose = null;
  fixtures.empty = false;
  setViewportWidth(1440);
  mockUseApp.mockReturnValue({ showToast: vi.fn() });
});

describe('collapsed by default', () => {
  it('shows a launcher and no composer — the canvas has every pixel', async () => {
    mountBuilder();
    await screen.findByText('Preview');

    expect(screen.getByRole('button', { name: 'Ask Populr' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask Populr' })).toHaveAttribute('title', 'Ask Populr');
    expect(screen.queryByLabelText(COMPOSER_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Ask Populr' })).not.toBeInTheDocument();
  });

  it('opens the conversation from the launcher, and the launcher steps aside', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');

    await openPanel(user);

    expect(screen.getByLabelText(COMPOSER_LABEL)).toBeInTheDocument();
    // One entry point at a time: the panel's collapse control takes over.
    expect(screen.queryByRole('button', { name: /^Ask Populr/ })).not.toBeInTheDocument();
  });

  it('collapses from the panel header, and the launcher returns', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);

    const collapse = screen.getByRole('button', { name: 'Collapse AI' });
    expect(collapse).toHaveAttribute('title', 'Collapse chat');
    await user.click(collapse);

    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Ask Populr' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Ask Populr' })).toBeInTheDocument();
  });
});

describe('the conversation', () => {
  it('keeps the exchange — their words, then what Populr did, never the operations', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);

    await user.type(screen.getByLabelText(COMPOSER_LABEL), 'Add a follow-up after 2 days.{Enter}');
    answer({
      summary: 'Added a 2-day wait and follow-up DM.',
      operations: [{ op: 'create_node', id: 'wait-1', type: 'wait', config: { kind: 'duration', minutes: 2880 } }],
      touchedNodeIds: ['wait-1'],
    });

    // Await the answer first: the prompt renders in the transient working
    // article during compose, then remounts in the settled history article.
    expect(await screen.findByText('Added a 2-day wait and follow-up DM.')).toBeInTheDocument();
    expect(screen.getByText('Add a follow-up after 2 days.')).toBeInTheDocument();
    expect(screen.queryByText(/create_node/)).not.toBeInTheDocument();

    // The next request continues the same conversation.
    await user.type(screen.getByLabelText(COMPOSER_LABEL), 'Make that message warmer.{Enter}');
    answer({ summary: 'Updated the follow-up message.', touchedNodeIds: ['send'] });

    expect(await screen.findByText('Updated the follow-up message.')).toBeInTheDocument();
    expect(screen.getByText('Add a follow-up after 2 days.')).toBeInTheDocument();
    expect(screen.getByText('Added a 2-day wait and follow-up DM.')).toBeInTheDocument();
  });

  it('survives collapse — the history is still there when it reopens', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);
    await user.type(screen.getByLabelText(COMPOSER_LABEL), 'Add a follow-up.{Enter}');
    answer({ summary: 'Added a follow-up.', touchedNodeIds: ['wait-1'] });
    await screen.findByText('Added a follow-up.');

    await user.click(screen.getByRole('button', { name: 'Collapse AI' }));
    await openPanel(user);

    expect(await screen.findByText('Add a follow-up.')).toBeInTheDocument();
    expect(screen.getByText('Added a follow-up.')).toBeInTheDocument();
  });

  it('offers Undo on the latest answer that changed something', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);
    await user.type(screen.getByLabelText(COMPOSER_LABEL), 'Add a follow-up.{Enter}');
    await answerAndBuild(user, { summary: 'Drafted a follow-up.' });
    await screen.findByText("Built it — it's on your canvas.");

    expect(screen.getByText('Undo')).toBeInTheDocument();
    expect(screen.getByText('View changes')).toBeInTheDocument();
  });

  it('keeps that Undo across a collapse — closing a panel must not cost an undo', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);
    await user.type(screen.getByLabelText(COMPOSER_LABEL), 'Add a follow-up.{Enter}');
    await answerAndBuild(user, { summary: 'Drafted a follow-up.' });
    await screen.findByText('Undo');

    await user.click(screen.getByRole('button', { name: 'Collapse AI' }));
    await openPanel(user);

    expect(await screen.findByText('Undo')).toBeInTheDocument();
    expect(screen.getByText('View changes')).toBeInTheDocument();
  });

  it("withdraws the answer's Undo once a later edit would be the one undone", async () => {
    // The button sits ON the AI's answer, but undo pops the shared stack —
    // after the creator's own edit, clicking it would revert THAT. It goes;
    // the full record stays behind View changes.
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);
    await user.type(screen.getByLabelText(COMPOSER_LABEL), 'Add a follow-up.{Enter}');
    await answerAndBuild(user, { summary: 'Drafted a follow-up.' });
    await screen.findByText('Undo');

    // A recorded manual edit, the way the canvas makes one.
    act(() => {
      (canvas.props?.onConnect as (s: string, t: string, b: string) => void)('trigger', 'send', 'next');
    });

    await waitFor(() => expect(screen.queryByText('Undo')).not.toBeInTheDocument());
    expect(screen.getByText('View changes')).toBeInTheDocument();
  });

  it('a request that dies on the network still gets an answer in the thread', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);

    await user.type(screen.getByLabelText(COMPOSER_LABEL), 'Add a follow-up.{Enter}');
    act(() => { rejectPropose?.(new Error('The server is unreachable.')); });

    // The failure is part of the conversation — a silently re-enabled input
    // reads as being ignored.
    expect(await screen.findByText('The server is unreachable.')).toBeInTheDocument();
    expect(screen.getByText('Add a follow-up.')).toBeInTheDocument();
    // Nothing changed, so nothing offers to be undone.
    expect(screen.queryByText('Undo')).not.toBeInTheDocument();
  });

  it('says it is working, in the panel', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);

    await user.type(screen.getByLabelText(COMPOSER_LABEL), 'Add a follow-up.{Enter}');

    expect(await screen.findByText('Working…')).toBeInTheDocument();
    expect(screen.getByLabelText('Populr is building…')).toBeInTheDocument();
  });
});

describe('selection context', () => {
  it('names the selected step, and sends the request to it', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);

    selectNode('send');

    // The panel stays open — the selection is its context, not a competitor —
    // and says which step the next request lands on.
    expect(screen.getByRole('complementary', { name: 'Ask Populr' })).toBeInTheDocument();
    expect(await screen.findByText('Editing: Message')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Ask Populr to change this step…'), 'Make this less formal.{Enter}');

    expect(proposeFlowMock).toHaveBeenCalledWith('flow_1', {
      prompt: 'Make this less formal.', selectedNodeId: 'send', proposalId: null,
    });
  });

  it('drops the pill when nothing is selected — requests are automation-wide', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);
    selectNode('send');
    await screen.findByText('Editing: Message');

    selectNode(null);

    await waitFor(() => expect(screen.queryByText('Editing: Message')).not.toBeInTheDocument());
    await user.type(screen.getByLabelText(COMPOSER_LABEL), 'Rename it.{Enter}');
    expect(proposeFlowMock).toHaveBeenCalledWith('flow_1', {
      prompt: 'Rename it.', selectedNodeId: null, proposalId: null,
    });
  });

  it('yields the one narrow-screen slot to the step the creator clicked', async () => {
    setViewportWidth(900);
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);

    selectNode('send');

    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Ask Populr' })).not.toBeInTheDocument());
    // One tap brings it back.
    expect(screen.getByRole('button', { name: /^Ask Populr/ })).toBeInTheDocument();
  });
});

describe('while collapsed', () => {
  it('a result that lands after collapsing earns a quiet dot; reading it clears it', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);
    await user.type(screen.getByLabelText(COMPOSER_LABEL), 'Add a follow-up.{Enter}');

    // Collapse mid-build; the answer arrives while nobody is watching.
    await user.click(screen.getByRole('button', { name: 'Collapse AI' }));
    answer({ summary: 'Added a follow-up.', touchedNodeIds: ['wait-1'] });

    expect(await screen.findByRole('button', { name: 'Ask Populr — new result' })).toBeInTheDocument();

    // Opening the panel is reading the news; collapsing again shows no dot.
    await openPanel(user);
    expect(await screen.findByText('Added a follow-up.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Collapse AI' }));
    expect(await screen.findByRole('button', { name: 'Ask Populr' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask Populr — new result' })).not.toBeInTheDocument();
  });
});

describe('the first run', () => {
  it('an empty canvas opens on the conversation, asking what should happen', async () => {
    fixtures.empty = true;
    const user = userEvent.setup();
    mountBuilder();

    expect(await screen.findByRole('complementary', { name: 'Ask Populr' })).toBeInTheDocument();
    expect(screen.getByText('What should happen?')).toBeInTheDocument();

    // A suggestion is a starting point, not a command: it fills the input.
    await user.click(screen.getByText('Message someone when they comment a keyword'));
    expect(screen.getByLabelText(COMPOSER_LABEL)).toHaveValue('Message someone when they comment a keyword');
    expect(proposeFlowMock).not.toHaveBeenCalled();
  });

  it('a canvas with steps opens quiet — the launcher waits in the corner', async () => {
    mountBuilder();
    await screen.findByText('Preview');

    expect(screen.queryByRole('complementary', { name: 'Ask Populr' })).not.toBeInTheDocument();
    expect(screen.queryByText('What should happen?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask Populr' })).toBeInTheDocument();
  });
});

describe('one region, shared politely', () => {
  it('Preview replaces the conversation, and the launcher comes back', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);

    await user.click(screen.getByText('Preview'));

    expect(await screen.findByRole('complementary', { name: 'Preview' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Ask Populr' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ask Populr/ })).toBeInTheDocument();
  });

  it('on a wide screen the conversation stays open beside a selected step', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await openPanel(user);

    selectNode('trigger');

    expect(screen.getByRole('complementary', { name: 'Ask Populr' })).toBeInTheDocument();
    expect(await screen.findByText('When')).toBeInTheDocument();
  });
});
