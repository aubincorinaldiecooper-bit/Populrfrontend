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
 * The old panel asked a creator to pick a channel, fill in "They say" and
 * press Start test, then read a list of executed steps. Every part of that is
 * a developer's question. The one a creator has is "what is this like to
 * receive", and a conversation answers it directly: they play the fan, type
 * what a fan would type, and watch the automation answer.
 *
 * The runtime underneath is unchanged — the same /test simulation, running the
 * real executors with sending switched off — so what these tests pin is that
 * the conversation is a faithful reading of what the server said would happen,
 * that both sides of a "did they reply?" are reachable, and that a preview
 * never sends anything.
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

/** What the server returns — the real shape, including the rendered body. */
function simulation(replied: boolean): FlowSimulationResult {
  return {
    matched: true,
    reason: null,
    steps: [
      { nodeId: 'trigger', nodeType: 'trigger', status: 'ok', detail: 'Matched “guide”', branch: 'next' },
      {
        nodeId: 'send', nodeType: 'send', status: 'ok', detail: `DM sent: “${DM}”`,
        branch: 'next', output: { channel: 'dm', text: DM },
      },
      { nodeId: 'wait', nodeType: 'wait', status: 'ok', detail: 'Waited 2 days', branch: 'next' },
      {
        nodeId: 'check', nodeType: 'condition', status: 'ok',
        detail: replied ? 'They replied' : "They haven't replied",
        branch: replied ? 'yes' : 'no', output: { replied },
      },
      replied
        ? {
            nodeId: 'thanks', nodeType: 'send', status: 'ok', detail: `DM sent: “${THANKS}”`,
            branch: 'next', output: { channel: 'dm', text: THANKS },
          }
        : {
            nodeId: 'followup', nodeType: 'send', status: 'ok', detail: `DM sent: “${FOLLOW_UP}”`,
            branch: 'next', output: { channel: 'dm', text: FOLLOW_UP },
          },
    ],
  };
}

describe('reading a simulation as a conversation', () => {
  it('starts a comment flow with the comment, and a DM flow with the DM', () => {
    const asComment = buildConversation({
      graph: graphFixture('comment'), result: simulation(false), channel: 'comment',
      triggerText: 'culture', replyText: null, pauseAtReplyCheck: false,
    });
    expect(asComment.items[0]).toMatchObject({ kind: 'comment', text: 'culture' });

    const asDm = buildConversation({
      graph: graphFixture('dm'), result: simulation(false), channel: 'dm',
      triggerText: 'guide', replyText: null, pauseAtReplyCheck: false,
    });
    expect(asDm.items[0]).toMatchObject({ kind: 'incoming', text: 'guide' });
  });

  it('draws a wait as the gap between two messages, not as a step', () => {
    const { items } = buildConversation({
      graph: graphFixture(), result: simulation(true), channel: 'comment',
      triggerText: 'guide', replyText: 'Thanks, this is helpful', pauseAtReplyCheck: false,
    });
    const separators = items.filter(i => i.kind === 'separator');
    expect(separators).toHaveLength(1);
    expect(separators[0]).toMatchObject({ text: '2 days later' });
    // No trace of the machinery that produced it.
    expect(items.some(i => 'text' in i && /wait|node|executed/i.test(i.text))).toBe(false);
  });

  it('says what the silence meant when nobody replied', () => {
    const { items } = buildConversation({
      graph: graphFixture(), result: simulation(false), channel: 'comment',
      triggerText: 'guide', replyText: null, pauseAtReplyCheck: false,
    });
    expect(items.find(i => i.kind === 'separator')).toMatchObject({ text: 'No reply after 2 days' });
    expect(items[items.length - 1]).toMatchObject({ kind: 'outgoing', text: FOLLOW_UP });
  });

  it('puts the fan’s reply where they would have sent it — inside the wait', () => {
    const { items } = buildConversation({
      graph: graphFixture(), result: simulation(true), channel: 'comment',
      triggerText: 'guide', replyText: 'Thanks, this is helpful', pauseAtReplyCheck: false,
    });
    const reply = items.findIndex(i => i.kind === 'incoming');
    const gap = items.findIndex(i => i.kind === 'separator');
    expect(reply).toBeGreaterThan(-1);
    expect(reply).toBeLessThan(gap);
    expect(items[items.length - 1]).toMatchObject({ kind: 'outgoing', text: THANKS });
  });

  it('stops at the reply question instead of choosing an answer for them', () => {
    const { items, awaitingReply } = buildConversation({
      graph: graphFixture(), result: simulation(false), channel: 'comment',
      triggerText: 'guide', replyText: null, pauseAtReplyCheck: true,
    });
    expect(awaitingReply).toBe(true);
    expect(items[items.length - 1]).toMatchObject({ kind: 'outgoing', text: DM });
    expect(items.some(i => 'text' in i && i.text === FOLLOW_UP)).toBe(false);
  });

  it('never draws a message the platform refused as though it was sent', () => {
    const graph = graphFixture();
    graph.nodes[1] = {
      id: 'send', type: 'send', position: { x: 280, y: 0 },
      config: { kind: 'comment_reply', text: 'Sent you a DM!' },
    };
    const refused = {
      matched: true, reason: null,
      steps: [
        { nodeId: 'trigger', nodeType: 'trigger', status: 'ok' as const, detail: 'Matched “guide”', branch: 'next' as const },
        {
          nodeId: 'send', nodeType: 'send', status: 'failed' as const,
          detail: 'instagram doesn’t support public comment replies.',
        },
      ],
    };

    const { items } = buildConversation({
      graph, result: refused, channel: 'comment',
      triggerText: 'guide', replyText: null, pauseAtReplyCheck: true,
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
      result: { matched: false, reason: 'That message doesn’t contain “guide”.', steps: [] },
      channel: 'comment', triggerText: 'hello', replyText: null, pauseAtReplyCheck: true,
    });
    expect(items[items.length - 1]).toMatchObject({ kind: 'blocked', text: 'That message doesn’t contain “guide”.' });
  });
});

