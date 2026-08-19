import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { render } from './render';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import AutomationBuilderPage from '../pages/AutomationBuilderPage';
import type { AutomationFlow, ComposerProgressEvent, FlowProposal } from '../lib/api';
import type { FlowGraph } from '../lib/flowSchema';
import { appContext } from './appContext.mock';

/* The proposal-first composer, end to end through the page.
 *
 * The order of events is the product: the creator asks → the agent DRAFTS a
 * proposal → the human reads it and confirms → only then does Populr build.
 * Every test here pins one link of that chain:
 *
 *   - a prompt produces a draft and NOTHING else — no save, no new nodes,
 *     no commit; the card says so in as many words;
 *   - the build trace is the server's real event sequence, not a timer;
 *   - Change something keeps the conversation on the draft: the next prompt
 *     carries the proposal id and the input takes focus;
 *   - Build this is the only gate — it commits, the canvas moves, the new
 *     region is brought into view, and Undo works;
 *   - a refusal (stale draft / plain failure) leaves the canvas alone and is
 *     said where the creator will see it;
 *   - a refresh restores the waiting card without replaying the build;
 *   - activation stays a separate human decision;
 *   - and no provider name ever reaches the panel.
 */

const canvas = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));

vi.mock('../components/automation-builder/FlowCanvas', () => ({
  default: (props: Record<string, unknown>) => {
    canvas.props = props;
    return (
      <div
        data-testid="canvas"
        data-focus-node={String(props.focusNodeId ?? '')}
        data-focus-signal={String(props.focusSignal ?? 0)}
      >
        {props.editorSlot as React.ReactNode}
      </div>
    );
  },
}));

function graphFixture(): FlowGraph {
  return {
    schemaVersion: 1,
    nodes: [
      {
        id: 'trigger', type: 'trigger', position: { x: 0, y: 0 },
        config: { kind: 'comment', accountId: 'acc_1', platform: 'instagram', allPosts: true,
          keywords: ['book'], matchMode: 'contains' },
      },
      { id: 'send', type: 'send', position: { x: 280, y: 0 }, config: { kind: 'dm', text: 'Hi there' } },
    ],
    edges: [{ id: 'e1', source: 'trigger', target: 'send', branch: 'next' }],
  };
}

let serverGraph: FlowGraph = graphFixture();

function flowFixture(): AutomationFlow {
  return {
    id: 'flow_1', name: 'Bookings', status: 'draft',
    accountId: 'acc_1', platform: 'instagram', graph: serverGraph, version: 1,
    legacyAutomationId: null, activatedAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } as unknown as AutomationFlow;
}

