import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import AutomationBuilderPage from '../pages/AutomationBuilderPage';
import PreviewPanel from '../components/automation-builder/PreviewPanel';
import { buildConversation } from '../lib/previewConversation';
import type { AutomationFlow, FlowSimulationResult } from '../lib/api';
import type { FlowGraph } from '../lib/flowSchema';

/* Preview — what "Test" became.
 *
 * The creator plays the fan: they type what a fan would type, and watch the
 * automation answer. The runtime underneath is the same /test simulation,
 * running the real executors with sending switched off, and it now walks the
 * conversation the way the live engine does: each "did they reply?" is an
 * open question the walk PARKS on (awaitingReply) until the creator answers
 * it — with words, or by declining. Their answers ride along as `replies`,
 * one per question, each carrying its text.
 *
 * The regression that forced this shape: with one global "replied" flag, the
 * first answer played out the entire rest of the flow at once, the panel
 * stopped awaiting, and the creator's next message — an answer to question
 * two — was re-tried against the trigger and told it "doesn't contain" the
 * keyword. A reply mid-conversation must always be a reply.
 */

const DM = 'Here you go 👇';
const FOLLOW_UP = 'Just checking in — did you get a chance to look?';
const THANKS = 'Amazing — here’s the link';

function graphFixture(triggerKind: 'comment' | 'dm' = 'comment'): FlowGraph {
  return {
    schemaVersion: 1,
    nodes: [
      {
        id: 'trigger', type: 'trigger', position: { x: 0, y: 0 },
        config: {
          kind: triggerKind, accountId: 'acc_1', platform: 'instagram',
          allPosts: true, keywords: ['guide'], matchMode: 'contains',
        },
      },
      { id: 'send', type: 'send', position: { x: 280, y: 0 }, config: { kind: 'dm', text: DM } },
      { id: 'wait', type: 'wait', position: { x: 560, y: 0 }, config: { kind: 'duration', minutes: 2880 } },
      { id: 'check', type: 'condition', position: { x: 840, y: 0 }, config: { kind: 'replied' } },
      { id: 'thanks', type: 'send', position: { x: 1120, y: -80 }, config: { kind: 'dm', text: THANKS } },
      { id: 'followup', type: 'send', position: { x: 1120, y: 80 }, config: { kind: 'dm', text: FOLLOW_UP } },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'send', branch: 'next' },
      { id: 'e2', source: 'send', target: 'wait', branch: 'next' },
      { id: 'e3', source: 'wait', target: 'check', branch: 'next' },
      { id: 'e4', source: 'check', target: 'thanks', branch: 'yes' },
      { id: 'e5', source: 'check', target: 'followup', branch: 'no' },
    ],
  };
}

/* What the server returns — the real shapes, including the rendered bodies.
 * Three walks of the same flow: parked on the question, answered, declined. */

const openingSteps = [
  { nodeId: 'trigger', nodeType: 'trigger', status: 'ok', detail: 'Matched “guide”', branch: 'next' },
  {
    nodeId: 'send', nodeType: 'send', status: 'ok', detail: `DM sent: “${DM}”`,
    branch: 'next', output: { channel: 'dm', text: DM },
  },
  { nodeId: 'wait', nodeType: 'wait', status: 'ok', detail: 'Waited 2 days', branch: 'next' },
] as FlowSimulationResult['steps'];

function parked(): FlowSimulationResult {
  return {
    matched: true, reason: null, awaitingReply: true,
    steps: [
      ...openingSteps,
      { nodeId: 'check', nodeType: 'condition', status: 'ok', detail: 'Waiting for their reply' },
    ],
  };
}

function answered(reply: string): FlowSimulationResult {
  return {
    matched: true, reason: null, awaitingReply: false,
    steps: [
      ...openingSteps,
      {
        nodeId: 'check', nodeType: 'condition', status: 'ok', detail: 'They replied',
        branch: 'yes', output: { replied: true, text: reply, simulated: true },
      },
      {
        nodeId: 'thanks', nodeType: 'send', status: 'ok', detail: `DM sent: “${THANKS}”`,
        branch: 'next', output: { channel: 'dm', text: THANKS },
      },
    ],
  };
}

