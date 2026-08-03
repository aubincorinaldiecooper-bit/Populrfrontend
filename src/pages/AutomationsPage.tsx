import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Play, Pause, Zap, ArrowLeft, Plus, Trash2, Pencil, Loader2, AlertCircle,
  MessageSquare, Send, MessagesSquare, Hash, KeyRound, Clock, Sparkles, X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  isBackendConfigured, fetchAutomations, updateAutomation, deleteAutomation, fetchAutomationEvents,
} from '../lib/api';
import type { AutomationRecord, AutomationEvent, ConnectedAccount } from '../lib/api';

type StatusTab = 'all' | 'active' | 'paused';

const MATCH_MODE_LABEL: Record<string, string> = {
  contains: 'contains', exact: 'exactly matches', starts_with: 'starts with',
};
const REPLY_CHANNEL_LABEL: Record<string, string> = {
  comment: 'Public reply', dm: 'DM', both: 'Public reply + DM',
};
const CHANNEL_ICON: Record<string, typeof MessageSquare> = {
  comment: MessageSquare, dm: Send, both: MessagesSquare,
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const card = 'bg-surface-container-lowest border border-surface-variant rounded-xl';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-label text-label-sm uppercase text-on-surface-variant">{label}</p>
      <p className="font-body text-body-md text-on-surface mt-0.5">{children}</p>
    </div>
  );
}

function StatusChip({ active }: { active: boolean }) {
  return (
    <span className={`font-label text-label-sm uppercase px-2.5 py-1 rounded-full ${active ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'}`}>
      {active ? 'Live' : 'Paused'}
    </span>
  );
}