/** The §25 shape in miniature: steps, a branch, an assumption the agent made. */
function proposalFixture(overrides: Partial<FlowProposal> = {}): FlowProposal {
  return {
    id: 'p1', status: 'awaiting_confirmation',
    prompt: 'ask when they want to book and mark repeat customers', revision: 1,
    plan: [
      { id: 'item-1', label: 'Message — "When would you like to book, and what\'s your budget?"', operationIds: [0] },
      { id: 'item-2', label: 'If they say "yes"', operationIds: [1] },
      { id: 'item-3', label: 'Tag them "repeat_customer"', operationIds: [2] },
    ],
    operations: [],
    assumptions: ["I'll treat a reply containing yes as a repeat customer and anything else as new."],
    summary: "Drafted 3 steps — review it and Build this when you're ready.",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function traceFixture(): ComposerProgressEvent[] {
  return [
    { id: 'ev-1', stage: 'planning', label: 'Planning 3 steps' },
    { id: 'ev-2', stage: 'drafting', label: 'Adding Message — "When would you like to book, and what\'s your budget?"', planItemId: 'item-1' },
    { id: 'ev-3', stage: 'drafting', label: 'Adding If they say "yes"', planItemId: 'item-2' },
    { id: 'ev-4', stage: 'drafting', label: 'Adding Tag them "repeat_customer"', planItemId: 'item-3' },
    { id: 'ev-5', stage: 'validating', label: 'Checking the flow fits together' },
    { id: 'ev-6', stage: 'complete', label: 'Ready for you' },
  ];
}

let finishPropose: ((result: unknown) => void) | null = null;
const proposeFlowMock = vi.fn(async () => new Promise(resolve => { finishPropose = resolve; }));
const commitProposalMock = vi.fn();
const discardProposalMock = vi.fn(async () => ({ ok: true }));
/** What a fresh mount finds waiting on the server. */
let activeProposal: FlowProposal | null = null;
const updateFlowMock = vi.fn(async (_id: string, patch: { graph: FlowGraph; name: string }) => {
  serverGraph = patch.graph;
  return { flow: { ...flowFixture(), name: patch.name } };
});
const activateFlowMock = vi.fn(async () => ({ flow: { ...flowFixture(), status: 'live' }, legacyPaused: false }));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchFlow: vi.fn(async () => flowFixture()),
    updateFlow: (...args: [string, { graph: FlowGraph; name: string }]) => updateFlowMock(...args),
    fetchFlowValidation: vi.fn(async () => ({ ok: true, problems: [] })),
    proposeFlow: (...args: unknown[]) => proposeFlowMock(...(args as [])),
    commitProposal: (...args: unknown[]) => commitProposalMock(...(args as [])),
    discardProposal: (...args: unknown[]) => discardProposalMock(...(args as [])),
    fetchActiveProposal: vi.fn(async () => ({ proposal: activeProposal })),
    fetchFlowAiMessages: vi.fn(async () => ({ messages: [], hasMore: false })),
    activateFlow: (...args: unknown[]) => activateFlowMock(...(args as [])),
    testFlow: vi.fn(async () => ({ matched: true, reason: null, steps: [] })),
    fetchConnectedAccounts: vi.fn(async () => [{
      id: 'acc_1', platform: 'instagram', username: 'populr.space', display_name: null,
      avatar_url: null, is_connected: true, status: 'connected', connected_at: null,
    }]),
    fetchCapabilities: vi.fn(async () => []),
    fetchFlowBuilderMeta: vi.fn(async () => ({ aiConfigured: true, tags: [] })),
    fetchPostsLibrary: vi.fn(async () => []),
    fetchInbox: vi.fn(async () => ({ items: [] })),
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

async function ask(user: ReturnType<typeof userEvent.setup>, prompt: string) {
  if (!screen.queryByLabelText(COMPOSER_LABEL)) {
    await user.click(await screen.findByRole('button', { name: /^Ask Populr/ }));
  }
  await user.type(await screen.findByLabelText(COMPOSER_LABEL), `${prompt}{Enter}`);
}

/** The agent's answer lands: a draft and the real events that built it. */
function draft(overrides: Record<string, unknown> = {}) {
  act(() => {
    finishPropose?.({
      proposal: proposalFixture(), clarification: false,
      summary: "Drafted 3 steps — review it and Build this when you're ready.",
      source: 'model', progress: traceFixture(),
      ...overrides,
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  canvas.props = null;
  finishPropose = null;
  activeProposal = null;
  serverGraph = graphFixture();
  commitProposalMock.mockImplementation(async () => ({
    applied: true, flow: flowFixture(), touchedNodeIds: [], operations: [],
    summary: "Built it — it's on your canvas.",
  }));
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  mockUseApp.mockReturnValue(appContext({ showToast: vi.fn() }));
});

describe('a prompt creates a proposal, not a change', () => {
  it('shows the draft as a checklist with its assumption — and touches nothing', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await ask(user, 'ask when they want to book and mark repeat customers');
    draft();

    // The confirmation card, derived from the real plan.
    expect(await screen.findByText('Ready for you')).toBeInTheDocument();
    expect(screen.getByText('Message — "When would you like to book, and what\'s your budget?"')).toBeInTheDocument();
    expect(screen.getByText('If they say "yes"')).toBeInTheDocument();
    expect(screen.getByText('Tag them "repeat_customer"')).toBeInTheDocument();
    // The assumption is surfaced, not buried in a log.
    expect(screen.getByText("I'll treat a reply containing yes as a repeat customer and anything else as new.")).toBeInTheDocument();
    // The card says exactly what the state is.
    expect(screen.getByText('Nothing is on the canvas yet.')).toBeInTheDocument();

    // And it is telling the truth: nothing was saved, nothing was committed.
    expect(updateFlowMock).not.toHaveBeenCalled();
    expect(commitProposalMock).not.toHaveBeenCalled();
  });

  it('the build trace is the server\'s real events, revealed after the work', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await ask(user, 'ask when they want to book');

    // In flight: the honest shimmer, no invented step rows.
    expect(await screen.findByText('Drafting your automation…')).toBeInTheDocument();
    expect(screen.queryByText(/^Adding /)).not.toBeInTheDocument();

    draft();

    // Settled: the drafting events, one row each, under a count that is theirs.
    expect(await screen.findByText('Drafted 3 steps')).toBeInTheDocument();
    expect(screen.getByText('Adding Message — "When would you like to book, and what\'s your budget?"')).toBeInTheDocument();
    expect(screen.getByText('Adding If they say "yes"')).toBeInTheDocument();
    expect(screen.getByText('Adding Tag them "repeat_customer"')).toBeInTheDocument();
    expect(screen.queryByText('Drafting your automation…')).not.toBeInTheDocument();
  });

  it('never lets a provider name reach the panel', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await ask(user, 'ask when they want to book');
    draft();
    await screen.findByText('Ready for you');

    expect(document.body.textContent).not.toMatch(/zernio|openrouter|OpenAI|gpt-/i);
  });
});

describe('Change something', () => {
  it('keeps the conversation on the draft: the next prompt revises it and the input takes focus', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await ask(user, 'ask when they want to book');
    draft();
    await screen.findByText('Ready for you');

    await user.click(screen.getByRole('button', { name: 'Change something' }));
    // The card stays; the composer is where the revision happens.
    expect(screen.getByText('Ready for you')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(COMPOSER_LABEL)).toHaveFocus());

    await user.type(screen.getByLabelText(COMPOSER_LABEL), 'make the first message shorter{Enter}');

    // The revision targets the DRAFT — the proposal id rides along.
    expect(proposeFlowMock).toHaveBeenLastCalledWith('flow_1', {
      prompt: 'make the first message shorter', selectedNodeId: null, proposalId: 'p1',
    });
    // And still nothing on the canvas.
    expect(updateFlowMock).not.toHaveBeenCalled();
    expect(commitProposalMock).not.toHaveBeenCalled();
  });

  it('the revised draft replaces the card', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await ask(user, 'ask when they want to book');
    draft();
    await screen.findByText("Here's the flow I drafted:");

    await user.type(screen.getByLabelText(COMPOSER_LABEL), 'make the wait longer{Enter}');
    act(() => {
      finishPropose?.({
        proposal: proposalFixture({
          revision: 2,
          plan: [{ id: 'item-1', label: 'Wait 2 days', operationIds: [0] }],
          assumptions: [],
        }),
        clarification: false, summary: 'Updated the draft — 1 step now. Build this when it looks right.',
        source: 'model', progress: [],
      });
    });

    expect(await screen.findByText("Here's the updated draft:")).toBeInTheDocument();
    expect(screen.getByText('Wait 2 days')).toBeInTheDocument();
    expect(screen.queryByText('If they say "yes"')).not.toBeInTheDocument();
  });
});

