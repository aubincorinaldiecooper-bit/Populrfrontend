import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, ExternalLink, X, Loader2, AlertCircle, Users, MessageSquare, Sparkles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  isBackendConfigured, fetchContacts, fetchContact, updateContact, setContactTag,
  adjustContactScore, markContactConverted, fetchOpportunities, CONTACT_STAGES,
} from '../lib/api';
import type { ContactRecord, ContactDetail as ContactDetailData, Opportunity } from '../lib/api';
import PlatformDot from '../components/PlatformDot';

const STAGE_LABEL: Record<string, string> = {
  cold: 'Cold', interested: 'Interested', warm: 'Warm', hot: 'Hot',
  needs_reply: 'Needs reply', converted: 'Converted',
};

// Distinct from the 'needs_reply' *stage* value — this marks the separate
// needs-reply boolean quick-filter so the two don't collide as filter values.
const NEEDS_REPLY_FILTER_VALUE = '__needs_reply_flag__';

const STAGE_STYLE: Record<string, string> = {
  cold: 'bg-surface-container-high text-on-surface-variant',
  interested: 'bg-[#e8f0fe] text-[#1a56db]',
  warm: 'bg-[#fef3e2] text-[#b45309]',
  hot: 'bg-error-container text-on-error-container',
  needs_reply: 'bg-secondary-container text-on-secondary-container',
  converted: 'bg-[#e3f6ec] text-[#046c4e]',
};

const OPP_STATUS_COLOR: Record<string, string> = {
  new: 'bg-secondary-fixed-dim', reviewed: 'bg-[#3b82f6]', responded: 'bg-[#0d9f6e]', dismissed: 'bg-outline',
};

const card = 'bg-surface-container-lowest border border-outline-variant rounded-xl';
const inputBase =
  'w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2.5 ' +
  'text-body-md text-on-surface placeholder:text-on-surface-variant/60 outline-none transition-colors';
const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-outline-variant text-primary px-4 py-2 text-body-md font-medium hover:bg-surface-container-high transition-colors disabled:opacity-50';

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initialsFrom(nameOrHandle: string): string {
  const s = nameOrHandle.replace(/^@/, '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  if (src) {
    return <img src={src} alt="" className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="rounded-full bg-surface-container-high border border-outline-variant flex items-center justify-center font-label text-on-surface-variant flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initialsFrom(name)}
    </span>
  );
}

