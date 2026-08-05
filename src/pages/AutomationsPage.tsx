import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import {
  Search, Play, Pause, Zap, ArrowLeft, Plus, Loader2, AlertCircle, MessageCircle, PenLine, Trash2,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import EmptyState from '../components/EmptyState';
import {
  isBackendConfigured, fetchAutomations, updateAutomation, fetchAutomationEvents,
} from '../lib/api';
import type { Automation, AutomationEvent } from '../lib/api';
import { AUTOMATION_TYPES, automationToTypeCard } from '../components/automation-wizard/useAutomationWizard';
import { ListSkeleton } from '../components/Skeleton';
import { listWizardDrafts, deleteWizardDraft, type WizardDraft } from '../components/automation-wizard/wizardDrafts';

type StatusTab = 'all' | 'active' | 'paused' | 'drafts';

function automationTypeLabel(a: Pick<Automation, 'trigger_type' | 'reply_channel'>): string {
  return AUTOMATION_TYPES[automationToTypeCard(a)].title;
}

export default function AutomationsPage() {
  const navigate = useNavigate();
  const { showToast } = useApp();
  const backendConfigured = isBackendConfigured();

  const [automations, setAutomations] = useState<Automation[]>([]);
  // Unfinished automations, autosaved by the wizard on this device — see
  // components/automation-wizard/wizardDrafts.ts. Local reads, no fetch.
  const [drafts, setDrafts] = useState<WizardDraft[]>(() => listWizardDrafts());
  const [loading, setLoading] = useState(backendConfigured);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [events, setEvents] = useState<AutomationEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');

  const load = useCallback(() => {
    if (!backendConfigured) return;
    setLoading(true);
    setError(null);
    fetchAutomations()
      .then(setAutomations)
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load automations.'))
      .finally(() => setLoading(false));
  }, [backendConfigured]);

  useEffect(() => {
    // Data fetch from the backend, not derived state — see ContactsPage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (!detailId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEventsError(null);
      setEvents(null);
      return;
    }
    setEventsError(null);
    fetchAutomationEvents(detailId)
      .then(setEvents)
      // A failed fetch used to resolve to [], rendering "No activity yet." —
      // indistinguishable from a working automation that simply hasn't fired,
      // which is the difference the creator most needs to see.
      .catch(err => setEventsError(err instanceof Error ? err.message : 'Could not load activity.'));
  }, [detailId]);

  const active = automations.filter(a => a.active);
  const paused = automations.filter(a => !a.active);

  const filtered = useMemo(() => {
    if (statusTab === 'drafts') return [];
    let result = [...automations];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(q) || a.keywords.some(k => k.includes(q)));
    }
    if (statusTab === 'active') result = result.filter(a => a.active);
    if (statusTab === 'paused') result = result.filter(a => !a.active);
    return result;
  }, [automations, search, statusTab]);

  const visibleDrafts = useMemo(() => {
    if (statusTab !== 'all' && statusTab !== 'drafts') return [];
    if (!search) return drafts;
    const q = search.toLowerCase();
    return drafts.filter(d =>
      d.state.name.toLowerCase().includes(q) || d.state.triggerKeywords.some(k => k.includes(q)));
  }, [drafts, search, statusTab]);

  const toggleStatus = async (a: Automation) => {
    try {
      const updated = await updateAutomation(a.id, { active: !a.active });
      setAutomations(prev => prev.map(x => x.id === a.id ? updated : x));
      showToast(updated.active ? 'Automation activated' : 'Automation paused', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update automation.', 'error');
    }
  };

  const handleEdit = (a: Automation) => navigate('/automations/new', { state: { automation: a } });

  const resumeDraft = (d: WizardDraft) => navigate('/automations/new', { state: { draftId: d.id } });

  const removeDraft = (d: WizardDraft) => {
    if (!window.confirm('Delete this draft? This can\'t be undone.')) return;
    deleteWizardDraft(d.id);
    const remaining = listWizardDrafts();
    setDrafts(remaining);
    // Don't leave the user stranded on a tab that no longer exists.
    if (remaining.length === 0 && statusTab === 'drafts') setStatusTab('all');
    showToast('Draft deleted', 'success');
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

  // Detail view
  const detail = detailId ? automations.find(a => a.id === detailId) : null;
  if (detail) {
    return (
      <div className="pop-page max-w-[900px]">
        <button onClick={() => setDetailId(null)} className="pop-btn-ghost mb-5">
          <ArrowLeft size={16} />Back to automations
        </button>

        <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <StatusPill status={detail.active ? 'active' : 'paused'} />
            </div>
            <h1 className="pop-section-heading">{detail.name}</h1>
            <p className="pop-body mt-1">{automationTypeLabel(detail)} · {detail.keywords.join(', ') || 'no keywords'}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => handleEdit(detail)} className="pop-btn-primary">
              <Zap size={14} />Edit
            </button>
            <button onClick={() => toggleStatus(detail)}
              className={detail.active ? 'pop-btn-tertiary' : 'pop-btn-primary'}>
              {detail.active ? <><Pause size={14} />Pause</> : <><Play size={14} />Activate</>}
            </button>
          </div>
        </div>

        <div className="pop-card p-5 mb-5">
          <h2 className="pop-card-title mb-3 flex items-center gap-2"><MessageCircle size={15} />Activity</h2>
          {eventsError ? (
            <div className="flex items-start gap-2 py-2">
              <AlertCircle size={15} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] text-[#111111]">Couldn&apos;t load this automation&apos;s activity</p>
                <p className="text-[12px] text-[#6B6B6B] mt-0.5">{eventsError}</p>
              </div>
            </div>
          ) : events === null ? (
            <div className="flex items-center gap-2 text-[#6B6B6B] text-[13px] py-4"><Loader2 size={16} className="animate-spin" />Loading activity…</div>
          ) : events.length === 0 ? (
            <p className="text-[13px] text-[#9B9B8F] py-2">No activity yet.</p>
          ) : (
            <div className="space-y-2">
              {events.map(e => (
                <div key={e.id} className="flex items-start gap-3 py-2 border-b border-[#F0EEEA] last:border-0">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${e.status === 'failed' ? 'bg-[#DC2626]' : e.status === 'skipped' ? 'bg-[#9B9B8F]' : 'bg-[#10B981]'}`} />
                  <div className="min-w-0">
                    <p className="text-[12px] text-[#111111]">{e.detail}</p>
                    <p className="text-[10px] text-[#9B9B8F] mt-0.5">{new Date(e.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="pop-page">
      <PageHeader
        title="Automations"
        subtitle={loading
          ? 'Loading...'
          : `${active.length} active · ${automations.length} total${drafts.length > 0 ? ` · ${drafts.length} draft${drafts.length === 1 ? '' : 's'}` : ''}`}
        action={
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
            <div className="relative w-full sm:w-auto">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search automations..."
                className="pop-search w-full sm:w-56" />
            </div>
            <button onClick={() => navigate('/automations/new')} className="pop-btn-primary w-full sm:w-auto justify-center">
              <Plus size={14} strokeWidth={2.5} />Create automation
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
            { key: 'all' as StatusTab, label: 'All', count: automations.length },
            { key: 'active' as StatusTab, label: 'Active', count: active.length },
            { key: 'paused' as StatusTab, label: 'Paused', count: paused.length },
            // The Drafts tab only exists while there's something in it —
            // like a post composer's drafts folder.
            ...(drafts.length > 0 ? [{ key: 'drafts' as StatusTab, label: 'Drafts', count: drafts.length }] : []),
          ].map(t => (
            <button key={t.key} onClick={() => setStatusTab(t.key)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-medium whitespace-nowrap transition-all ${statusTab === t.key ? 'bg-[#111111] text-white' : 'text-[#6B6B6B] hover:bg-white'}`}>
              {t.label} <span className="text-[10px] opacity-60">({t.count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Drafts — unfinished automations the wizard autosaved on this device.
          Rendered ahead of the (backend-loaded) list so they're visible even
          while automations are still loading. */}
      {visibleDrafts.length > 0 && (
        <div className="mb-6">
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="font-geist font-semibold text-[13px] text-[#111111]">Drafts</h2>
            <span className="text-[11px] text-[#9B9B8F]">Unfinished automations, saved on this device</span>
          </div>
          <div className="space-y-3">
            {visibleDrafts.map(d => (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                aria-label={`Continue setting up ${d.state.name.trim() || 'Untitled automation'}`}
                onClick={() => resumeDraft(d)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); resumeDraft(d); } }}
                className="pop-card p-4 pop-card-hover cursor-pointer border-dashed outline-none focus-visible:ring-2 focus-visible:ring-chartreuse focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#FAFAF8]">
                      <PenLine size={18} className="text-[#6B6B6B]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-geist font-semibold text-[13px] text-[#111111] truncate">
                          {d.state.name.trim() || 'Untitled automation'}
                        </h3>
                        <StatusPill status="draft" className="text-[10px]" />
                      </div>
                      <p className="text-[11px] text-[#6B6B6B] mt-0.5">
                        {d.state.type ? AUTOMATION_TYPES[d.state.type].title : 'Type not chosen yet'}
                      </p>
                      {d.state.triggerKeywords.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-1.5">
                          {d.state.triggerKeywords.map(k => (
                            <span key={k} className="bg-[#FAFAF8] text-[#6B6B6B] text-[10px] px-2 py-0.5 rounded-full">{k}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); resumeDraft(d); }} className="p-2.5 hover:bg-[#FAFAF8] rounded-lg transition-all" title="Continue setup" aria-label={`Continue setting up ${d.state.name.trim() || 'Untitled automation'}`}>
                      <PenLine size={14} className="text-[#6B6B6B]" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); removeDraft(d); }} className="p-2.5 hover:bg-[#FAFAF8] rounded-lg transition-all" title="Delete draft" aria-label={`Delete draft ${d.state.name.trim() || 'Untitled automation'}`}>
                      <Trash2 size={14} className="text-[#DC2626]" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-[#F0EEEA] flex items-center justify-between">
                  <p className="text-[11px] text-[#9B9B8F]">Instagram</p>
                  <span className="text-[10px] text-[#9B9B8F]">Saved {new Date(d.savedAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <ListSkeleton count={3} label="Loading automations" />
      ) : !error && statusTab === 'drafts' ? (
        visibleDrafts.length === 0 && (
          <EmptyState icon="automations" title="No drafts found" description="Automations you start but don't finish are saved here automatically." action={<button onClick={() => navigate('/automations/new')} className="pop-btn-primary">Create automation</button>} />
        )
      ) : !error && filtered.length === 0 ? (
        // Drafts visible above are still something — reserve the big empty
        // state for a genuinely empty page.
        visibleDrafts.length === 0 && (
          <EmptyState icon="automations" title="No automations found" description="Create automations to respond to engagement automatically." action={<button onClick={() => navigate('/automations/new')} className="pop-btn-primary">Create automation</button>} />
        )
      ) : !error && (
        <div className="space-y-3">
          {filtered.map(a => (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              aria-label={`Open ${a.name}`}
              onClick={() => setDetailId(a.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailId(a.id); } }}
              className="pop-card p-4 pop-card-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-chartreuse focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${a.active ? 'bg-chartreuse' : 'bg-[#FAFAF8]'}`}>
                    {a.active ? <Zap size={18} className="text-[#111111]" /> : <Pause size={18} className="text-[#6B6B6B]" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-geist font-semibold text-[13px] text-[#111111] truncate">{a.name}</h3>
                      <StatusPill status={a.active ? 'active' : 'paused'} className="text-[10px]" />
                    </div>
                    <p className="text-[11px] text-[#6B6B6B] mt-0.5">{automationTypeLabel(a)}</p>
                    {a.keywords.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-1.5">
                        {a.keywords.map(k => (
                          <span key={k} className="bg-[#FAFAF8] text-[#6B6B6B] text-[10px] px-2 py-0.5 rounded-full">{k}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={e => { e.stopPropagation(); handleEdit(a); }} className="p-2.5 hover:bg-[#FAFAF8] rounded-lg transition-all" title="Edit" aria-label={`Edit ${a.name}`}>
                    <Zap size={14} className="text-[#6B6B6B]" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); toggleStatus(a); }}
                    className="p-2.5 hover:bg-[#FAFAF8] rounded-lg transition-all"
                    title={a.active ? 'Pause' : 'Activate'}
                    aria-label={`${a.active ? 'Pause' : 'Activate'} ${a.name}`}
                  >
                    {a.active ? <Pause size={14} className="text-[#6B6B6B]" /> : <Play size={14} className="text-[#10B981]" />}
                  </button>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-[#F0EEEA] flex items-center justify-between">
                <p className="text-[11px] text-[#9B9B8F] capitalize">{a.platform}</p>
                <span className="text-[10px] text-[#9B9B8F]">Updated {new Date(a.updated_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