describe('Build this', () => {
  it('commits the draft, brings the new region into view, and can be undone', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await ask(user, 'ask when they want to book');
    draft();
    await screen.findByText('Ready for you');

    const builtGraph: FlowGraph = {
      ...graphFixture(),
      nodes: [
        ...graphFixture().nodes,
        { id: 'wait-1', type: 'wait', position: { x: 560, y: 0 }, config: { kind: 'duration', minutes: 1440 } },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'send', branch: 'next' },
        { id: 'e2', source: 'send', target: 'wait-1', branch: 'next' },
      ],
    };
    commitProposalMock.mockImplementation(async () => {
      serverGraph = builtGraph;
      return {
        applied: true, flow: flowFixture(), touchedNodeIds: ['wait-1'],
        operations: [{ op: 'create_node', id: 'wait-1', type: 'wait', config: { kind: 'duration', minutes: 1440 } }],
        summary: "Built it — it's on your canvas.",
      };
    });

    await user.click(screen.getByRole('button', { name: 'Build this' }));

    expect(commitProposalMock).toHaveBeenCalledWith('flow_1', 'p1');
    expect(await screen.findByText("Built it — it's on your canvas.")).toBeInTheDocument();
    // The card handed over to the conversation; the gate is spent.
    await waitFor(() => expect(screen.queryByText('Ready for you')).not.toBeInTheDocument());
    // §24: the new region is brought into view on the canvas.
    await waitFor(() =>
      expect(screen.getByTestId('canvas')).toHaveAttribute('data-focus-node', 'wait-1'));
    expect(Number(screen.getByTestId('canvas').getAttribute('data-focus-signal'))).toBeGreaterThan(0);
    // The change is one Undo away, exactly like a manual edit.
    expect(screen.getByText('Undo')).toBeInTheDocument();
  });

  it('a commit the server fails leaves the card up, the error on it, the canvas alone', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await ask(user, 'ask when they want to book');
    draft();
    await screen.findByText('Ready for you');

    commitProposalMock.mockRejectedValueOnce(new Error("Couldn't reach Populr."));
    await user.click(screen.getByRole('button', { name: 'Build this' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't reach Populr. Nothing was changed.");
    // The draft survives its failed commit — the creator can try again.
    expect(screen.getByRole('button', { name: 'Build this' })).toBeInTheDocument();
    expect(screen.queryByText("Built it — it's on your canvas.")).not.toBeInTheDocument();
    expect(updateFlowMock).not.toHaveBeenCalled();
  });

  it('a draft the canvas outgrew is retired, and the conversation says why', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await ask(user, 'ask when they want to book');
    draft();
    await screen.findByText('Ready for you');

    const { ApiError } = await import('../lib/api');
    commitProposalMock.mockRejectedValueOnce(new ApiError(
      'The canvas changed since this was drafted — ask Populr to draft it again.', 409, 'proposal_stale'));
    await user.click(screen.getByRole('button', { name: 'Build this' }));

    // Said in the conversation — the card is gone, so it cannot say it.
    expect(await screen.findByText('The canvas changed since this was drafted — ask Populr to draft it again.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Ready for you')).not.toBeInTheDocument());
    expect(updateFlowMock).not.toHaveBeenCalled();
  });

  it('building is not activating — the automation stays a draft until the creator says live', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await ask(user, 'ask when they want to book');
    draft();
    await user.click(await screen.findByRole('button', { name: 'Build this' }));
    await screen.findByText("Built it — it's on your canvas.");

    // The second gate is still standing, untouched.
    expect(activateFlowMock).not.toHaveBeenCalled();
    expect(screen.getByText('Activate')).toBeInTheDocument();
  });
});

