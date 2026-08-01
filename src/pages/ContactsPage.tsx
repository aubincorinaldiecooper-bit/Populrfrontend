import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { initialsFrom } from '../lib/identity';
import {
  isBackendConfigured, fetchContacts, fetchContact, updateContact, setContactTag,
  adjustContactScore, markContactConverted, fetchOpportunities, CONTACT_STAGES,
} from '../lib/api';
import type { ContactRecord, ContactDetail as ContactDetailData, Opportunity } from '../lib/api';
import {
  Search, Loader2, AlertCircle, ArrowLeft, Plus, X, ExternalLink,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import PlatformDot from '../components/PlatformDot';
import EmptyState from '../components/EmptyState';

const STAGE_LABEL: Record<string, string> = {
  cold: 'Cold', interested: 'Interested', warm: 'Warm', hot: 'Hot',
  needs_reply: 'Needs reply', converted: 'Converted',
};

// Mirrors OpportunitiesPage's STATUS_DOT palette so an opportunity reads the
// same way wherever it appears, rather than each page inventing its own.
const OPP_STATUS_COLOR: Record<string, string> = {
  new: 'bg-chartreuse', reviewed: 'bg-[#3B82F6]', responded: 'bg-[#059669]', dismissed: 'bg-[#9B9B8F]',
};

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
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

function Avatar({ url, name }: { url: string | null; name: string }) {
  return url ? (
    <img src={url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
  ) : (
    <div className="w-9 h-9 rounded-full bg-[#FAFAF8] border border-[#E8E4DF] flex items-center justify-center text-[11px] font-semibold text-[#6B6B6B] flex-shrink-0">
      {initialsFrom(name)}
    </div>
  );
}

function ContactDetailView({
  contact, accountLabel, onBack, onSaved,
}: {
  contact: ContactRecord;
  accountLabel: string | null;
  onBack: () => void;
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
  const [scoreDelta, setScoreDelta] = useState('');
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
    const delta = Number(scoreDelta);
    if (!Number.isFinite(delta) || delta === 0) return;
    setBusyScore(true);
    try {
      const leadScore = await adjustContactScore(contact.id, delta);
      setDetail(d => (d ? { ...d, contact: { ...d.contact, lead_score: leadScore } } : d));
      onSaved({ ...current, lead_score: leadScore });
      setScoreDelta('');
      showToast('Lead score updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not adjust lead score.', 'error');
    } finally {
      setBusyScore(false);
    }
  };

  return (
    <div className="pop-page max-w-[820px]">
      <button onClick={onBack} className="pop-btn-ghost mb-5">
        <ArrowLeft size={16} />Back to contacts
      </button>

      <div className="flex items-start gap-4 mb-6">
        <Avatar url={current.avatar_url} name={current.name ?? current.handle ?? 'Contact'} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="pop-section-heading">{current.handle ? `@${current.handle}` : current.name ?? 'Unknown contact'}</h1>
            <StatusPill status={current.stage} />
            {current.needs_reply && <StatusPill status="human-review" />}
          </div>
          {current.name && current.handle && <p className="pop-body">{current.name}</p>}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <PlatformDot platform={current.platform} size={7} />
            <span className="text-[12px] text-[#6B6B6B] capitalize">{current.platform}</span>
            {accountLabel && <span className="text-[12px] text-[#6B6B6B]">· {accountLabel}</span>}
            <span className="text-[12px] text-[#9B9B8F]">· First seen {relativeTime(current.first_seen)}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-geist-mono font-bold text-xl text-[#111111]">{current.lead_score}</p>
          <p className="text-[10px] text-[#9B9B8F] tracking-wide">LEAD SCORE</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-5 mb-5">
        <div className="pop-card p-4">
          <p className="pop-meta mb-2">Stage</p>
          <div className="flex flex-wrap gap-1.5">
            {CONTACT_STAGES.map(s => (
              <button key={s} onClick={() => handleStageChange(s)} disabled={busyStage || current.stage === s}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all disabled:cursor-default ${current.stage === s ? 'bg-[#111111] text-white' : 'bg-[#FAFAF8] text-[#6B6B6B] hover:bg-[#F0EFEA]'}`}>
                {STAGE_LABEL[s] ?? s}
              </button>
            ))}
          </div>
          {current.stage !== 'converted' && (
            <button onClick={handleConverted} disabled={busyStage} className="pop-btn-secondary text-[11px] py-1.5 px-3 mt-3 disabled:opacity-60">
              Mark converted
            </button>
          )}
        </div>

        <div className="pop-card p-4">
          <p className="pop-meta mb-2">Adjust lead score</p>
          <div className="flex gap-2">
            <input type="number" value={scoreDelta} onChange={e => setScoreDelta(e.target.value)} placeholder="e.g. 10 or -10"
              className="pop-input flex-1 text-[12px] py-1.5" />
            <button onClick={handleAdjustScore} disabled={busyScore || !scoreDelta} className="pop-btn-secondary text-[11px] px-3 disabled:opacity-60">
              {busyScore ? <Loader2 size={12} className="animate-spin" /> : 'Apply'}
            </button>
          </div>
        </div>
      </div>

      <div className="pop-card p-4 mb-5">
        <p className="pop-meta mb-2">Tags</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {current.tags.length === 0 && <span className="text-[12px] text-[#9B9B8F]">No tags yet.</span>}
          {current.tags.map(t => (
            <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#FAFAF8] text-[#111111]">
              {t}
              <button onClick={() => handleRemoveTag(t)} disabled={busyTag} className="hover:text-[#DC2626] disabled:opacity-60">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="text" value={newTag} onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddTag()}
            placeholder="Add a tag" className="pop-input flex-1 text-[12px] py-1.5" />
          <button onClick={handleAddTag} disabled={busyTag || !newTag.trim()} className="pop-btn-secondary text-[11px] px-3 disabled:opacity-60">
            <Plus size={12} />
          </button>
        </div>
      </div>

      <div className="pop-card p-4 mb-5">
        <p className="pop-meta mb-2">Notes</p>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          className="pop-input w-full resize-none text-[13px]" placeholder="Private notes about this contact…" />
        <button onClick={handleSaveNotes} disabled={savingNotes || notes === (current.notes ?? '')}
          className="pop-btn-secondary text-[11px] py-1.5 px-3 mt-2 disabled:opacity-60">
          {savingNotes ? 'Saving…' : 'Save notes'}
        </button>
      </div>

      {(detail?.sourceAutomation || detail?.sourcePost || current.source_type) && (
        <div className="pop-card p-4 mb-5">
          <p className="pop-meta mb-2">How they found you</p>
          <p className="text-[13px] text-[#111111]">
            {detail?.sourceAutomation ? `Via automation "${detail.sourceAutomation.name}"` : `Source: ${current.source_type}`}
          </p>
          {detail?.sourcePost?.url && (
            <a href={detail.sourcePost.url} target="_blank" rel="noreferrer"
              className="text-[12px] text-[#3B82F6] hover:underline inline-flex items-center gap-1 mt-1">
              View source post <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}

      <div className="pop-card p-5 mb-5">
        <h2 className="pop-card-title mb-3">Conversation history</h2>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-[#6B6B6B]">
            <Loader2 size={18} className="animate-spin mr-2" /> Loading...
          </div>
        ) : !detail || detail.messages.length === 0 ? (
          <p className="text-[12px] text-[#6B6B6B]">No messages yet.</p>
        ) : (
          <div className="space-y-2">
            {detail.messages.slice().reverse().map(m => (
              <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-xl px-3 py-2 ${m.direction === 'outbound' ? 'bg-chartreuse/20 text-[#111111]' : 'bg-[#FAFAF8] text-[#111111]'}`}>
                  <p className="text-[12px]">{m.text || <span className="italic text-[#9B9B8F]">(no text)</span>}</p>
                  <p className="text-[10px] text-[#9B9B8F] mt-1">{m.channel} · {relativeTime(m.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pop-card p-5">
        <h2 className="pop-card-title mb-3">Related opportunities</h2>
        {oppsLoading ? (
          <div className="flex items-center justify-center py-8 text-[#6B6B6B]">
            <Loader2 size={18} className="animate-spin mr-2" /> Loading...
          </div>
        ) : opportunities.length === 0 ? (
          <p className="text-[12px] text-[#6B6B6B]">No opportunities from this contact yet.</p>
        ) : (
          <div className="space-y-2">
            {opportunities.map(o => (
              <div key={o.id} className="flex items-center justify-between gap-3 py-2 border-b border-[#F0EEEA] last:border-0">
                <div className="min-w-0">
                  <p className="text-[12px] text-[#111111] truncate">&ldquo;{o.interaction.text}&rdquo;</p>
                  <p className="text-[11px] text-[#9B9B8F] mt-0.5">{o.intent.label}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${OPP_STATUS_COLOR[o.status] ?? 'bg-[#9B9B8F]'}`} />
                  <span className="text-[10px] text-[#9B9B8F] capitalize">{o.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const PAGE_SIZE = 50;

export default function ContactsPage() {
  const { accounts } = useApp();
  const backendConfigured = isBackendConfigured();

  const [contactList, setContactList] = useState<ContactRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
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
  const load = useCallback(() => {
    if (!backendConfigured) { setLoading(false); return; }
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    fetchContacts({
      search: debouncedSearch || undefined,
      stage: stageFilter,
      needsReply: needsReplyOnly ? true : undefined,
      limit: PAGE_SIZE,
    })
      .then(r => {
        if (seq !== requestSeq.current) return;
        setContactList(r.contacts);
        setTotal(r.total);
      })
      .catch(err => {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : 'Could not load contacts right now.');
      })
      .finally(() => { if (seq === requestSeq.current) setLoading(false); });
  }, [backendConfigured, debouncedSearch, stageFilter, needsReplyOnly]);

  useEffect(() => {
    // Data fetch from the backend, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const accountById = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a])), [accounts]);

  const handleSavedFromDetail = (updated: ContactRecord) => {
    setContactList(prev => prev.map(c => (c.id === updated.id ? updated : c)));
  };

  const detail = detailId ? contactList.find(c => c.id === detailId) ?? null : null;
  if (detail) {
    const account = detail.account_id ? accountById[detail.account_id] : undefined;
    const accountLabel = account ? (account.username ? `@${account.username}` : account.display_name ?? null) : null;
    return (
      <ContactDetailView
        contact={detail}
        accountLabel={accountLabel}
        onBack={() => setDetailId(null)}
        onSaved={handleSavedFromDetail}
      />
    );
  }

  return (
    <div className="pop-page">
      <PageHeader
        title="Contacts"
        subtitle={backendConfigured ? `${total} ${total === 1 ? 'person has' : 'people have'} engaged with you` : undefined}
        action={
          <div className="relative w-full sm:w-auto">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..."
              className="pop-search w-full sm:w-56" />
          </div>
        }
      />

      {!backendConfigured && (
        <div className="pop-card p-6 mb-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to a backend yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Set <code className="bg-[#FAFAF8] px-1 py-0.5 rounded">VITE_API_URL</code> to your Populr backend to see real contacts here. This page never shows placeholder data in its place.
            </p>
          </div>
        </div>
      )}

      {backendConfigured && (
        <>
          <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
            <button onClick={() => { setStageFilter(undefined); setNeedsReplyOnly(false); }}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-medium whitespace-nowrap transition-all ${!stageFilter && !needsReplyOnly ? 'bg-[#111111] text-white' : 'text-[#6B6B6B] hover:bg-white'}`}>
              All
            </button>
            <button onClick={() => { setNeedsReplyOnly(true); setStageFilter(undefined); }}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-medium whitespace-nowrap transition-all ${needsReplyOnly ? 'bg-[#111111] text-white' : 'text-[#6B6B6B] hover:bg-white'}`}>
              Needs reply
            </button>
            {CONTACT_STAGES.map(s => (
              <button key={s} onClick={() => { setStageFilter(s); setNeedsReplyOnly(false); }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-medium whitespace-nowrap transition-all ${stageFilter === s ? 'bg-[#111111] text-white' : 'text-[#6B6B6B] hover:bg-white'}`}>
                {STAGE_LABEL[s] ?? s}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16 text-[#6B6B6B]">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading contacts...
            </div>
          )}

          {!loading && error && (
            <div className="pop-card p-6 flex items-start gap-3">
              <AlertCircle size={18} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-[#111111]">Couldn&apos;t load contacts</p>
                <p className="text-[12px] text-[#6B6B6B] mt-1">{error}</p>
                <button onClick={load} className="pop-btn-secondary text-[12px] py-1.5 px-3 mt-3">Try again</button>
              </div>
            </div>
          )}

          {!loading && !error && contactList.length === 0 && (
            <EmptyState icon="contacts" title="No contacts yet"
              description="People who comment or message your connected accounts will show up here as Populr captures them." />
          )}

          {!loading && !error && contactList.length > 0 && (
            <div className="pop-card overflow-hidden">
              <div className="divide-y divide-[#F0EEEA]">
                {contactList.map(c => {
                  const account = c.account_id ? accountById[c.account_id] : undefined;
                  return (
                    <button key={c.id} onClick={() => setDetailId(c.id)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#FAFAF8] transition-colors">
                      <Avatar url={c.avatar_url} name={c.name ?? c.handle ?? 'Contact'} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[13px] font-semibold text-[#111111] truncate">{c.handle ? `@${c.handle}` : c.name ?? 'Unknown'}</p>
                          <PlatformDot platform={c.platform} size={6} />
                          {c.needs_reply && <StatusPill status="human-review" className="text-[9px]" />}
                        </div>
                        <p className="text-[11px] text-[#9B9B8F] truncate mt-0.5">
                          {account ? (account.username ? `@${account.username}` : account.display_name) : c.platform}
                          {c.tags.length > 0 && ` · ${c.tags.slice(0, 3).join(', ')}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <StatusPill status={c.stage} className="text-[10px]" />
                        <p className="font-geist-mono font-bold text-[12px] text-[#111111] w-8 text-right">{c.lead_score}</p>
                        <span className="text-[10px] text-[#9B9B8F] w-14 text-right">{relativeTime(c.last_seen)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
