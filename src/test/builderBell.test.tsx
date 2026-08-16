import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import AutomationBuilderPage from '../pages/AutomationBuilderPage';
import { useBuilderNotifications } from '../components/automation-builder/useBuilderNotifications';
import { renderHook, waitFor as waitForHook } from '@testing-library/react';
import { FlowNotReadyError, type AutomationFlow, type FlowProblem } from '../lib/api';
import type { FlowGraph } from '../lib/flowSchema';

/* The top right of the builder, after Review became a bell.
 *
 * "Review" named a chore and hid what Populr actually wanted; a bell with a
 * count says the same thing the way every other product a creator uses says
 * it. What matters is that the swap is only presentational where it should be
 * and load-bearing where it must be:
 *
 *  - the feed is derived from the server's activation problems, so it can
 *    never claim a flow is ready that Activate would refuse;
 *  - a notification is an index into the canvas — tapping one goes to the
 *    step and asks the question there, which is the only place it can be
 *    answered;
 *  - answering one takes it off the count;
 *  - and Activate still asks the server. It opens the feed when it's refused
 *    rather than deciding for itself that it would be.
 */

const canvas = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));

vi.mock('../components/automation-builder/FlowCanvas', () => ({
  // React Flow needs a real viewport to measure; the page's contract with it
  // is what this file is about, so the canvas is stood in for and its props
  // are asserted directly — including the pan request a notification makes.
  default: (props: Record<string, unknown>) => {
    canvas.props = props;
    return (
      <div
        data-testid="canvas"
        data-focus-node={String(props.focusNodeId ?? '')}
        data-focus-signal={String(props.focusSignal ?? 0)}
      />
    );
  },
}));

function graphFixture(): FlowGraph {
  return {
    schemaVersion: 1,
    nodes: [
      {
        id: 'trigger', type: 'trigger', position: { x: 0, y: 0 },
        config: { kind: 'comment', accountId: null, platform: null, allPosts: true, keywords: ['guide'], matchMode: 'contains' },
      },
      { id: 'send', type: 'send', position: { x: 280, y: 0 }, config: { kind: 'dm', text: '' } },
    ],
    edges: [{ id: 'e1', source: 'trigger', target: 'send', branch: 'next' }],
  };
}

const NEEDS_ACCOUNT = 'Choose which connected account this automation watches.';
const NEEDS_MESSAGE = 'This Send step is empty — write the message.';

let serverProblems: FlowProblem[] = [];
let serverGraph: FlowGraph = graphFixture();

function flowFixture(): AutomationFlow {
  return {
    id: 'flow_1', name: 'Free Creator Guide', status: 'draft',
    accountId: null, platform: null, graph: serverGraph, version: 1,
    legacyAutomationId: null, activatedAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } as unknown as AutomationFlow;
}

const activateFlowMock = vi.fn();
/** Held open so a test can look at the builder mid-compose. */
let finishCompose: ((result: unknown) => void) | null = null;
const composeFlowMock = vi.fn(async () => new Promise(resolve => { finishCompose = resolve; }));
const updateFlowMock = vi.fn(async (_id: string, patch: { graph: FlowGraph; name: string }) => {
  serverGraph = patch.graph;
  return { flow: { ...flowFixture(), name: patch.name } };
});
const testFlowMock = vi.fn(async () => ({ matched: true, reason: null, steps: [] }));
const sendInboxReplyMock = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchFlow: vi.fn(async () => flowFixture()),
    updateFlow: (...args: [string, { graph: FlowGraph; name: string }]) => updateFlowMock(...args),
    fetchFlowValidation: vi.fn(async () => ({ ok: serverProblems.length === 0, problems: serverProblems })),
    activateFlow: (...args: unknown[]) => activateFlowMock(...args),
    composeFlow: (...args: unknown[]) => composeFlowMock(...(args as [])),
    testFlow: (...args: unknown[]) => testFlowMock(...(args as [])),
    sendInboxReply: (...args: unknown[]) => sendInboxReplyMock(...args),
    fetchConnectedAccounts: vi.fn(async () => [{
      id: 'acc_1', platform: 'instagram', username: 'populr.space', display_name: null,
      avatar_url: null, is_connected: true, status: 'connected', connected_at: null,
    }]),
    fetchCapabilities: vi.fn(async () => []),
    fetchFlowBuilderMeta: vi.fn(async () => ({ aiConfigured: true, tags: [] })),
    fetchPostsLibrary: vi.fn(async () => []),
    // The top bar's Inbox badge asks for the waiting conversations, and the
    // drawer renders them — so these are shaped like real ones.
    fetchInbox: vi.fn(async () => ({
      items: ['jordan', 'maya', 'alex'].map((handle, i) => ({
        id: `i${i + 1}`, contact_id: `c${i + 1}`, contact_handle: handle, contact_name: handle,
        platform: 'instagram', channel: 'dm', message_text: `${handle} said something`,
        needs_reply: true, needs_reply_reason: 'no_rule_matched', suggested_reply: null,
        post_caption: null, created_at: new Date().toISOString(),
      })),
    })),
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

