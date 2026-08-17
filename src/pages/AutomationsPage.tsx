import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useApp } from '../context/AppContext';
import { isOwnerView, canEditAutomations } from '../lib/access';
import { GENERIC_ERROR, isCreatorSafe } from '../lib/voice';
import { Search, Plus, AlertCircle, Loader2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { ListSkeleton } from '../components/Skeleton';
import AutomationCard from '../components/automations/AutomationCard';
import {
  isBackendConfigured, fetchFlows, createFlow, updateFlow, deleteFlow, restoreFlow,
  pauseFlow, activateFlow,
  FlowNotReadyError,
  type AutomationFlow,
} from '../lib/api';
import { readTrigger, triggerNodes, type FlowGraph } from '../lib/flowSchema';
import { useCreateAutomation } from '../context/CreateAutomationContext';

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

/**
 * How long Undo stays on offer. It is the length of a toast, nothing more.
 *
 * It used to be how long the DELETE was held back for, which made the deletion
 * itself contingent on the browser surviving the next seven seconds: a reload,
 * a crash, an OS tab discard or a backgrounded phone lost it after the
 * interface had already said "deleted". The request is sent when the creator
 * asks for it now, and Undo restores what was deleted.
 */
const UNDO_WINDOW_MS = 7000;

/**
 * How long a reload will wait for a delete that hasn't been answered yet.
 *
 * Bounded on purpose. The API client sets no timeout and passes no abort
 * signal, so a server that accepts a DELETE and never answers would otherwise
 * hold this page on its loading skeleton for as long as the tab is open. After
 * this, the list is fetched anyway — the filter below is what stops the
 * still-deleting automation reappearing in the meantime.
 */
const DELETE_SETTLE_WAIT_MS = 4000;

/**
 * Deletes that have been sent and not yet answered, held at module scope so
 * they outlive the component that started them.
 *
 * A delete is sent the moment it is asked for, but "sent" is not "answered".
 * Deleting an automation and immediately navigating away and back re-mounts
 * this page and refetches — and a list fetched before the DELETE reaches the
 * server still contains the automation that was just deleted. It reappears and
 * stays there, which reads as the delete having silently failed.
 *
 * Entries are removed when the request is ANSWERED, never when somebody reads
 * them. A creator can leave and return several times while one delete is still
 * in flight, and every one of those remounts has to see it — a map that
 * emptied on the first read would leave the second return racing the request
 * exactly as before.
 */
const inFlightDeletes = new Map<string, Promise<Error | null>>();

/**
 * Failures from deletes that nobody has told the creator about yet.
 *
 * Kept apart from the in-flight map because the two have different lifetimes:
 * waiting is over the moment the server answers, while an unreported failure
 * has to survive until some page is around to show it.
 */
const unreportedDeleteErrors = new Map<string, Error>();

interface DeleteOutcome {
  error: Error | null;
  /** Populr deleted it, but Instagram hasn't confirmed its copy stopped. */
  warning?: string;
}

/** Send the delete and track it until the server answers. Never rejects. */
function commitDelete(id: string): Promise<DeleteOutcome> {
  const outcome: Promise<DeleteOutcome> = deleteFlow(id).then(
    res => ({ error: null, warning: res.warning }),
    (err: unknown) => ({
      error: err instanceof Error ? err : new Error('Could not delete this automation.'),
    }),
  );
  inFlightDeletes.set(id, outcome.then(o => o.error));
  void outcome.then(o => {
    inFlightDeletes.delete(id);
    if (o.error) unreportedDeleteErrors.set(id, o.error);
  });
  return outcome;
}

/**
 * Restores that have been sent and not yet answered — the mirror of the map
 * above, and needed for the mirror-image reason.
 *
 * Undo, then straight back to another page and back again: the new page asks
 * for the list while the restore is still open, and the server truthfully
 * answers that the automation is still deleted. The restore then lands on a
 * component that no longer exists, so its setFlows does nothing, and the
 * automation the creator just brought back is missing from the page they are
 * looking at until something else reloads it.
 */
const inFlightRestores = new Map<string, Promise<RestoreOutcome>>();

interface RestoreOutcome {
  flow: AutomationFlow | null;
  error: Error | null;
}

/** Send the restore and track it until the server answers. Never rejects. */
function commitRestore(id: string): Promise<RestoreOutcome> {
  const outcome: Promise<RestoreOutcome> = restoreFlow(id).then(
    res => ({ flow: res.flow, error: null }),
    (err: unknown) => ({
      flow: null,
      error: err instanceof Error ? err : new Error('Could not restore this automation.'),
    }),
  );
  inFlightRestores.set(id, outcome);
  void outcome.then(() => inFlightRestores.delete(id));
  return outcome;
}

/**
 * Claim the right to report a failure; false if somebody already has.
 *
 * The page that started the delete and the next load of that page can both
 * reach the same failure, and the creator should hear about it once.
 */
function claimDeleteError(id: string): boolean {
  return unreportedDeleteErrors.delete(id);
}

function keywordsOf(graph: FlowGraph): string[] {
  const trigger = triggerNodes(graph)[0];
  return trigger ? readTrigger(trigger).keywords : [];
}

export default function AutomationsPage() {
  const navigate = useNavigate();
  const { showToast, workspaceAccess } = useApp();
  const ownerView = isOwnerView(workspaceAccess);
  const mayCreate = canEditAutomations(workspaceAccess) && workspaceAccess?.role !== 'canvas';
  const [searchParams, setSearchParams] = useSearchParams();
  const backendConfigured = isBackendConfigured();

  const [flows, setFlows] = useState<AutomationFlow[]>([]);
  /**
   * How many people each automation has reached, kept apart from the flows.
   *
   * The count comes only from the list route (see api.ts), so a flow object
   * handed back by pause, activate or restore has no `audienceCount` on it.
   * Reading the number off the flow would make an automation's audience vanish
   * the moment it was paused — which is exactly when a creator is most likely
   * to be looking at how many people it reached. Keyed by id, it survives
   * every mutation that replaces a row.
   */
  const [audience, setAudience] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(backendConfigured);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  

  // There is deliberately nothing here for teardown to do. A delete is a
  // request that has already been sent by the time anything can tear this page
  // down, so no `pagehide` handler, unmount flush or `keepalive` request is
  // needed to rescue one — which is the point: those existed only because the
  // deletion was being held hostage to the browser staying alive.

  const load = useCallback(() => {
    if (!backendConfigured) return;
    setLoading(true);
    setError(null);

    // Let anything already sent land first — asking for the list before a
    // delete arrives returns the automation that was just deleted, and asking
    // before a restore arrives leaves out the one just brought back. Bounded,
    // because a request that is accepted and never answered would otherwise
    // hold this page on its skeleton forever.
    Promise.race([
      Promise.all([...inFlightDeletes.values(), ...inFlightRestores.values()]),
      new Promise(resolve => setTimeout(resolve, DELETE_SETTLE_WAIT_MS)),
    ])
      .then(() => fetchFlows())
      .then(list => {
        // Whatever is still being deleted must not reappear merely because the
        // server hasn't answered yet. This is what makes the bounded wait
        // above safe: waiting can give up, but the list still tells the truth.
        //
        // There is deliberately no mirror of this for restores. A restore that
        // outlasts the wait leaves its automation missing from a list it is
        // about to be in, which the next load corrects; speculatively adding a
        // row instead would show an automation that isn't there if the restore
        // turns out to have failed. Briefly missing something real is the safer
        // way to be wrong than briefly showing something that isn't.
        setFlows(list.filter(f => !inFlightDeletes.has(f.id)));
        setAudience(prev => {
          const next = { ...prev };
          for (const f of list) if (f.audienceCount !== undefined) next[f.id] = f.audienceCount;
          return next;
        });

        // A delete that actually failed is why a row is back. Say so, rather
        // than letting the reappearance be the only clue — and say it once.
        for (const [id, err] of unreportedDeleteErrors) {
          if (claimDeleteError(id)) {
            showToast(err.message, 'error');
            break;
          }
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load automations.'))
      .finally(() => setLoading(false));
  }, [backendConfigured, showToast]);

  useEffect(() => {
    // Data fetch from the backend, not derived state — see ContactsPage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // One creation experience everywhere: this page's New button goes through
  // the same shared action as Home's CTA and the sidebar's Create — which
  // also asks "Run this automation from…" when the workspace has several
  // connected accounts, instead of silently minting an unbound draft.
  const { beginCreateAutomation, creatingAutomation } = useCreateAutomation();
  const startNew = useCallback(() => beginCreateAutomation(), [beginCreateAutomation]);

  // The retired /automations/new route lands here with ?new=1 so a bookmark
  // or a stale tab still ends up creating an automation rather than 404ing.
  // Reacting to the URL is exactly the external-system synchronisation an
  // effect is for; the marker is consumed first so a re-render can't create
  // a second automation.
  useEffect(() => {
    if (searchParams.get('new') !== '1' || !backendConfigured) return;
    setSearchParams({}, { replace: true });
    startNew();
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

  /**
   * Rename, from the card.
   *
   * Optimistic: the name is already on screen — the creator typed it — and a
   * PATCH that answers in 200ms would otherwise make the title flick back to
   * the old name and forward again. The failure branch puts the old name back
   * and says so, rather than leaving the list quietly disagreeing with the
   * server about what this automation is called.
   */
  const rename = async (flow: AutomationFlow, name: string) => {
    const previous = flow.name;
    setFlows(prev => prev.map(f => (f.id === flow.id ? { ...f, name } : f)));
    try {
      const { flow: saved } = await updateFlow(flow.id, { name });
      setFlows(prev => prev.map(f => (f.id === flow.id ? { ...f, ...saved } : f)));
    } catch (err) {
      setFlows(prev => prev.map(f => (f.id === flow.id ? { ...f, name: previous } : f)));
      showToast(err instanceof Error ? err.message : 'Could not rename this automation.', 'error');
    }
  };

  /**
   * Duplicate — a starting point, not a second live automation.
   *
   * The copy is created through the ordinary create route, so it arrives as a
   * draft however it was copied: duplicating something live must not quietly
   * put a second automation in front of real people. It also starts with an
   * audience of nobody, which is why the count isn't copied across.
   */
  const duplicate = async (flow: AutomationFlow) => {
    try {
      const copy = await createFlow({ name: `${flow.name} copy`, graph: flow.graph });
      setFlows(prev => [copy, ...prev]);
      showToast(`Duplicated as “${copy.name}” — it's a draft`, 'success', {
        durationMs: 8000,
        action: { label: 'Open', onClick: () => navigate(`/automations/${copy.id}`) },
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not duplicate this automation.', 'error');
    }
  };

  const toggleStatus = async (flow: AutomationFlow) => {
    try {
      if (flow.status === 'live') {
        const result = await pauseFlow(flow.id);
        setFlows(prev => prev.map(f => (f.id === flow.id ? result.flow : f)));
        // "Paused" is a claim about what fans experience, not about our own
        // row. When Instagram hasn't confirmed the automation stopped it may
        // still be DMing commenters, and saying "Automation paused" over the
        // top of that would be the reassuring version of a lie.
        if (result.warning) {
          showToast(isCreatorSafe(result.warning) ? result.warning : GENERIC_ERROR, 'error', { durationMs: 10000 });
        } else {
          showToast(
            result.cancelledRuns > 0
              ? `Paused — ${result.cancelledRuns} in-progress follow-up${result.cancelledRuns === 1 ? '' : 's'} cancelled`
              : 'Automation paused',
            'success',
          );
        }
      } else {
        const result = await activateFlow(flow.id);
        setFlows(prev => prev.map(f => (f.id === flow.id ? result.flow : f)));
        showToast('Automation is live', 'success');
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
   * The delete is sent now. The row disappears now. Undo is a separate request
   * that brings the automation back — same id, same run history, not a
   * rebuilt lookalike — because the backend records the deletion rather than
   * destroying the row.
   *
   * The order matters, and it is the opposite of what this used to do. Holding
   * the DELETE for the length of the undo offer made the deletion contingent
   * on the browser: a reload, a crash, a closed tab or a phone that discarded
   * the tab meant the request was simply never sent, and the automation was
   * still there on the way back with nothing having failed and nothing to
   * report. Undo is now the exceptional path; it is no longer the delete path
   * waiting to go wrong.
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
    const sent = commitDelete(flow.id);

    void sent.then(({ error, warning }) => {
      if (error) {
        // Only ours to report if a reload hasn't already taken it.
        if (!claimDeleteError(flow.id)) return;
        // The delete failed after the row was already gone from the list, so
        // put it back rather than leave the two out of step.
        setFlows(prev => (prev.some(f => f.id === flow.id) ? prev : [flow, ...prev]));
        showToast(error.message, 'error');
        return;
      }
      // "Deleted" is a claim about what fans experience. If Instagram hasn't
      // confirmed its copy stopped, commenters may still be getting the DM,
      // and letting the row vanish quietly would be the reassuring version of
      // a lie — the same distinction pause already draws.
      if (warning) showToast(warning, 'error', { durationMs: 10000 });
    });

    showToast(`“${flow.name}” deleted`, 'success', {
      durationMs: UNDO_WINDOW_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          // Sequenced behind the delete rather than raced with it. A restore
          // that overtook its own DELETE would find nothing deleted yet, 404,
          // and then be deleted a moment later — the automation would vanish
          // again with the toast already gone and nothing left to press.
          void sent.then(async ({ error }) => {
            // It was never deleted, so there is nothing to restore; the
            // failure branch above has already put it back and said why.
            if (error) return;

            // Tracked, for the same reason the delete is: a creator who
            // presses Undo and immediately navigates away and back would
            // otherwise land on a page that asked for the list before the
            // restore arrived, and the automation they just brought back
            // would be missing from it.
            const { flow: restored, error: restoreError } = await commitRestore(flow.id);
            if (restoreError || !restored) {
              showToast(
                restoreError?.message ?? 'Could not restore this automation.',
                'error',
              );
              return;
            }
            setFlows(prev =>
              [restored, ...prev.filter(f => f.id !== restored.id)]
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
            // Restore hands back a paused automation whatever it was before.
            // Deleting stopped Instagram's copy and cancelled the follow-ups
            // that were in flight; bringing the row back reverses neither, so
            // someone who deleted a live automation by accident has to be
            // told it is not live again rather than discovering it later.
            if (flow.status === 'live') {
              showToast(
                `“${restored.name}” is back, switched off — turn it on when you're ready`,
                'success',
                { durationMs: 10000 },
              );
            }
          });
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
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to its server yet</p>
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
        subtitle={loading ? 'Loading…' : `${live.length} live · ${flows.length} total`}
        action={
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
            <div className="relative w-full sm:w-auto">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search automations..." className="pop-search w-full sm:w-56"
              />
            </div>
            {mayCreate && <button
              onClick={startNew}
              disabled={creatingAutomation}
              className="pop-btn-primary w-full sm:w-auto justify-center disabled:opacity-60"
            >
              {creatingAutomation ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} strokeWidth={2.5} />}
              New automation
            </button>}
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
        // Filters sit closer to what they filter than to the header above
        // them, so the eye reads title → filters → list rather than finding a
        // row of pills floating between two things.
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {[
            { key: 'all' as StatusTab, label: 'All', count: flows.length },
            { key: 'live' as StatusTab, label: 'Live', count: live.length },
            { key: 'draft' as StatusTab, label: 'Drafts', count: drafts.length },
            { key: 'paused' as StatusTab, label: 'Paused', count: paused.length },
          ].map(t => (
            <button
              key={t.key} onClick={() => setStatusTab(t.key)}
              aria-pressed={statusTab === t.key}
              className={`px-3.5 py-1.5 rounded-xl text-[12px] font-medium whitespace-nowrap
                border transition-colors duration-150 ${
                statusTab === t.key
                  ? 'bg-[#111111] text-white border-[#111111] shadow-[0_1px_2px_rgba(17,17,17,0.12)]'
                  : 'border-transparent text-[#6B6B6B] hover:bg-white hover:border-[#E8E4DF] hover:text-[#111111]'}`}
            >
              {t.label} <span className="text-[11px] opacity-55">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <ListSkeleton count={3} label="Loading automations" />
      ) : !error && filtered.length === 0 ? (
        <EmptyState
          icon="automations"
          title={search || statusTab !== 'all' ? 'No automations match that search' : 'No automations yet'}
          description="Describe what should happen and Populr builds the steps for you."
          action={mayCreate ? (
            <button onClick={startNew} className="pop-btn-primary" disabled={creatingAutomation}>
              New automation
            </button>
          ) : undefined}
        />
      ) : !error && (
        <div className="space-y-2.5">
          {filtered.map(flow => (
            <AutomationCard
              key={flow.id}
              flow={flow}
              audience={audience[flow.id] ?? null}
              onOpen={() => navigate(`/automations/${flow.id}`)}
              onToggleStatus={() => toggleStatus(flow)}
              canToggle={ownerView}
              onRename={name => rename(flow, name)}
              onDuplicate={() => duplicate(flow)}
              onDelete={() => remove(flow)}
              onShowAudience={() => navigate(`/contacts?automation=${flow.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