describe('the Preview panel', () => {
  function mountPanel(triggerKind: 'comment' | 'dm' = 'comment') {
    const onRun = vi.fn(async (input: { replied: boolean }) => simulation(input.replied));
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

    expect(onRun).toHaveBeenCalledWith({ channel: 'dm', text: 'guide', replied: false });
    expect(await screen.findByText(DM)).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
  });

  it('shows a comment-triggered flow as a comment, then the DM it opens', async () => {
    const user = userEvent.setup();
    const onRun = mountPanel('comment');

    await user.type(screen.getByLabelText('Comment as a fan…'), 'culture{Enter}');

    expect(onRun).toHaveBeenCalledWith({ channel: 'comment', text: 'culture', replied: false });
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

    await waitFor(() => expect(onRun).toHaveBeenLastCalledWith({
      channel: 'dm', text: 'guide', replied: true,
    }));
    expect(await screen.findByText('Thanks, this is helpful')).toBeInTheDocument();
    expect(screen.getByText(THANKS)).toBeInTheDocument();
    expect(screen.queryByText(FOLLOW_UP)).not.toBeInTheDocument();
  });

  it('lets them decline to reply, and shows the follow-up that earns', async () => {
    const user = userEvent.setup();
    mountPanel('dm');
    await user.type(screen.getByLabelText('Message @yourfan…'), 'guide{Enter}');
    await screen.findByText(DM);

    await user.click(await screen.findByText('Continue without reply'));

    expect(await screen.findByText('No reply after 2 days')).toBeInTheDocument();
    expect(screen.getByText(FOLLOW_UP)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The page: Preview replaced Test, and it runs the simulation and nothing else.

const canvas = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock('../components/automation-builder/FlowCanvas', () => ({
  default: (props: Record<string, unknown>) => {
    canvas.props = props;
    return <div data-testid="canvas" />;
  },
}));

const testFlowMock = vi.fn(async () => simulation(false));
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
      channel: 'dm', text: 'guide', replied: false,
    }));
    expect(await screen.findByText(DM)).toBeInTheDocument();
    // The one thing that must never happen from a preview.
    expect(sendInboxReplyMock).not.toHaveBeenCalled();
  });
});
