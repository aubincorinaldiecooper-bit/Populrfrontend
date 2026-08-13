import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  AlertTriangle, ArrowLeft, Check, Cloud, CloudOff, Loader2, MessageCircle, Pause, PenLine, Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useFlowBuilder } from '../components/automation-builder/useFlowBuilder';
import { useAccountPosts } from '../components/automation-builder/useAccountPosts';
import { useBuilderNotifications } from '../components/automation-builder/useBuilderNotifications';
import FlowCanvas from '../components/automation-builder/FlowCanvas';
import NodeInspector, { type BuilderQuestion } from '../components/automation-builder/NodeInspector';
import AIComposer from '../components/automation-builder/AIComposer';
import BuildingOverlay from '../components/automation-builder/BuildingOverlay';
import PreviewPanel from '../components/automation-builder/PreviewPanel';
import NotificationBell from '../components/automation-builder/NotificationBell';
import NotificationsPanel from '../components/automation-builder/NotificationsPanel';
import HistoryDrawer from '../components/automation-builder/HistoryDrawer';
import {
  fetchCapabilities, fetchConnectedAccounts, fetchFlowBuilderMeta,
  isBackendConfigured, testFlow,
  type ConnectedAccount, type FlowSimulationResult, type PlatformCapabilities,
} from '../lib/api';
import { platformMeta } from '../lib/platformMeta';
import { derivedNotifications, type BuilderNotification } from '../lib/builderNotifications';
import { NODE_LABEL, STEP_OPTIONS, nodeById, readTrigger, triggerNodes, type FlowNodeType } from '../lib/flowSchema';
import LoadingState from '../components/LoadingState';

/**
 * The automation builder.
 *
 * The canvas owns the viewport; everything else is transient. Nothing sits
 * permanently on either side of it — the inspector appears when a step is
 * selected, Preview and Notifications when asked for, history only when
 * opened. That restraint is the product: a creator should be looking at their
 * automation, not at the tool.
 *
 * The three things in the top right are deliberately three different
 * questions. Preview: how will this feel? The bell: what does Populr need from
 * me? Activate: put it live. Nothing else earns a place up there.
 */

type SidePanel = 'preview' | 'notifications' | 'history' | null;