// ── Detail view ──────────────────────────────────────────────────────
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
    <div className="px-container-padding-mobile md:px-container-padding-desktop py-8 md:py-10 max-w-[900px] mx-auto pb-24">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-body-md font-medium text-on-surface-variant hover:text-primary transition-colors">
        <ArrowLeft size={16} /> Back to automations
      </button>

      <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mt-5 mb-7">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <StatusChip active={automation.active} />
            {reviewFirst && <span className="font-label text-label-sm uppercase px-2.5 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant">Reply recommended</span>}
          </div>
          <h1 className="font-display text-headline-md md:text-display-lg-mobile text-on-surface">{automation.name}</h1>
          <p className="font-body text-body-md text-on-surface-variant mt-1.5 capitalize">
            {automation.platform}
            {account && <span> · {account.username ? `@${account.username}` : account.display_name ?? account.id}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={onEdit} className="inline-flex items-center gap-1.5 bg-primary text-on-primary rounded-full px-4 py-2 text-body-md font-semibold hover:opacity-90 transition-opacity">
            <Pencil size={14} /> Edit
          </button>
          <button onClick={onToggleActive} disabled={busy} className="inline-flex items-center gap-1.5 border border-outline-variant text-primary rounded-full px-4 py-2 text-body-md font-semibold hover:bg-surface-container-high transition-colors disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : automation.active ? <Pause size={14} /> : <Play size={14} />}
            {automation.active ? 'Pause' : 'Resume'}
          </button>
          <button onClick={onDelete} disabled={busy} className="w-9 h-9 rounded-full border border-outline-variant flex items-center justify-center text-error hover:bg-error-container/40 transition-colors disabled:opacity-50">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className={`${card} p-6 mb-5`}>
        <h2 className="font-display text-headline-md text-on-surface mb-4">Configuration</h2>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Trigger">
            {automation.all_posts ? 'Any post' : `Post ${automation.source_post_id}`} · comment {MATCH_MODE_LABEL[automation.match_mode] ?? automation.match_mode}
            <span className="block font-label text-label-sm text-on-surface-variant mt-1">{automation.keywords.join(', ')}</span>
          </Field>
          <Field label="Reply channel">{REPLY_CHANNEL_LABEL[automation.reply_channel] ?? automation.reply_channel}</Field>
          {automation.comment_reply_body && <Field label="Public reply text">{automation.comment_reply_body}</Field>}
          {automation.message_body && <Field label="DM text">{automation.message_body}</Field>}
          {automation.link_url && <Field label="Link"><span className="truncate block">{automation.link_url}</span></Field>}
          {automation.score_delta !== 0 && <Field label="Lead score">+{automation.score_delta} per match</Field>}
        </div>
      </div>

      <div className={`${card} p-6`}>
        <h2 className="font-display text-headline-md text-on-surface mb-4">Recent activity</h2>
        {eventsLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-on-surface-variant"><Loader2 size={18} className="animate-spin" /> Loading activity…</div>
        ) : eventsError ? (
          <div className="flex items-center gap-2 text-error"><AlertCircle size={16} /> {eventsError}</div>
        ) : events.length === 0 ? (
          <p className="font-body text-body-md text-on-surface-variant">No activity yet. This fills in as people engage with your keywords.</p>
        ) : (
          <div className="flex flex-col">
            {events.map(e => (
              <div key={e.id} className="flex items-start justify-between gap-3 py-3 border-b border-surface-variant last:border-0">
                <div className="min-w-0">
                  <p className="font-body text-body-md text-on-surface">
                    {e.contact_name || e.contact_handle ? (e.contact_name || `@${e.contact_handle}`) : 'Someone'} — {e.detail}
                  </p>
                  {e.error && <p className="font-label text-label-sm text-error mt-0.5">{e.error}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`font-label text-label-sm uppercase px-2 py-0.5 rounded-full ${e.status === 'ok' ? 'bg-secondary-container text-on-secondary-container' : e.status === 'failed' ? 'bg-error-container text-on-error-container' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    {e.status === 'ok' ? 'Sent' : e.status === 'failed' ? 'Failed' : 'Pending'}
                  </span>
                  <span className="font-label text-label-sm text-on-surface-variant whitespace-nowrap">{relativeTime(e.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── List row ─────────────────────────────────────────────────────────
function AutomationRow({
  automation, account, busy, onOpen, onToggle, onEdit, onDelete,
}: {
  automation: AutomationRecord;
  account?: ConnectedAccount;
  busy: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const a = automation;
  const Icon = CHANNEL_ICON[a.reply_channel] ?? MessageSquare;
  const reviewFirst = a.ai_enabled && a.ai_mode === 'suggest';
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <div
      onClick={onOpen}
      className={`${card} p-6 relative overflow-hidden flex flex-col lg:flex-row gap-6 lg:items-center cursor-pointer transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,0.04)] ${a.active ? '' : 'bg-surface-container-low'}`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${a.active ? 'bg-secondary-fixed' : 'bg-outline-variant'}`} />

      {/* Content */}
      <div className="flex-1 min-w-0 pl-2">
        <div className="flex items-center gap-2.5 mb-2 flex-wrap">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${a.active ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'}`}>
            <Icon size={15} />
          </span>
          <span className="font-label text-label-sm uppercase tracking-wider text-on-surface-variant capitalize">{a.platform} · {REPLY_CHANNEL_LABEL[a.reply_channel] ?? a.reply_channel}</span>
          {reviewFirst && (
            <span className="inline-flex items-center gap-1 font-label text-label-sm uppercase px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant"><Sparkles size={11} /> AI</span>
          )}
        </div>
        <h3 className="font-display text-headline-md text-on-surface leading-tight truncate">{a.name}</h3>
        <p className="font-body text-body-md text-on-surface-variant mt-1 leading-snug">
          When a comment {MATCH_MODE_LABEL[a.match_mode] ?? a.match_mode}{' '}
          <span className="font-semibold px-1.5 py-0.5 bg-surface-container-high rounded text-[14px] text-on-surface">{a.keywords.slice(0, 3).join(', ')}{a.keywords.length > 3 ? '…' : ''}</span>
          {' '}→ {REPLY_CHANNEL_LABEL[a.reply_channel] ?? a.reply_channel}
          {account && <span className="text-on-surface-variant"> · {account.username ? `@${account.username}` : account.display_name ?? account.id}</span>}
        </p>
      </div>

      {/* Real attributes (no fabricated run-counts) */}
      <div className="grid grid-cols-3 gap-6 lg:min-w-[300px]">
        <div className="flex flex-col">
          <span className="font-label text-label-sm text-on-surface-variant mb-1 flex items-center gap-1"><KeyRound size={12} /> Keywords</span>
          <span className="font-body text-body-lg font-semibold text-on-surface">{a.keywords.length}</span>
        </div>
        <div className="flex flex-col">
          <span className="font-label text-label-sm text-on-surface-variant mb-1 flex items-center gap-1"><Hash size={12} /> Score</span>
          <span className="font-body text-body-lg font-semibold text-on-surface">{a.score_delta > 0 ? `+${a.score_delta}` : a.score_delta}</span>
        </div>
        <div className="flex flex-col">
          <span className="font-label text-label-sm text-on-surface-variant mb-1 flex items-center gap-1"><Clock size={12} /> Updated</span>
          <span className="font-body text-body-md text-on-surface">{relativeTime(a.updated_at)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 justify-between lg:justify-end border-t border-surface-variant lg:border-t-0 pt-4 lg:pt-0">
        <button
          onClick={stop(onToggle)}
          disabled={busy}
          role="switch"
          aria-checked={a.active}
          className="flex items-center gap-2.5 disabled:opacity-50"
        >
          <span className={`relative w-10 h-6 rounded-full transition-colors ${a.active ? 'bg-secondary-fixed' : 'bg-surface-container-highest'}`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${a.active ? 'left-[22px]' : 'left-1'}`} />
          </span>
          <span className="font-label text-label-sm uppercase text-on-surface-variant">{a.active ? 'Live' : 'Paused'}</span>
        </button>
        <div className="flex gap-2">
          <button onClick={stop(onEdit)} disabled={busy} className="w-9 h-9 rounded-full border border-surface-variant flex items-center justify-center text-on-surface-variant hover:text-primary hover:border-primary transition-colors disabled:opacity-50">
            <Pencil size={16} />
          </button>
          <button onClick={stop(onDelete)} disabled={busy} className="w-9 h-9 rounded-full border border-surface-variant flex items-center justify-center text-error hover:bg-error-container/40 hover:border-error transition-colors disabled:opacity-50">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────
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
  const [deleteTarget, setDeleteTarget] = useState<AutomationRecord | null>(null);

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

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const a = deleteTarget;
    setBusyId(a.id);
    try {
      await deleteAutomation(a.id);
      setAutomationList(prev => prev.filter(x => x.id !== a.id));
      showToast('Automation deleted', 'success');
      setDetailId(null);
      setDeleteTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete this automation.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleEdit = (a: AutomationRecord) => navigate('/automations/new', { state: { automation: a } });

  const isDeletingTarget = deleteTarget !== null && busyId === deleteTarget.id;
  const filters: { key: StatusTab; label: string; count: number }[] = [
    { key: 'all', label: 'All flows', count: automationList.length },
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'paused', label: 'Paused', count: pausedCount },
  ];

  const detail = detailId ? automationList.find(a => a.id === detailId) ?? null : null;

  const deleteModal = (
    <AnimatePresence>
      {deleteTarget && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(250,249,246,0.6)', backdropFilter: 'blur(8px)' }}
          onClick={() => !isDeletingTarget && setDeleteTarget(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.24, 1, 0.4, 1] }}
            onClick={e => e.stopPropagation()}
            className="bg-surface-container-lowest rounded-2xl w-full max-w-md overflow-hidden border border-surface-variant shadow-[0_20px_60px_rgba(0,0,0,0.1)]"
          >
            <div className="p-6 pb-2 flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-error-container flex items-center justify-center flex-shrink-0"><AlertCircle size={22} className="text-error" /></div>
              <h3 className="font-display text-[20px] font-bold text-on-surface pt-2">Delete automation?</h3>
              <button onClick={() => setDeleteTarget(null)} disabled={isDeletingTarget} className="ml-auto text-on-surface-variant hover:text-on-surface"><X size={20} /></button>
            </div>
            <div className="p-6 pt-2">
              <p className="font-body text-body-md text-on-surface-variant">
                Delete <span className="font-semibold text-on-surface">&ldquo;{deleteTarget.name}&rdquo;</span>? This is permanent and cannot be undone. Its run history will also be removed.
              </p>
            </div>
            <div className="p-6 pt-0 flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} disabled={isDeletingTarget} className="border border-outline-variant text-primary font-semibold py-2.5 px-5 rounded-full hover:bg-surface-container-high transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={confirmDelete} disabled={isDeletingTarget} className="inline-flex items-center gap-2 bg-error text-on-error font-semibold py-2.5 px-5 rounded-full hover:opacity-90 transition-opacity disabled:opacity-60">
                {isDeletingTarget && <Loader2 size={15} className="animate-spin" />} Delete automation
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (detail) {
    return (
      <>
        <AutomationDetail
          automation={detail}
          account={accountById[detail.account_id]}
          busy={busyId === detail.id}
          onBack={() => setDetailId(null)}
          onEdit={() => handleEdit(detail)}
          onToggleActive={() => handleToggleActive(detail)}
          onDelete={() => setDeleteTarget(detail)}
        />
        {deleteModal}
      </>
    );
  }

  return (
    <div className="px-container-padding-mobile md:px-container-padding-desktop py-8 md:py-10 max-w-[1200px] mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-display-lg-mobile md:text-[40px] text-on-surface">Automations</h1>
            {backendConfigured && automationList.length > 0 && (
              <span className="font-label text-label-sm uppercase px-3 py-1 bg-surface-container-high text-on-surface-variant rounded-full">{activeCount} active</span>
            )}
          </div>
          <p className="font-body text-body-md text-on-surface-variant mt-2">Reply to comments and DMs automatically, and capture contacts as people engage.</p>
        </div>
        <button onClick={() => navigate('/automations/new')} className="inline-flex items-center justify-center gap-2 bg-secondary-fixed text-primary font-semibold px-6 py-3 rounded-full hover:bg-secondary-fixed-dim transition-colors self-start sm:self-auto">
          <Plus size={16} strokeWidth={2.5} /> Create automation
        </button>
      </div>

      {!backendConfigured && (
        <div className={`${card} p-6 flex items-start gap-3`}>
          <AlertCircle size={18} className="text-error mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-on-surface">Populr isn&apos;t connected to a backend yet</p>
            <p className="font-body text-body-md text-on-surface-variant mt-1">Set <code className="font-label">VITE_API_URL</code> to see real automations here. This page never shows placeholder data.</p>
          </div>
        </div>
      )}

      {backendConfigured && (
        <>
          {/* Filters + search */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 w-full sm:w-auto">
              {filters.map(f => (
                <button
                  key={f.key}
                  onClick={() => setStatusTab(f.key)}
                  className={`px-4 py-2 rounded-full font-label text-label-sm whitespace-nowrap transition-colors ${statusTab === f.key ? 'bg-primary text-on-primary' : `${card} text-on-surface hover:bg-surface-container-low`}`}
                >
                  {f.label} {f.count > 0 && <span className="opacity-60">{f.count}</span>}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search automations…"
                className="w-full bg-surface-container-lowest border border-surface-variant rounded-full pl-9 pr-4 py-2.5 text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-20 text-on-surface-variant"><Loader2 size={22} className="animate-spin" /> Loading automations…</div>
          )}

          {!loading && error && (
            <div className={`${card} p-6 flex flex-col items-start gap-3`}>
              <div className="flex items-start gap-3"><AlertCircle size={18} className="text-error mt-0.5" /><p className="font-semibold text-on-surface">{error}</p></div>
              <button onClick={load} className="text-body-md font-semibold text-primary underline underline-offset-4">Try again</button>
            </div>
          )}

          {!loading && !error && automationList.length === 0 && !accountsLoading && connectedAccounts.length === 0 && (
            <EmptyState
              title="Connect an account first"
              description="Automations reply to comments and DMs on your connected accounts. Connect one to get started."
              cta="Connect an account" onCta={() => navigate('/connections')}
            />
          )}

          {!loading && !error && automationList.length === 0 && (accountsLoading || connectedAccounts.length > 0) && (
            <CreateHint onClick={() => navigate('/automations/new')} />
          )}

          {!loading && !error && automationList.length > 0 && filtered.length === 0 && (
            <EmptyState title="Nothing matches" description="Try a different search or status filter." />
          )}

          {!loading && !error && filtered.length > 0 && (
            <div className="flex flex-col gap-4">
              {filtered.map(a => (
                <AutomationRow
                  key={a.id}
                  automation={a}
                  account={accountById[a.account_id]}
                  busy={busyId === a.id}
                  onOpen={() => setDetailId(a.id)}
                  onToggle={() => handleToggleActive(a)}
                  onEdit={() => handleEdit(a)}
                  onDelete={() => setDeleteTarget(a)}
                />
              ))}
              <CreateHint onClick={() => navigate('/automations/new')} compact />
            </div>
          )}
        </>
      )}

      {deleteModal}
    </div>
  );
}

function CreateHint({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`group w-full ${compact ? 'py-8' : 'py-12 mt-1'} border-2 border-dashed border-surface-variant rounded-xl flex flex-col items-center justify-center text-center hover:bg-surface-container-lowest hover:border-primary transition-all`}
    >
      <span className="w-16 h-16 bg-secondary-container rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
        <Plus size={28} className="text-on-secondary-container" />
      </span>
      <h3 className="font-display text-headline-md text-on-surface mb-1">Create new automation</h3>
      <p className="font-body text-body-md text-on-surface-variant max-w-sm">Turn comments and DMs into captured leads and sales automatically.</p>
    </button>
  );
}

function EmptyState({ title, description, cta, onCta }: { title: string; description: string; cta?: string; onCta?: () => void }) {
  return (
    <div className={`${card} p-10 flex flex-col items-center text-center gap-3`}>
      <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center"><Zap size={24} className="text-on-surface-variant" /></div>
      <h3 className="font-display text-headline-md text-on-surface">{title}</h3>
      <p className="font-body text-body-md text-on-surface-variant max-w-sm">{description}</p>
      {cta && onCta && (
        <button onClick={onCta} className="mt-2 inline-flex items-center gap-2 bg-secondary-fixed text-primary font-semibold px-5 py-2.5 rounded-full hover:bg-secondary-fixed-dim transition-colors">
          <Plus size={16} /> {cta}
        </button>
      )}
    </div>
  );
}
