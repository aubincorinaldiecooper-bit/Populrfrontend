import { useCallback, useEffect, useRef, useState } from 'react';
import {
  activateFlow, composeFlow, createFlow, fetchFlow, fetchFlowValidation, pauseFlow, updateFlow,
  FlowNotReadyError,
  type AutomationFlow, type FlowProblem,
} from '../../lib/api';
import { emptyGraph, newNodeId, type FlowGraph, type FlowNode, type FlowNodeType } from '../../lib/flowSchema';
import { layoutGraph, needsLayout } from '../../lib/flowLayout';

/**
 * All of the builder's state in one place: the graph, what's selected, the
 * autosave, and the undo stack.
 *
 * Two decisions worth naming.
 *
 * Autosave is debounced and last-write-wins, with an in-flight guard. The
 * creator is told "Autosaved just now" and there is no Save button, so the
 * only unacceptable outcome is a change that looks saved and isn't — hence
 * the explicit 'error' state rather than a silent retry.
 *
 * Undo keeps whole graph snapshots rather than inverse operations. A flow is
 * a few dozen small nodes; storing the document is cheaper to get right than
 * inverting a delete-and-splice, and it means undo behaves identically whether
 * the change came from the AI, the inspector, or a drag.
 */

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface ChangeCard {
  summary: string;
  /** Nodes the change touched — briefly highlighted on the canvas. */
  touchedNodeIds: string[];
  /** The graph before the change, so Undo is a single assignment. */
  previousGraph: FlowGraph;
  previousName: string;
  source: 'model' | 'fallback' | 'manual';
}

export interface HistoryEntry {
  prompt: string;
  summary: string;
  at: number;
  source: 'model' | 'fallback' | 'manual';
}

const AUTOSAVE_DELAY_MS = 700;
/** How long an AI-touched node keeps its highlight. */
export const HIGHLIGHT_MS = 2600;