beforeEach(() => {
  vi.clearAllMocks();
  canvas.props = null;
  finishCompose = null;
  // The builder reads the viewport width to decide whether the notifications
  // feed and a step's settings fit side by side. Stated rather than inherited
  // from jsdom's 1024 default, which is narrower than the threshold — these
  // tests are about the feed→step flow, not about narrow layout.
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  serverGraph = graphFixture();
  serverProblems = [
    { nodeId: 'trigger', message: NEEDS_ACCOUNT },
    { nodeId: 'send', message: NEEDS_MESSAGE },
  ];
  mockUseApp.mockReturnValue({ showToast: vi.fn() });
});

describe('the builder’s top bar', () => {
  it('offers Preview, a bell and Activate — and no Review', async () => {
    mountBuilder();
    await screen.findByText('Preview');

    expect(screen.queryByText('Review')).not.toBeInTheDocument();
    expect(screen.getByText('Activate')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Notifications,/)).toBeInTheDocument();
  });

  it('offers no second inbox surface — Inbox is the nav\'s job now', async () => {
    // There used to be an Inbox button here that opened a drawer copy of the
    // /inbox page over the canvas: two inboxes. The rail carries Inbox as a
    // navigation destination (badge included); the top bar answers only
    // questions about THIS automation.
    mountBuilder();
    await screen.findByText('Preview');

    expect(screen.queryByLabelText(/^Inbox/)).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Inbox' })).not.toBeInTheDocument();
  });

  it('counts what is unresolved on the bell', async () => {
    mountBuilder();
    const bell = await screen.findByLabelText('Notifications, 2 unread');
    expect(bell).toHaveTextContent('2');
  });

  it('shows a plain bell when nothing needs the creator', async () => {
    serverProblems = [];
    mountBuilder();
    expect(await screen.findByLabelText('Notifications, nothing unread')).toBeInTheDocument();
  });
});

describe('the notification feed', () => {
  it('asks in Populr’s words rather than reciting the validator', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await user.click(await screen.findByLabelText('Notifications, 2 unread'));

    expect(await screen.findByText('Which connected account should this automation use?')).toBeInTheDocument();
    expect(screen.getByText('What should this message say?')).toBeInTheDocument();
    // The words the server chose stay on the server.
    expect(screen.queryByText(NEEDS_ACCOUNT)).not.toBeInTheDocument();
  });

  it('says so plainly when there is nothing to say', async () => {
    serverProblems = [];
    const user = userEvent.setup();
    mountBuilder();
    await user.click(await screen.findByLabelText('Notifications, nothing unread'));

    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
  });

  it('takes the creator to the step, and asks the question there', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await user.click(await screen.findByLabelText('Notifications, 2 unread'));
    await user.click(await screen.findByText('Which connected account should this automation use?'));

    // Panned to the step it belongs to…
    await waitFor(() =>
      expect(screen.getByTestId('canvas')).toHaveAttribute('data-focus-node', 'trigger'));
    expect(Number(screen.getByTestId('canvas').getAttribute('data-focus-signal'))).toBeGreaterThan(0);

    // …selected it, and opened the question ON it. The feed is an index; this
    // is where the answer happens.
    expect(screen.getByLabelText('When settings')).toBeInTheDocument();
    expect(screen.getByText('Populr asks')).toBeInTheDocument();
    expect(screen.getAllByText('Which connected account should this automation use?').length).toBeGreaterThan(1);
  });

  it('answering one takes it off the count and leaves it answered in the feed', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await user.click(await screen.findByLabelText('Notifications, 2 unread'));
    await user.click(await screen.findByText('Which connected account should this automation use?'));

    // The server stops asking once the account is chosen — the same order of
    // events as production: edit, autosave, re-validate.
    serverProblems = [{ nodeId: 'send', message: NEEDS_MESSAGE }];
    await user.click(screen.getByLabelText('Account'));
    await user.click(screen.getByText('@populr.space'));

    await waitFor(() => expect(updateFlowMock).toHaveBeenCalled(), { timeout: 3000 });
    await waitFor(() => expect(screen.getByLabelText('Notifications, 1 unread')).toBeInTheDocument());
    expect(await screen.findByText('Account chosen')).toBeInTheDocument();
  });
});