describe('discard and refresh', () => {
  it('the X puts the draft away; the canvas never knew about it', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await ask(user, 'ask when they want to book');
    draft();
    await screen.findByText('Ready for you');

    await user.click(screen.getByLabelText('Discard this draft'));

    await waitFor(() => expect(screen.queryByText('Ready for you')).not.toBeInTheDocument());
    expect(discardProposalMock).toHaveBeenCalledWith('flow_1', 'p1');
    expect(updateFlowMock).not.toHaveBeenCalled();
    expect(commitProposalMock).not.toHaveBeenCalled();
  });

  it('a refresh restores the waiting card without replaying the build', async () => {
    activeProposal = proposalFixture();
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await user.click(await screen.findByRole('button', { name: /^Ask Populr/ }));

    // The same card, ready where the creator left it…
    expect(await screen.findByText('Ready for you')).toBeInTheDocument();
    expect(screen.getByText('If they say "yes"')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Build this' })).toBeInTheDocument();
    // …and no theatre: the build already happened, so nothing replays it.
    expect(screen.queryByText('Drafting your automation…')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Drafted \d+ steps?$/)).not.toBeInTheDocument();
  });

  it('the restored draft still commits', async () => {
    activeProposal = proposalFixture();
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');
    await user.click(await screen.findByRole('button', { name: /^Ask Populr/ }));
    await user.click(await screen.findByRole('button', { name: 'Build this' }));

    expect(commitProposalMock).toHaveBeenCalledWith('flow_1', 'p1');
    expect(await screen.findByText("Built it — it's on your canvas.")).toBeInTheDocument();
  });
});
