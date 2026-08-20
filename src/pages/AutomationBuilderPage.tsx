import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  AlertTriangle, ArrowLeft, Check, Cloud, CloudOff, Eye, Loader2, Pause, PenLine, Sparkles, Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isOwnerView, canEditAutomations } from '../lib/access';
import ShareAutomation from '../components/automation-builder/ShareAutomation';
import NotesIndex from '../components/automation-builder/NotesIndex';
import CanvasNotesLayer from '../components/automation-builder/CanvasNotesLayer';
import NoteThread, { NoteComposer } from '../components/automation-builder/NoteThread';
import { useCanvasNotes, usePlacing, type Placement } from '../components/automation-builder/useCanvasNotes';
import { newNoteLabel, noteLabel, placeLabel } from '../lib/notePlacement';
import CollaboratorFacepile from '../components/automation-builder/CollaboratorFacepile';
import { useFlowBuilder, type ChangeCard } from '../components/automation-builder/useFlowBuilder';
import { useAccountPosts } from '../components/automation-builder/useAccountPosts';
import { useBuilderNotifications } from '../components/automation-builder/useBuilderNotifications';
import FlowCanvas from '../components/automation-builder/FlowCanvas';
import NodeEditorCard, { type BuilderQuestion } from '../components/automation-builder/NodeEditorCard';
import AIChatPanel from '../components/automation-builder/AIChatPanel';
import PairedRevolution from '../components/PairedRevolution';
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
import { GENERIC_ERROR, isCreatorSafe } from '../lib/voice';
import { derivedNotifications, type BuilderNotification } from '../lib/builderNotifications';
import { NODE_LABEL, STEP_OPTIONS, nodeById, readTrigger, triggerNodes, type FlowNodeType } from '../lib/flowSchema';
import LoadingState from '../components/LoadingState';
import { HeaderLocal, HeaderActions } from '../components/app/headerSlots';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SIDEBAR_WIDTH, SIDEBAR_RAIL_WIDTH, useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

/**
 * The automation builder.
 *
 * The canvas owns the viewport; everything else is transient. Nothing sits
 * permanently on either side of it — the inspector appears when a step is
 * selected, Preview and Notifications when asked for, history only when
 * opened. That restraint is the product: a creator should be looking at their
 * automation, not at the tool.
 *
 * The controls in the top right are four different questions, and they are
 * weighted to say so. Preview: how will this feel? The bell: what does
 * Populr need from me? Activate: put it live — the only one wearing lime.
 * Nothing else earns a place up there. Inbox is a destination in the nav —
 * the rail carries it, badge included — not a second surface layered over
 * the canvas.
 *
 * The AI is a conversation the creator opens, not furniture. Collapsed, it
 * is a small launcher in the canvas's bottom-right corner and the canvas has
 * every pixel; opened, it is one more contextual side panel — same region,
 * same reflow, same one-context-at-a-time rules as Preview and the bell's
 * feed. Available always, in the way never.
 */

type SidePanel = 'preview' | 'notifications' | 'history' | 'ai' | null;

/**
 * The widths every layout decision below is arithmetic over. The sidebar's
 * two come from ui/sidebar.tsx rather than being copied here: the one time
 * a copy went stale (a 60px icon rail became a 280px sidebar) every
 * threshold with the old chrome baked in silently over-promised 220px of
 * canvas, and nothing caught it.
 */
const PANEL_WIDTH = 320;
/** A canvas narrower than this cannot show a step and its next step at
 *  once, which is the least a flow editor can be. */
const CANVAS_MIN_WIDTH = 480;

/** What the anchored step editor needs of the content column before it
 *  beats a bottom sheet — a card floating over less than this hides more
 *  than it shows. */
const ANCHORED_EDITOR_MIN_CONTENT = 708;

/**
 * Both thresholds are arithmetic over the chrome actually on screen, and
 * the sidebar's width is a creator's choice now — collapsing it hands the
 * canvas 208px, which is most of a panel. Reading a constant instead would
 * make the builder refuse a layout it has the room for, which is exactly
 * the benefit someone collapses the navigation to get.
 *
 * TWO_COLUMN: the sidebar plus two real columns plus the least canvas worth
 * having. The panels are columns, not overlays — they take their width from
 * the canvas — so below this it is one thing at a time, which is the honest
 * trade: both open on a smaller screen leaves the creator unable to see the
 * step the feed just sent them to.
 */