function declined(): FlowSimulationResult {
  return {
    matched: true, reason: null, awaitingReply: false,
    steps: [
      ...openingSteps,
      {
        nodeId: 'check', nodeType: 'condition', status: 'ok', detail: "They haven't replied",
        branch: 'no', output: { replied: false, simulated: true },
      },
      {
        nodeId: 'followup', nodeType: 'send', status: 'ok', detail: `DM sent: “${FOLLOW_UP}”`,
        branch: 'next', output: { channel: 'dm', text: FOLLOW_UP },
      },
    ],
  };
}

/** The server, in one line: answer the checks from the replies given. */
function simulate(replies: (string | null)[]): FlowSimulationResult {
  if (!replies.length) return parked();
  return replies[0] === null ? declined() : answered(replies[0]);
}

describe('reading a simulation as a conversation', () => {
  it('starts a comment flow with the comment, and a DM flow with the DM', () => {
    const asComment = buildConversation({
      graph: graphFixture('comment'), result: declined(), channel: 'comment', triggerText: 'culture',
    });
    expect(asComment.items[0]).toMatchObject({ kind: 'comment', text: 'culture' });

    const asDm = buildConversation({
      graph: graphFixture('dm'), result: declined(), channel: 'dm', triggerText: 'guide',
    });
    expect(asDm.items[0]).toMatchObject({ kind: 'incoming', text: 'guide' });
  });

  it('draws a wait as the gap between two messages, not as a step', () => {
    const { items } = buildConversation({
      graph: graphFixture(), result: answered('Thanks, this is helpful'),
      channel: 'comment', triggerText: 'guide',
    });
    const separators = items.filter(i => i.kind === 'separator');
    expect(separators).toHaveLength(1);
    expect(separators[0]).toMatchObject({ text: '2 days later' });
    // No trace of the machinery that produced it.
    expect(items.some(i => 'text' in i && /wait|node|executed/i.test(i.text))).toBe(false);
  });

  it('says what the silence meant when nobody replied', () => {
    const { items } = buildConversation({
      graph: graphFixture(), result: declined(), channel: 'comment', triggerText: 'guide',
    });
    expect(items.find(i => i.kind === 'separator')).toMatchObject({ text: 'No reply after 2 days' });
    expect(items[items.length - 1]).toMatchObject({ kind: 'outgoing', text: FOLLOW_UP });
  });

  it('puts the fan’s reply where they would have sent it — inside the wait', () => {
    const { items } = buildConversation({
      graph: graphFixture(), result: answered('Thanks, this is helpful'),
      channel: 'comment', triggerText: 'guide',
    });
    const reply = items.findIndex(i => i.kind === 'incoming');
    const gap = items.findIndex(i => i.kind === 'separator');
    expect(reply).toBeGreaterThan(-1);
    expect(items[reply]).toMatchObject({ text: 'Thanks, this is helpful' });
    expect(reply).toBeLessThan(gap);
    expect(items[items.length - 1]).toMatchObject({ kind: 'outgoing', text: THANKS });
  });

  it('stops at the reply question instead of choosing an answer for them', () => {
    const { items, awaitingReply } = buildConversation({
      graph: graphFixture(), result: parked(), channel: 'comment', triggerText: 'guide',
    });
    expect(awaitingReply).toBe(true);
    // The parked question is the reply box, not a line of the transcript —
    // and nothing past it is shown, because nothing past it has happened.
    expect(items[items.length - 1]).toMatchObject({ kind: 'outgoing', text: DM });
    expect(items.some(i => 'text' in i && i.text === FOLLOW_UP)).toBe(false);
    expect(items.some(i => 'text' in i && i.text === THANKS)).toBe(false);
  });

  it('never draws a message the platform refused as though it was sent', () => {
    const graph = graphFixture();
    graph.nodes[1] = {
      id: 'send', type: 'send', position: { x: 280, y: 0 },
      config: { kind: 'comment_reply', text: 'Sent you a DM!' },
    };
    const refused: FlowSimulationResult = {
      matched: true, reason: null, awaitingReply: false,
      steps: [
        { nodeId: 'trigger', nodeType: 'trigger', status: 'ok', detail: 'Matched “guide”', branch: 'next' },
        {
          nodeId: 'send', nodeType: 'send', status: 'failed',
          detail: 'instagram doesn’t support public comment replies.',
        },
      ],
    };

    const { items } = buildConversation({
      graph, result: refused, channel: 'comment', triggerText: 'guide',
    });

    // A public reply is as refusable as a DM, and a preview that shows it
    // going out anyway is the exact lie this panel exists to prevent.
    expect(items[items.length - 1]).toMatchObject({
      kind: 'public_reply',
      problem: 'instagram doesn’t support public comment replies.',
    });
  });

  it('says why nothing would happen when the trigger wouldn’t fire', () => {
    const { items } = buildConversation({
      graph: graphFixture(),
      result: { matched: false, reason: 'That message doesn’t contain “guide”.', steps: [], awaitingReply: false },
      channel: 'comment', triggerText: 'hello',
    });
    expect(items[items.length - 1]).toMatchObject({ kind: 'blocked', text: 'That message doesn’t contain “guide”.' });
  });
});

