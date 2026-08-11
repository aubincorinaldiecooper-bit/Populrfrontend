import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useApp } from '../context/AppContext';
import { Search, Play, Pause, Zap, Plus, AlertCircle, Trash2, Loader2, GitBranch } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import EmptyState from '../components/EmptyState';
import { ListSkeleton } from '../components/Skeleton';
import {
  isBackendConfigured, fetchFlows, createFlow, deleteFlow, pauseFlow, activateFlow,
  FlowNotReadyError,
  type AutomationFlow,
} from '../lib/api';
import {
  NODE_LABEL, readTrigger, triggerNodes, type FlowGraph, type FlowNodeType,
} from '../lib/flowSchema';
import { platformMeta } from '../lib/platformMeta';
import { timeAgo } from '../lib/timeAgo';

/**
 * Automations — the list.
 *
 * Every automation is a flow now, including the ones built in the retired
 * four-step wizard: the backend reads those as one-trigger-one-send graphs
 * when this page loads them (populrbackend flows/legacyImport.ts), so there is
 * exactly one kind of thing in this list and one place to edit it.
 *
 * Local device drafts are gone with the wizard. A flow is created server-side
 * the moment you start one and autosaves from then on, so an unfinished
 * automation is simply a flow that hasn't been activated — visible on every
 * device, not just the one it was started on.
 */

type StatusTab = 'all' | 'live' | 'draft' | 'paused';

/** How long Undo stays on offer before a delete is actually sent. */
const UNDO_WINDOW_MS = 7000;

/**
 * Deletes committed on the way out of this page that may still be in flight,
 * held at module scope so they outlive the component that started them.
 *
 * Leaving the page inside the undo window sends the delete immediately — but
 * navigating straight back re-mounts and refetches, and a list fetched before
 * that DELETE reaches the server still contains the automation the creator
 * just deleted. It reappears, and stays visibly there until something happens
 * to load the page again, which reads as the delete having silently failed.
 * So the refetch waits for them.
 *
 * Each entry resolves to the error that stopped the delete, or null; it never
 * rejects. A delete that genuinely failed then surfaces on whatever page the
 * creator is looking at, instead of disappearing into a swallowed rejection
 * raised by a component that no longer exists.
 */
const committedDeletes = new Map<string, Promise<Error | null>>();

/** A one-line "what does this do", read from the graph. */
function summarize(graph: FlowGraph): string {
  const trigger = triggerNodes(graph)[0];
  if (!trigger) return 'Not set up yet';
  const cfg = readTrigger(trigger);
  const start = cfg.kind === 'dm' ? 'Someone DMs' : 'Someone comments';
  const words = cfg.matchMode === 'any' || !cfg.keywords.length
    ? ''
    : ` ${cfg.keywords.map(k => `“${k}”`).join(' or ')}`;

  const counts = graph.nodes.reduce<Partial<Record<FlowNodeType, number>>>((acc, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1;
    return acc;
  }, {});
  const after = (['send', 'wait', 'condition', 'action'] as const)
    .filter(t => counts[t])
    .map(t => `${counts[t]} ${NODE_LABEL[t]}`)
    .join(' · ');

  return after ? `${start}${words} → ${after}` : `${start}${words}`;
}

function keywordsOf(graph: FlowGraph): string[] {
  const trigger = triggerNodes(graph)[0];
  return trigger ? readTrigger(trigger).keywords : [];
}