export default function AutomationBuilderPage() {
  const { flowId = null } = useParams<{ flowId: string }>();
  const navigate = useNavigate();
  const { showToast } = useApp();

  const builder = useFlowBuilder(flowId);
  const {
    flow, graph, name, loading, loadError, selectedNodeId, setSelectedNodeId,
    saveState, savedAt, delegationWarning, composing, changeCard, setChangeCard, highlighted, history,
    problems, refreshValidation, updateNodeConfig, moveNode, addNode, deleteNode,
    connectNodes, rename, compose, undo, canUndo, activate, pause, commitGraph,
  } = builder;

  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  // The whole capability matrix, fetched once; the trigger's platform picks
  // the row every Send step is judged against.
  const [allCapabilities, setAllCapabilities] = useState<PlatformCapabilities[]>([]);
  const [workspaceTags, setWorkspaceTags] = useState<string[]>([]);
  const [aiConfigured, setAiConfigured] = useState(true);

  const [panel, setPanel] = useState<SidePanel>(null);
  const [testResult, setTestResult] = useState<FlowSimulationResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [activating, setActivating] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [addMenu, setAddMenu] = useState<{ nodeId: string; branch: 'next' | 'yes' | 'no' } | null>(null);

  // Arriving at a step from a notification: which one to bring into view, and
  // what Populr is asking about it once we're there.
  const [focus, setFocus] = useState<{ nodeId: string; signal: number }>({ nodeId: '', signal: 0 });
  const [question, setQuestion] = useState<(BuilderQuestion & {
    id: string; nodeId: string; sourceMessage: string;
  }) | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  /** A refused activation sent the creator to the bell — say so briefly. */
  const [bellAttention, setBellAttention] = useState(false);

  const notifications = useBuilderNotifications(problems, graph);

  const nameRef = useRef<HTMLInputElement>(null);

  // Stable across renders so the posts hook doesn't re-run on every paint.
  const postsError = useCallback(
    (message: string) => showToast(message, 'error', { durationMs: 7000 }),
    [showToast],
  );

  // ------------------------------------------------------------ reference data
  useEffect(() => {
    if (!isBackendConfigured()) return;
    void fetchConnectedAccounts().then(setAccounts).catch(() => setAccounts([]));
    void fetchCapabilities().then(setAllCapabilities).catch(() => setAllCapabilities([]));
    void fetchFlowBuilderMeta()
      .then(meta => { setAiConfigured(meta.aiConfigured); setWorkspaceTags(meta.tags); })
      // Failing open on the AI flag keeps the composer's normal copy: telling
      // a creator AI is off when the check merely failed is the worse error.
      .catch(() => setAiConfigured(true));
  }, []);

  // The trigger's platform decides which capabilities every Send is judged
  // against, so it's refetched whenever the creator switches account.
  const triggerPlatform = useMemo(() => {
    const trigger = triggerNodes(graph)[0];
    return trigger ? readTrigger(trigger).platform : null;
  }, [graph]);

  const capabilities = useMemo(
    () => allCapabilities.find(c => c.platform === triggerPlatform) ?? null,
    [allCapabilities, triggerPlatform],
  );

  // The account the When step watches. Posts are fetched FOR that account
  // rather than fetched wholesale and filtered here: the workspace can hold
  // several connected Instagram accounts, and asking the server for one
  // account's posts removes any chance of another account's showing up
  // because of a stale filter or a row attributed to the wrong account.
  const triggerAccountId = useMemo(() => {
    const trigger = triggerNodes(graph)[0];
    return trigger ? readTrigger(trigger).accountId : null;
  }, [graph]);

  const { posts, loading: postsLoading, refresh: refreshPosts } =
    useAccountPosts(triggerAccountId, postsError);

  // Re-fit whenever the shape of the graph changes, so a newly generated flow
  // lands comfortably in view rather than off-screen. Derived, not an effect:
  // the count IS the signal, and bumping a counter in an effect would just be
  // a slower way of saying the same thing.
  const fitSignal = graph.nodes.length + graph.edges.length;

  // --------------------------------------------------------------- actions
  const selectedNode = nodeById(graph, selectedNodeId);

  /**
   * The question actually on screen.
   *
   * A question belongs to a step AND to the notification that opened it, so
   * it stops being asked the moment either moves on — a different step
   * selected, or the thing it asked about answered. Derived rather than
   * cleared in an effect: "is this still being asked" is a fact about the
   * current state, not an event to react to.
   */
  const activeQuestion = useMemo(() => {
    if (!question || question.nodeId !== selectedNodeId) return null;
    return notifications.open.some(n => n.id === question.id) ? question : null;
  }, [question, selectedNodeId, notifications.open]);

  const nodeProblems = useMemo(
    () =>
      problems
        .filter(p => p.nodeId === selectedNodeId)
        // The open question is already on screen in Populr's words; printing
        // the validator's sentence beside it would say the same thing twice.
        .filter(p => p.message !== activeQuestion?.sourceMessage)
        .map(p => p.message),
    [problems, selectedNodeId, activeQuestion],
  );

  const openNotifications = useCallback(async () => {
    setPanel('notifications');
    setChecking(true);
    await refreshValidation();
    setChecking(false);
  }, [refreshValidation]);

  /** Take the creator to the step a notification is about, and ask it there. */
  const openNotification = useCallback((notification: BuilderNotification) => {
    setHighlightId(notification.id);
    if (!notification.nodeId) return;
    setSelectedNodeId(notification.nodeId);
    setFocus(current => ({ nodeId: notification.nodeId!, signal: current.signal + 1 }));
    setQuestion(
      notification.kind === 'question'
        ? {
            id: notification.id,
            nodeId: notification.nodeId,
            title: notification.title,
            field: notification.field,
            sourceMessage: notification.sourceMessage,
          }
        : null,
    );
    // Wide enough for both, the feed stays open beside the step — it is an
    // index, and closing it would cost the creator their place in the list.
    // Narrow, the two would be stacked on top of each other.
    if (window.innerWidth < 640) setPanel(null);
  }, [setSelectedNodeId]);

  useEffect(() => {
    if (!bellAttention) return;
    const timer = setTimeout(() => setBellAttention(false), 2200);
    return () => clearTimeout(timer);
  }, [bellAttention]);

  const runPreview = useCallback(async (
    input: { channel: 'comment' | 'dm'; text: string; replied: boolean },
  ): Promise<FlowSimulationResult | null> => {
    if (!flowId) return null;
    setTesting(true);
    try {
      const result = await testFlow(flowId, input);
      setTestResult(result);
      return result;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not run the preview.', 'error');
      return null;
    } finally {
      setTesting(false);
    }
  }, [flowId, showToast]);

  const onActivate = useCallback(async () => {
    setActivating(true);
    try {
      // The server decides. `problems` here is its answer, not a local guess —
      // the bell only ever shows what activation itself would refuse over.
      const result = await activate();
      if (result.ok) {
        showToast('Automation activated', 'success');
        setPanel(null);
        return;
      }
      // Not a modal and not a wall of validation: the same feed the bell
      // already offers, opened on the first thing standing in the way.
      setPanel('notifications');
      setBellAttention(true);
      const first = derivedNotifications(result.problems, graph)[0];
      setHighlightId(first?.id ?? null);
      showToast('Populr needs a couple of things first', 'error');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not activate.', 'error');
    } finally {
      setActivating(false);
    }
  }, [activate, graph, showToast]);

  const onPause = useCallback(async () => {
    try {
      const result = await pause();
      // The banner below the header already says Instagram hasn't confirmed
      // the automation stopped. Announcing "Automation paused" beside it would
      // contradict it in the same breath, and the reassuring message is the
      // one people believe.
      if (result?.warning) {
        showToast(result.warning, 'error', { durationMs: 10000 });
      } else {
        showToast(
          result && result.cancelledRuns > 0
            ? `Paused — ${result.cancelledRuns} in-progress follow-up${result.cancelledRuns === 1 ? '' : 's'} cancelled`
            : 'Automation paused',
          'success',
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not pause.', 'error');
    }
  }, [pause, showToast]);

  const onAddAfter = useCallback((nodeId: string, branch: 'next' | 'yes' | 'no') => {
    setAddMenu({ nodeId, branch });
  }, []);

  const chooseStep = useCallback((type: FlowNodeType) => {
    if (!addMenu) return;
    const defaults: Record<FlowNodeType, Record<string, unknown>> = {
      trigger: { kind: 'comment', allPosts: true, matchMode: 'any' },
      condition: { kind: 'replied' },
      send: { kind: 'dm', text: '' },
      wait: { kind: 'duration', minutes: 1440 },
      action: { kind: 'add_tag', tag: '' },
    };
    addNode(type, addMenu.nodeId, addMenu.branch, defaults[type]);
    setAddMenu(null);
  }, [addMenu, addNode]);

  // Add the first step to an empty canvas — the manual alternative to asking.
  const startManually = useCallback(() => {
    // Pre-bind the first CONNECTED account, not merely the first row — a
    // disconnected account can't run an automation, and the picker no longer
    // offers it, so pre-binding it would select something unpickable.
    const firstConnected = accounts.find(a => a.status === 'connected') ?? null;
    const id = addNode('trigger', null, 'next', {
      kind: 'comment', allPosts: true, matchMode: 'any',
      accountId: firstConnected?.id ?? null, platform: firstConnected?.platform ?? null,
    });
    setSelectedNodeId(id);
  }, [addNode, accounts, setSelectedNodeId]);

  if (loading) return <LoadingState />;

  if (loadError) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[#B91C1C]">{loadError}</p>
        <button
          type="button"
          onClick={() => navigate('/automations')}
          className="mt-3 text-[13px] font-medium text-[#111111] underline underline-offset-2"
        >
          Back to Automations
        </button>
      </div>
    );
  }

  const live = flow?.status === 'live';
  const isEmpty = graph.nodes.length === 0;

  return (
    <div className="flex flex-col h-[100dvh] md:h-screen bg-[#F7F5F2]">
      {/* ------------------------------------------------------------ header */}
      <header className="shrink-0 flex items-center gap-3 px-4 md:px-5 py-2.5 bg-white border-b border-[#E8E4DF]">
        <button
          type="button"
          onClick={() => navigate('/automations')}
          className="p-1.5 -ml-1.5 rounded-lg text-[#6B6B6B] hover:bg-[#F7F5F2] hover:text-[#111111]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
          aria-label="Back to Automations"
        >
          <ArrowLeft size={17} />
        </button>

        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/automations')}
            className="hidden sm:inline text-[13px] text-[#8A857E] hover:text-[#111111] shrink-0"
          >
            Automations
          </button>
          <span className="hidden sm:inline text-[13px] text-[#D8D3CC]">/</span>

          {editingName ? (
            <input
              ref={nameRef}
              value={name}
              onChange={e => rename(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false); }}
              autoFocus
              className="min-w-0 max-w-[280px] rounded-md border border-[#C5FF3D] px-1.5 py-0.5
                text-[14px] font-semibold text-[#111111] focus:outline-none"
              aria-label="Automation name"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="group inline-flex items-center gap-1.5 min-w-0 rounded px-1 -mx-1
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
            >
              <span className="truncate text-[14px] font-semibold text-[#111111]">{name}</span>
              <PenLine size={13} className="shrink-0 text-[#B0AAA2] group-hover:text-[#6B6B6B]" />
            </button>
          )}

          {live && (
            <span className="ml-1 shrink-0 rounded-full bg-[#F0F7DC] px-2 py-0.5 text-[10.5px]
              font-semibold uppercase tracking-wide text-[#3F6212]">
              Live
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <SaveIndicator state={saveState} savedAt={savedAt} />

          <button
            type="button"
            onClick={() => setPanel(panel === 'preview' ? null : 'preview')}
            disabled={isEmpty}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8E4DF] bg-white
              px-2.5 md:px-3 py-1.5 text-[13px] font-medium text-[#111111] hover:border-[#D8D3CC]
              disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
          >
            <MessageCircle size={14} /> <span className="hidden md:inline">Preview</span>
          </button>

          <NotificationBell
            count={notifications.unresolvedCount}
            open={panel === 'notifications'}
            attention={bellAttention}
            onClick={() => (panel === 'notifications' ? setPanel(null) : void openNotifications())}
          />

          {live ? (
            <button
              type="button"
              onClick={onPause}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8E4DF] bg-white
                px-3 py-1.5 text-[13px] font-medium text-[#111111] hover:border-[#D8D3CC]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
            >
              <Pause size={14} /> Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={onActivate}
              disabled={isEmpty || activating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#C5FF3D] px-3 md:px-4 py-1.5
                text-[13px] font-semibold text-[#111111] hover:bg-[#B9F52E] disabled:opacity-40
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]
                focus-visible:ring-offset-1"
            >
              {activating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              Activate
            </button>
          )}
        </div>
      </header>

      {/* The automation's live behaviour and this canvas have come apart.
          Sits directly under the header, above the canvas, because it
          contradicts the "Autosaved just now" sitting a few pixels above it —
          the save did happen, it just hasn't reached the people the
          automation talks to. Not a toast: autosave fires on every pause in
          typing, and this is a condition that lasts until the edit is one
          Instagram will accept, not an event. */}
      {delegationWarning && (
        <div
          role="status"
          className="flex items-start gap-2 border-b border-[#F0D9A8] bg-[#FEF7E6]
            px-4 md:px-6 py-2.5 text-[13px] text-[#7A5A12]"
        >
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-[#B8860B]" />
          <p className="flex-1">{delegationWarning}</p>
        </div>
      )}

      {/* ------------------------------------------------------------ canvas */}
      <div className="relative flex-1 min-h-0">
        <FlowCanvas
          graph={graph}
          selectedNodeId={selectedNodeId}
          highlighted={highlighted}
          problems={problems}
          posts={posts}
          activePath={testResult?.steps.map(s => s.nodeId) ?? []}
          onSelect={id => { setSelectedNodeId(id); setAddMenu(null); }}
          onMove={moveNode}
          onConnect={connectNodes}
          onAddAfter={onAddAfter}
          fitSignal={fitSignal}
          focusNodeId={focus.nodeId || null}
          focusSignal={focus.signal}
        />

        {/* Building an automation takes a few seconds of someone else's
            computer thinking. Say so on the canvas, where they're looking. */}
        {composing && <BuildingOverlay building={isEmpty} />}

        {isEmpty && !composing && (
          <div className="absolute inset-x-0 top-1/3 flex justify-center pointer-events-none">
            <button
              type="button"
              onClick={startManually}
              className="pointer-events-auto text-[12.5px] text-[#8A857E] underline underline-offset-2
                hover:text-[#111111] focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-[#C5FF3D] rounded px-1"
            >
              …or start from a blank step
            </button>
          </div>
        )}

        {selectedNode && (
          <NodeInspector
            key={selectedNode.id}
            node={selectedNode}
            accounts={accounts}
            posts={posts}
            postsLoading={postsLoading}
            onRefreshPosts={refreshPosts}
            capabilities={capabilities}
            workspaceTags={workspaceTags}
            problems={nodeProblems}
            question={activeQuestion}
            onChange={patch => updateNodeConfig(selectedNode.id, patch)}
            onDelete={() => {
              const label = NODE_LABEL[selectedNode.type];
              // Captured HERE, and restored verbatim. Calling the generic undo
              // would pop whatever is newest on the shared stack — so a
              // creator who edits something else (or deletes a second step)
              // during the toast's seven seconds would have that unrelated
              // edit reverted while the step this toast names stayed deleted.
              const restored = graph;
              const restoredName = name;
              deleteNode(selectedNode.id);
              // No confirm dialog: the step is already restorable, and an
              // offer to undo is faster to read than a modal is to dismiss.
              showToast(`${label} step removed`, 'success', {
                action: {
                  label: 'Undo',
                  onClick: () => commitGraph(restored, { nextName: restoredName }),
                },
              });
            }}
            onClose={() => setSelectedNodeId(null)}
          />
        )}

        {addMenu && (
          <>
            {/* Click-away closes the menu without selecting anything. */}
            <div className="absolute inset-0 z-30" onClick={() => setAddMenu(null)} />
            <div
              className="absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 w-56
                rounded-xl border border-[#E8E4DF] bg-white p-1.5 shadow-[0_8px_28px_rgba(17,17,17,0.12)]"
              role="menu"
            >
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8A857E]">
                Add a step
              </p>
              {STEP_OPTIONS.map(option => (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => chooseStep(option.type)}
                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#F7F5F2]
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
                  role="menuitem"
                >
                  <span className="block text-[13px] font-medium text-[#111111]">{option.label}</span>
                  <span className="block text-[11px] text-[#8A857E]">{option.hint}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {panel === 'preview' && (
          <PreviewPanel
            graph={graph}
            platformLabel={triggerPlatform ? platformMeta(triggerPlatform).name : null}
            running={testing}
            onRun={runPreview}
            onReset={() => setTestResult(null)}
            onClose={() => { setPanel(null); setTestResult(null); }}
          />
        )}

        {panel === 'notifications' && (
          <NotificationsPanel
            notifications={notifications.feed}
            checking={checking}
            highlightId={highlightId}
            onSelect={openNotification}
            onClose={() => setPanel(null)}
          />
        )}

        {panel === 'history' && (
          <HistoryDrawer
            history={history}
            canUndo={canUndo}
            onUndo={() => { undo(); setPanel(null); }}
            onClose={() => setPanel(null)}
          />
        )}

        <AIComposer
          // Shifted clear of the inspector when one is open: centred on the
          // whole viewport it sat on top of the last settings control and the
          // Remove-step button, which is where a creator reaches next.
          insetLeft={selectedNode ? 300 : 0}
          selectedNode={selectedNode}
          composing={composing}
          changeCard={changeCard}
          canUndo={canUndo}
          aiConfigured={aiConfigured}
          empty={isEmpty}
          historyCount={history.length}
          onSubmit={compose}
          onUndo={undo}
          onDismissCard={() => setChangeCard(null)}
          onOpenHistory={() => setPanel('history')}
        />
      </div>
    </div>
  );
}

/**
 * "Autosaved just now" — and, when it matters more, that it wasn't. A silent
 * failure here would let a creator walk away believing their work is saved.
 */
function SaveIndicator({ state, savedAt }: { state: 'idle' | 'saving' | 'saved' | 'error'; savedAt: number | null }) {
  // The label is held in state and refreshed on a timer rather than computed
  // from Date.now() while rendering: reading the clock during render makes the
  // component's output depend on when React happened to paint it.
  const [label, setLabel] = useState('just now');

  useEffect(() => {
    if (state !== 'saved' || !savedAt) return;
    const update = () => {
      const seconds = Math.floor((Date.now() - savedAt) / 1000);
      setLabel(seconds < 60 ? 'just now' : `${Math.floor(seconds / 60)}m ago`);
    };
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [state, savedAt]);

  if (state === 'idle') return null;

  if (state === 'error') {
    return (
      <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] text-[#B91C1C]">
        <CloudOff size={13} /> Not saved
      </span>
    );
  }

  if (state === 'saving') {
    return (
      <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] text-[#8A857E]">
        <Cloud size={13} /> Saving…
      </span>
    );
  }

  return (
    <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] text-[#8A857E]">
      <Check size={13} className="text-[#4D7C0F]" /> Autosaved {label}
    </span>
  );
}