describe('the Preview panel', () => {
  function mountPanel(triggerKind: 'comment' | 'dm' = 'comment') {
    const onRun = vi.fn(async (input: { replies: (string | null)[] }) => simulate(input.replies));
    render(
      <PreviewPanel
        graph={graphFixture(triggerKind)}
        platformLabel="Instagram"
        running={false}
        onRun={onRun}
        onReset={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    return onRun;
  }

  it('is a conversation, not a test form', () => {
    mountPanel();
    expect(screen.getByLabelText('Preview')).toBeInTheDocument();
    expect(screen.getByText('@yourfan')).toBeInTheDocument();
    expect(screen.getByText('Active now')).toBeInTheDocument();
    // The old simulator's controls are gone.
    expect(screen.queryByText('Simulate')).not.toBeInTheDocument();
    expect(screen.queryByText('They say')).not.toBeInTheDocument();
    expect(screen.queryByText('Start test')).not.toBeInTheDocument();
    expect(screen.queryByText('A comment')).not.toBeInTheDocument();
  });

  it('keeps saying it is not real, quietly', () => {
    mountPanel();
    expect(screen.getByText('Nothing is sent')).toBeInTheDocument();
  });

  it('treats what the creator types as the trigger', async () => {
    const user = userEvent.setup();
    const onRun = mountPanel('dm');

    await user.type(screen.getByLabelText('Message @yourfan…'), 'guide{Enter}');

    expect(onRun).toHaveBeenCalledWith({ channel: 'dm', text: 'guide', replies: [] });
    expect(await screen.findByText(DM)).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
  });

  it('shows a comment-triggered flow as a comment, then the DM it opens', async () => {
    const user = userEvent.setup();
    const onRun = mountPanel('comment');

    await user.type(screen.getByLabelText('Comment as a fan…'), 'culture{Enter}');

    expect(onRun).toHaveBeenCalledWith({ channel: 'comment', text: 'culture', replies: [] });
    expect(await screen.findByText('@yourfan commented on your post')).toBeInTheDocument();
    expect(screen.getByText('“culture”')).toBeInTheDocument();
    expect(screen.getByText('Instagram DM')).toBeInTheDocument();
    expect(screen.getByText(DM)).toBeInTheDocument();
  });

  it('lets the creator answer as the fan, and takes the replied path', async () => {
    const user = userEvent.setup();
    const onRun = mountPanel('dm');
    await user.type(screen.getByLabelText('Message @yourfan…'), 'guide{Enter}');
    await screen.findByText(DM);

    // The automation is waiting on them, and says so by asking rather than by
    // picking one of the two outcomes.
    const replyBox = await screen.findByLabelText('Reply as @yourfan…');
    await user.type(replyBox, 'Thanks, this is helpful{Enter}');

    // Their reply rides along with the conversation so far — it is an answer
    // to the open question, never a fresh trigger.
    await waitFor(() => expect(onRun).toHaveBeenLastCalledWith({
      channel: 'dm', text: 'guide', replies: ['Thanks, this is helpful'],
    }));
    expect(await screen.findByText('Thanks, this is helpful')).toBeInTheDocument();
    expect(screen.getByText(THANKS)).toBeInTheDocument();
    expect(screen.queryByText(FOLLOW_UP)).not.toBeInTheDocument();
  });

  it('lets them decline to reply, and shows the follow-up that earns', async () => {
    const user = userEvent.setup();
    const onRun = mountPanel('dm');
    await user.type(screen.getByLabelText('Message @yourfan…'), 'guide{Enter}');
    await screen.findByText(DM);

    await user.click(await screen.findByText('Continue without reply'));

    // Declining answers ONE question — with silence — the same way a reply
    // answers one. It is not a global "never replies".
    await waitFor(() => expect(onRun).toHaveBeenLastCalledWith({
      channel: 'dm', text: 'guide', replies: [null],
    }));
    expect(await screen.findByText('No reply after 2 days')).toBeInTheDocument();
    expect(screen.getByText(FOLLOW_UP)).toBeInTheDocument();
  });

  /* The bug from the field, pinned end to end.
   *
   * A booking flow asks two questions in a row. The creator commented the
   * keyword, got question one, answered it — and their next message, the
   * answer to question two, was treated as a brand-new comment and told
   * "That message doesn't contain 'price'". Every answer after the trigger
   * must be an answer, for as long as the flow has questions to ask.
   */
  it('a flow with two questions asks them one at a time, and every answer is a reply', async () => {
    const Q1 = 'When would you like to book and what is your budget?';
    const Q2 = 'Do you have a specific boat in mind?';
    const CLOSING = 'Perfect — sending the booking link now.';

    const booking: FlowGraph = {
      schemaVersion: 1,
      nodes: [
        {
          id: 'trigger', type: 'trigger', position: { x: 0, y: 0 },
          config: {
            kind: 'comment', accountId: 'acc_1', platform: 'instagram',
            allPosts: true, keywords: ['price'], matchMode: 'contains',
          },
        },
        { id: 'ask-when', type: 'send', position: { x: 280, y: 0 }, config: { kind: 'dm', text: Q1 } },
        { id: 'check-1', type: 'condition', position: { x: 560, y: 0 }, config: { kind: 'replied' } },
        { id: 'ask-boat', type: 'send', position: { x: 840, y: 0 }, config: { kind: 'dm', text: Q2 } },
        { id: 'check-2', type: 'condition', position: { x: 1120, y: 0 }, config: { kind: 'replied' } },
        { id: 'closing', type: 'send', position: { x: 1400, y: 0 }, config: { kind: 'dm', text: CLOSING } },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'ask-when', branch: 'next' },
        { id: 'e2', source: 'ask-when', target: 'check-1', branch: 'next' },
        { id: 'e3', source: 'check-1', target: 'ask-boat', branch: 'yes' },
        { id: 'e4', source: 'ask-boat', target: 'check-2', branch: 'next' },
        { id: 'e5', source: 'check-2', target: 'closing', branch: 'yes' },
      ],
    };

    const sendStep = (nodeId: string, text: string) => ({
      nodeId, nodeType: 'send', status: 'ok' as const, detail: `DM sent: “${text}”`,
      branch: 'next' as const, output: { channel: 'dm', text },
    });
    const answeredCheck = (nodeId: string, text: string) => ({
      nodeId, nodeType: 'condition', status: 'ok' as const, detail: 'They replied',
      branch: 'yes' as const, output: { replied: true, text, simulated: true },
    });
    const parkedCheck = (nodeId: string) => ({
      nodeId, nodeType: 'condition', status: 'ok' as const, detail: 'Waiting for their reply',
    });
    const triggerStep = {
      nodeId: 'trigger', nodeType: 'trigger', status: 'ok' as const, detail: 'Matched “price”', branch: 'next' as const,
    };

    // The server's walk, answer by answer — the same shapes the backend's
    // reply queue produces.
    const onRun = vi.fn(async ({ replies }: { replies: (string | null)[] }): Promise<FlowSimulationResult> => {
      const [first, second] = replies;
      if (typeof first !== 'string') {
        return { matched: true, reason: null, awaitingReply: true,
          steps: [triggerStep, sendStep('ask-when', Q1), parkedCheck('check-1')] };
      }
      if (typeof second !== 'string') {
        return { matched: true, reason: null, awaitingReply: true,
          steps: [triggerStep, sendStep('ask-when', Q1), answeredCheck('check-1', first),
            sendStep('ask-boat', Q2), parkedCheck('check-2')] };
      }
      return { matched: true, reason: null, awaitingReply: false,
        steps: [triggerStep, sendStep('ask-when', Q1), answeredCheck('check-1', first),
          sendStep('ask-boat', Q2), answeredCheck('check-2', second), sendStep('closing', CLOSING)] };
    });

    const user = userEvent.setup();
    render(
      <PreviewPanel
        graph={booking} platformLabel="Instagram" running={false}
        onRun={onRun} onReset={vi.fn()} onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Comment as a fan…'), 'price{Enter}');
    expect(await screen.findByText(Q1)).toBeInTheDocument();

    await user.type(await screen.findByLabelText('Reply as @yourfan…'), 'this weekend and 1500{Enter}');
    expect(await screen.findByText(Q2)).toBeInTheDocument();
    expect(screen.getByText('this weekend and 1500')).toBeInTheDocument();

    // The second answer — the one production used to bounce with a keyword
    // error — is still a reply, and it finishes the flow.
    await user.type(await screen.findByLabelText('Reply as @yourfan…'), 'the catamaran{Enter}');
    expect(await screen.findByText(CLOSING)).toBeInTheDocument();
    expect(screen.getByText('the catamaran')).toBeInTheDocument();

    expect(onRun).toHaveBeenLastCalledWith({
      channel: 'comment', text: 'price', replies: ['this weekend and 1500', 'the catamaran'],
    });
    // Never re-tried as a trigger, never told it lacks the keyword, and the
    // transcript never reset to a single bubble.
    expect(onRun).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(/doesn.t contain/)).not.toBeInTheDocument();
    expect(screen.getByText('“price”')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The page: Preview replaced Test, and it runs the simulation and nothing else.

const canvas = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock('../components/automation-builder/FlowCanvas', () => ({
  default: (props: Record<string, unknown>) => {
    canvas.props = props;
    return <div data-testid="canvas">{props.editorSlot as React.ReactNode}</div>;
  },
}));

const testFlowMock = vi.fn(async () => parked());
const sendInboxReplyMock = vi.fn();

function flowFixture(): AutomationFlow {
  return {
    id: 'flow_1', name: 'Free Creator Guide', status: 'draft',
    accountId: 'acc_1', platform: 'instagram', graph: graphFixture('dm'), version: 1,
    legacyAutomationId: null, activatedAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } as unknown as AutomationFlow;
}

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    isBackendConfigured: () => true,
    fetchFlow: vi.fn(async () => flowFixture()),
    updateFlow: vi.fn(async () => ({ flow: flowFixture() })),
    fetchFlowValidation: vi.fn(async () => ({ ok: true, problems: [] })),
    testFlow: (...args: unknown[]) => testFlowMock(...(args as [])),
    sendInboxReply: (...args: unknown[]) => sendInboxReplyMock(...args),
    fetchConnectedAccounts: vi.fn(async () => []),
    fetchCapabilities: vi.fn(async () => []),
    fetchFlowBuilderMeta: vi.fn(async () => ({ aiConfigured: true, tags: [] })),
    fetchPostsLibrary: vi.fn(async () => []),
  };
});

const mockUseApp = vi.fn();
vi.mock('../context/AppContext', () => ({ useApp: () => mockUseApp() }));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseApp.mockReturnValue({ showToast: vi.fn() });
});

describe('the builder’s Preview button', () => {
  it('is called Preview, because nothing is being tested at anyone', async () => {
    render(
      <MemoryRouter initialEntries={['/automations/flow_1']}>
        <Routes><Route path="/automations/:flowId" element={<AutomationBuilderPage />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Preview')).toBeInTheDocument();
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
  });

  it('opens the conversation, runs the simulation, and sends nothing', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/automations/flow_1']}>
        <Routes><Route path="/automations/:flowId" element={<AutomationBuilderPage />} /></Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByText('Preview'));
    expect(await screen.findByLabelText('Preview')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Message @yourfan…'), 'guide{Enter}');

    await waitFor(() => expect(testFlowMock).toHaveBeenCalledWith('flow_1', {
      channel: 'dm', text: 'guide', replies: [],
    }));
    expect(await screen.findByText(DM)).toBeInTheDocument();
    // The one thing that must never happen from a preview.
    expect(sendInboxReplyMock).not.toHaveBeenCalled();
  });
});
