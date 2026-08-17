/* The builder's stateful behaviour: autosave, undo, splice-on-insert, and the
 * AI round trip.
 *
 * These are the promises the UI makes that a creator would only discover were
 * broken after losing work — "Autosaved just now", "Undo", and "adding a step
 * in the middle doesn't break the rest". Driven through the real hook against
 * a mocked API, so the state machine is exercised rather than described.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFlowBuilder } from '../components/automation-builder/useFlowBuilder';
import type { AutomationFlow, FlowProblem } from '../lib/api';
import type { FlowGraph, FlowNode } from '../lib/flowSchema';

const updateFlow = vi.fn();
const proposeFlowMock = vi.fn();
const commitProposalMock = vi.fn();
const discardProposalMock = vi.fn(async () => ({ ok: true }));
const activateFlowMock = vi.fn();
const pauseFlowMock = vi.fn();
const fetchFlowValidationMock = vi.fn();

function baseGraph(): FlowGraph {
  return {
    schemaVersion: 1,
    nodes: [
      { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, config: { kind: 'comment', keywords: ['guide'] } },
      { id: 'send', type: 'send', position: { x: 280, y: 0 }, config: { kind: 'dm', text: 'Here you go' } },
      { id: 'tag', type: 'action', position: { x: 560, y: 0 }, config: { kind: 'add_tag', tag: 'warm_lead' } },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'send', branch: 'next' },
      { id: 'e2', source: 'send', target: 'tag', branch: 'next' },
    ],
  };
}

function flowFixture(graph: FlowGraph = baseGraph()): AutomationFlow {
  return {
    id: 'flow_1', name: 'Free Creator Guide', status: 'draft',
    accountId: 'acc_1', platform: 'instagram', graph, version: 1,
    legacyAutomationId: null, activatedAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    fetchFlow: vi.fn(async () => flowFixture()),
    updateFlow: (...args: unknown[]) => updateFlow(...args),
    proposeFlow: (...args: unknown[]) => proposeFlowMock(...args),
    commitProposal: (...args: unknown[]) => commitProposalMock(...args),
    discardProposal: (...args: unknown[]) => discardProposalMock(...(args as [])),
    fetchActiveProposal: vi.fn(async () => ({ proposal: null })),
    fetchFlowAiMessages: vi.fn(async () => ({ messages: [], hasMore: false })),
    activateFlow: (...args: unknown[]) => activateFlowMock(...args),
    fetchFlowValidation: (...args: unknown[]) => fetchFlowValidationMock(...args),
    pauseFlow: (...args: unknown[]) => pauseFlowMock(...args),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  // Mirrors the real PATCH response — the flow AND whether the edit actually
  // reached the platform. Returning a bare flow here would let the hook read
  // `.flow` off the wrong shape and still pass, which is how a mock stops
  // testing anything.
  updateFlow.mockImplementation(async (_id: string, patch: { graph: FlowGraph; name: string }) =>
    ({ flow: { ...flowFixture(patch.graph), name: patch.name } }));
  pauseFlowMock.mockImplementation(async () => ({ flow: flowFixture(), cancelledRuns: 0 }));
  fetchFlowValidationMock.mockImplementation(async () => ({ ok: true, problems: [] as FlowProblem[] }));
});

async function mountBuilder() {
  const hook = renderHook(() => useFlowBuilder('flow_1'));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('autosave', () => {
  it('saves an edit without any Save button', async () => {
    const { result } = await mountBuilder();

    act(() => result.current.updateNodeConfig('send', { text: 'Updated copy' }));
    await waitFor(() => expect(updateFlow).toHaveBeenCalled());

    const saved = updateFlow.mock.calls[0][1] as { graph: FlowGraph };
    expect(saved.graph.nodes.find((n: FlowNode) => n.id === 'send')!.config.text).toBe('Updated copy');
    await waitFor(() => expect(result.current.saveState).toBe('saved'));
  });

  it('surfaces a failed save instead of claiming everything is fine', async () => {
    updateFlow.mockRejectedValue(new Error('network down'));
    const { result } = await mountBuilder();

    act(() => result.current.updateNodeConfig('send', { text: 'Will not save' }));
    await waitFor(() => expect(result.current.saveState).toBe('error'));
  });

  it('does not save on load — only on a real edit', async () => {
    await mountBuilder();
    await new Promise(r => setTimeout(r, 900));
    expect(updateFlow).not.toHaveBeenCalled();
  });
});

describe('editing the graph', () => {
  it('splices an inserted step in rather than severing what came after', async () => {
    const { result } = await mountBuilder();

    act(() => { result.current.addNode('wait', 'send', 'next', { kind: 'duration', minutes: 1440 }); });

    const { graph } = result.current;
    const waitNode = graph.nodes.find(n => n.type === 'wait')!;
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: 'send', target: waitNode.id }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: waitNode.id, target: 'tag' }));
    // The old direct edge must be gone, or the tag would run twice.
    expect(graph.edges.filter(e => e.source === 'send' && e.target === 'tag')).toHaveLength(0);
  });

  it('rejoins the chain when a middle step is removed', async () => {
    const { result } = await mountBuilder();

    act(() => result.current.deleteNode('send'));

    expect(result.current.graph.nodes.map(n => n.id)).toEqual(['trigger', 'tag']);
    expect(result.current.graph.edges).toContainEqual(
      expect.objectContaining({ source: 'trigger', target: 'tag' }));
  });

  it('will not delete the trigger — an automation with no start is not a thing', async () => {
    const { result } = await mountBuilder();
    act(() => result.current.deleteNode('trigger'));
    expect(result.current.graph.nodes.some(n => n.id === 'trigger')).toBe(true);
  });

  it('adds the first step of an empty flow without inventing a dangling edge', async () => {
    const { result } = await mountBuilder();

    act(() => { result.current.commitGraph({ schemaVersion: 1, nodes: [], edges: [] }); });
    act(() => { result.current.addNode('trigger', null, 'next', { kind: 'comment' }); });

    expect(result.current.graph.nodes).toHaveLength(1);
    expect(result.current.graph.edges).toHaveLength(0);
  });

  it('replaces rather than duplicates when a connector is rewired', async () => {
    const { result } = await mountBuilder();
    act(() => result.current.connectNodes('trigger', 'tag', 'next'));
    expect(result.current.graph.edges.filter(e => e.source === 'trigger')).toHaveLength(1);
  });
});

describe('undo', () => {
  it('takes back an edit', async () => {
    const { result } = await mountBuilder();

    act(() => result.current.updateNodeConfig('send', { text: 'Changed' }));
    expect(result.current.graph.nodes.find(n => n.id === 'send')!.config.text).toBe('Changed');

    act(() => result.current.undo());
    expect(result.current.graph.nodes.find(n => n.id === 'send')!.config.text).toBe('Here you go');
  });

  it('takes back a deletion, edges and all', async () => {
    const { result } = await mountBuilder();

    act(() => result.current.deleteNode('send'));
    expect(result.current.graph.nodes).toHaveLength(2);

    act(() => result.current.undo());
    expect(result.current.graph.nodes).toHaveLength(3);
    expect(result.current.graph.edges).toHaveLength(2);
  });

  it('ignores a drag, so undo still reaches the edit before it', async () => {
    const { result } = await mountBuilder();

    act(() => result.current.updateNodeConfig('send', { text: 'Edited' }));
    act(() => result.current.moveNode('send', { x: 999, y: 999 }));

    act(() => result.current.undo());
    expect(result.current.graph.nodes.find(n => n.id === 'send')!.config.text).toBe('Here you go');
  });
});

describe('the AI round trip', () => {
  /** What the agent answers with: a draft, not a change. */
  function draftResult(overrides: Record<string, unknown> = {}) {
    return {
      proposal: {
        id: 'p1', status: 'awaiting_confirmation' as const, prompt: '', revision: 1,
        plan: [{ id: 'item-1', label: 'Wait 2 days', operationIds: [0] }],
        operations: [{ op: 'create_node', id: 'wait-1d', type: 'wait', config: { kind: 'duration', minutes: 2880 } }],
        assumptions: [], summary: 'Drafted 1 step.',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
      clarification: false, summary: 'Drafted 1 step — review it and Build this when you\'re ready.',
      source: 'model', progress: [],
      ...overrides,
    };
  }

  it('drafts without touching the canvas; Build this applies, reports, and can be undone', async () => {
    const nextGraph: FlowGraph = {
      ...baseGraph(),
      nodes: [
        ...baseGraph().nodes,
        { id: 'wait-1d', type: 'wait', position: { x: 0, y: 0 }, config: { kind: 'duration', minutes: 2880 } },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'send', branch: 'next' },
        { id: 'e3', source: 'send', target: 'wait-1d', branch: 'next' },
        { id: 'e4', source: 'wait-1d', target: 'tag', branch: 'next' },
      ],
    };
    proposeFlowMock.mockResolvedValue(draftResult());
    commitProposalMock.mockResolvedValue({
      applied: true,
      summary: 'Added a 2-day delay and follow-up DM.',
      operations: [{ op: 'create_node', id: 'wait-1d', type: 'wait' }],
      touchedNodeIds: ['wait-1d'],
      previousGraph: baseGraph(),
      flow: flowFixture(nextGraph),
    });

    const { result } = await mountBuilder();
    await act(async () => { await result.current.compose('wait two days before tagging'); });

    // The draft is on the table — and the canvas has not moved an inch.
    expect(result.current.proposal?.id).toBe('p1');
    expect(result.current.graph.nodes.some(n => n.id === 'wait-1d')).toBe(false);
    expect(result.current.changeCard).toBeNull();
    expect(result.current.history).toHaveLength(1);

    // The creator says Build this. Only now does the graph change.
    await act(async () => { await result.current.confirmProposal(); });

    expect(result.current.graph.nodes.some(n => n.id === 'wait-1d')).toBe(true);
    expect(result.current.changeCard?.summary).toBe('Added a 2-day delay and follow-up DM.');
    expect(result.current.highlighted).toEqual(['wait-1d']);
    expect(result.current.proposal).toBeNull();

    act(() => result.current.undo());
    expect(result.current.graph.nodes.some(n => n.id === 'wait-1d')).toBe(false);
  });

  it('does not re-save the graph the server just returned', async () => {
    proposeFlowMock.mockResolvedValue(draftResult());
    commitProposalMock.mockResolvedValue({
      applied: true, summary: 'Built it.', operations: [], touchedNodeIds: [],
      previousGraph: baseGraph(), flow: flowFixture(),
    });

    const { result } = await mountBuilder();
    await act(async () => { await result.current.compose('rename it') });
    await act(async () => { await result.current.confirmProposal(); });
    await new Promise(r => setTimeout(r, 900));

    expect(updateFlow).not.toHaveBeenCalled();
  });

  it('a Build this the server refuses leaves the canvas alone and says so', async () => {
    proposeFlowMock.mockResolvedValue(draftResult());
    const { ApiError } = await import('../lib/api');
    commitProposalMock.mockRejectedValue(new ApiError(
      "The canvas changed since this was drafted — ask Populr to draft it again.", 409, 'proposal_stale'));

    const { result } = await mountBuilder();
    await act(async () => { await result.current.compose('wait two days') });
    await act(async () => { await result.current.confirmProposal(); });

    expect(result.current.graph.nodes).toHaveLength(3);
    // The card is gone with the spent draft, so the explanation lives in the
    // conversation — the one surface that outlives it.
    expect(result.current.history[result.current.history.length - 1]?.summary).toMatch(/draft it again/);
    // A stale draft is spent — the next prompt starts fresh.
    expect(result.current.proposal).toBeNull();
  });

  it('says so plainly when it understood nothing, instead of silently doing nothing', async () => {
    proposeFlowMock.mockResolvedValue({
      proposal: null, clarification: true,
      summary: "I couldn't work out what to change from that.",
      source: 'fallback', progress: [],
    });

    const { result } = await mountBuilder();
    await act(async () => { await result.current.compose('do the thing') });

    expect(result.current.history[result.current.history.length - 1]?.summary).toMatch(/couldn't work out/);
    expect(result.current.proposal).toBeNull();
    expect(result.current.graph.nodes).toHaveLength(3);
  });

  it('reports a failure rather than leaving the composer silent', async () => {
    proposeFlowMock.mockRejectedValue(new Error('The model is unavailable.'));

    const { result } = await mountBuilder();
    await act(async () => { await result.current.compose('anything') });

    expect(result.current.history[result.current.history.length - 1]?.summary).toBe('The model is unavailable.');
  });

  it('Build this flushes a pending edit first, so the server judges the real canvas', async () => {
    // The creator edits and clicks Build this inside the autosave debounce.
    // Committing against the server's older version would either lose the
    // edit under the build or let the late autosave overwrite the build —
    // so the save must land first, and the commit answer to what it made.
    proposeFlowMock.mockResolvedValue(draftResult());
    commitProposalMock.mockResolvedValue({
      applied: true, summary: 'Built it.', operations: [], touchedNodeIds: [],
      previousGraph: baseGraph(), flow: flowFixture(),
    });

    const { result } = await mountBuilder();
    await act(async () => { await result.current.compose('wait two days') });
    act(() => result.current.updateNodeConfig('send', { text: 'Edited mid-draft' }));
    await act(async () => { await result.current.confirmProposal(); });

    expect(updateFlow).toHaveBeenCalledTimes(1);
    const saved = updateFlow.mock.calls[0][1] as { graph: FlowGraph };
    expect(saved.graph.nodes.find(n => n.id === 'send')!.config.text).toBe('Edited mid-draft');
    expect(updateFlow.mock.invocationCallOrder[0]).toBeLessThan(commitProposalMock.mock.invocationCallOrder[0]);
  });

  it('opening a different automation does not carry the old draft along', async () => {
    proposeFlowMock.mockResolvedValue(draftResult());
    const hook = renderHook(({ id }: { id: string }) => useFlowBuilder(id), { initialProps: { id: 'flow_1' } });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => { await hook.result.current.compose('wait two days') });
    expect(hook.result.current.proposal).not.toBeNull();

    hook.rerender({ id: 'flow_2' });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    // flow_2 has no draft; Build this here must have nothing to submit.
    expect(hook.result.current.proposal).toBeNull();
  });

  it('a discard the server never heard brings the card back, with a word', async () => {
    proposeFlowMock.mockResolvedValue(draftResult());
    discardProposalMock.mockRejectedValueOnce(new Error('offline'));

    const { result } = await mountBuilder();
    await act(async () => { await result.current.compose('wait two days') });
    act(() => { result.current.discardDraft(); });

    // Optimistically gone…
    expect(result.current.proposal).toBeNull();
    // …but the server still holds it, so it returns rather than lying.
    await waitFor(() => expect(result.current.proposal?.id).toBe('p1'));
    expect(result.current.proposalError).toMatch(/try the X again/i);
  });
});