function twoColumnMinWidth(sidebar: number): number {
  return sidebar + PANEL_WIDTH * 2 + CANVAS_MIN_WIDTH;
}

function anchoredEditorMinWidth(sidebar: number): number {
  return ANCHORED_EDITOR_MIN_CONTENT + sidebar;
}

function roomForBothColumns(sidebar: number): boolean {
  return window.innerWidth >= twoColumnMinWidth(sidebar);
}

export default function AutomationBuilderPage() {
  const { flowId = null } = useParams<{ flowId: string }>();
  const navigate = useNavigate();
  const { showToast, workspaceAccess } = useApp();
  const ownerView = isOwnerView(workspaceAccess);
  // View-only members can open and read everything; every write affordance
  // below is gated on this so nothing is offered that the API would refuse.
  const mayEdit = canEditAutomations(workspaceAccess);

  // The chrome the canvas is actually competing with. Collapsing the
  // navigation is a creator's choice on every route now, and it hands this
  // page 208px — most of a panel — so every threshold below is measured
  // against the width on screen rather than the widest one possible.
  const { collapsed: navCollapsed } = useSidebar();
  const sidebarWidth = navCollapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH;

  const builder = useFlowBuilder(flowId);
  const {
    flow, graph, name, loading, loadError, selectedNodeId, setSelectedNodeId,
    saveState, savedAt, delegationWarning, composing, changeCard,
    editsSinceCard, activity, highlighted, history, historyHasMore, loadEarlierHistory,
    proposal, proposalTrace, committing, proposalError, confirmProposal, discardDraft,
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

  /* ── Notes ──────────────────────────────────────────────────────────────
     Collaboration metadata, laid over the work. Deliberately not part of
     `panel`: the AI owns the right-hand column, and notes must never become
     a second one — the index is a popover and a thread is an overlay, so
     the canvas keeps its width whatever the notes are doing. */
  const notes = useCanvasNotes(flowId);
  const { placing, arm: armNote, place: placeNote, cancel: cancelNote } = usePlacing();
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const stepLabel = useCallback(
    (id: string) => {
      const node = graph.nodes.find(n => n.id === id);
      return node ? NODE_LABEL[node.type] : null;
    },
    [graph.nodes],
  );
  const openNote = openNoteId ? notes.threads.find(t => t.id === openNoteId) ?? null : null;
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
   * Whether the contextual side region exists at all this render.
   *
   * Only explicitly opened panels live there now. The step editor is no
   * longer a column: it rides the selected node as a small anchored card
   * (see the editor slot handed to FlowCanvas), or a bottom sheet on narrow
   * screens — so selecting a step never takes width away from the canvas.
   */
  const sideOpen = panel !== null;

  /**
   * Where the step editor renders. Wide screens anchor it to the node —
   * proximity is the point — but on a small canvas a floating card obscures
   * more than it helps, so it becomes a bottom sheet.
   *
   * "Small" is about the CANVAS, not the window: the 280px sidebar shows
   * from 768px up, so a 768px tablet has a 488px content column and an
   * anchored 320px card would leave it 168px of canvas. The anchored card
   * earns its place once the content column has the ~708px it always needed
   * — see anchoredEditorMinWidth().
   */
  const [narrowEditor, setNarrowEditor] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time environment fallback
      setNarrowEditor(window.innerWidth < anchoredEditorMinWidth(sidebarWidth));
      return;
    }
    const query = window.matchMedia(`(max-width: ${anchoredEditorMinWidth(sidebarWidth) - 1}px)`);
    const sync = () => setNarrowEditor(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
    // Re-subscribed when the navigation's width changes: the threshold IS
    // the sidebar's width plus a constant, so a stale query would be
    // watching a line that has moved.
  }, [sidebarWidth]);

  /* Notes, on a screen too narrow to float a card beside a pin: the thread
     arrives from the bottom instead. That is the same place the step editor
     goes, and two sheets cannot share it — so opening or starting a note
     stands the editor down. The note is the thing that was just asked for. */
  const showNote = useCallback((id: string | null) => {
    setOpenNoteId(id);
    if (id && narrowEditor) setSelectedNodeId(null);
  }, [narrowEditor, setSelectedNodeId]);
  const startNote = useCallback((placement: Placement) => {
    setOpenNoteId(null);
    if (narrowEditor) setSelectedNodeId(null);
    placeNote(placement);
  }, [narrowEditor, placeNote, setSelectedNodeId]);
  /* And the mirror: choosing a step is asking for the editor, so a note that
     was open steps aside. Cleared rather than hidden — a note that came back
     when the editor closed would be the ghost of a gesture the creator had
     already finished with. Every path that selects a step goes through here,
     which is the point of it being a function rather than three copies. */
  const selectStep = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    if (id && narrowEditor) {
      setOpenNoteId(null);
      cancelNote();
    }
  }, [narrowEditor, setSelectedNodeId, cancelNote]);
  // A const rather than `placing.at` read twice: what a note will be attached
  // to has to be said before a word is typed, and the same answer has to
  // label the sheet and head the composer inside it.
  const composingNote = placing.at;
  const placingLabel = composingNote && 'nodeId' in composingNote
    ? stepLabel(composingNote.nodeId) ?? 'On a step'
    : 'On the canvas';
  /* The bottom of a narrow screen holds exactly one thing, and these two are
     the only claimants. Written as a pair so the exclusivity is a property of
     the code rather than of every call site remembering to clear the other:
     the step editor wins a tie, because reaching it means a step was selected,
     and selecting a step is the more recent gesture. */
  const stepSheet = narrowEditor && selectedNode !== null;
  const noteSheet = narrowEditor && !stepSheet && (composingNote !== null || openNote !== null);

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

  /**
   * Panels are contextual, and there is one context at a time.
   *
   * Preview and History are about the automation as a whole, so opening
   * one closes the step inspector rather than stacking two panels over the
   * canvas — on a laptop that leaves a strip of canvas between them, which is
   * the "forms with a canvas squeezed in the middle" this builder is not.
   *
   * Notifications is the exception, and deliberately: it is an index of steps,
   * and every item in it selects one. Closing the inspector it just opened
   * would undo the thing the creator clicked for.
   */
  const togglePanel = useCallback((next: Exclude<SidePanel, null>) => {
    const opening = panel !== next;
    setPanel(opening ? next : null);
    if (opening) setSelectedNodeId(null);
  }, [panel, setSelectedNodeId]);

  /**
   * Opening the feed: keep the step beside it, or drop the step.
   *
   * "Beside" is a width claim — see twoColumnMinWidth(). Without the room,
   * keeping both would leave the creator seeing neither the list nor the
   * step, which is the exact thing the exception exists to preserve.
   */
  const keepStepBesideFeed = useCallback(() => {
    if (!roomForBothColumns(sidebarWidth)) setSelectedNodeId(null);
    // sidebarWidth belongs here now that the threshold reads it: a callback
    // closed over the width the sidebar had when it was made would answer
    // for a shell the creator has since changed.
  }, [setSelectedNodeId, sidebarWidth]);

  /**
   * The window is not only measured when someone clicks.
   *
   * Checking at click time alone was wrong: a creator who opens both at a
   * comfortable width and then resizes, splits the screen, or rotates a tablet
   * keeps two 320px columns on a viewport that cannot hold them — landing in
   * exactly the layout the threshold exists to prevent, by a route the
   * threshold never watches.
   *
   * matchMedia rather than a resize listener because the only thing we care
   * about is crossing the line, and it fires once on the crossing instead of
   * on every intermediate pixel.
   *
   * The step yields, not the panel. A panel is opened deliberately and closed
   * deliberately, so taking it away would be undoing something the creator
   * asked for; a selection is one click on the canvas to get back. This is
   * also the same direction keepStepBesideFeed already resolves it in.
   */
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(`(min-width: ${twoColumnMinWidth(sidebarWidth)}px)`);
    const reconcile = () => {
      if (!query.matches) setSelectedNodeId(current => (panel ? null : current));
    };
    // Answered once on subscribing, not only on the next crossing. The
    // threshold itself moves now — expanding the navigation raises it by
    // 208px — and a viewport that was wide enough a moment ago can be on the
    // wrong side of the new line without having changed at all. matchMedia
    // reports crossings, and constructing a MediaQueryList is not one, so
    // waiting for `change` here would leave both columns open on a canvas
    // that cannot hold them until something else happened to resize.
    reconcile();
    query.addEventListener('change', reconcile);
    return () => query.removeEventListener('change', reconcile);
    // sidebarWidth is a dependency for the same reason as above: collapsing
    // the navigation moves this threshold, and a listener left on the old
    // one would reconcile against a line that is no longer there.
  }, [panel, setSelectedNodeId, sidebarWidth]);

  const openNotifications = useCallback(async () => {
    setPanel('notifications');
    keepStepBesideFeed();
    setChecking(true);
    await refreshValidation();
    setChecking(false);
  }, [refreshValidation, keepStepBesideFeed]);

  /**
   * The last compose answer the creator has actually had on screen. The
   * launcher's dot is the difference between this and the current one — a
   * result that landed while the panel was collapsed is news; a result they
   * were looking at when they collapsed is not. Tracked separately from the
   * card itself, because the card also carries the answer's Undo, and
   * collapsing a panel must never cost the creator their undo.
   */
  const [seenAiCard, setSeenAiCard] = useState<ChangeCard | null>(null);
  /** Same rule for a DRAFT: a proposal that arrived while the panel was
   *  collapsed is news — "Ready for you" is exactly what the dot is for. */
  const [seenProposalId, setSeenProposalId] = useState<string | null>(null);

  /**
   * Open the conversation. Like the feed — and unlike Preview — the AI keeps
   * the selected step beside it when there's room, because the selection IS
   * its context: "make this warmer" lands on the step the creator is looking
   * at, and closing that step to open the chat would throw away the very
   * thing the next request is about.
   */
  const openAi = useCallback(() => {
    setPanel('ai');
    keepStepBesideFeed();
    setSeenAiCard(changeCard);
    setSeenProposalId(proposal?.id ?? null);
  }, [keepStepBesideFeed, changeCard, proposal]);

  /** Collapse the conversation; whatever is on screen right now is read. */
  const collapseAi = useCallback(() => {
    setPanel(null);
    setSeenAiCard(changeCard);
    setSeenProposalId(proposal?.id ?? null);
  }, [changeCard, proposal]);

  /**
   * The builder opens on the conversation when there is nothing else to open
   * on: an empty canvas has no step to select and nothing to preview, and
   * "describe it in your own words" is the whole first-run experience. Once
   * only, after load — a creator who then collapses it has answered the
   * question of whether they want it open.
   */
  const openedForEmpty = useRef(false);
  useEffect(() => {
    if (loading || loadError || openedForEmpty.current) return;
    openedForEmpty.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-load decision, same pattern as the loader
    if (graph.nodes.length === 0 && mayEdit) setPanel('ai');
  }, [loading, loadError, graph.nodes.length, mayEdit]);

  /** Take the creator to the step a notification is about, and ask it there. */
  const openNotification = useCallback((notification: BuilderNotification) => {
    setHighlightId(notification.id);
    if (!notification.nodeId) return;
    selectStep(notification.nodeId);
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
    // The mirror of keepStepBesideFeed, for the other direction of arrival.
    // Wide enough for both, the feed stays open beside the step — it is an
    // index, and closing it would cost the creator their place in the list.
    // Otherwise the step wins: they clicked to go somewhere, and the place
    // they landed matters more than the list they left.
    if (!roomForBothColumns(sidebarWidth)) setPanel(null);
  }, [selectStep, sidebarWidth]);

  useEffect(() => {
    if (!bellAttention) return;
    const timer = setTimeout(() => setBellAttention(false), 2200);
    return () => clearTimeout(timer);
  }, [bellAttention]);

  const runPreview = useCallback(async (
    input: { channel: 'comment' | 'dm'; text: string; replies: (string | null)[] },
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
        showToast('Automation is live', 'success');
        setPanel(null);
        return;
      }
      // Not a modal and not a wall of validation: the same feed the bell
      // already offers, opened on the first thing standing in the way.
      setPanel('notifications');
      keepStepBesideFeed();
      setBellAttention(true);
      const first = derivedNotifications(result.problems, graph)[0];
      setHighlightId(first?.id ?? null);
      showToast('Populr needs a couple of things first', 'error');
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't take this live.", 'error');
    } finally {
      setActivating(false);
    }
  }, [activate, graph, showToast, keepStepBesideFeed]);

  const onPause = useCallback(async () => {
    try {
      const result = await pause();
      // The banner below the header already says Instagram hasn't confirmed
      // the automation stopped. Announcing "Automation paused" beside it would
      // contradict it in the same breath, and the reassuring message is the
      // one people believe.
      if (result?.warning) {
        showToast(isCreatorSafe(result.warning) ? result.warning : GENERIC_ERROR, 'error', { durationMs: 10000 });
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
    selectStep(id);
  }, [addNode, accounts, selectStep]);

  /** Remove a step, restorable from the toast. The snapshot is captured HERE
   *  and restored verbatim — the generic undo would pop whatever is newest on
   *  the shared stack, which one later edit would make the wrong thing.
   *
   *  Takes an id rather than reading the selection, because the canvas's
   *  right-click menu removes the step the pointer is on, which is not
   *  necessarily the selected one. */
  const deleteStep = useCallback((nodeId: string) => {
    const target = nodeById(graph, nodeId);
    if (!target || target.type === 'trigger') return;
    const label = NODE_LABEL[target.type];
    const restored = graph;
    const restoredName = name;
    deleteNode(nodeId);
    showToast(`${label} step removed`, 'success', {
      action: { label: 'Undo', onClick: () => commitGraph(restored, { nextName: restoredName }) },
    });
  }, [graph, name, deleteNode, showToast, commitGraph]);

  const deleteSelected = useCallback(() => {
    if (selectedNode) deleteStep(selectedNode.id);
  }, [selectedNode, deleteStep]);

  /** The same editor content wherever it mounts — anchored card or sheet. */
  const editorFor = (variant: 'anchored' | 'sheet') =>
    selectedNode ? (
      // View-only: the card still opens — reading a step's configuration is
      // the point — but every control inside is natively disabled.
      <fieldset disabled={!mayEdit} className="contents">
      <NodeEditorCard
        key={selectedNode.id}
        variant={variant}
        node={selectedNode}
        accounts={accounts}
        posts={posts}
        postsLoading={postsLoading}
        onRefreshPosts={refreshPosts}
        capabilities={capabilities}
        workspaceTags={workspaceTags}
        problems={nodeProblems}
        question={activeQuestion}
        onChange={patch => { if (mayEdit) updateNodeConfig(selectedNode.id, patch); }}
        onDelete={() => { if (mayEdit) deleteSelected(); }}
        onClose={() => setSelectedNodeId(null)}
      />
      </fieldset>
    ) : null;

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
    // The shell's header sits above this — the same one every page gets —
    // so the page takes what the viewport has left, exactly like the Inbox.
    // The builder's own controls live in that header's slots below, not in
    // a second bar of its own.
    <div className="flex flex-col bg-[#F7F5F2]
      h-[calc(100dvh-4rem-env(safe-area-inset-top))] md:h-[calc(100vh-3.5rem)]">
      {/* ------------------------------------------- header slot: where am I */}
      <HeaderLocal>
        <div className="flex items-center gap-1.5 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/automations')}
          className="-ml-1.5 h-8 w-8 rounded-lg shrink-0"
          aria-label="Back to Automations"
        >
          <ArrowLeft size={17} />
        </Button>
          <button
            type="button"
            onClick={() => navigate('/automations')}
            className="hidden sm:inline text-[13px] text-[#8A857E] hover:text-[#111111] shrink-0"
          >
            Automations
          </button>
          <span className="hidden sm:inline text-[13px] text-[#D8D3CC]">/</span>

          {!mayEdit ? (
            <span className="truncate text-[14px] font-semibold text-[#111111]">{name}</span>
          ) : editingName ? (
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

          {live && <Badge variant="success" className="ml-1 shrink-0">Live</Badge>}
          {!mayEdit && (
            <Badge
              className="ml-1 shrink-0"
              title="Editing automations wasn't shared with you — you can read everything here."
            >
              View only
            </Badge>
          )}
        </div>
      </HeaderLocal>

      {/* ------------------------------------- header slot: what can I do */}
      <HeaderActions>
          {/* Who else is on this canvas right now. First in the cluster
              because it answers a question the creator has before they touch
              anything — am I about to edit over somebody? — and because it
              is the one thing here that is not a control. */}
          <CollaboratorFacepile flowId={flowId} />

          <SaveIndicator state={saveState} savedAt={savedAt} />

          {/* Sharing one automation: owner-only, like every other way of
              granting access. flowId is null only before the flow exists.
              Desktop-only: the shared header carries the hamburger and the
              global cluster on phones, and sharing is the one control here
              whose job nobody does from a 390px screen. Dropping it is what
              keeps the name readable beside Activate. */}
          {flowId && (
            <span className="hidden md:inline-flex">
              <ShareAutomation flowId={flowId} flowName={name} />
            </span>
          )}

          {/* Three different jobs, three different weights. Preview is a
              secondary action and looks like one; the bell is chrome that
              reports rather than acts, so it carries no border at all;
              Activate is the only thing here wearing lime. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => togglePanel('preview')}
            disabled={isEmpty}
            aria-pressed={panel === 'preview'}
            className={cn(
              'gap-1.5 rounded-lg px-2.5 md:px-3',
              // Pressed reads as pressed: the border darkens to the ink the
              // label is written in, which is how every other toggle in the
              // app says "this one is open".
              panel === 'preview' && 'border-foreground bg-muted',
            )}
          >
            <Eye size={14} /> <span className="hidden md:inline">Preview</span>
          </Button>

          {/* Notes: navigation, not a panel. The popover closes the moment it
              points somewhere, and what it points at opens on the canvas. */}
          <NotesIndex
            threads={notes.threads}
            count={notes.open.length}
            stepLabel={stepLabel}
            onPick={thread => {
              // Fly to the step it belongs to, then open it. A note on the
              // canvas has no step to fly to and simply opens.
              if (thread.nodeId) {
                setFocus(current => ({ nodeId: thread.nodeId!, signal: current.signal + 1 }));
              }
              showNote(thread.id);
            }}
            onLeaveNote={armNote}
            sheet={narrowEditor}
          />

          <div className="flex items-center gap-0.5 pl-1">
            <NotificationBell
              count={notifications.unresolvedCount}
              open={panel === 'notifications'}
              attention={bellAttention}
              onClick={() => (panel === 'notifications' ? setPanel(null) : void openNotifications())}
            />
          </div>

          {live && ownerView ? (
            <Button variant="outline" size="sm" onClick={onPause} className="gap-1.5 rounded-lg">
              <Pause size={14} /> Pause
            </Button>
          ) : !ownerView ? (
            // Members and canvas collaborators build; switching on stays with
            // the owner. Absence would read as a bug — say it instead.
            <span className="hidden md:inline text-[11.5px] text-[#9B9B8F]">
              {live ? 'Live — the owner runs it' : 'The owner turns it on'}
            </span>
          ) : (
            <Button
              size="sm"
              onClick={onActivate}
              disabled={isEmpty || activating}
              className="gap-1.5 rounded-lg px-3.5 md:px-4 shadow-[0_1px_2px_rgba(17,17,17,0.10)]
                hover:shadow-[0_2px_6px_rgba(17,17,17,0.12)] disabled:shadow-none"
            >
              {activating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              Activate
            </Button>
          )}
      </HeaderActions>

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
          <p className="flex-1">{isCreatorSafe(delegationWarning) ? delegationWarning : GENERIC_ERROR}</p>
        </div>
      )}

      {/* ------------------------------------------------------------ canvas */}
      <div className="flex-1 min-h-0 flex">
      <div className="relative flex-1 min-w-0 min-h-0">
        <FlowCanvas
          graph={graph}
          selectedNodeId={selectedNodeId}
          highlighted={highlighted}
          problems={problems}
          posts={posts}
          activePath={testResult?.steps.map(s => s.nodeId) ?? []}
          onSelect={id => {
            selectStep(id);
            setAddMenu(null);
            // The mirror of togglePanel: picking a step is choosing the other
            // context, so the whole-automation panel steps aside. The feed and
            // the AI are the exceptions — the feed is an index into the
            // canvas, and the selection is the AI's context — but only where
            // both columns actually fit; narrower than that, the step the
            // creator just clicked wins the one slot.
            if (id && panel && panel !== 'notifications' && panel !== 'ai') setPanel(null);
            if (id && (panel === 'notifications' || panel === 'ai') && !roomForBothColumns(sidebarWidth)) {
              setPanel(null);
            }
          }}
          onMove={mayEdit ? moveNode : () => {}}
          onConnect={mayEdit ? connectNodes : () => {}}
          onAddAfter={mayEdit ? onAddAfter : () => {}}
          onDeleteNode={mayEdit ? deleteStep : () => {}}
          readOnly={!mayEdit}
          // Leaving a note is NOT an editing power, so this is offered
          // whatever readOnly says — that is the whole point of a seat that
          // can look but not change.
          onLeaveNoteAt={at => startNote({ at })}
          notesArmed={placing.arming}
          onLeaveNoteOnNode={(nodeId, at) => startNote({ nodeId, at })}
          notesLayer={
            <CanvasNotesLayer
              threads={notes.threads}
              nodes={graph.nodes}
              openId={openNoteId}
              composing={placing.at}
              stepLabel={stepLabel}
              maySettle={notes.maySettle}
              onOpen={showNote}
              onReply={notes.reply}
              onSettle={notes.settle}
              onDelete={notes.remove}
              onLeave={async (placement, body) => {
                await notes.leave(placement, body);
                cancelNote();
              }}
              onCancelCompose={cancelNote}
              // Narrow: the pins stay on the canvas, the conversation moves
              // to a sheet. A 300px card floating beside a pin needs a canvas
              // there is room to look at.
              cards={!narrowEditor}
            />
          }
          fitSignal={fitSignal}
          focusNodeId={focus.nodeId || null}
          focusSignal={focus.signal}
          editorSlot={!narrowEditor ? editorFor('anchored') : null}
        />

        {/* Narrow screens: the same editor slides up from the bottom instead
            of floating at a node the small canvas can barely show. The canvas
            stays live behind it — tapping another step swaps the sheet,
            tapping empty canvas closes it. */}
        <Sheet
          // Not modal, and no scrim: the canvas behind stays live, which is
          // the behaviour this sheet has always had — tapping another step
          // swaps the sheet, tapping empty canvas closes it. Base UI still
          // gives it Escape, focus return, and a real dialog role.
          modal={false}
          open={stepSheet}
          onOpenChange={next => { if (!next) setSelectedNodeId(null); }}
        >
          <SheetContent
            side="bottom"
            backdrop={false}
            aria-label={selectedNode ? `${NODE_LABEL[selectedNode.type]} settings` : 'Step settings'}
            className="z-40 rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)]
              shadow-[0_-8px_28px_rgba(17,17,17,0.14)]"
          >
            <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-[#E8E4DF]" />
            {editorFor('sheet')}
          </SheetContent>
        </Sheet>

        {/* And the same for a note. The pin stays where the feedback was
            left — that never changes — but the conversation comes to the
            bottom of the screen instead of floating beside a pin on a canvas
            there is no room to read. Same thread, same composer, same
            everything inside; only the container is different. */}
        <Sheet
          modal={false}
          open={noteSheet}
          onOpenChange={next => {
            if (next) return;
            setOpenNoteId(null);
            cancelNote();
          }}
        >
          <SheetContent
            side="bottom"
            backdrop={false}
            aria-label={
              composingNote
                ? newNoteLabel(placingLabel)
                : openNote
                  ? noteLabel(openNote, placeLabel(openNote, stepLabel))
                  : 'Note'
            }
            className="z-40 rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)]
              shadow-[0_-8px_28px_rgba(17,17,17,0.14)]"
          >
            <div aria-hidden className="mx-auto my-2 h-1 w-9 rounded-full bg-[#E8E4DF]" />
            {composingNote ? (
              <NoteComposer
                presentation="sheet"
                where={placingLabel}
                onSubmit={async body => {
                  await notes.leave(composingNote, body);
                  cancelNote();
                }}
                onCancel={cancelNote}
              />
            ) : openNote ? (
              <NoteThread
                presentation="sheet"
                thread={openNote}
                where={placeLabel(openNote, stepLabel)}
                maySettle={notes.maySettle(openNote)}
                onReply={body => notes.reply(openNote.id, body)}
                onSettle={resolved => notes.settle(openNote.id, resolved)}
                onDelete={notes.remove}
                onClose={() => setOpenNoteId(null)}
              />
            ) : null}
          </SheetContent>
        </Sheet>

        {/* A viewer on an empty canvas: nothing to do, and until now nothing
            said so either — a blank screen reads as a page that failed to
            load rather than an automation nobody has built yet. */}
        {isEmpty && !composing && !mayEdit && (
          <div className="absolute inset-x-0 top-1/3 flex justify-center px-6">
            <p className="max-w-xs text-center text-[12.5px] leading-relaxed text-[#8A857E]">
              Nothing has been built here yet. The steps will appear as they&apos;re drawn.
            </p>
          </div>
        )}

        {isEmpty && !composing && mayEdit && (
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


        {addMenu && (
          <>
            {/* Click-away closes the menu without selecting anything. */}
            <div className="absolute inset-0 z-30" onClick={() => setAddMenu(null)} />
            <div
              className="absolute left-1/2 top-1/2 z-40 w-56 -translate-x-1/2 -translate-y-1/2
                overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
              role="menu"
              aria-label="Add a step"
            >
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide
                text-muted-foreground">
                Add a step
              </p>
              {STEP_OPTIONS.map(option => (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => chooseStep(option.type)}
                  className="w-full px-3 py-2 text-left transition-colors hover:bg-muted
                    focus-visible:outline-none focus-visible:bg-muted"
                  role="menuitem"
                >
                  <span className="block text-[13px] font-medium text-foreground">{option.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{option.hint}</span>
                </button>
              ))}
            </div>
          </>
        )}





        {/* The AI's front door when the conversation is closed: a small
            launcher in the corner the canvas doesn't use. Working state and
            unseen results surface HERE, because here is all the AI shows of
            itself while collapsed — a quiet spin while it builds, a lime dot
            when something landed after the panel was closed. */}
        {panel !== 'ai' && mayEdit && (
          <button
            type="button"
            onClick={openAi}
            title="Ask Populr"
            aria-label={((changeCard && changeCard !== seenAiCard) || (proposal && proposal.id !== seenProposalId)) && !composing
              ? 'Ask Populr — new result'
              : 'Ask Populr'}
            className="absolute bottom-5 right-5 z-30 flex h-11 w-11 items-center justify-center
              rounded-2xl border border-[#E8E4DF] bg-white text-[#111111]
              shadow-[0_4px_16px_rgba(17,17,17,0.10)] transition-all
              hover:border-[#C5FF3D] hover:shadow-[0_6px_20px_rgba(17,17,17,0.14)]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
          >
            {composing ? <PairedRevolution size="sm" /> : <Sparkles size={17} />}
            {((changeCard && changeCard !== seenAiCard) || (proposal && proposal.id !== seenProposalId)) && !composing && (
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#C5FF3D]
                  ring-2 ring-white"
              />
            )}
          </button>
        )}
      </div>

      {/* ----------------------------------------- the contextual side region
          Whole-automation panels only — Preview, the bell's feed, History,
          the AI conversation. The step editor no longer lives here: it rides
          the selected node on the canvas, so editing a step costs the canvas
          nothing. `togglePanel` still clears the selection when one of these
          opens, and selecting a step still closes Preview/History — one
          context at a time, same rules as before.

          Not a landmark itself: each panel below is its own <aside> with its
          own name, and wrapping them in a second one would make a screen
          reader announce the region twice.

          Desktop: a real column, so the canvas reflows to what is left.
          Narrow: an overlay, because a 320px column beside a canvas on a
          phone is two unusable things instead of one usable one. */}
      {sideOpen && (
        <div
          className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[360px]
            shadow-[-4px_0_24px_rgba(17,17,17,0.06)]
            motion-safe:animate-in motion-safe:slide-in-from-right-2 motion-safe:fade-in
            motion-safe:duration-200
            md:static md:z-auto md:w-auto md:max-w-none md:shrink-0 md:shadow-none"
        >
          {panel && (
            <div
              // The conversation gets a little more width than the other
              // panels — chat bubbles wrap badly at 320 — at the cost of a
              // slightly narrower canvas in the rare AI-beside-step case.
              className={`w-full border-l border-[#E8E4DF] md:shrink-0
                ${panel === 'ai' ? 'md:w-[340px]' : 'md:w-[320px]'}`}
            >
              {panel === 'ai' && (
                <AIChatPanel
                  history={history}
                  composing={composing}
                  changeCard={changeCard}
                  activity={activity}
                  // The answer's Undo pops the shared stack, so it may only
                  // show while that answer is still the newest recorded write
                  // — one inspector edit later it would revert the wrong
                  // thing. Undo stays reachable in View changes regardless.
                  canUndo={canUndo && editsSinceCard === 0}
                  aiConfigured={aiConfigured}
                  empty={isEmpty}
                  selectedNode={selectedNode}
                  onSubmit={prompt => void compose(prompt)}
                  onUndo={undo}
                  onOpenHistory={() => { setPanel('history'); setSelectedNodeId(null); }}
                  onCollapse={collapseAi}
                  hasEarlier={historyHasMore}
                  onLoadEarlier={() => void loadEarlierHistory()}
                  proposal={proposal}
                  proposalTrace={proposalTrace}
                  committing={committing}
                  proposalError={proposalError}
                  onConfirmProposal={() => {
                    // After Build this, bring the newly built region into
                    // view and let the highlight say what's new — no full
                    // recenter of the canvas.
                    void confirmProposal().then(touched => {
                      if (touched?.[0]) setFocus({ nodeId: touched[0], signal: Date.now() });
                    });
                  }}
                  onDiscardProposal={discardDraft}
                />
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
            </div>
          )}
        </div>
      )}
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