export function useFlowBuilder(flowId: string | null) {
  const [flow, setFlow] = useState<AutomationFlow | null>(null);
  const [graph, setGraph] = useState<FlowGraph>(emptyGraph());
  const [name, setName] = useState('New automation');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  /**
   * Set when the last save reached Populr but not Instagram — the automation
   * is live and still sending its previous message, or it was paused because
   * the update could not be applied. Deliberately state rather than a toast:
   * autosave fires on every pause in typing, and a toast per keystroke would
   * be unreadable, while this is a condition that persists until the edit is
   * one Instagram will take.
   */
  const [delegationWarning, setDelegationWarning] = useState<string | null>(null);

  const [composing, setComposing] = useState(false);
  const [changeCard, setChangeCard] = useState<ChangeCard | null>(null);
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [problems, setProblems] = useState<FlowProblem[]>([]);

  // Undo stack of snapshots. Bounded — a builder session shouldn't grow
  // without limit, and nobody undoes twenty steps in a node editor.
  //
  // The stack itself is a ref (it must not drive renders on every push), but
  // its emptiness is mirrored in state: reading the ref during render would
  // leave the Undo button showing whatever it showed last paint.
  const undoStack = useRef<{ graph: FlowGraph; name: string }[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  /** Set by every write; the autosave effect skips the load that produced it. */
  const dirty = useRef(false);
  const saving = useRef(false);
  const pending = useRef<{ graph: FlowGraph; name: string } | null>(null);

  // ---------------------------------------------------------------- load
  useEffect(() => {
    let cancelled = false;
    // Loading from the backend, not deriving state — the same fetch-on-mount
    // convention the rest of the app's pages use.
    if (!flowId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    fetchFlow(flowId)
      .then(loaded => {
        if (cancelled) return;
        setFlow(loaded);
        setName(loaded.name);
        // An imported or AI-built graph arrives with no meaningful positions;
        // laying it out on open is what makes it readable at a glance. A graph
        // the creator has already arranged is left exactly as they left it.
        setGraph(needsLayout(loaded.graph) ? layoutGraph(loaded.graph) : loaded.graph);
        dirty.current = false;
      })
      .catch(err => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load this automation.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [flowId]);

  // ------------------------------------------------------------- autosave
  const persist = useCallback(async (next: { graph: FlowGraph; name: string }) => {
    if (!flowId) return;
    if (saving.current) {
      // Coalesce: keep only the newest pending state, so a burst of typing
      // costs one more request rather than one per keystroke.
      pending.current = next;
      return;
    }

    saving.current = true;
    setSaveState('saving');
    // Drain rather than recurse: whatever arrived while a save was in flight
    // is written by this same loop, so the last thing the creator typed is
    // always the thing that ends up stored.
    let current: { graph: FlowGraph; name: string } | null = next;
    try {
      let warning: string | undefined;
      while (current) {
        const updated = await updateFlow(flowId, { graph: current.graph, name: current.name });
        setFlow(updated.flow);
        warning = updated.delegationWarning;
        current = pending.current;
        pending.current = null;
      }
      // Only the last write's answer counts: an earlier keystroke's warning
      // describes a graph the creator has already typed past. Cleared on a
      // clean save, so fixing the edit removes the banner without a reload.
      setDelegationWarning(warning ?? null);
      setSaveState('saved');
      setSavedAt(Date.now());
    } catch (err) {
      // Deliberately surfaced. "Autosaved just now" is a promise, and a failed
      // save that shows nothing is the one way this UI can lie to a creator.
      setSaveState('error');
      console.error('[builder] autosave failed', err);
    } finally {
      saving.current = false;
    }
  }, [flowId]);

  useEffect(() => {
    if (!dirty.current || !flowId) return;
    const timer = setTimeout(() => {
      dirty.current = false;
      void persist({ graph, name });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [graph, name, flowId, persist]);

  // -------------------------------------------------------------- editing
  const pushUndo = useCallback((snapshot: { graph: FlowGraph; name: string }) => {
    undoStack.current = [...undoStack.current.slice(-19), snapshot];
    setCanUndo(true);
  }, []);

  /** The single write path — everything that changes the graph goes through it. */
  const commitGraph = useCallback((
    next: FlowGraph,
    options: { record?: boolean; nextName?: string } = {},
  ) => {
    if (options.record !== false) pushUndo({ graph, name });
    dirty.current = true;
    setGraph(next);
    if (options.nextName !== undefined) setName(options.nextName);
  }, [graph, name, pushUndo]);

  const updateNodeConfig = useCallback((nodeId: string, patch: Record<string, unknown>) => {
    commitGraph({
      ...graph,
      nodes: graph.nodes.map(n => (n.id === nodeId ? { ...n, config: { ...n.config, ...patch } } : n)),
    });
  }, [graph, commitGraph]);

  const moveNode = useCallback((nodeId: string, position: { x: number; y: number }) => {
    // Dragging is not an undoable "change" — it produces no different
    // behaviour, and filling the undo stack with drags would bury the edit a
    // creator actually wants to take back.
    dirty.current = true;
    setGraph(current => ({
      ...current,
      nodes: current.nodes.map(n => (n.id === nodeId ? { ...n, position } : n)),
    }));
  }, []);

  /**
   * Insert a step after `afterNodeId` on `branch`, splicing it into whatever
   * was already connected there so adding a step in the middle never severs
   * the rest of the flow.
   */
  const addNode = useCallback((
    type: FlowNodeType,
    afterNodeId: string | null,
    branch: 'next' | 'yes' | 'no' = 'next',
    config: Record<string, unknown> = {},
  ): string => {
    const id = newNodeId(type, graph);
    const source = afterNodeId ? graph.nodes.find(n => n.id === afterNodeId) ?? null : null;
    const existing = source
      ? graph.edges.find(e => e.source === source.id && e.branch === branch)
      : undefined;

    const node: FlowNode = {
      id,
      type,
      position: source
        ? { x: source.position.x + 284, y: source.position.y }
        : { x: 0, y: 0 },
      config,
    };

    // The first step on an empty canvas has nothing to connect to. Without
    // this the graph would carry an edge whose source is a node that doesn't
    // exist, and the server would refuse to save the whole flow.
    const edges = source
      ? graph.edges
          .filter(e => !(e.source === source.id && e.branch === branch))
          .concat({ id: `${source.id}-${branch}-${id}`, source: source.id, target: id, branch })
      : [...graph.edges];

    // Reconnect the displaced tail below the new step. A condition has no
    // single "next", so its two answers are left for the creator to wire.
    if (source && existing && type !== 'condition') {
      edges.push({ id: `${id}-next-${existing.target}`, source: id, target: existing.target, branch: 'next' });
    }

    commitGraph(layoutGraph({ ...graph, nodes: [...graph.nodes, node], edges }));
    setSelectedNodeId(id);
    return id;
  }, [graph, commitGraph]);

  const deleteNode = useCallback((nodeId: string) => {
    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node || node.type === 'trigger') return;

    const incoming = graph.edges.filter(e => e.target === nodeId);
    const outgoing = graph.edges.filter(e => e.source === nodeId);
    let edges = graph.edges.filter(e => e.source !== nodeId && e.target !== nodeId);

    // Same healing rule as the backend's delete_node op: splice the chain back
    // together when there's exactly one successor to splice to.
    const successor = outgoing.length === 1 ? outgoing[0].target : null;
    if (successor) {
      for (const edge of incoming) {
        const clashes = edges.some(e => e.source === edge.source && e.branch === edge.branch);
        if (!clashes && edge.source !== successor) {
          edges = edges.concat({
            id: `${edge.source}-${edge.branch}-${successor}`,
            source: edge.source, target: successor, branch: edge.branch,
          });
        }
      }
    }

    commitGraph(layoutGraph({ ...graph, nodes: graph.nodes.filter(n => n.id !== nodeId), edges }));
    setSelectedNodeId(current => (current === nodeId ? null : current));
  }, [graph, commitGraph]);

  const connectNodes = useCallback((source: string, target: string, branch: 'next' | 'yes' | 'no') => {
    if (source === target) return;
    const edges = graph.edges
      .filter(e => !(e.source === source && e.branch === branch))
      .concat({ id: `${source}-${branch}-${target}`, source, target, branch });
    commitGraph({ ...graph, edges });
  }, [graph, commitGraph]);

  const disconnect = useCallback((edgeId: string) => {
    commitGraph({ ...graph, edges: graph.edges.filter(e => e.id !== edgeId) });
  }, [graph, commitGraph]);

  const rename = useCallback((next: string) => {
    dirty.current = true;
    setName(next);
  }, []);

  const relayout = useCallback(() => {
    commitGraph(layoutGraph(graph));
  }, [graph, commitGraph]);

  // ------------------------------------------------------------------ AI
  const highlight = useCallback((ids: string[]) => {
    setHighlighted(ids);
    if (!ids.length) return;
    const timer = setTimeout(() => setHighlighted([]), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, []);

  const compose = useCallback(async (prompt: string) => {
    if (!flowId || composing) return;
    setComposing(true);
    const before = { graph, name };
    try {
      const result = await composeFlow(flowId, { prompt, selectedNodeId });
      setHistory(h => [...h, { prompt, summary: result.summary, at: Date.now(), source: result.source }]);

      if (!result.applied || !result.flow) {
        // The composer understood nothing actionable. Say so plainly rather
        // than silently doing nothing — a canvas that doesn't move after a
        // request reads as a bug.
        setChangeCard({
          summary: result.summary,
          touchedNodeIds: [],
          previousGraph: before.graph,
          previousName: before.name,
          source: result.source,
        });
        return;
      }

      pushUndo(before);
      setFlow(result.flow);
      setName(result.flow.name);
      // The server has already saved this graph, so the layout pass is the
      // only local change — and it must not mark the builder dirty, or every
      // AI edit would trigger a redundant save of what we just received.
      setGraph(layoutGraph(result.flow.graph));
      dirty.current = false;
      setSaveState('saved');
      setSavedAt(Date.now());

      setChangeCard({
        summary: result.summary,
        touchedNodeIds: result.touchedNodeIds ?? [],
        previousGraph: before.graph,
        previousName: before.name,
        source: result.source,
      });
      highlight(result.touchedNodeIds ?? []);
    } catch (err) {
      setChangeCard({
        summary: err instanceof Error ? err.message : 'That change could not be applied.',
        touchedNodeIds: [],
        previousGraph: before.graph,
        previousName: before.name,
        source: 'manual',
      });
    } finally {
      setComposing(false);
    }
  }, [flowId, composing, graph, name, selectedNodeId, pushUndo, highlight]);

  /** Undo the last change — AI or manual — and save the restored graph. */
  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    dirty.current = true;
    setGraph(previous.graph);
    setName(previous.name);
    setChangeCard(null);
    setHighlighted([]);
    setCanUndo(undoStack.current.length > 0);
  }, []);

  // ------------------------------------------------------- validate/activate
  const refreshValidation = useCallback(async () => {
    if (!flowId) return [];
    try {
      const result = await fetchFlowValidation(flowId);
      setProblems(result.problems);
      return result.problems;
    } catch {
      return [];
    }
  }, [flowId]);

  const activate = useCallback(async (): Promise<{ ok: boolean; problems: FlowProblem[] }> => {
    if (!flowId) return { ok: false, problems: [] };
    // Flush any pending edit first: activating a graph the server hasn't seen
    // would validate the previous version and switch on the wrong thing.
    if (dirty.current) {
      dirty.current = false;
      await persist({ graph, name });
    }
    try {
      const result = await activateFlow(flowId);
      setFlow(result.flow);
      setProblems([]);
      return { ok: true, problems: [] };
    } catch (err) {
      if (err instanceof FlowNotReadyError) {
        setProblems(err.problems);
        return { ok: false, problems: err.problems };
      }
      throw err;
    }
  }, [flowId, graph, name, persist]);

  const pause = useCallback(async () => {
    if (!flowId) return;
    const result = await pauseFlow(flowId);
    setFlow(result.flow);
    // A pause Instagram hasn't confirmed leaves the automation still able to
    // DM commenters, which outlives the toast that reports it — so it takes
    // the same persistent banner as an unapplied edit.
    setDelegationWarning(result.warning ?? null);
    return result;
  }, [flowId]);

  return {
    flow, graph, name, loading, loadError,
    selectedNodeId, setSelectedNodeId,
    saveState, savedAt, delegationWarning,
    composing, changeCard, setChangeCard, highlighted, history,
    problems, refreshValidation,
    updateNodeConfig, moveNode, addNode, deleteNode, connectNodes, disconnect,
    rename, relayout, commitGraph,
    compose, undo, canUndo,
    activate, pause,
  };
}

/** Create a flow and hand back its id — the "New automation" entry point. */
export async function startNewFlow(): Promise<AutomationFlow> {
  return createFlow({ name: 'New automation', graph: emptyGraph() });
}
