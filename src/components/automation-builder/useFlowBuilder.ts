import { useCallback, useEffect, useRef, useState } from 'react';
import {
  activateFlow, commitProposal, discardProposal, fetchActiveProposal, fetchFlow,
  fetchFlowAiMessages, fetchFlowValidation, pauseFlow, proposeFlow, updateFlow,
  FlowConflictError,
  ApiError, FlowNotReadyError,
  type AutomationFlow, type ComposerProgressEvent, type FlowAiMessage, type FlowProblem,
  type FlowProposal,
} from '../../lib/api';
import { NODE_LABEL, emptyGraph, newNodeId, type FlowGraph, type FlowNode, type FlowNodeType } from '../../lib/flowSchema';
import { isCreatorSafe } from '../../lib/voice';
import { layoutGraph, needsLayout } from '../../lib/flowLayout';
import { activityLines, parseOperations } from '../../lib/composerActivity';

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
  source: 'model' | 'fallback' | 'intent' | 'manual';
}

export interface HistoryEntry {
  /** Empty when the prompt fell on an earlier, not-yet-loaded page. */
  prompt: string;
  summary: string;
  at: number;
  source: 'model' | 'fallback' | 'intent' | 'manual';
  /** Creator name of the step the exchange concerned ("Message"), if one. */
  nodeLabel?: string | null;
  /** What actually changed, from the server's permanent record. */
  operationSummary?: string | null;
}

/**
 * The server's conversation rows, paired into display entries: each user row
 * with the answer that follows it. A page boundary can split a pair — the
 * answer then stands alone with an empty prompt rather than being dropped.
 */
function entriesFromMessages(messages: FlowAiMessage[], graph: FlowGraph): HistoryEntry[] {
  const label = (nodeId: string | null): string | null => {
    if (!nodeId) return null;
    const node = graph.nodes.find(n => n.id === nodeId);
    return node ? NODE_LABEL[node.type] : null;
  };
  const entries: HistoryEntry[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const answer = message.role === 'user' && messages[i + 1]?.role === 'assistant' ? messages[i + 1] : null;
    entries.push({
      prompt: message.role === 'user' ? message.content : '',
      summary: message.role === 'user' ? (answer?.content ?? '') : message.content,
      at: Date.parse(message.createdAt) || Date.now(),
      source: (answer ?? message).source ?? 'manual',
      nodeLabel: label((answer ?? message).nodeId ?? message.nodeId),
      operationSummary: (answer ?? message).operationSummary,
    });
    if (answer) i++;
  }
  return entries;
}

const AUTOSAVE_DELAY_MS = 700;
/** How long an AI-touched node keeps its highlight. */
export const HIGHLIGHT_MS = 2600;

