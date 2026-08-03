import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  isBackendConfigured, fetchContacts, fetchContact, updateContact, setContactTag,
  adjustContactScore, markContactConverted, fetchOpportunities, CONTACT_STAGES,
} from '../lib/api';
import type { ContactRecord, ContactDetail as ContactDetailData, Opportunity } from '../lib/api';
import {
  Search, ArrowLeft, Plus, X, ExternalLink,
} from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Avatar } from '@astryxdesign/core/Avatar';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import PlatformDot from '../components/PlatformDot';
import EmptyState from '../components/EmptyState';

const STAGE_LABEL: Record<string, string> = {
  cold: 'Cold', interested: 'Interested', warm: 'Warm', hot: 'Hot',
  needs_reply: 'Needs reply', converted: 'Converted',
};

// Distinct from the 'needs_reply' *stage* value below — this marks the
// separate needs-reply boolean quick-filter so the two don't collide as
// TabList values (a contact can be in the "needs_reply" stage without its
// needs_reply flag set, and vice versa).
const NEEDS_REPLY_FILTER_VALUE = '__needs_reply_flag__';

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
    <div className="pop-page max-w-[820px]">
      <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} />} label="Back to contacts" className="mb-5" onClick={onBack} />

      <div className="flex items-start gap-4 mb-6">
        <Avatar src={current.avatar_url ?? undefined} name={current.name ?? current.handle ?? 'Contact'} size="md" tooltip={false} className="flex-shrink-0" />
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
        <Card padding={4}>
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
            <Button variant="secondary" size="sm" label="Mark converted" isDisabled={busyStage} className="mt-3" onClick={handleConverted} />
          )}
        </Card>

        <Card padding={4}>
          <p className="pop-meta mb-2">Adjust lead score</p>
          <div className="flex gap-2 items-start">
            <NumberInput label="Score delta" isLabelHidden value={scoreDelta} onChange={setScoreDelta} hasClear placeholder="e.g. 10 or -10" size="sm" className="flex-1" />
            <Button variant="secondary" size="sm" label="Apply" isLoading={busyScore} isDisabled={busyScore || scoreDelta == null} onClick={handleAdjustScore} />
          </div>
        </Card>
      </div>

      <Card padding={4} className="mb-5">
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
          <TextInput
            label="Add a tag" isLabelHidden value={newTag} onChange={setNewTag}
            onKeyDown={e => e.key === 'Enter' && handleAddTag()}
            placeholder="Add a tag" size="sm" className="flex-1"
          />
          <Button variant="secondary" size="sm" isIconOnly icon={<Plus size={12} />} label="Add tag" isDisabled={busyTag || !newTag.trim()} onClick={handleAddTag} />
        </div>
      </Card>

      <Card padding={4} className="mb-5">
        <p className="pop-meta mb-2">Notes</p>
        <TextArea
          label="Notes" isLabelHidden value={notes} onChange={setNotes} rows={3}
          placeholder="Private notes about this contact…"
        />
        <Button
          variant="secondary" size="sm" label={savingNotes ? 'Saving…' : 'Save notes'} className="mt-2"
          isLoading={savingNotes} isDisabled={savingNotes || notes === (current.notes ?? '')}
          onClick={handleSaveNotes}
        />
      </Card>

      {(detail?.sourceAutomation || detail?.sourcePost || current.source_type) && (
        <Card padding={4} className="mb-5">
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
        </Card>
      )}

      <Card padding={5} className="mb-5">
        <h2 className="pop-card-title mb-3">Conversation history</h2>
        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <Spinner size="md" />
            <Text type="body" color="secondary">Loading...</Text>
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
      </Card>

      <Card padding={5}>
        <h2 className="pop-card-title mb-3">Related opportunities</h2>
        {oppsLoading ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <Spinner size="md" />
            <Text type="body" color="secondary">Loading...</Text>
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
      </Card>
    </div>
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
    [backendConfigured, debouncedSearch, stageFilter, needsReplyOnly, showToast]
  );

  const load = useCallback(
    () => runFetch({ offset: 0, limit: PAGE_SIZE, append: false }),
    [runFetch]
  );

  const loadMore = useCallback(
    () => runFetch({ offset: contactList.length, limit: PAGE_SIZE, append: true }),
    [runFetch, contactList.length]
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
  const handleFilterChange = (value: string) => {
    if (value === 'all') { setStageFilter(undefined); setNeedsReplyOnly(false); }
    else if (value === NEEDS_REPLY_FILTER_VALUE) { setNeedsReplyOnly(true); setStageFilter(undefined); }
    else { setStageFilter(value); setNeedsReplyOnly(false); }
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
          <TextInput
            label="Search contacts" isLabelHidden value={search} onChange={setSearch}
            placeholder="Search contacts..." startIcon={<Search size={16} />}
            size="sm" className="w-full sm:w-56"
          />
        }
      />

      {!backendConfigured && (
        <Banner
          status="warning"
          title="Populr isn't connected to a backend yet"
          description="Set VITE_API_URL to your Populr backend to see real contacts here. This page never shows placeholder data in its place."
          className="mb-6"
        />
      )}

      {backendConfigured && (
        <>
          <div className="overflow-x-auto pb-1 mb-5">
            <TabList value={activeFilterValue} onChange={handleFilterChange}>
              <Tab value="all" label="All" />
              <Tab value={NEEDS_REPLY_FILTER_VALUE} label="Needs reply" />
              {CONTACT_STAGES.map(s => (
                <Tab key={s} value={s} label={STAGE_LABEL[s] ?? s} />
              ))}
            </TabList>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16 gap-2">
              <Spinner size="lg" />
              <Text type="body" color="secondary">Loading contacts...</Text>
            </div>
          )}

          {!loading && error && (
            <Banner
              status="error"
              title="Couldn't load contacts"
              description={error}
              endContent={<Button label="Try again" variant="secondary" size="sm" onClick={load} />}
            />
          )}

          {!loading && !error && contactList.length === 0 && (
            <EmptyState icon="contacts" title="No contacts yet"
              description="People who comment or message your connected accounts will show up here as Populr captures them." />
          )}

          {!loading && !error && contactList.length > 0 && (
            <Card padding={0} className="overflow-hidden">
              <div className="divide-y divide-[#F0EEEA]">
                {contactList.map(c => {
                  const account = c.account_id ? accountById[c.account_id] : undefined;
                  return (
                    <button key={c.id} onClick={() => setDetailId(c.id)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#FAFAF8] transition-colors">
                      <Avatar src={c.avatar_url ?? undefined} name={c.name ?? c.handle ?? 'Contact'} size="md" tooltip={false} className="flex-shrink-0" />
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
            </Card>
          )}

          {!loading && !error && contactList.length > 0 && contactList.length < total && (
            <div className="flex flex-col items-center gap-2 mt-5">
              <Button
                variant="secondary" size="sm" label={loadingMore ? 'Loading...' : 'Load more'}
                isLoading={loadingMore} isDisabled={loadingMore} onClick={loadMore}
              />
              <Text type="supporting" color="disabled">Showing {contactList.length} of {total}</Text>
            </div>
          )}
        </>
      )}
    </div>
  );
}
