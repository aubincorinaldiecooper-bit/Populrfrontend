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
import type { AutomationFlow } from '../lib/api';
import type { FlowGraph, FlowNode } from '../lib/flowSchema';

const updateFlow = vi.fn();
const composeFlowMock = vi.fn();
const activateFlowMock = vi.fn();
const pauseFlowMock = vi.fn();

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
    composeFlow: (...args: unknown[]) => composeFlowMock(...args),
    activateFlow: (...args: unknown[]) => activateFlowMock(...args),
    fetchFlowValidation: vi.fn(async () => ({ ok: true, problems: [] })),
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
  it('applies the server\'s graph, reports what changed, and can be undone', async () => {
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
    composeFlowMock.mockResolvedValue({
      applied: true,
      summary: 'Added a 2-day delay and follow-up DM.',
      source: 'model',
      operations: [{ op: 'create_node', id: 'wait-1d', type: 'wait' }],
      touchedNodeIds: ['wait-1d'],
      previousGraph: baseGraph(),
      flow: flowFixture(nextGraph),
    });

    const { result } = await mountBuilder();
    await act(async () => { await result.current.compose('wait two days before tagging'); });

    expect(result.current.graph.nodes.some(n => n.id === 'wait-1d')).toBe(true);
    expect(result.current.changeCard?.summary).toBe('Added a 2-day delay and follow-up DM.');
    expect(result.current.highlighted).toEqual(['wait-1d']);
    expect(result.current.history).toHaveLength(1);

    act(() => result.current.undo());
    expect(result.current.graph.nodes.some(n => n.id === 'wait-1d')).toBe(false);
  });

  it('does not re-save the graph the server just returned', async () => {
    composeFlowMock.mockResolvedValue({
      applied: true, summary: 'Renamed it.', source: 'model',
      operations: [], touchedNodeIds: [], previousGraph: baseGraph(), flow: flowFixture(),
    });

    const { result } = await mountBuilder();
    await act(async () => { await result.current.compose('rename it') });
    await new Promise(r => setTimeout(r, 900));

    expect(updateFlow).not.toHaveBeenCalled();
  });

  it('says so plainly when it understood nothing, instead of silently doing nothing', async () => {
    composeFlowMock.mockResolvedValue({
      applied: false,
      summary: "I couldn't work out what to change from that.",
      source: 'fallback', operations: [], flow: flowFixture(),
    });

    const { result } = await mountBuilder();
    await act(async () => { await result.current.compose('do the thing') });

    expect(result.current.changeCard?.summary).toMatch(/couldn't work out/);
    expect(result.current.graph.nodes).toHaveLength(3);
  });

  it('reports a failure rather than leaving the composer silent', async () => {
    composeFlowMock.mockRejectedValue(new Error('The model is unavailable.'));

    const { result } = await mountBuilder();
    await act(async () => { await result.current.compose('anything') });

    expect(result.current.changeCard?.summary).toBe('The model is unavailable.');
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