describe('Activate', () => {
  it('does not go live when the server says it is not ready — it opens the feed', async () => {
    activateFlowMock.mockRejectedValueOnce(
      new FlowNotReadyError([{ nodeId: 'trigger', message: NEEDS_ACCOUNT }]),
    );
    const showToast = vi.fn();
    mockUseApp.mockReturnValue({ showToast });
    const user = userEvent.setup();
    mountBuilder();

    await user.click(await screen.findByText('Activate'));

    expect(activateFlowMock).toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalledWith('Automation activated', 'success');
    // Not a modal, not a wall of validation — the feed, opened on the thing
    // standing in the way, one tap from the step that fixes it.
    expect(await screen.findByLabelText('Notifications')).toBeInTheDocument();
    await user.click(screen.getByText('Which connected account should this automation use?'));
    expect(screen.getByLabelText('When settings')).toBeInTheDocument();
  });

  it('still activates when the server is happy', async () => {
    serverProblems = [];
    activateFlowMock.mockResolvedValueOnce({ flow: flowFixture(), legacyPaused: false });
    const showToast = vi.fn();
    mockUseApp.mockReturnValue({ showToast });
    const user = userEvent.setup();
    mountBuilder();

    await user.click(await screen.findByText('Activate'));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Automation activated', 'success'));
  });
});

describe('while Populr is building the automation', () => {
  it('says so on the canvas, and stops saying it when the change lands', async () => {
    const user = userEvent.setup();
    mountBuilder();
    await screen.findByText('Preview');

    await user.type(
      screen.getByLabelText('Ask Populr to build or change anything…'),
      'follow up if they don\'t reply{Enter}',
    );

    // A still canvas and a spinner inside a button read as nothing happening.
    expect(await screen.findByText('Populr is making that change')).toBeInTheDocument();

    finishCompose?.({
      applied: true, summary: 'Added a follow-up.', source: 'model', operations: [],
      touchedNodeIds: [], flow: flowFixture(),
    });

    await waitFor(() =>
      expect(screen.queryByText('Populr is making that change')).not.toBeInTheDocument());
  });
});

describe('the count itself', () => {
  const problem = (nodeId: string, message: string): FlowProblem => ({ nodeId, message });

  it('drops as questions are answered, and disappears at zero', async () => {
    const graph = graphFixture();
    const { result, rerender } = renderHook(
      ({ problems }: { problems: FlowProblem[] }) => useBuilderNotifications(problems, graph),
      { initialProps: { problems: [problem('trigger', NEEDS_ACCOUNT), problem('send', NEEDS_MESSAGE)] } },
    );

    await waitForHook(() => expect(result.current.unresolvedCount).toBe(2));

    rerender({ problems: [problem('send', NEEDS_MESSAGE)] });
    await waitForHook(() => expect(result.current.unresolvedCount).toBe(1));
    // Answered, not vanished: the feed keeps it briefly so answering lands.
    expect(result.current.feed.some(n => n.kind === 'resolved' && n.title === 'Account chosen')).toBe(true);

    rerender({ problems: [] });
    await waitForHook(() => expect(result.current.unresolvedCount).toBe(0));
    expect(result.current.feed.every(n => n.kind === 'resolved')).toBe(true);
  });

  it('never counts a resolved item, so the badge is always clearable', async () => {
    const graph = graphFixture();
    const { result, rerender } = renderHook(
      ({ problems }: { problems: FlowProblem[] }) => useBuilderNotifications(problems, graph),
      { initialProps: { problems: [problem('send', NEEDS_MESSAGE)] } },
    );
    await waitForHook(() => expect(result.current.unresolvedCount).toBe(1));

    rerender({ problems: [] });
    await waitForHook(() => expect(result.current.unresolvedCount).toBe(0));
    expect(result.current.feed.length).toBe(1);
  });
});
