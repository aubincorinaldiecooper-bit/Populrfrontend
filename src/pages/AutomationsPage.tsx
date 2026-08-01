import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import {
  isBackendConfigured, fetchAutomations, updateAutomation, deleteAutomation, fetchAutomationEvents,
} from '../lib/api';
import type { AutomationRecord, AutomationEvent, ConnectedAccount } from '../lib/api';
import {
  Search, Play, Pause, Zap, ArrowLeft, Plus, Loader2, AlertCircle, Trash2, Pencil,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import PlatformDot from '../components/PlatformDot';
import EmptyState from '../components/EmptyState';

type StatusTab = 'all' | 'active' | 'paused';

const MATCH_MODE_LABEL: Record<string, string> = {
  contains: 'contains',
  exact: 'exactly matches',
  starts_with: 'starts with',
};

const REPLY_CHANNEL_LABEL: Record<string, string> = {
  comment: 'Public reply',
  dm: 'DM',
  both: 'Public reply + DM',
};

function relativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function AutomationDetail({
  automation, account, busy, onBack, onEdit, onToggleActive, onDelete,
}: {
  automation: AutomationRecord;
  account?: ConnectedAccount;
  busy: boolean;
  onBack: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const reviewFirst = automation.ai_enabled && automation.ai_mode === 'suggest';

  useEffect(() => {
    let cancelled = false;
    // Data fetch from the backend, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEventsLoading(true);
    setEventsError(null);
    fetchAutomationEvents(automation.id, 25)
      .then(list => { if (!cancelled) setEvents(list); })
      .catch(err => { if (!cancelled) setEventsError(err instanceof Error ? err.message : 'Could not load activity.'); })
      .finally(() => { if (!cancelled) setEventsLoading(false); });
    return () => { cancelled = true; };
  }, [automation.id]);

  return (
    <div className="pop-page max-w-[900px]">
      <button onClick={onBack} className="pop-btn-ghost mb-5">
        <ArrowLeft size={16} />Back to automations
      </button>

      <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <StatusPill status={automation.active ? 'active' : 'paused'} />
            {reviewFirst && <StatusPill status="reply recommended" />}
          </div>
          <h1 className="pop-section-heading">{automation.name}</h1>
          <div className="flex items-center gap-1.5 mt-1.5">
            <PlatformDot platform={automation.platform} size={8} />
            <span className="text-[13px] text-[#6B6B6B] capitalize">{automation.platform}</span>
            {account && (
              <span className="text-[13px] text-[#6B6B6B]">
                · {account.username ? `@${account.username}` : account.display_name ?? account.id}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={onEdit} className="pop-btn-primary">
            <Pencil size={14} />Edit
          </button>
          <button onClick={onToggleActive} disabled={busy}
            className={`${automation.active ? 'pop-btn-tertiary' : 'pop-btn-primary'} disabled:opacity-60`}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : automation.active ? <Pause size={14} /> : <Play size={14} />}
            {automation.active ? 'Pause' : 'Resume'}
          </button>
          <button onClick={onDelete} disabled={busy}
            className="pop-btn-tertiary text-[#DC2626] border-[#FCA5A5] hover:bg-[#FEE2E2] disabled:opacity-60">
            <Trash2 size={14} />Delete
          </button>
        </div>
      </div>

      <div className="pop-card p-5 mb-5 space-y-4">
        <h2 className="pop-card-title">Configuration</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="pop-meta">Trigger</p>
            <p className="text-[13px] text-[#111111] mt-0.5">
              {automation.all_posts ? 'Any post' : `Post ${automation.source_post_id}`} · comment {MATCH_MODE_LABEL[automation.match_mode] ?? automation.match_mode}
            </p>
            <p className="text-[12px] text-[#6B6B6B] mt-0.5">{automation.keywords.join(', ')}</p>
          </div>
          <div>
            <p className="pop-meta">Reply channel</p>
            <p className="text-[13px] text-[#111111] mt-0.5">{REPLY_CHANNEL_LABEL[automation.reply_channel] ?? automation.reply_channel}</p>
          </div>
          {automation.comment_reply_body && (
            <div>
              <p className="pop-meta">Public reply text</p>
              <p className="text-[13px] text-[#111111] mt-0.5">{automation.comment_reply_body}</p>
            </div>
          )}
          {automation.message_body && (
            <div>
              <p className="pop-meta">DM text</p>
              <p className="text-[13px] text-[#111111] mt-0.5">{automation.message_body}</p>
            </div>
          )}
          {automation.link_url && (
            <div>
              <p className="pop-meta">Link</p>
              <p className="text-[13px] text-[#111111] mt-0.5 truncate">{automation.link_url}</p>
            </div>
          )}
          {automation.tags.length > 0 && (
            <div>
              <p className="pop-meta">Tags</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {automation.tags.map(t => <StatusPill key={t} status={t} className="text-[10px]" />)}
              </div>
            </div>
          )}
          {automation.score_delta !== 0 && (
            <div>
              <p className="pop-meta">Lead score</p>
              <p className="text-[13px] text-[#111111] mt-0.5">+{automation.score_delta} per match</p>
            </div>
          )}
        </div>
      </div>

      <div className="pop-card p-5">
        <h2 className="pop-card-title mb-4">Recent activity</h2>
        {eventsLoading && (
          <div className="flex items-center justify-center py-8 text-[#6B6B6B]">
            <Loader2 size={18} className="animate-spin mr-2" /> Loading activity...
          </div>
        )}
        {!eventsLoading && eventsError && <p className="text-[12px] text-[#DC2626]">{eventsError}</p>}
        {!eventsLoading && !eventsError && events.length === 0 && (
          <p className="text-[12px] text-[#6B6B6B]">No activity yet. This fills in as people engage with your keywords.</p>
        )}
        {!eventsLoading && !eventsError && events.length > 0 && (
          <div className="space-y-2">
            {events.map(e => (
              <div key={e.id} className="flex items-start justify-between gap-3 py-2 border-b border-[#F0EEEA] last:border-0">
                <div className="min-w-0">
                  <p className="text-[12px] text-[#111111]">
                    {e.contact_name || e.contact_handle ? (e.contact_name || `@${e.contact_handle}`) : 'Someone'} — {e.detail}
                  </p>
                  {e.error && <p className="text-[11px] text-[#DC2626] mt-0.5">{e.error}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusPill status={e.status === 'ok' ? 'sent' : e.status === 'failed' ? 'disconnected' : 'draft'} className="text-[10px]" />
                  <span className="text-[10px] text-[#9B9B8F]">{relativeTime(e.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AutomationsPage() {
  const navigate = useNavigate();
  const { showToast, accounts, accountsLoading } = useApp();
  const backendConfigured = isBackendConfigured();

  const [automationList, setAutomationList] = useState<AutomationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!backendConfigured) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetchAutomations()
      .then(setAutomationList)
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load automations right now.'))
      .finally(() => setLoading(false));
  }, [backendConfigured]);

  useEffect(() => {
    // Data fetch from the backend, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const connectedAccounts = useMemo(() => accounts.filter(a => a.status === 'connected'), [accounts]);
  const accountById = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a])), [accounts]);

  const activeCount = automationList.filter(a => a.active).length;
  const pausedCount = automationList.filter(a => !a.active).length;

  const filtered = useMemo(() => {
    let result = automationList;
    if (statusTab === 'active') result = result.filter(a => a.active);
    if (statusTab === 'paused') result = result.filter(a => !a.active);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(q) || a.keywords.some(k => k.toLowerCase().includes(q)));
    }
    return result;
  }, [automationList, statusTab, search]);

  const handleToggleActive = async (a: AutomationRecord) => {
    setBusyId(a.id);
    try {
      const updated = await updateAutomation(a.id, { active: !a.active });
      setAutomationList(prev => prev.map(x => x.id === a.id ? updated : x));
      showToast(updated.active ? 'Automation resumed' : 'Automation paused', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update this automation.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (a: AutomationRecord) => {
    if (!window.confirm(`Delete "${a.name}"? This cannot be undone.`)) return;
    setBusyId(a.id);
    try {
      await deleteAutomation(a.id);
      setAutomationList(prev => prev.filter(x => x.id !== a.id));
      showToast('Automation deleted', 'success');
      setDetailId(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete this automation.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleEdit = (a: AutomationRecord) => navigate('/automations/new', { state: { automation: a } });

  const detail = detailId ? automationList.find(a => a.id === detailId) ?? null : null;
  if (detail) {
    return (
      <AutomationDetail
        automation={detail}
        account={accountById[detail.account_id]}
        busy={busyId === detail.id}
        onBack={() => setDetailId(null)}
        onEdit={() => handleEdit(detail)}
        onToggleActive={() => handleToggleActive(detail)}
        onDelete={() => handleDelete(detail)}
      />
    );
  }

  return (
    <div className="pop-page">
      <PageHeader
        title="Automations"
        subtitle={backendConfigured ? `${activeCount} active · ${automationList.length} total` : undefined}
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

      {!backendConfigured && (
        <div className="pop-card p-6 mb-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to a backend yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Set <code className="bg-[#FAFAF8] px-1 py-0.5 rounded">VITE_API_URL</code> to your Populr backend to see real automations here. This page never shows placeholder data in its place.
            </p>
          </div>
        </div>
      )}

      {backendConfigured && (
        <>
          <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
            {[
              { key: 'all' as StatusTab, label: 'All', count: automationList.length },
              { key: 'active' as StatusTab, label: 'Active', count: activeCount },
              { key: 'paused' as StatusTab, label: 'Paused', count: pausedCount },
            ].map(t => (
              <button key={t.key} onClick={() => setStatusTab(t.key)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-medium whitespace-nowrap transition-all ${statusTab === t.key ? 'bg-[#111111] text-white' : 'text-[#6B6B6B] hover:bg-white'}`}>
                {t.label} <span className="text-[10px] opacity-60">({t.count})</span>
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16 text-[#6B6B6B]">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading automations...
            </div>
          )}

          {!loading && error && (
            <div className="pop-card p-6 flex items-start gap-3">
              <AlertCircle size={18} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-[#111111]">Couldn&apos;t load automations</p>
                <p className="text-[12px] text-[#6B6B6B] mt-1">{error}</p>
                <button onClick={load} className="pop-btn-secondary text-[12px] py-1.5 px-3 mt-3">Try again</button>
              </div>
            </div>
          )}

          {!loading && !error && automationList.length === 0 && !accountsLoading && connectedAccounts.length === 0 && (
            <EmptyState icon="automations" title="Connect an account first"
              description="Automations reply to comments and DMs on your connected accounts. Connect one to get started."
              action={<button onClick={() => navigate('/connections')} className="pop-btn-primary">Connect an account</button>} />
          )}

          {!loading && !error && automationList.length === 0 && (accountsLoading || connectedAccounts.length > 0) && (
            <EmptyState icon="automations" title="No automations yet"
              description="Create an automation to reply to comments and DMs automatically, and start capturing contacts."
              action={<button onClick={() => navigate('/automations/new')} className="pop-btn-primary">Create automation</button>} />
          )}

          {!loading && !error && automationList.length > 0 && filtered.length === 0 && (
            <EmptyState icon="search" title="Nothing matches" description="Try a different search or status filter." />
          )}

          {!loading && !error && filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map(a => {
                const account = accountById[a.account_id];
                const reviewFirst = a.ai_enabled && a.ai_mode === 'suggest';
                const busy = busyId === a.id;
                return (
                  <div key={a.id} className="pop-card p-4 pop-card-hover cursor-pointer" onClick={() => setDetailId(a.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${a.active ? 'bg-chartreuse' : 'bg-[#FAFAF8]'}`}>
                          {a.active ? <Zap size={18} className="text-[#111111]" /> : <Pause size={18} className="text-[#6B6B6B]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-geist font-semibold text-[13px] text-[#111111] truncate">{a.name}</h3>
                            <StatusPill status={a.active ? 'active' : 'paused'} className="text-[10px]" />
                            {reviewFirst && <StatusPill status="reply recommended" className="text-[10px]" />}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <PlatformDot platform={a.platform} size={7} />
                            <span className="text-[11px] text-[#9B9B8F] capitalize">{a.platform}</span>
                            {account && (
                              <span className="text-[11px] text-[#9B9B8F]">
                                · {account.username ? `@${account.username}` : account.display_name ?? account.id}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#6B6B6B] mt-1">
                            When a comment {MATCH_MODE_LABEL[a.match_mode] ?? a.match_mode} &ldquo;{a.keywords.slice(0, 3).join(', ')}{a.keywords.length > 3 ? '…' : ''}&rdquo; → {REPLY_CHANNEL_LABEL[a.reply_channel] ?? a.reply_channel}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleEdit(a)} disabled={busy} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all disabled:opacity-50" title="Edit">
                          <Pencil size={14} className="text-[#6B6B6B]" />
                        </button>
                        <button onClick={() => handleToggleActive(a)} disabled={busy} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all disabled:opacity-50" title={a.active ? 'Pause' : 'Resume'}>
                          {busy ? <Loader2 size={14} className="animate-spin text-[#6B6B6B]" /> : a.active ? <Pause size={14} className="text-[#6B6B6B]" /> : <Play size={14} className="text-[#10B981]" />}
                        </button>
                        <button onClick={() => handleDelete(a)} disabled={busy} className="p-2 hover:bg-[#FEE2E2] rounded-lg transition-all disabled:opacity-50" title="Delete">
                          <Trash2 size={14} className="text-[#DC2626]" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
