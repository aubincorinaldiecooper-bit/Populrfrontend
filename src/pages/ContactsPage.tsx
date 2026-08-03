import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  isBackendConfigured, fetchContacts, fetchContact, updateContact, setContactTag,
  adjustContactScore, markContactConverted, fetchOpportunities, CONTACT_STAGES,
} from '../lib/api';
import type { ContactRecord, ContactDetail as ContactDetailData, Opportunity } from '../lib/api';
import {
  Search, ArrowLeft, Plus, ExternalLink,
} from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Avatar } from '@astryxdesign/core/Avatar';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { Token } from '@astryxdesign/core/Token';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
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

      <HStack gap={4} align="start" style={{ marginBottom: 24 }}>
        <Avatar src={current.avatar_url ?? undefined} name={current.name ?? current.handle ?? 'Contact'} size="md" tooltip={false} className="flex-shrink-0" />
        <VStack gap={0.5} style={{ flex: 1, minWidth: 0 }}>
          <HStack gap={2} align="center" wrap="wrap">
            <Heading level={1} type="display-2">{current.handle ? `@${current.handle}` : current.name ?? 'Unknown contact'}</Heading>
            <StatusPill status={current.stage} />
            {current.needs_reply && <StatusPill status="human-review" />}
          </HStack>
          {current.name && current.handle && <Text type="body" color="secondary">{current.name}</Text>}
          <HStack gap={1.5} align="center" wrap="wrap" style={{ marginTop: 4 }}>
            <PlatformDot platform={current.platform} size={7} />
            <Text type="supporting" color="secondary" className="capitalize">{current.platform}</Text>
            {accountLabel && <Text type="supporting" color="secondary">· {accountLabel}</Text>}
            <Text type="supporting" color="disabled">· First seen {relativeTime(current.first_seen)}</Text>
          </HStack>
        </VStack>
        <VStack gap={0} align="end" style={{ flexShrink: 0 }}>
          <Text size="xl" weight="bold" className="font-geist-mono">{current.lead_score}</Text>
          <Text type="supporting" color="disabled" style={{ letterSpacing: '0.04em' }}>LEAD SCORE</Text>
        </VStack>
      </HStack>

      <div className="grid sm:grid-cols-2 gap-5 mb-5">
        <Card padding={4}>
          <Text type="supporting" color="secondary" display="block" style={{ marginBottom: 8 }}>Stage</Text>
          <HStack wrap="wrap" gap={1.5}>
            {CONTACT_STAGES.map(s => (
              <ToggleButton
                key={s}
                size="sm"
                label={STAGE_LABEL[s] ?? s}
                isPressed={current.stage === s}
                isDisabled={current.stage === s || busyStage}
                pressedChangeAction={() => handleStageChange(s)}
              />
            ))}
          </HStack>
          {current.stage !== 'converted' && (
            <Button variant="secondary" size="sm" label="Mark converted" isDisabled={busyStage} className="mt-3" onClick={handleConverted} />
          )}
        </Card>

        <Card padding={4}>
          <Text type="supporting" color="secondary" display="block" style={{ marginBottom: 8 }}>Adjust lead score</Text>
          <div className="flex gap-2 items-start">
            <NumberInput label="Score delta" isLabelHidden value={scoreDelta} onChange={setScoreDelta} hasClear placeholder="e.g. 10 or -10" className="flex-1" />
            <Button variant="secondary" size="sm" label="Apply" isLoading={busyScore} isDisabled={busyScore || scoreDelta == null} onClick={handleAdjustScore} />
          </div>
        </Card>
      </div>

      <Card padding={4} className="mb-5">
        <Text type="supporting" color="secondary" display="block" style={{ marginBottom: 8 }}>Tags</Text>
        <HStack wrap="wrap" gap={1.5} style={{ marginBottom: 8 }}>
          {current.tags.length === 0 && <Text type="supporting" color="disabled">No tags yet.</Text>}
          {current.tags.map(t => (
            <Token key={t} label={t} size="sm" isDisabled={busyTag} onRemove={() => handleRemoveTag(t)} />
          ))}
        </HStack>
        <div className="flex gap-2">
          <TextInput
            label="Add a tag" isLabelHidden value={newTag} onChange={setNewTag}
            onKeyDown={e => e.key === 'Enter' && handleAddTag()}
            placeholder="Add a tag" className="flex-1"
          />
          <Button variant="secondary" size="sm" isIconOnly icon={<Plus size={12} />} label="Add tag" isDisabled={busyTag || !newTag.trim()} onClick={handleAddTag} />
        </div>
      </Card>

      <Card padding={4} className="mb-5">
        <Text type="supporting" color="secondary" display="block" style={{ marginBottom: 8 }}>Notes</Text>
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
          <Text type="supporting" color="secondary" display="block" style={{ marginBottom: 8 }}>How they found you</Text>
          <Text type="body">
            {detail?.sourceAutomation ? `Via automation "${detail.sourceAutomation.name}"` : `Source: ${current.source_type}`}
          </Text>
          {detail?.sourcePost?.url && (
            <a href={detail.sourcePost.url} target="_blank" rel="noreferrer"
              className="text-[12px] text-[#3B82F6] hover:underline inline-flex items-center gap-1 mt-1">
              View source post <ExternalLink size={11} />
            </a>
          )}
        </Card>
      )}

      <Card padding={5} className="mb-5">
        <Heading level={5} accessibilityLevel={2} style={{ marginBottom: 12 }}>Conversation history</Heading>
        {loading ? (
          <HStack justify="center" align="center" gap={2} style={{ paddingBlock: 32 }}>
            <Spinner size="md" />
            <Text type="body" color="secondary">Loading...</Text>
          </HStack>
        ) : !detail || detail.messages.length === 0 ? (
          <Text type="supporting" color="secondary">No messages yet.</Text>
        ) : (
          <VStack gap={2}>
            {detail.messages.slice().reverse().map(m => (
              <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-xl px-3 py-2 ${m.direction === 'outbound' ? 'bg-chartreuse/20 text-[#111111]' : 'bg-[#FAFAF8] text-[#111111]'}`}>
                  <Text type="supporting" color="primary">{m.text || <Text type="inherit" style={{ fontStyle: 'italic' }} color="disabled">(no text)</Text>}</Text>
                  <Text type="supporting" color="disabled" display="block" style={{ marginTop: 4 }}>{m.channel} · {relativeTime(m.created_at)}</Text>
                </div>
              </div>
            ))}
          </VStack>
        )}
      </Card>

      <Card padding={5}>
        <Heading level={5} accessibilityLevel={2} style={{ marginBottom: 12 }}>Related opportunities</Heading>
        {oppsLoading ? (
          <HStack justify="center" align="center" gap={2} style={{ paddingBlock: 32 }}>
            <Spinner size="md" />
            <Text type="body" color="secondary">Loading...</Text>
          </HStack>
        ) : opportunities.length === 0 ? (
          <Text type="supporting" color="secondary">No opportunities from this contact yet.</Text>
        ) : (
          <VStack gap={2}>
            {opportunities.map(o => (
              <div key={o.id} className="flex items-center justify-between gap-3 py-2 border-b border-[#F0EEEA] last:border-0">
                <VStack gap={0.5} style={{ minWidth: 0 }}>
                  <Text type="supporting" color="primary" className="truncate">&ldquo;{o.interaction.text}&rdquo;</Text>
                  <Text type="supporting" color="disabled">{o.intent.label}</Text>
                </VStack>
                <HStack gap={1.5} align="center" style={{ flexShrink: 0 }}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${OPP_STATUS_COLOR[o.status] ?? 'bg-[#9B9B8F]'}`} />
                  <Text type="supporting" color="disabled" className="capitalize">{o.status}</Text>
                </HStack>
              </div>
            ))}
          </VStack>
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
            className="w-full sm:w-56"
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
                      <VStack gap={0.5} style={{ flex: 1, minWidth: 0 }}>
                        <HStack gap={2} align="center" wrap="wrap">
                          <Text type="label" weight="semibold" className="truncate">{c.handle ? `@${c.handle}` : c.name ?? 'Unknown'}</Text>
                          <PlatformDot platform={c.platform} size={6} />
                          {c.needs_reply && <StatusPill status="human-review" className="text-[9px]" />}
                        </HStack>
                        <Text type="supporting" color="disabled" className="truncate">
                          {account ? (account.username ? `@${account.username}` : account.display_name) : c.platform}
                          {c.tags.length > 0 && ` · ${c.tags.slice(0, 3).join(', ')}`}
                        </Text>
                      </VStack>
                      <HStack gap={3} align="center" style={{ flexShrink: 0 }}>
                        <StatusPill status={c.stage} className="text-[10px]" />
                        <Text weight="bold" className="font-geist-mono" style={{ width: 32, textAlign: 'right' }}>{c.lead_score}</Text>
                        <Text type="supporting" color="disabled" style={{ width: 56, textAlign: 'right' }}>{relativeTime(c.last_seen)}</Text>
                      </HStack>
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
