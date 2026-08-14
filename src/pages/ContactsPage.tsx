import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search, ArrowLeft, AlertCircle, X, Plus, Reply, Clock, Tag,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import PlatformDot from '../components/PlatformDot';
import StatusPill from '../components/StatusPill';
import PageHeader from '../components/PageHeader';
import InboxLauncher from '../components/inbox/InboxButton';
import EmptyState from '../components/EmptyState';
import { TableSkeleton, Skeleton } from '../components/Skeleton';
import {
  isBackendConfigured, fetchContacts, fetchContact, updateContact, updateContactTag,
} from '../lib/api';
import type { Contact, ContactDetail, LeadStage } from '../lib/api';

const PAGE_SIZE = 20;

const STAGE_TABS: { key: LeadStage | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'cold', label: 'New' },
  { key: 'interested', label: 'Engaged' },
  { key: 'warm', label: 'Warm' },
  { key: 'hot', label: 'Hot' },
  { key: 'needs_reply', label: 'Needs reply' },
  { key: 'converted', label: 'Converted' },
];

const STAGE_PILL: Record<string, string> = {
  cold: 'new', interested: 'engaged', warm: 'warm fan', hot: 'strong offer intent',
  needs_reply: 'human-review', converted: 'converted',
};

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ContactsPage() {
  const backendConfigured = isBackendConfigured();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [stageTab, setStageTab] = useState<LeadStage | 'all'>('all');
  // Behavior filters + tag filter: urgency (the needs_reply flag the queue
  // sets), recency (who was active last), and the creator's own labels.
  // Tags are the substrate saved segments will be built on later.
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [sortRecent, setSortRecent] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(backendConfigured);
  const [error, setError] = useState<string | null>(null);

  const [detailId, setDetailId] = useState<string | null>(null);

  // Monotonic request id: search is un-debounced (one fetch per keystroke), so
  // without this a slower earlier response could resolve last and show results
  // for the wrong query. Only the most-recently-issued load may write.
  const loadSeq = useRef(0);

  const load = useCallback(() => {
    if (!backendConfigured) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    // The "Needs reply" tab is the needs_reply FLAG, not the stage column: a
    // warm/hot contact flagged for a reply keeps its stage, so filtering by
    // stage='needs_reply' hid exactly the contacts the tab is about (and
    // disagreed with the "Waiting on you" urgency chip, which uses the flag).
    const needsReply = urgentOnly || stageTab === 'needs_reply';
    const stage = stageTab === 'all' || stageTab === 'needs_reply' ? undefined : stageTab;
    fetchContacts({
      search: search || undefined,
      stage,
      needsReply: needsReply ? true : undefined,
      sort: sortRecent ? 'recent' : undefined,
      tag: activeTag || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then(res => {
        if (seq !== loadSeq.current) return; // a newer load superseded this one
        setContacts(res.contacts);
        setTotal(res.total);
        // Workspace-wide, not page-scoped — safe to keep across filters.
        setAllTags(res.allTags ?? []);
      })
      .catch(err => {
        if (seq !== loadSeq.current) return;
        setError(err instanceof Error ? err.message : 'Could not load contacts.');
      })
      .finally(() => {
        if (seq === loadSeq.current) setLoading(false);
      });
  }, [backendConfigured, search, stageTab, urgentOnly, sortRecent, activeTag, page]);

  useEffect(() => {
    // Data fetch from the backend, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    // Resetting pagination when search/filter (external inputs) change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(0);
  }, [search, stageTab, urgentOnly, sortRecent, activeTag]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!backendConfigured) {
    return (
      <div className="pop-page">
        <PageHeader title="Contacts" subtitle="Your people, your community, your next big collab." />
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to a backend yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Populr can&apos;t reach its server, so your contacts can&apos;t be loaded right now.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (detailId) {
    return (
      <ContactDetailView
        contactId={detailId}
        onBack={() => { setDetailId(null); load(); }}
        onChanged={c => setContacts(prev => prev.map(x => x.id === c.id ? c : x))}
      />
    );
  }

  return (
    <div className="pop-page">
      <PageHeader
        title="Contacts"
        subtitle="Your people, your community, your next big collab."
        action={
          // No "Add contact" button: contacts are created automatically when
          // someone engages with an automation, and a primary button whose
          // only behavior was a toast explaining it does nothing was a dead
          // affordance — the empty state below carries that explanation.
          <>
            <InboxLauncher />
            <div className="relative hidden sm:block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts by name, username..."
                className="pop-search w-56" />
            </div>
          </>
        }
      />

      {/* On mobile the header search is hidden — without this, phones had no
          way to search contacts at all. */}
      <div className="relative sm:hidden mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..."
          className="pop-search w-full" />
      </div>

      <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
        {STAGE_TABS.map(t => (
          <button key={t.key} onClick={() => setStageTab(t.key)}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-medium whitespace-nowrap transition-all ${stageTab === t.key ? 'bg-[#111111] text-white' : 'text-[#6B6B6B] hover:bg-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Behavior + tag chips: how fans act (waiting on you, active lately)
          and how you've labeled them. These compose with the stage tabs and
          search — and they're how contacts get classified until saved
          segments exist to name these combinations. */}
      <div className="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1">
        <button
          onClick={() => setUrgentOnly(v => !v)}
          aria-pressed={urgentOnly}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap border transition-all ${urgentOnly ? 'bg-[#111111] text-white border-[#111111]' : 'border-[#E8E4DF] text-[#6B6B6B] hover:bg-white'}`}>
          <Reply size={12} />Waiting on you
        </button>
        <button
          onClick={() => setSortRecent(v => !v)}
          aria-pressed={sortRecent}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap border transition-all ${sortRecent ? 'bg-[#111111] text-white border-[#111111]' : 'border-[#E8E4DF] text-[#6B6B6B] hover:bg-white'}`}>
          <Clock size={12} />Recently active
        </button>
        {allTags.length > 0 && <span aria-hidden className="w-px h-4 bg-[#E8E4DF] mx-1 flex-shrink-0" />}
        {allTags.map(tag => (
          <button key={tag}
            onClick={() => setActiveTag(t => t === tag ? null : tag)}
            aria-pressed={activeTag === tag}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap border transition-all ${activeTag === tag ? 'bg-chartreuse text-[#111111] border-chartreuse' : 'border-[#E8E4DF] text-[#6B6B6B] hover:bg-white'}`}>
            <Tag size={12} />{tag}
          </button>
        ))}
      </div>

      {error && (
        <div className="pop-card p-4 mb-5 flex items-center gap-3">
          <AlertCircle size={16} className="text-[#DC2626] flex-shrink-0" />
          <p className="text-[13px] text-[#111111] flex-1">{error}</p>
          <button onClick={load} className="pop-btn-tertiary text-[12px] py-1.5 px-3">Retry</button>
        </div>
      )}

      <div className="pop-card overflow-hidden">
        {loading ? (
          <TableSkeleton count={6} label="Loading contacts" />
        ) : !error && contacts.length === 0 ? (
          search || stageTab !== 'all' || urgentOnly || activeTag ? (
            <EmptyState
              icon="search"
              title="No contacts match your filters"
              description="Try a different search term, or clear the filters above."
            />
          ) : (
            <EmptyState
              icon="contacts"
              title="No contacts yet"
              description="People who comment on or message your connected accounts show up here automatically once your automations start running."
            />
          )
        ) : !error && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E8E4DF]">
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-[#9B9B8F] tracking-wide">Contact</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-[#9B9B8F] tracking-wide">Stage</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-[#9B9B8F] tracking-wide">Score</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-[#9B9B8F] tracking-wide">Latest activity</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(contact => (
                  <tr
                    key={contact.id}
                    tabIndex={0}
                    aria-label={`Open ${contact.handle ? `@${contact.handle}` : contact.name || 'contact'}`}
                    onClick={() => setDetailId(contact.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailId(contact.id); }
                    }}
                    className="border-b border-[#F0EEEA] last:border-0 hover:bg-[#FAFAF8] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-chartreuse">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        {contact.avatar_url ? (
                          <img src={contact.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-[#FAFAF8] flex items-center justify-center flex-shrink-0 text-[12px] font-semibold text-[#9B9B8F]">
                            {(contact.name || contact.handle || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-semibold text-[#111111] truncate">{contact.handle ? `@${contact.handle}` : contact.name || 'Unknown'}</p>
                            <PlatformDot platform={contact.platform} size={6} />
                          </div>
                          {contact.name && <p className="text-[11px] text-[#9B9B8F] truncate">{contact.name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5"><StatusPill status={STAGE_PILL[contact.stage] ?? contact.stage} /></td>
                    <td className="px-4 py-3.5 text-[13px] font-geist-mono text-[#111111]">{contact.lead_score}</td>
                    <td className="px-4 py-3.5 text-[12px] text-[#9B9B8F]">{timeAgo(contact.last_message_at ?? contact.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && !error && total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-[12px] text-[#6B6B6B]">Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="pop-btn-tertiary text-[12px] py-1.5 px-3 disabled:opacity-40">Previous</button>
            <span className="text-[12px] text-[#6B6B6B]">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="pop-btn-tertiary text-[12px] py-1.5 px-3 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactDetailView({
  contactId, onBack, onChanged,
}: { contactId: string; onBack: () => void; onChanged: (c: Contact) => void }) {
  const { showToast } = useApp();
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [tagDraft, setTagDraft] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchContact(contactId)
      .then(d => { setDetail(d); setNotes(d.contact.notes ?? ''); })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load this contact.'))
      .finally(() => setLoading(false));
  }, [contactId]);

  useEffect(() => {
    // Data fetch from the backend, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleStageChange = async (stage: LeadStage) => {
    if (!detail) return;
    try {
      const updated = await updateContact(detail.contact.id, { stage });
      setDetail(prev => prev ? { ...prev, contact: { ...prev.contact, stage: updated.stage } } : prev);
      onChanged({ ...detail.contact, stage: updated.stage });
      showToast('Stage updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update stage.', 'error');
    }
  };

  const handleSaveNotes = async () => {
    if (!detail) return;
    setSavingNotes(true);
    try {
      const updated = await updateContact(detail.contact.id, { notes });
      setDetail(prev => prev ? { ...prev, contact: { ...prev.contact, notes: updated.notes } } : prev);
      showToast('Notes saved', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save notes.', 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAddTag = async () => {
    const tag = tagDraft.trim();
    if (!tag || !detail) return;
    try {
      const tags = await updateContactTag(detail.contact.id, tag, false);
      setDetail(prev => prev ? { ...prev, contact: { ...prev.contact, tags } } : prev);
      setTagDraft('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add tag.', 'error');
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!detail) return;
    try {
      const tags = await updateContactTag(detail.contact.id, tag, true);
      setDetail(prev => prev ? { ...prev, contact: { ...prev.contact, tags } } : prev);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not remove tag.', 'error');
    }
  };

  return (
    <div className="pop-page max-w-[800px]">
      <button onClick={onBack} className="pop-btn-ghost mb-5">
        <ArrowLeft size={16} />Back to contacts
      </button>

      {loading && (
        <div role="status" aria-busy="true" aria-label="Loading contact">
          <div className="flex items-center gap-4 mb-6">
            <Skeleton className="w-16 h-16 rounded-full flex-shrink-0" />
            <div className="space-y-2">
              <Skeleton className="h-4 rounded w-40" />
              <Skeleton className="h-3 rounded w-24" />
            </div>
          </div>
          <div className="pop-card p-5 space-y-3">
            <Skeleton className="h-3 rounded w-[30%]" />
            <Skeleton className="h-3 rounded w-[55%]" />
            <Skeleton className="h-3 rounded w-[45%]" />
          </div>
          <span className="sr-only">Loading contact</span>
        </div>
      )}

      {!loading && error && (
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Couldn&apos;t load this contact</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && detail && (
        <>
          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div className="flex items-center gap-4">
              {detail.contact.avatar_url ? (
                <img src={detail.contact.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[#FAFAF8] flex items-center justify-center text-[20px] font-semibold text-[#9B9B8F]">
                  {(detail.contact.name || detail.contact.handle || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="pop-section-heading">{detail.contact.name || detail.contact.handle || 'Unknown'}</h1>
                  <PlatformDot platform={detail.contact.platform} size={8} />
                </div>
                {detail.contact.handle && <p className="pop-body">@{detail.contact.handle}</p>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-[#9B9B8F]">Lead score</p>
              <p className="font-geist-mono font-bold text-2xl text-[#111111]">{detail.contact.lead_score}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="sm:col-span-2 space-y-5">
              <div className="pop-card p-5">
                <h2 className="pop-card-title mb-3">Timeline</h2>
                <ContactTimeline detail={detail} />
              </div>

              <div className="pop-card p-5">
                <h2 className="pop-card-title mb-3">Notes</h2>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Add a note about this contact..."
                  className="w-full h-24 border border-[#E8E4DF] rounded-xl p-3 text-[13px] placeholder:text-[#9B9B8F] resize-none focus:outline-none focus-visible:border-chartreuse focus-visible:ring-2 focus-visible:ring-chartreuse/20 transition-all" />
                <button onClick={handleSaveNotes} disabled={savingNotes} className="pop-btn-tertiary text-[12px] py-1.5 px-3 mt-2 disabled:opacity-50">
                  {savingNotes ? 'Saving...' : 'Save notes'}
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div className="pop-card p-5">
                <h2 className="pop-card-title mb-3">Stage</h2>
                <select value={detail.contact.stage} onChange={e => handleStageChange(e.target.value as LeadStage)}
                  className="w-full border border-[#E8E4DF] rounded-lg px-3 py-2 text-[12px] bg-white focus:outline-none focus-visible:border-chartreuse">
                  {(['cold', 'interested', 'warm', 'hot', 'needs_reply', 'converted'] as LeadStage[]).map(s => (
                    <option key={s} value={s}>{STAGE_TABS.find(t => t.key === s)?.label ?? s}</option>
                  ))}
                </select>
              </div>

              <div className="pop-card p-5">
                <h2 className="pop-card-title mb-3">Tags</h2>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {detail.contact.tags.length === 0 && <p className="text-[12px] text-[#9B9B8F]">No tags yet.</p>}
                  {detail.contact.tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 bg-[#FAFAF8] text-[#111111] text-[11px] font-medium px-2 py-1 rounded-full">
                      {tag}
                      <button onClick={() => handleRemoveTag(tag)} aria-label={`Remove tag ${tag}`}><X size={11} /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input type="text" value={tagDraft} onChange={e => setTagDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddTag(); }}
                    placeholder="Add tag..."
                    className="flex-1 min-w-0 border border-[#E8E4DF] rounded-lg px-2.5 py-1.5 text-[12px] placeholder:text-[#9B9B8F] focus:outline-none focus-visible:border-chartreuse" />
                  <button onClick={handleAddTag} className="pop-btn-tertiary p-1.5"><Plus size={14} /></button>
                </div>
              </div>

              {(detail.sourcePost || detail.sourceAutomation) && (
                <div className="pop-card p-5">
                  <h2 className="pop-card-title mb-3">First touch</h2>
                  {detail.sourceAutomation && <p className="text-[12px] text-[#111111]">{detail.sourceAutomation.name}</p>}
                  {detail.sourcePost && <p className="text-[12px] text-[#6B6B6B] mt-1 line-clamp-2">{detail.sourcePost.caption}</p>}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ContactTimeline({ detail }: { detail: ContactDetail }) {
  type TimelineEntry = { id: string; time: string; label: string };
  const entries: TimelineEntry[] = [
    ...detail.messages.map(m => ({
      id: `m-${m.id}`, time: m.created_at,
      label: `${m.direction === 'inbound' ? 'Received' : 'Sent'} ${m.channel}${m.text ? `: "${m.text.slice(0, 80)}"` : ''}`,
    })),
    ...detail.scoreEvents.map(s => ({
      id: `s-${s.id}`, time: s.created_at,
      label: `Score ${s.delta > 0 ? '+' : ''}${s.delta} — ${s.reason.replace(/_/g, ' ')}`,
    })),
    ...detail.events.map(e => ({ id: `e-${e.id}`, time: e.created_at, label: e.detail })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  if (entries.length === 0) return <p className="text-[13px] text-[#9B9B8F]">No activity yet.</p>;

  return (
    <div className="space-y-2 max-h-[360px] overflow-y-auto">
      {entries.slice(0, 50).map(e => (
        <div key={e.id} className="flex items-start gap-3 py-2 border-b border-[#F0EEEA] last:border-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D4CFC8] mt-1.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[12px] text-[#111111]">{e.label}</p>
            <p className="text-[10px] text-[#9B9B8F] mt-0.5">{new Date(e.time).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