export function useFlowBuilder(flowId: string | null) {
  const [flow, setFlow] = useState<AutomationFlow | null>(null);
  /**
   * The version the server last confirmed, in a ref rather than read off
   * `flow` at save time — the save loop drains a queue and would otherwise
   * send the same stale number for every item in it, refusing its own writes
   * from the second one onward.
   */
  const versionRef = useRef<number | null>(null);
  const [graph, setGraph] = useState<FlowGraph>(emptyGraph());
  const [name, setName] = useState('New automation');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  /**
   * Somebody else saved while this creator was working, and the server
   * declined the write rather than letting it land on top.
   *
   * Held separately from saveState's 'error' because the two need different
   * words and different offers: an error is "that didn't go through, it will
   * try again", and this is "your version and theirs have come apart, pick
   * one". Autosave stops while it is set — retrying would just be refused
   * again, every few seconds, forever.
   */
  const [conflict, setConflict] = useState<string | null>(null);
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
  /**
   * Recorded writes since the last compose answer. The chat panel's Undo
   * button sits ON that answer, and the shared stack pops whatever is newest
   * — so once the creator has made a later edit of their own, the button
   * would revert the wrong thing and must go. Drags don't count: they're not
   * recorded, not undoable, and not a reason to hide anything.
   */
  const [editsSinceCard, setEditsSinceCard] = useState(0);
  /**
   * What the last composer answer actually did, in order.
   *
   * Derived from the operations the server validated, applied and saved — not
   * from anything in flight — so the activity list can only ever describe
   * changes that are already in the graph. Shown under the latest answer in
   * the chat panel; cleared when the next request goes out, which is the only
   * moment it stops describing the newest change.
   */
  const [activity, setActivity] = useState<string[]>([]);
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  /** Whether the server holds pages of the conversation older than what's
   *  loaded. The oldest loaded message id is the cursor for walking back. */
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const historyCursor = useRef<string | null>(null);
  /**
   * The agent's draft, awaiting the creator's Build this. While a proposal
   * exists the graph is exactly what the creator last saw — drafting and
   * revising happen entirely inside it. `proposalTrace` is the real event
   * sequence that built the draft, for the panel's build trace.
   */
  const [proposal, setProposal] = useState<FlowProposal | null>(null);
  const [proposalTrace, setProposalTrace] = useState<ComposerProgressEvent[] | null>(null);
  const [committing, setCommitting] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [problems, setProblemsRaw] = useState<FlowProblem[]>([]);
  // Problem sentences come from the server. They're written for the creator
  // there too, but this is the last line before a canvas warning chip — a
  // problem that reads like software (an old server, a provider echo) shows
  // as a calm generic ask instead. Same rule as lib/voice everywhere else.
  const setProblems = useCallback((next: FlowProblem[]) => {
    setProblemsRaw(next.map(p => (isCreatorSafe(p.message) ? p : { ...p, message: 'This step needs attention before the automation can run.' })));
  }, []);

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
  /** The in-flight save's drain loop, so a commit can wait for the canvas to
   *  really be on the server before building on top of it. */
  const saveRun = useRef<Promise<void> | null>(null);

  // ------------------------------------------------------- validate/activate
  /**
   * Ask the server what still stands between this flow and going live.
   *
   * Deliberately the server's answer and not a local re-implementation: it is
   * the same call Activate makes, so the notification bell can never say "all
   * caught up" about a flow the server would refuse.
   *
   * Answers are sequenced because they can overtake each other: two saves in
   * quick succession each validate, and opening a different automation starts
   * its own. Whichever request left last is the only one describing the graph
   * on screen — an earlier answer arriving after it would put blockers on the
   * bell for a version that no longer exists, or clear ones that still stand.
   */
  const validationSeq = useRef(0);
  const refreshValidation = useCallback(async () => {
    if (!flowId) return [];
    const seq = ++validationSeq.current;
    try {
      const result = await fetchFlowValidation(flowId);
      // Still returned to the caller — Activate asks directly and wants its
      // own answer — but a superseded one must not reach the bell.
      if (seq === validationSeq.current) setProblems(result.problems);
      return result.problems;
    } catch {
      return [];
    }
  }, [flowId, setProblems]);

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
    // A different automation is a different conversation: the previous
    // flow's draft must not survive the switch, or Build this would submit
    // the old proposal against the new flow.
    setProposal(null);
    setProposalTrace(null);
    setProposalError(null);
    fetchFlow(flowId)
      .then(loaded => {
        if (cancelled) return;
        setFlow(loaded);
        versionRef.current = loaded.version;
        setName(loaded.name);
        // An imported or AI-built graph arrives with no meaningful positions;
        // laying it out on open is what makes it readable at a glance. A graph
        // the creator has already arranged is left exactly as they left it.
        setGraph(needsLayout(loaded.graph) ? layoutGraph(loaded.graph) : loaded.graph);
        dirty.current = false;
        // So the bell is right the moment the builder opens, rather than
        // after the first edit.
        void refreshValidation();
        // The automation's build conversation, from the server — this is what
        // makes the composer remember across a refresh. Its absence must
        // never block the builder: a fetch failure just opens an empty chat.
        fetchFlowAiMessages(flowId)
          .then(({ messages, hasMore }) => {
            if (cancelled || !messages.length) return;
            historyCursor.current = messages[0].id;
            setHistoryHasMore(hasMore);
            setHistory(entriesFromMessages(messages, loaded.graph));
          })
          .catch(() => {});
        // A draft awaiting confirmation survives a refresh: the creator
        // comes back to the same card, not to replayed build progress.
        fetchActiveProposal(flowId)
          .then(({ proposal: active }) => {
            if (!cancelled && active) setProposal(active);
          })
          .catch(() => {});
      })
      .catch(err => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load this automation.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [flowId, refreshValidation]);

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
    setConflict(null);
    let resolveRun: () => void = () => {};
    saveRun.current = new Promise<void>(resolve => { resolveRun = resolve; });
    // Drain rather than recurse: whatever arrived while a save was in flight
    // is written by this same loop, so the last thing the creator typed is
    // always the thing that ends up stored.
    let current: { graph: FlowGraph; name: string } | null = next;
    try {
      let warning: string | undefined;
      while (current) {
        // The version this client believes the server holds. Kept current by
        // setFlow below on every accepted write, so a run of saves does not
        // start refusing itself.
        const updated = await updateFlow(flowId, {
          graph: current.graph,
          name: current.name,
          expectedVersion: versionRef.current ?? undefined,
        });
        setFlow(updated.flow);
        versionRef.current = updated.flow.version;
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
      // Re-check now that the server holds this version. The notification bell
      // is only useful if it keeps up with the edit that just landed — and
      // asking any earlier would validate the previous graph.
      void refreshValidation();
    } catch (err) {
      if (err instanceof FlowConflictError) {
        // Not a failure — a refusal, and the right answer is a choice rather
        // than a retry. Anything queued behind this save is dropped: it was
        // written against a version the server has moved past.
        pending.current = null;
        setConflict(err.message);
        setSaveState('idle');
      } else {
        // Deliberately surfaced. "Autosaved just now" is a promise, and a failed
        // save that shows nothing is the one way this UI can lie to a creator.
        setSaveState('error');
        console.error('[builder] autosave failed', err);
      }
    } finally {
      saving.current = false;
      saveRun.current = null;
      resolveRun();
    }
  }, [flowId, refreshValidation]);

  useEffect(() => {
    // Not while the versions are apart: every attempt would be refused again,
    // once every few seconds, until somebody chose. The choice is the fix.
    if (!dirty.current || !flowId || conflict) return;
    const timer = setTimeout(() => {
      dirty.current = false;
      void persist({ graph, name });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [graph, name, flowId, persist, conflict]);

  /**
   * Take their version. The local edits go — which is the honest cost of the
   * choice, and why the other one exists.
   */
  const takeTheirs = useCallback(async () => {
    if (!flowId) return;
    const loaded = await fetchFlow(flowId);
    setFlow(loaded);
    versionRef.current = loaded.version;
    setName(loaded.name);
    setGraph(needsLayout(loaded.graph) ? layoutGraph(loaded.graph) : loaded.graph);
    dirty.current = false;
    setConflict(null);
    setSaveState('idle');
    void refreshValidation();
  }, [flowId, refreshValidation]);

  /**
   * Keep mine, on top of theirs. Their edit is in the automation's history
   * either way, and the next person to save will be told the same thing this
   * creator was just told — which is the whole point of the guard.
   */
  const keepMine = useCallback(async () => {
    if (!flowId) return;
    // Ask the server what it holds now, then write against that, so this is
    // a deliberate overwrite rather than another refusal.
    const loaded = await fetchFlow(flowId);
    versionRef.current = loaded.version;
    setConflict(null);
    dirty.current = false;
    await persist({ graph, name });
  }, [flowId, persist, graph, name]);

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
    setEditsSinceCard(n => n + 1);
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


  /** Walk the conversation one page further into the past. */
  const loadEarlierHistory = useCallback(async () => {
    if (!flowId || !historyCursor.current) return;
    try {
      const { messages, hasMore } = await fetchFlowAiMessages(flowId, { before: historyCursor.current });
      if (messages.length) {
        historyCursor.current = messages[0].id;
        setHistory(h => [...entriesFromMessages(messages, graph), ...h]);
      }
      setHistoryHasMore(hasMore);
    } catch {
      // The button stays; trying again can succeed.
    }
  }, [flowId, graph]);

  /**
   * Ask the agent to DRAFT. The graph does not move here — the agent builds
   * (or revises) a proposal, and the canvas changes only when the creator
   * clicks Build this (confirmProposal below). While a draft is showing, a
   * new prompt continues the proposal conversation: "make the first message
   * shorter" edits the drafted message, not the canvas.
   */
  const compose = useCallback(async (prompt: string) => {
    if (!flowId || composing) return;
    setComposing(true);
    setActivity([]);
    setProposalError(null);
    const selected = selectedNodeId ? graph.nodes.find(n => n.id === selectedNodeId) ?? null : null;
    const nodeLabel = selected ? NODE_LABEL[selected.type] : null;
    try {
      const result = await proposeFlow(flowId, {
        prompt,
        selectedNodeId,
        proposalId: proposal?.status === 'awaiting_confirmation' ? proposal.id : null,
      });
      setHistory(h => [...h, { prompt, summary: result.summary, at: Date.now(), source: result.source, nodeLabel }]);
      if (result.proposal) {
        setProposal(result.proposal);
        setProposalTrace(result.progress ?? null);
      }
      // A clarification is just the question, in the conversation — the
      // agent asked instead of guessing, and there is nothing to confirm yet.
    } catch (err) {
      const summary = err instanceof Error ? err.message : "Couldn't draft that. Try again in a moment.";
      // A failure is part of the conversation. The panel renders answers from
      // the history, so a request that died on the network must land there
      // too — a re-enabled input with no reply reads as being ignored.
      setHistory(h => [...h, { prompt, summary, at: Date.now(), source: 'manual', nodeLabel }]);
    } finally {
      setComposing(false);
    }
  }, [flowId, composing, graph, selectedNodeId, proposal]);

  /**
   * Build this — the explicit human confirmation gate. Only here do the
   * agent's operations reach the stored graph, and only as a whole: the
   * server re-validates against the live canvas and either builds everything
   * or nothing. Returns the touched node ids so the page can bring the new
   * region into view.
   */
  const confirmProposal = useCallback(async (): Promise<string[] | null> => {
    if (!flowId || !proposal || committing) return null;
    setCommitting(true);
    setProposalError(null);
    const before = { graph, name };
    try {
      // The server must hold the canvas the creator is looking at before it
      // decides whether the draft still fits it. An unflushed edit here would
      // either be silently overwritten by the build, or — worse — land AFTER
      // it and overwrite the build. Flush first; if the edit moved the flow's
      // version past the draft's, the commit answers stale, which is honest.
      if (dirty.current) {
        dirty.current = false;
        await persist(before);
      }
      if (saveRun.current) await saveRun.current;
      const result = await commitProposal(flowId, proposal.id);
      if (!result.applied || !result.flow) {
        throw new Error(result.summary || "Couldn't build this. Nothing was changed.");
      }
      pushUndo(before);
      setFlow(result.flow);
      versionRef.current = result.flow.version;
      setName(result.flow.name);
      // The server saved this graph itself; the layout pass is the only
      // local change and must not mark the builder dirty.
      setGraph(layoutGraph(result.flow.graph));
      dirty.current = false;
      setSaveState('saved');
      setSavedAt(Date.now());
      void refreshValidation();
      setChangeCard({
        summary: result.summary,
        touchedNodeIds: result.touchedNodeIds ?? [],
        previousGraph: before.graph,
        previousName: before.name,
        source: 'intent',
      });
      setEditsSinceCard(0);
      setActivity(activityLines(parseOperations(result.operations), result.flow.graph));
      highlight(result.touchedNodeIds ?? []);
      setHistory(h => [...h, { prompt: '', summary: result.summary, at: Date.now(), source: 'intent' }]);
      setProposal(null);
      setProposalTrace(null);
      return result.touchedNodeIds ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't build this. Nothing was changed.";
      // A draft the server can no longer build (the canvas changed under it)
      // is spent; the next prompt drafts fresh against what's really there.
      // The card goes with it, so the explanation moves to the conversation —
      // an error shown only on a card that just vanished is an error unseen.
      if (err instanceof ApiError && (err.code === 'proposal_stale' || err.code === 'proposal_not_active')) {
        setProposal(null);
        setProposalTrace(null);
        setHistory(h => [...h, { prompt: '', summary: message, at: Date.now(), source: 'manual' }]);
      } else {
        setProposalError(message);
      }
      return null;
    } finally {
      setCommitting(false);
    }
  }, [flowId, proposal, committing, graph, name, persist, pushUndo, highlight, refreshValidation]);

  /** Never mind — the draft goes away; the canvas never moved. */
  const discardDraft = useCallback(() => {
    if (!flowId || !proposal) return;
    const snapshot = proposal;
    const trace = proposalTrace;
    setProposal(null);
    setProposalTrace(null);
    setProposalError(null);
    // Optimistic, but not silent: if the server never heard the discard, the
    // draft would still be active there and reappear on refresh — so the card
    // comes back with a word, unless a newer draft has already replaced it.
    void discardProposal(flowId, snapshot.id).catch(() => {
      setProposal(current => {
        if (current) return current;
        setProposalTrace(trace);
        setProposalError("Couldn't put the draft away just now — try the X again.");
        return snapshot;
      });
    });
  }, [flowId, proposal, proposalTrace]);

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
      versionRef.current = result.flow.version;
      setProblems([]);
      // Activation registers the automation with the platform afresh, so any
      // earlier complaint — an edit that hadn't reached it, a pause it never
      // confirmed — describes a state that no longer exists. Left standing, a
      // banner saying "Instagram hasn't confirmed it stopped" would greet the
      // creator on an automation they have just deliberately switched on.
      // Only on success: a refused activation leaves the flow exactly as the
      // warning describes it.
      setDelegationWarning(null);
      return { ok: true, problems: [] };
    } catch (err) {
      if (err instanceof FlowNotReadyError) {
        setProblems(err.problems);
        return { ok: false, problems: err.problems };
      }
      throw err;
    }
  }, [flowId, graph, name, persist, setProblems]);

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
    conflict, takeTheirs, keepMine,
    composing, changeCard, setChangeCard, editsSinceCard,
    activity, highlighted, history, historyHasMore, loadEarlierHistory,
    problems, refreshValidation,
    updateNodeConfig, moveNode, addNode, deleteNode, connectNodes, disconnect,
    rename, relayout, commitGraph,
    compose, undo, canUndo,
    proposal, proposalTrace, committing, proposalError, confirmProposal, discardDraft,
    activate, pause,
  };
}