/* The bell in the top bar counts what the SERVER says is still missing, so
 * whenever the stored graph changes, that answer has to be asked for again —
 * and the answer that arrives has to be the one for the graph on screen. */
describe('what still stands in the way', () => {
  it('re-checks after Build this changes the flow, not only after a manual edit', async () => {
    proposeFlowMock.mockResolvedValue({
      proposal: {
        id: 'p1', status: 'awaiting_confirmation', prompt: '', revision: 1,
        plan: [{ id: 'item-1', label: 'Message — write it after building', operationIds: [0] }],
        operations: [], assumptions: [], summary: 'Drafted 1 step.',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
      clarification: false, summary: 'Drafted 1 step.', source: 'model', progress: [],
    });
    commitProposalMock.mockResolvedValue({
      applied: true, summary: 'Added a follow-up.', operations: [], touchedNodeIds: [],
      previousGraph: baseGraph(), flow: flowFixture(),
    });

    const { result } = await mountBuilder();
    // Build this saves server-side and deliberately leaves the builder clean,
    // so no autosave follows to carry the re-check. Without an explicit one
    // the bell would keep the count from before the AI's change — which is
    // most of the changes a creator makes.
    fetchFlowValidationMock.mockResolvedValue({
      ok: false, problems: [{ nodeId: 'send-followup', message: 'This Send step is empty — write the message.' }],
    });

    await act(async () => { await result.current.compose('follow up in two days') });
    await act(async () => { await result.current.confirmProposal(); });

    await waitFor(() => expect(result.current.problems).toHaveLength(1));
    expect(result.current.problems[0].nodeId).toBe('send-followup');
  });

  it('ignores an answer that has been overtaken by a newer one', async () => {
    const pending: ((value: { ok: boolean; problems: FlowProblem[] }) => void)[] = [];
    fetchFlowValidationMock.mockImplementation(
      () => new Promise(resolve => { pending.push(resolve); }),
    );
    const stale: FlowProblem[] = [{ nodeId: 'trigger', message: 'Choose which connected account this automation watches.' }];
    const fresh: FlowProblem[] = [];

    const { result } = await mountBuilder();
    act(() => { void result.current.refreshValidation(); });
    act(() => { void result.current.refreshValidation(); });
    await waitFor(() => expect(pending.length).toBe(3)); // one from the load, two asked for

    // Newest first, then the older ones — the order two saves in quick
    // succession can genuinely land in.
    await act(async () => {
      pending[2]({ ok: true, problems: fresh });
      pending[1]({ ok: false, problems: stale });
      pending[0]({ ok: false, problems: stale });
    });

    // A superseded answer describes a graph that no longer exists; letting it
    // through would leave the bell holding blockers the creator has fixed.
    expect(result.current.problems).toEqual(fresh);
  });
});

describe('activation', () => {
  it('flushes a pending edit first, so it validates what the creator sees', async () => {
    activateFlowMock.mockResolvedValue({ flow: { ...flowFixture(), status: 'live' }, legacyPaused: false });

    const { result } = await mountBuilder();
    act(() => result.current.updateNodeConfig('send', { text: 'Final copy' }));
    await act(async () => { await result.current.activate() });

    expect(updateFlow).toHaveBeenCalled();
    const saved = updateFlow.mock.calls[updateFlow.mock.calls.length - 1][1] as { graph: FlowGraph };
    expect(saved.graph.nodes.find((n: FlowNode) => n.id === 'send')!.config.text).toBe('Final copy');
    expect(activateFlowMock).toHaveBeenCalled();
  });

  it('hands back the problems rather than throwing them at the user', async () => {
    const { FlowNotReadyError } = await import('../lib/api');
    activateFlowMock.mockRejectedValue(
      new FlowNotReadyError([{ nodeId: 'send', message: 'This Send step is empty — write the message.' }]));

    const { result } = await mountBuilder();
    const outcome = await act(async () => result.current.activate());

    expect(outcome.ok).toBe(false);
    expect(result.current.problems).toHaveLength(1);
    expect(result.current.problems[0].nodeId).toBe('send');
  });
});

describe('undo targets the change it was offered for', () => {
  it('restores a captured snapshot even after a later edit', async () => {
    const { result } = await mountBuilder();

    // What the delete toast captures at the moment it is raised.
    const snapshot = result.current.graph;
    const snapshotName = result.current.name;
    act(() => result.current.deleteNode('send'));
    expect(result.current.graph.nodes).toHaveLength(2);

    // The creator keeps working during the toast's seven seconds. A generic
    // undo would now pop THIS edit and leave the step deleted.
    act(() => result.current.updateNodeConfig('tag', { tag: 'later_edit' }));

    act(() => result.current.commitGraph(snapshot, { nextName: snapshotName }));

    expect(result.current.graph.nodes).toHaveLength(3);
    expect(result.current.graph.nodes.some(n => n.id === 'send')).toBe(true);
    // And the unrelated edit is what got rolled back with it, not left behind
    // in a graph that no longer matches what the toast promised.
    expect(result.current.graph.nodes.find(n => n.id === 'tag')!.config.tag).toBe('warm_lead');
  });

  it('the generic undo still pops the newest change, which is why the toast cannot use it', async () => {
    const { result } = await mountBuilder();

    act(() => result.current.deleteNode('send'));
    act(() => result.current.updateNodeConfig('tag', { tag: 'later_edit' }));
    act(() => result.current.undo());

    // Newest change reverted; the deleted step is still gone. Exactly the
    // behaviour a delete toast must not have.
    expect(result.current.graph.nodes.find(n => n.id === 'tag')!.config.tag).toBe('warm_lead');
    expect(result.current.graph.nodes.some(n => n.id === 'send')).toBe(false);
  });
});

/* A live comment→DM automation's opening message is sent by Instagram, from a
 * copy registered when the automation went live. So an edit can save perfectly
 * here and still not reach a single person — and "Autosaved just now" then
 * reads as a promise the product hasn't kept. The backend says so; these pin
 * that the builder passes it on rather than swallowing it. */
describe('an edit that saved here but not on the platform', () => {
  it('carries the backend warning instead of only saying "saved"', async () => {
    updateFlow.mockImplementation(async (_id: string, patch: { graph: FlowGraph; name: string }) => ({
      flow: { ...flowFixture(patch.graph), name: patch.name },
      delegationWarning: 'Remove {first_name} from the opening DM. Instagram is still sending the previous version.',
    }));
    const { result } = await mountBuilder();

    act(() => result.current.updateNodeConfig('send', { text: 'Hey {first_name}' }));
    await waitFor(() => expect(result.current.saveState).toBe('saved'));
    expect(result.current.delegationWarning).toContain('still sending the previous version');
  });

  it('clears it once the edit is one the platform will take', async () => {
    updateFlow.mockImplementationOnce(async (_id: string, patch: { graph: FlowGraph; name: string }) => ({
      flow: { ...flowFixture(patch.graph), name: patch.name },
      delegationWarning: 'Instagram is still sending the previous version.',
    }));
    const { result } = await mountBuilder();

    act(() => result.current.updateNodeConfig('send', { text: 'Hey {first_name}' }));
    await waitFor(() => expect(result.current.delegationWarning).not.toBeNull());

    // The default mock (no warning) answers the next save — the fix landing.
    act(() => result.current.updateNodeConfig('send', { text: 'Here you go' }));
    await waitFor(() => expect(result.current.delegationWarning).toBeNull());
  });

  it('says when a pause was not confirmed by the platform', async () => {
    pauseFlowMock.mockImplementation(async () => ({
      flow: flowFixture(),
      cancelledRuns: 0,
      warning: "Instagram hasn't confirmed it stopped — new comments may still get the DM.",
    }));
    const { result } = await mountBuilder();

    await act(async () => { await result.current.pause(); });
    // "Paused" is a claim about what fans experience. An unconfirmed stop
    // still reaches them, so it has to outlive the click that caused it.
    expect(result.current.delegationWarning).toContain("hasn't confirmed it stopped");
  });
});

/* Both raised in review on #81. Each leaves a creator with two statements in
 * front of them that cannot both be true. */
describe('warnings that must not outlive what they describe', () => {
  it('a successful activation clears a stale unconfirmed-pause banner', async () => {
    pauseFlowMock.mockImplementation(async () => ({
      flow: flowFixture(), cancelledRuns: 0,
      warning: "Instagram hasn't confirmed it stopped.",
    }));
    activateFlowMock.mockImplementation(async () => ({ flow: flowFixture(), legacyPaused: false }));
    const { result } = await mountBuilder();

    await act(async () => { await result.current.pause(); });
    expect(result.current.delegationWarning).not.toBeNull();

    // Switching it back on registers it afresh, so "it never stopped" is no
    // longer a statement about anything.
    await act(async () => { await result.current.activate(); });
    expect(result.current.delegationWarning).toBeNull();
  });

  it('a refused activation keeps it, because nothing about the flow changed', async () => {
    const { FlowNotReadyError } = await import('../lib/api');
    pauseFlowMock.mockImplementation(async () => ({
      flow: flowFixture(), cancelledRuns: 0,
      warning: "Instagram hasn't confirmed it stopped.",
    }));
    activateFlowMock.mockImplementation(async () => {
      throw new FlowNotReadyError([{ nodeId: 'send', message: 'Write the message.' }]);
    });
    const { result } = await mountBuilder();

    await act(async () => { await result.current.pause(); });
    await act(async () => { await result.current.activate(); });
    expect(result.current.delegationWarning).not.toBeNull();
  });
});
