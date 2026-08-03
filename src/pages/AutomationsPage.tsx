import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Card } from '@astryxdesign/core/Card';
import { Banner } from '@astryxdesign/core/Banner';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { useApp } from '../context/AppContext';
import {
  isBackendConfigured, fetchAutomations, updateAutomation, deleteAutomation, fetchAutomationEvents,
} from '../lib/api';
import type { AutomationRecord, AutomationEvent, ConnectedAccount } from '../lib/api';
import {
  Search, Play, Pause, Zap, ArrowLeft, Plus, Loader2, Trash2, Pencil,
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
      <Button label="Back to automations" variant="ghost" size="sm" icon={<ArrowLeft size={16} />} onClick={onBack} />

      <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mt-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <StatusPill status={automation.active ? 'active' : 'paused'} />
            {reviewFirst && <StatusPill status="reply recommended" />}
          </div>
          <Heading level={1}>{automation.name}</Heading>
          <div className="flex items-center gap-1.5 mt-1.5">
            <PlatformDot platform={automation.platform} size={8} />
            <Text type="body" color="secondary">{automation.platform}</Text>
            {account && (
              <Text type="body" color="secondary">
                · {account.username ? `@${account.username}` : account.display_name ?? account.id}
              </Text>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button label="Edit" variant="primary" size="sm" icon={<Pencil size={14} />} onClick={onEdit} />
          <Button
            label={automation.active ? 'Pause' : 'Resume'}
            variant="secondary"
            size="sm"
            icon={automation.active ? <Pause size={14} /> : <Play size={14} />}
            clickAction={onToggleActive}
            isLoading={busy}
          />
          <Button label="Delete" variant="destructive" size="sm" icon={<Trash2 size={14} />} onClick={onDelete} isDisabled={busy} />
        </div>
      </div>

      <Card padding={5} className="mb-5">
        <Heading level={2} className="mb-4">Configuration</Heading>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Text type="supporting" display="block">Trigger</Text>
            <Text type="body" display="block" className="mt-0.5">
              {automation.all_posts ? 'Any post' : `Post ${automation.source_post_id}`} · comment {MATCH_MODE_LABEL[automation.match_mode] ?? automation.match_mode}
            </Text>
            <Text type="supporting" display="block" className="mt-0.5">{automation.keywords.join(', ')}</Text>
          </div>
          <div>
            <Text type="supporting" display="block">Reply channel</Text>
            <Text type="body" display="block" className="mt-0.5">{REPLY_CHANNEL_LABEL[automation.reply_channel] ?? automation.reply_channel}</Text>
          </div>
          {automation.comment_reply_body && (
            <div>
              <Text type="supporting" display="block">Public reply text</Text>
              <Text type="body" display="block" className="mt-0.5">{automation.comment_reply_body}</Text>
            </div>
          )}
          {automation.message_body && (
            <div>
              <Text type="supporting" display="block">DM text</Text>
              <Text type="body" display="block" className="mt-0.5">{automation.message_body}</Text>
            </div>
          )}
          {automation.link_url && (
            <div>
              <Text type="supporting" display="block">Link</Text>
              <Text type="body" display="block" className="mt-0.5 truncate">{automation.link_url}</Text>
            </div>
          )}
          {automation.tags.length > 0 && (
            <div>
              <Text type="supporting" display="block">Tags</Text>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {automation.tags.map(t => <StatusPill key={t} status={t} className="text-[10px]" />)}
              </div>
            </div>
          )}
          {automation.score_delta !== 0 && (
            <div>
              <Text type="supporting" display="block">Lead score</Text>
              <Text type="body" display="block" className="mt-0.5">+{automation.score_delta} per match</Text>
            </div>
          )}
        </div>
      </Card>

      <Card padding={5}>
        <Heading level={2} className="mb-4">Recent activity</Heading>
        {eventsLoading && (
          <div className="flex items-center justify-center py-8 text-[#6B6B6B]">
            <Loader2 size={18} className="animate-spin mr-2" /> Loading activity...
          </div>
        )}
        {!eventsLoading && eventsError && <Banner status="error" title={eventsError} />}
        {!eventsLoading && !eventsError && events.length === 0 && (
          <Text type="body" color="secondary" display="block">No activity yet. This fills in as people engage with your keywords.</Text>
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
      </Card>
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
            <div className="w-full sm:w-56">
              <TextInput
                label="Search automations"
                isLabelHidden
                value={search}
                onChange={setSearch}
                placeholder="Search automations..."
                startIcon={<Search size={16} />}
              />
            </div>
            <Button label="Create automation" variant="primary" icon={<Plus size={14} strokeWidth={2.5} />} width="100%" onClick={() => navigate('/automations/new')} />
          </div>
        }
      />

      {!backendConfigured && (
        <div className="mb-6">
          <Banner
            status="warning"
            title="Populr isn't connected to a backend yet"
            description="Set VITE_API_URL to your Populr backend to see real automations here. This page never shows placeholder data in its place."
          />
        </div>
      )}

      {backendConfigured && (
        <>
          <TabList value={statusTab} onChange={v => setStatusTab(v as StatusTab)} hasDivider>
            <Tab value="all" label="All" endContent={<span className="text-[10px] opacity-60">{automationList.length}</span>} />
            <Tab value="active" label="Active" endContent={<span className="text-[10px] opacity-60">{activeCount}</span>} />
            <Tab value="paused" label="Paused" endContent={<span className="text-[10px] opacity-60">{pausedCount}</span>} />
          </TabList>

          {loading && (
            <div className="flex items-center justify-center py-16 text-[#6B6B6B]">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading automations...
            </div>
          )}

          {!loading && error && (
            <div className="mt-5">
              <Banner status="error" title="Couldn't load automations" description={error}
                endContent={<Button label="Try again" variant="secondary" size="sm" onClick={load} />} />
            </div>
          )}

          {!loading && !error && automationList.length === 0 && !accountsLoading && connectedAccounts.length === 0 && (
            <div className="mt-5">
              <EmptyState icon="automations" title="Connect an account first"
                description="Automations reply to comments and DMs on your connected accounts. Connect one to get started."
                action={<Button label="Connect an account" variant="primary" onClick={() => navigate('/connections')} />} />
            </div>
          )}

          {!loading && !error && automationList.length === 0 && (accountsLoading || connectedAccounts.length > 0) && (
            <div className="mt-5">
              <EmptyState icon="automations" title="No automations yet"
                description="Create an automation to reply to comments and DMs automatically, and start capturing contacts."
                action={<Button label="Create automation" variant="primary" onClick={() => navigate('/automations/new')} />} />
            </div>
          )}

          {!loading && !error && automationList.length > 0 && filtered.length === 0 && (
            <div className="mt-5">
              <EmptyState icon="search" title="Nothing matches" description="Try a different search or status filter." />
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div className="space-y-3 mt-5">
              {filtered.map(a => {
                const account = accountById[a.account_id];
                const reviewFirst = a.ai_enabled && a.ai_mode === 'suggest';
                const busy = busyId === a.id;
                return (
                  <Card key={a.id} padding={4} className="pop-card-hover cursor-pointer" onClick={() => setDetailId(a.id)}>
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
                        <Button label="Edit" variant="ghost" size="sm" icon={<Pencil size={14} />} isIconOnly isDisabled={busy} onClick={() => handleEdit(a)} />
                        <Button
                          label={a.active ? 'Pause' : 'Resume'}
                          variant="ghost"
                          size="sm"
                          icon={busy ? <Loader2 size={14} className="animate-spin" /> : a.active ? <Pause size={14} /> : <Play size={14} />}
                          isIconOnly
                          isDisabled={busy}
                          onClick={() => handleToggleActive(a)}
                        />
                        <Button label="Delete" variant="ghost" size="sm" icon={<Trash2 size={14} className="text-[#DC2626]" />} isIconOnly isDisabled={busy} onClick={() => handleDelete(a)} />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