export default function AutomationsPage() {
  const navigate = useNavigate();
  const { showToast } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const backendConfigured = isBackendConfigured();

  const [flows, setFlows] = useState<AutomationFlow[]>([]);
  const [loading, setLoading] = useState(backendConfigured);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [creating, setCreating] = useState(false);
  // Deletions waiting out their undo window, so leaving the page can commit
  // them instead of silently abandoning the request.
  const pendingDeletes = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => () => {
    // Unmounting mid-window: fire the deletes the creator asked for rather
    // than dropping them, and drop the timers so nothing runs after teardown.
    // Each one is handed to committedDeletes so a re-mount can wait for it
    // instead of racing it — see there.
    for (const [id, timer] of pendingDeletes.current) {
      clearTimeout(timer);
      committedDeletes.set(
        id,
        deleteFlow(id).then(
          () => null,
          (err: unknown) => (err instanceof Error ? err : new Error('Could not delete this automation.')),
        ),
      );
    }
    pendingDeletes.current.clear();
  }, []);

  const load = useCallback(() => {
    if (!backendConfigured) return;
    setLoading(true);
    setError(null);

    // Let any delete committed on the way out of this page land first. Asking
    // for the list before it does returns the automation that was just
    // deleted, and it then sits there looking undeleted.
    const pending = [...committedDeletes.values()];
    committedDeletes.clear();

    Promise.all(pending)
      .then(results => {
        // A delete that actually failed is why the row is about to come back.
        // Say so, rather than letting the reappearance be the only clue.
        const failed = results.find((e): e is Error => e !== null);
        if (failed) showToast(failed.message, 'error');
        return fetchFlows();
      })
      .then(setFlows)
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load automations.'))
      .finally(() => setLoading(false));
  }, [backendConfigured, showToast]);

  useEffect(() => {
    // Data fetch from the backend, not derived state — see ContactsPage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const startNew = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const flow = await createFlow({ name: 'New automation' });
      navigate(`/automations/${flow.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not start a new automation.', 'error');
    } finally {
      setCreating(false);
    }
  }, [creating, navigate, showToast]);

  // The retired /automations/new route lands here with ?new=1 so a bookmark
  // or a stale tab still ends up creating an automation rather than 404ing.
  // Reacting to the URL is exactly the external-system synchronisation an
  // effect is for; the marker is consumed first so a re-render can't create
  // a second automation.
  useEffect(() => {
    if (searchParams.get('new') !== '1' || !backendConfigured) return;
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void startNew();
  }, [searchParams, setSearchParams, startNew, backendConfigured]);

  const live = flows.filter(f => f.status === 'live');
  const drafts = flows.filter(f => f.status === 'draft');
  const paused = flows.filter(f => f.status === 'paused');

  const filtered = useMemo(() => {
    let result = [...flows];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(f =>
        f.name.toLowerCase().includes(q) || keywordsOf(f.graph).some(k => k.toLowerCase().includes(q)));
    }
    if (statusTab !== 'all') result = result.filter(f => f.status === statusTab);
    return result;
  }, [flows, search, statusTab]);

  const toggleStatus = async (flow: AutomationFlow) => {
    try {
      if (flow.status === 'live') {
        const result = await pauseFlow(flow.id);
        setFlows(prev => prev.map(f => (f.id === flow.id ? result.flow : f)));
        showToast(
          result.cancelledRuns > 0
            ? `Paused — ${result.cancelledRuns} in-progress follow-up${result.cancelledRuns === 1 ? '' : 's'} cancelled`
            : 'Automation paused',
          'success',
        );
      } else {
        const result = await activateFlow(flow.id);
        setFlows(prev => prev.map(f => (f.id === flow.id ? result.flow : f)));
        showToast('Automation activated', 'success');
      }
    } catch (err) {
      if (err instanceof FlowNotReadyError) {
        // Activation problems belong to specific steps, so send them where
        // those steps are rather than flattening it all into a toast.
        showToast('This one needs a few things first — opening it', 'error');
        navigate(`/automations/${flow.id}`);
        return;
      }
      showToast(err instanceof Error ? err.message : 'Could not update this automation.', 'error');
    }
  };

  /**
   * Delete, with a real way back.
   *
   * The row disappears at once and the server call is held for the length of
   * the undo offer, so Undo genuinely restores the automation — id, run
   * history and all — rather than rebuilding a lookalike. Nothing is lost if
   * the tab closes mid-window: the delete simply never happens, which is the
   * safe direction to fail in.
   *
   * A live automation still asks first. It is actively messaging real people,
   * and stopping that deserves a deliberate answer rather than a toast you
   * might not look at.
   */
  const remove = (flow: AutomationFlow) => {
    if (flow.status === 'live' && !window.confirm(
      `Delete “${flow.name}”? It's live — it will stop running and any scheduled follow-ups are cancelled.`
    )) return;

    setFlows(prev => prev.filter(f => f.id !== flow.id));
    let undone = false;

    const timer = setTimeout(async () => {
      if (undone) return;
      pendingDeletes.current.delete(flow.id);
      try {
        await deleteFlow(flow.id);
      } catch (err) {
        // The delete failed after the row was already gone from the list, so
        // put it back rather than leave the two out of step.
        setFlows(prev => [flow, ...prev.filter(f => f.id !== flow.id)]);
        showToast(err instanceof Error ? err.message : 'Could not delete this automation.', 'error');
      }
    }, UNDO_WINDOW_MS);

    pendingDeletes.current.set(flow.id, timer);

    showToast(`“${flow.name}” deleted`, 'success', {
      durationMs: UNDO_WINDOW_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          undone = true;
          clearTimeout(timer);
          pendingDeletes.current.delete(flow.id);
          setFlows(prev =>
            prev.some(f => f.id === flow.id)
              ? prev
              : [...prev, flow].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        },
      },
    });
  };

  if (!backendConfigured) {
    return (
      <div className="pop-page">
        <PageHeader title="Automations" subtitle="Turn creator engagement into autopilot conversations." />
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to a backend yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Populr can&apos;t reach its server, so your automations can&apos;t be loaded right now.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pop-page">
      <PageHeader
        title="Automations"
        subtitle={loading ? 'Loading...' : `${live.length} live · ${flows.length} total`}
        action={
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
            <div className="relative w-full sm:w-auto">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search automations..." className="pop-search w-full sm:w-56"
              />
            </div>
            <button
              onClick={startNew}
              disabled={creating}
              className="pop-btn-primary w-full sm:w-auto justify-center disabled:opacity-60"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} strokeWidth={2.5} />}
              New automation
            </button>
          </div>
        }
      />

      {error && (
        <div className="pop-card p-4 mb-5 flex items-center gap-3">
          <AlertCircle size={16} className="text-[#DC2626] flex-shrink-0" />
          <p className="text-[13px] text-[#111111] flex-1">{error}</p>
          <button onClick={load} className="pop-btn-tertiary text-[12px] py-1.5 px-3">Retry</button>
        </div>
      )}

      {!error && (
        <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
          {[
            { key: 'all' as StatusTab, label: 'All', count: flows.length },
            { key: 'live' as StatusTab, label: 'Live', count: live.length },
            { key: 'draft' as StatusTab, label: 'Drafts', count: drafts.length },
            { key: 'paused' as StatusTab, label: 'Paused', count: paused.length },
          ].map(t => (
            <button
              key={t.key} onClick={() => setStatusTab(t.key)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-medium whitespace-nowrap transition-all ${
                statusTab === t.key ? 'bg-[#111111] text-white' : 'text-[#6B6B6B] hover:bg-white'}`}
            >
              {t.label} <span className="text-[10px] opacity-60">({t.count})</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <ListSkeleton count={3} label="Loading automations" />
      ) : !error && filtered.length === 0 ? (
        <EmptyState
          icon="automations"
          title={search || statusTab !== 'all' ? 'No automations found' : 'No automations yet'}
          description="Describe what should happen and Populr builds the steps for you."
          action={
            <button onClick={startNew} className="pop-btn-primary" disabled={creating}>
              New automation
            </button>
          }
        />
      ) : !error && (
        <div className="space-y-3">
          {filtered.map(flow => {
            const status = flow.status === 'live' ? 'active' : flow.status === 'paused' ? 'paused' : 'draft';
            const keywords = keywordsOf(flow.graph);
            const steps = flow.graph.nodes.length;
            return (
              <div
                key={flow.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${flow.name}`}
                onClick={() => navigate(`/automations/${flow.id}`)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/automations/${flow.id}`); }
                }}
                className="pop-card p-4 pop-card-hover cursor-pointer outline-none focus-visible:ring-2
                  focus-visible:ring-chartreuse focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      flow.status === 'live' ? 'bg-chartreuse' : 'bg-[#FAFAF8]'}`}>
                      {flow.status === 'live'
                        ? <Zap size={18} className="text-[#111111]" />
                        : <GitBranch size={18} className="text-[#6B6B6B]" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-geist font-semibold text-[13px] text-[#111111] truncate">{flow.name}</h3>
                        <StatusPill status={status} className="text-[10px]" />
                      </div>
                      <p className="text-[11px] text-[#6B6B6B] mt-0.5">{summarize(flow.graph)}</p>
                      {keywords.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-1.5">
                          {keywords.map(k => (
                            <span key={k} className="bg-[#FAFAF8] text-[#6B6B6B] text-[10px] px-2 py-0.5 rounded-full">
                              {k}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); toggleStatus(flow); }}
                      className="p-2.5 hover:bg-[#FAFAF8] rounded-lg transition-all"
                      title={flow.status === 'live' ? 'Pause' : 'Activate'}
                      aria-label={`${flow.status === 'live' ? 'Pause' : 'Activate'} ${flow.name}`}
                    >
                      {flow.status === 'live'
                        ? <Pause size={14} className="text-[#6B6B6B]" />
                        : <Play size={14} className="text-[#10B981]" />}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); remove(flow); }}
                      className="p-2.5 hover:bg-[#FAFAF8] rounded-lg transition-all"
                      title="Delete" aria-label={`Delete ${flow.name}`}
                    >
                      <Trash2 size={14} className="text-[#DC2626]" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-[#F0EEEA] flex items-center justify-between">
                  {/* Display name, not the internal id — `twitter` must read as "X". */}
                  <p className="text-[11px] text-[#9B9B8F]">
                    {flow.platform ? platformMeta(flow.platform).name : 'No channel yet'}
                    {steps > 0 && ` · ${steps} step${steps === 1 ? '' : 's'}`}
                  </p>
                  <span className="text-[10px] text-[#9B9B8F]">
                    Updated {timeAgo(flow.updatedAt)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