function StageBadge({ stage, className = '' }: { stage: string; className?: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-label text-label-sm uppercase ${STAGE_STYLE[stage] ?? 'bg-surface-container-high text-on-surface-variant'} ${className}`}>
      {STAGE_LABEL[stage] ?? stage}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-label text-label-sm uppercase text-on-surface-variant mb-2.5">{children}</p>;
}

// ── Real, backend-wired contact detail as a slide-in drawer ──
function ContactDetailDrawer({
  contact, accountLabel, onClose, onSaved,
}: {
  contact: ContactRecord;
  accountLabel: string | null;
  onClose: () => void;
  onSaved: (c: ContactRecord) => void;
}) {
  const { showToast } = useApp();
  const [detail, setDetail] = useState<ContactDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState(contact.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [busyTag, setBusyTag] = useState(false);
  const [busyStage, setBusyStage] = useState(false);
  const [scoreDelta, setScoreDelta] = useState<number | null>(null);
  const [busyScore, setBusyScore] = useState(false);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [oppsLoading, setOppsLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchContact(contact.id)
      .then(d => { setDetail(d); setNotes(d.contact.notes ?? ''); })
      .catch(err => showToast(err instanceof Error ? err.message : 'Could not load this contact.', 'error'))
      .finally(() => setLoading(false));
  }, [contact.id, showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    // Data fetch from the backend, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOppsLoading(true);
    fetchOpportunities({ contactId: contact.id, limit: 50 })
      .then(r => setOpportunities(r.opportunities))
      .catch(err => console.error('[contacts] failed to load related opportunities:', err))
      .finally(() => setOppsLoading(false));
  }, [contact.id]);

  const current = detail?.contact ?? contact;

  const handleStageChange = async (stage: string) => {
    setBusyStage(true);
    try {
      const updated = await updateContact(contact.id, { stage });
      setDetail(d => (d ? { ...d, contact: { ...updated, tags: d.contact.tags } } : d));
      onSaved({ ...updated, tags: current.tags });
      showToast('Stage updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update stage.', 'error');
    } finally {
      setBusyStage(false);
    }
  };

  const handleConverted = async () => {
    setBusyStage(true);
    try {
      await markContactConverted(contact.id);
      await load();
      onSaved({ ...current, stage: 'converted' });
      showToast('Marked as converted', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not mark this contact converted.', 'error');
    } finally {
      setBusyStage(false);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const updated = await updateContact(contact.id, { notes });
      setDetail(d => (d ? { ...d, contact: { ...updated, tags: d.contact.tags } } : d));
      onSaved({ ...updated, tags: current.tags });
      showToast('Notes saved', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save notes.', 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAddTag = async () => {
    const tag = newTag.trim();
    if (!tag) return;
    setBusyTag(true);
    try {
      const tags = await setContactTag(contact.id, tag);
      setDetail(d => (d ? { ...d, contact: { ...d.contact, tags } } : d));
      onSaved({ ...current, tags });
      setNewTag('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add tag.', 'error');
    } finally {
      setBusyTag(false);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    setBusyTag(true);
    try {
      const tags = await setContactTag(contact.id, tag, true);
      setDetail(d => (d ? { ...d, contact: { ...d.contact, tags } } : d));
      onSaved({ ...current, tags });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not remove tag.', 'error');
    } finally {
      setBusyTag(false);
    }
  };

  const handleAdjustScore = async () => {
    if (scoreDelta == null || scoreDelta === 0) return;
    setBusyScore(true);
    try {
      const leadScore = await adjustContactScore(contact.id, scoreDelta);
      setDetail(d => (d ? { ...d, contact: { ...d.contact, lead_score: leadScore } } : d));
      onSaved({ ...current, lead_score: leadScore });
      setScoreDelta(null);
      showToast('Lead score updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not adjust lead score.', 'error');
    } finally {
      setBusyScore(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/30 z-[60]"
      />
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.32, ease: [0.24, 1, 0.4, 1] }}
        className="fixed right-0 top-0 h-screen w-[560px] max-w-full bg-surface-container-lowest border-l border-outline-variant z-[70] shadow-drawer flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-surface-variant flex-shrink-0 gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Avatar src={current.avatar_url} name={current.name ?? current.handle ?? 'Contact'} size={44} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-headline-md text-on-surface truncate">{current.handle ? `@${current.handle}` : current.name ?? 'Unknown contact'}</h1>
                <StageBadge stage={current.stage} />
                {current.needs_reply && <span className="inline-flex items-center px-2.5 py-1 rounded-full font-label text-label-sm uppercase bg-primary text-on-primary">Needs reply</span>}
              </div>
              {current.name && current.handle && <p className="text-body-md text-on-surface-variant">{current.name}</p>}
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <PlatformDot platform={current.platform} size={7} />
                <span className="font-label text-label-sm text-on-surface-variant capitalize">{current.platform}</span>
                {accountLabel && <span className="font-label text-label-sm text-on-surface-variant">· {accountLabel}</span>}
                <span className="font-label text-label-sm text-on-surface-variant">· First seen {relativeTime(current.first_seen)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="font-label text-xl text-on-surface leading-none">{current.lead_score}</p>
              <p className="font-label text-label-sm uppercase text-on-surface-variant mt-1">Score</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Stage + score */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className={`${card} p-4`}>
              <SectionLabel>Stage</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {CONTACT_STAGES.map(s => {
                  const active = current.stage === s;
                  return (
                    <button
                      key={s}
                      disabled={active || busyStage}
                      onClick={() => handleStageChange(s)}
                      className={`px-3 py-1.5 rounded-full font-label text-label-sm uppercase transition-colors disabled:cursor-default ${active ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'}`}
                    >
                      {STAGE_LABEL[s] ?? s}
                    </button>
                  );
                })}
              </div>
              {current.stage !== 'converted' && (
                <button disabled={busyStage} onClick={handleConverted} className={`${secondaryBtn} mt-3`}>Mark converted</button>
              )}
            </div>

            <div className={`${card} p-4`}>
              <SectionLabel>Adjust lead score</SectionLabel>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  className={inputBase}
                  value={scoreDelta ?? ''}
                  onChange={e => setScoreDelta(e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="e.g. 10 or -10"
                />
                <button disabled={busyScore || scoreDelta == null || scoreDelta === 0} onClick={handleAdjustScore} className={`${secondaryBtn} flex-shrink-0`}>
                  {busyScore ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
                </button>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className={`${card} p-4`}>
            <SectionLabel>Tags</SectionLabel>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {current.tags.length === 0 && <span className="text-body-md text-on-surface-variant">No tags yet.</span>}
              {current.tags.map(t => (
                <span key={t} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface text-[13px]">
                  {t}
                  <button disabled={busyTag} onClick={() => handleRemoveTag(t)} aria-label={`Remove ${t}`} className="text-on-surface-variant hover:text-error transition-colors">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className={inputBase}
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                placeholder="Add a tag"
              />
              <button disabled={busyTag || !newTag.trim()} onClick={handleAddTag} aria-label="Add tag" className={`${secondaryBtn} flex-shrink-0`}>
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className={`${card} p-4`}>
            <SectionLabel>Notes</SectionLabel>
            <textarea
              className={`${inputBase} min-h-[76px] resize-y`}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Private notes about this contact…"
            />
            <button
              disabled={savingNotes || notes === (current.notes ?? '')}
              onClick={handleSaveNotes}
              className={`${secondaryBtn} mt-2`}
            >
              {savingNotes ? 'Saving…' : 'Save notes'}
            </button>
          </div>

          {/* How they found you */}
          {(detail?.sourceAutomation || detail?.sourcePost || current.source_type) && (
            <div className={`${card} p-4`}>
              <SectionLabel>How they found you</SectionLabel>
              <p className="text-body-md text-on-surface">
                {detail?.sourceAutomation ? `Via automation “${detail.sourceAutomation.name}”` : `Source: ${current.source_type}`}
              </p>
              {detail?.sourcePost?.url && (
                <a href={detail.sourcePost.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline mt-1">
                  View source post <ExternalLink size={11} />
                </a>
              )}
            </div>
          )}

          {/* Conversation history */}
          <div className={`${card} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={15} className="text-on-surface-variant" />
              <h2 className="text-body-md font-semibold text-on-surface">Conversation history</h2>
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-on-surface-variant">
                <Loader2 size={16} className="animate-spin" /> Loading…
              </div>
            ) : !detail || detail.messages.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">No messages yet.</p>
            ) : (
              <div className="space-y-2">
                {detail.messages.slice().reverse().map(m => (
                  <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${m.direction === 'outbound' ? 'bg-secondary-container text-on-secondary-container rounded-br-md' : 'bg-surface-container text-on-surface rounded-bl-md'}`}>
                      <p className="text-body-md">{m.text || <span className="italic text-on-surface-variant">(no text)</span>}</p>
                      <p className="font-label text-label-sm text-on-surface-variant mt-1">{m.channel} · {relativeTime(m.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Related opportunities */}
          <div className={`${card} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={15} className="text-on-surface-variant" />
              <h2 className="text-body-md font-semibold text-on-surface">Related opportunities</h2>
            </div>
            {oppsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-on-surface-variant">
                <Loader2 size={16} className="animate-spin" /> Loading…
              </div>
            ) : opportunities.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">No opportunities from this contact yet.</p>
            ) : (
              <div className="divide-y divide-surface-variant">
                {opportunities.map(o => (
                  <div key={o.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-body-md text-on-surface truncate">&ldquo;{o.interaction.text}&rdquo;</p>
                      <p className="font-label text-label-sm text-on-surface-variant">{o.intent.label}</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 flex-shrink-0">
                      <span className={`w-2 h-2 rounded-full ${OPP_STATUS_COLOR[o.status] ?? 'bg-outline'}`} />
                      <span className="font-label text-label-sm text-on-surface-variant capitalize">{o.status}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

const PAGE_SIZE = 50;

export default function ContactsPage() {
  const { accounts, showToast } = useApp();
  const backendConfigured = isBackendConfigured();

  const [contactList, setContactList] = useState<ContactRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string | undefined>(undefined);
  const [needsReplyOnly, setNeedsReplyOnly] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const requestSeq = useRef(0);
  const runFetch = useCallback(
    ({ offset, limit, append }: { offset: number; limit: number; append: boolean }) => {
      if (!backendConfigured) { setLoading(false); return; }
      const seq = ++requestSeq.current;
      if (append) setLoadingMore(true);
      else { setLoading(true); setError(null); }
      fetchContacts({
        search: debouncedSearch || undefined,
        stage: stageFilter,
        needsReply: needsReplyOnly ? true : undefined,
        limit,
        offset,
      })
        .then(r => {
          if (seq !== requestSeq.current) return;
          setContactList(prev => (append ? [...prev, ...r.contacts] : r.contacts));
          setTotal(r.total);
        })
        .catch(err => {
          if (seq !== requestSeq.current) return;
          const message = err instanceof Error ? err.message : 'Could not load contacts right now.';
          if (append) showToast(message, 'error');
          else setError(message);
        })
        .finally(() => {
          if (seq === requestSeq.current) { setLoading(false); setLoadingMore(false); }
        });
    },
    [backendConfigured, debouncedSearch, stageFilter, needsReplyOnly, showToast],
  );

  const load = useCallback(() => runFetch({ offset: 0, limit: PAGE_SIZE, append: false }), [runFetch]);
  const loadMore = useCallback(
    () => runFetch({ offset: contactList.length, limit: PAGE_SIZE, append: true }),
    [runFetch, contactList.length],
  );

  useEffect(() => {
    // Data fetch from the backend, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const accountById = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a])), [accounts]);

  const handleSavedFromDetail = (updated: ContactRecord) => {
    setContactList(prev => prev.map(c => (c.id === updated.id ? updated : c)));
  };

  const activeFilterValue = needsReplyOnly ? NEEDS_REPLY_FILTER_VALUE : (stageFilter ?? 'all');
  const setFilter = (value: string) => {
    if (value === 'all') { setStageFilter(undefined); setNeedsReplyOnly(false); }
    else if (value === NEEDS_REPLY_FILTER_VALUE) { setNeedsReplyOnly(true); setStageFilter(undefined); }
    else { setStageFilter(value); setNeedsReplyOnly(false); }
  };

  const filters: { value: string; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: NEEDS_REPLY_FILTER_VALUE, label: 'Needs reply' },
    ...CONTACT_STAGES.map(s => ({ value: s as string, label: STAGE_LABEL[s] ?? s })),
  ];

  const detailContact = detailId ? contactList.find(c => c.id === detailId) ?? null : null;
  const detailAccount = detailContact?.account_id ? accountById[detailContact.account_id] : undefined;
  const detailAccountLabel = detailAccount ? (detailAccount.username ? `@${detailAccount.username}` : detailAccount.display_name ?? null) : null;

  return (
    <div className="px-container-padding-mobile md:px-container-padding-desktop py-8 md:py-10 max-w-[1100px] mx-auto pb-24">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-headline-md md:text-display-lg-mobile text-on-surface">Contacts</h1>
          {backendConfigured && (
            <p className="font-body text-body-md text-on-surface-variant mt-1.5">
              {total} {total === 1 ? 'person has' : 'people have'} engaged with you
            </p>
          )}
        </div>
        <div className="relative w-full sm:w-64 flex-shrink-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            className={`${inputBase} pl-9`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts…"
          />
        </div>
      </div>

      {!backendConfigured && (
        <div className={`${card} p-4 mb-6 flex items-start gap-2.5`}>
          <AlertCircle size={16} className="text-on-surface-variant flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-body-md font-semibold text-on-surface">Populr isn’t connected to a backend yet</p>
            <p className="text-[13px] text-on-surface-variant mt-0.5">Set VITE_API_URL to your Populr backend to see real contacts here. This page never shows placeholder data in its place.</p>
          </div>
        </div>
      )}

      {backendConfigured && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {filters.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded-full font-label text-label-sm uppercase transition-colors ${activeFilterValue === f.value ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-on-surface-variant">
              <Loader2 size={20} className="animate-spin" /> <span className="text-body-md">Loading contacts…</span>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-error/40 bg-error-container/40 p-5">
              <p className="flex items-center gap-2 text-body-md font-semibold text-on-error-container">
                <AlertCircle size={16} /> Couldn’t load contacts
              </p>
              <p className="text-[14px] text-on-error-container mt-1">{error}</p>
              <button onClick={load} className={`${secondaryBtn} mt-3`}>Try again</button>
            </div>
          )}

          {!loading && !error && contactList.length === 0 && (
            <div className={`${card} p-10 text-center`}>
              <div className="w-12 h-12 rounded-full bg-surface-container-high mx-auto flex items-center justify-center mb-3">
                <Users size={22} className="text-on-surface-variant" />
              </div>
              <h3 className="font-display text-headline-md text-on-surface">No contacts yet</h3>
              <p className="text-body-md text-on-surface-variant mt-1.5 max-w-sm mx-auto">
                People who comment or message your connected accounts will show up here as Populr captures them.
              </p>
            </div>
          )}

          {!loading && !error && contactList.length > 0 && (
            <div className={`${card} overflow-hidden`}>
              <div className="divide-y divide-surface-variant">
                {contactList.map(c => {
                  const account = c.account_id ? accountById[c.account_id] : undefined;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setDetailId(c.id)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-container-low transition-colors"
                    >
                      <Avatar src={c.avatar_url} name={c.name ?? c.handle ?? 'Contact'} size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-body-md font-semibold text-on-surface truncate">{c.handle ? `@${c.handle}` : c.name ?? 'Unknown'}</span>
                          <PlatformDot platform={c.platform} size={6} />
                          {c.needs_reply && <span className="inline-flex items-center px-2 py-0.5 rounded-full font-label text-[10px] uppercase bg-primary text-on-primary">Needs reply</span>}
                        </div>
                        <p className="font-label text-label-sm text-on-surface-variant truncate mt-0.5">
                          {account ? (account.username ? `@${account.username}` : account.display_name) : c.platform}
                          {c.tags.length > 0 && ` · ${c.tags.slice(0, 3).join(', ')}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <StageBadge stage={c.stage} className="hidden sm:inline-flex" />
                        <span className="font-label text-body-md text-on-surface w-8 text-right">{c.lead_score}</span>
                        <span className="font-label text-label-sm text-on-surface-variant w-14 text-right hidden sm:inline">{relativeTime(c.last_seen)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && !error && contactList.length > 0 && contactList.length < total && (
            <div className="flex flex-col items-center gap-2 mt-5">
              <button onClick={loadMore} disabled={loadingMore} className={secondaryBtn}>
                {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
              <span className="font-label text-label-sm text-on-surface-variant">Showing {contactList.length} of {total}</span>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {detailContact && (
          <ContactDetailDrawer
            key={detailContact.id}
            contact={detailContact}
            accountLabel={detailAccountLabel}
            onClose={() => setDetailId(null)}
            onSaved={handleSavedFromDetail}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
