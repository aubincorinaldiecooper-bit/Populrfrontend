import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { RefreshCw, Inbox as InboxIcon, AlertCircle, ExternalLink, Copy, Check } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Spinner } from '@astryxdesign/core/Spinner';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/PageHeader';
import PlatformDot from '../components/PlatformDot';
import OpportunityDetailDrawer from '../components/OpportunityDetailDrawer';
import {
  isBackendConfigured, fetchOpportunities, updateOpportunityStatus, fetchCapabilities,
} from '../lib/api';
import type { Opportunity, OpportunitySummary, OpportunityStatus, PlatformCapabilities } from '../lib/api';

// No explicit backend "initial sync status" exists for opportunities, so
// recency-of-connection is the most honest available proxy for "Populr
// hasn't plausibly had time to review this account's engagement yet" —
// avoids claiming "no opportunities yet" moments after a user's first
// connect, before anything could realistically have synced.
const INITIAL_SYNC_WINDOW_MS = 10 * 60 * 1000;

const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'twitter', label: 'Twitter' },
  { value: 'reddit', label: 'Reddit' },
];

const INTENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'purchase_interest', label: 'Purchase interest' },
  { value: 'pricing_request', label: 'Pricing request' },
  { value: 'booking_interest', label: 'Booking interest' },
  { value: 'event_ticket_interest', label: 'Event or ticket interest' },
  { value: 'link_info_request', label: 'Link or information request' },
  { value: 'collaboration_partnership', label: 'Collaboration or partnership' },
  { value: 'support_issue', label: 'Support issue' },
  { value: 'general_engagement', label: 'General engagement' },
];

// 'active' is a server-side pseudo-status meaning "not dismissed", so the
// working queue stays calm without the client hiding rows the server counted
// — which would desync the summary and pagination from what's on screen.
type StatusFilter = 'active' | OpportunityStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'responded', label: 'Responded' },
  { value: 'dismissed', label: 'Dismissed' },
];

const INTENT_SUMMARY_LABEL: Record<string, { one: string; many: string }> = {
  purchase_interest: { one: 'purchase interest', many: 'purchase interests' },
  pricing_request: { one: 'pricing question', many: 'pricing questions' },
  booking_interest: { one: 'booking request', many: 'booking requests' },
  event_ticket_interest: { one: 'event inquiry', many: 'event inquiries' },
  link_info_request: { one: 'info request', many: 'info requests' },
  collaboration_partnership: { one: 'collaboration request', many: 'collaboration requests' },
  support_issue: { one: 'support issue', many: 'support issues' },
  general_engagement: { one: 'general engagement mention', many: 'general engagement mentions' },
};

const STATUS_DOT: Record<OpportunityStatus, string> = {
  new: 'bg-chartreuse',
  reviewed: 'bg-[#3B82F6]',
  responded: 'bg-[#059669]',
  dismissed: 'bg-[#9B9B8F]',
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

function CopyResponseButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      label={copied ? 'Copied' : 'Copy response'}
      icon={copied ? <Check size={13} /> : <Copy size={13} />}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard access denied — not worth a hard error here.
        }
      }}
    />
  );
}

function OpportunityRow({
  opportunity, onOpen, onDismiss,
}: {
  opportunity: Opportunity;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const canRespond = opportunity.availableActions.includes('reply') || opportunity.availableActions.includes('message');
  const canOpenOnPlatform = opportunity.availableActions.includes('open_on_platform');
  const canCopy = opportunity.availableActions.includes('copy_response') && opportunity.suggestedResponse;
  const openUrl = opportunity.interaction.externalUrl ?? opportunity.source?.externalUrl ?? null;
  const personLabel = opportunity.person.username ? `@${opportunity.person.username}` : opportunity.person.displayName || 'Unknown person';

  return (
    <ClickableCard label={`Opportunity from ${personLabel}`} padding={4} className="pop-card-hover" onClick={onOpen}>
      <div className="flex items-start gap-3">
        {opportunity.person.avatarUrl ? (
          <img src={opportunity.person.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-[#FAFAF8] flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[#111111]">{personLabel}</span>
            <PlatformDot platform={opportunity.platform} size={7} />
            <span className="text-[11px] text-[#9B9B8F] capitalize">{opportunity.platform}</span>
            <span className="text-[11px] text-[#9B9B8F]">· {relativeTime(opportunity.interaction.occurredAt)}</span>
            <span className={`inline-block w-1.5 h-1.5 rounded-full ml-auto flex-shrink-0 ${STATUS_DOT[opportunity.status]}`} title={opportunity.status} />
          </div>
          <p className="text-[13px] text-[#111111] mt-1.5 line-clamp-2">&ldquo;{opportunity.interaction.text}&rdquo;</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FAFAF8] text-[#111111]">
              {opportunity.intent.label}
            </span>
            <span className="text-[11px] text-[#6B6B6B]">{opportunity.intent.reason}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 ml-12 flex-wrap">
        {canRespond && (
          <Button variant="primary" size="sm" label="Reply" onClick={onOpen} />
        )}
        {!canRespond && canOpenOnPlatform && openUrl && (
          <Button variant="primary" size="sm" label="Open on platform" icon={<ExternalLink size={13} />} href={openUrl} target="_blank" rel="noreferrer" />
        )}
        {!canRespond && canCopy && opportunity.suggestedResponse && (
          <CopyResponseButton text={opportunity.suggestedResponse} />
        )}
        {!canRespond && !canOpenOnPlatform && !canCopy && (
          <Button variant="secondary" size="sm" label="Review" onClick={onOpen} />
        )}
        {opportunity.status !== 'dismissed' && (
          <Button variant="ghost" size="sm" label="Dismiss" onClick={onDismiss} />
        )}
      </div>
    </ClickableCard>
  );
}

const PAGE_SIZE = 25;
/** Server caps `limit` at 100; refreshes never ask for more than it will give. */
const MAX_LIMIT = 100;

export default function OpportunitiesPage() {
  const navigate = useNavigate();
  const { showToast, accounts, accountsLoading, accountsError, refreshAccounts } = useApp();
  const backendConfigured = isBackendConfigured();

  const [platformFilter, setPlatformFilter] = useState<string | undefined>(undefined);
  const [intentFilter, setIntentFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [summary, setSummary] = useState<OpportunitySummary | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held as an object rather than looked up in `opportunities`, so the drawer
  // survives a refresh that drops the row from the current filter.
  const [selected, setSelected] = useState<Opportunity | null>(null);

  const [capabilities, setCapabilities] = useState<Record<string, PlatformCapabilities>>({});
  useEffect(() => {
    if (!backendConfigured) return;
    fetchCapabilities()
      .then(list => setCapabilities(Object.fromEntries(list.map(c => [c.platform, c]))))
      .catch(err => console.error('[opportunities] failed to load platform capabilities:', err));
  }, [backendConfigured]);

  // `Date.now()` can't be called directly in the render body (React purity
  // rule) — captured once at mount and refreshed periodically instead, which
  // is more than enough precision for a 10-minute window.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const connectedAccounts = accounts.filter(a => a.status === 'connected');
  const hasConnectedAccounts = connectedAccounts.length > 0;
  const recentlyConnected = connectedAccounts.some(a => {
    if (!a.connected_at) return false;
    const connectedAt = new Date(a.connected_at).getTime();
    return Number.isFinite(connectedAt) && now - connectedAt < INITIAL_SYNC_WINDOW_MS;
  });
  // A connected account whose platform can't supply what opportunities need
  // (comment replies + DMs) is still connected — never treated as "not
  // connected" — just flagged with an explanatory note.
  const limitedAccount = connectedAccounts.find(a => {
    const caps = capabilities[a.platform];
    return caps && (!caps.supportsCommentReplies || !caps.supportsDMs);
  });

  // Monotonic request id: only the newest in-flight fetch may write state, so
  // a slow earlier request can't overwrite results for filters the user has
  // already moved on from.
  const requestSeq = useRef(0);

  const runFetch = useCallback(
    async ({ offset, limit, append }: { offset: number; limit: number; append: boolean }) => {
      if (!backendConfigured) {
        setLoading(false);
        return;
      }
      const seq = ++requestSeq.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await fetchOpportunities({
          platform: platformFilter,
          intent: intentFilter,
          status: statusFilter,
          limit,
          offset,
        });
        if (seq !== requestSeq.current) return; // superseded
        setOpportunities(prev => (append ? [...prev, ...result.opportunities] : result.opportunities));
        setSummary(result.summary);
        setTotal(result.total);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        const message = err instanceof Error ? err.message : 'Could not load opportunities right now.';
        if (append) showToast(message, 'error');
        else setError(message);
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [backendConfigured, platformFilter, intentFilter, statusFilter, showToast],
  );

  const load = useCallback(
    () => runFetch({ offset: 0, limit: PAGE_SIZE, append: false }),
    [runFetch],
  );

  const loadMore = useCallback(
    () => runFetch({ offset: opportunities.length, limit: PAGE_SIZE, append: true }),
    [runFetch, opportunities.length],
  );

  /**
   * After a mutation, re-read the span the user currently has open. A status
   * change can move a row out of the active filter and always shifts the
   * summary counts, so patching the row in place would leave both wrong.
   */
  const refreshLoaded = useCallback(
    () => runFetch({
      offset: 0,
      limit: Math.min(Math.max(opportunities.length, PAGE_SIZE), MAX_LIMIT),
      append: false,
    }),
    [runFetch, opportunities.length],
  );

  useEffect(() => {
    // Data fetch from the backend, not derived state — the setState calls
    // inside `load` are the effect synchronizing with an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleStatusChange(id: string, status: 'reviewed' | 'responded' | 'dismissed') {
    try {
      const updated = await updateOpportunityStatus(id, status);
      setSelected(prev => (prev && prev.id === id ? updated : prev));
      await refreshLoaded();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update this opportunity.', 'error');
    }
  }

  async function handleReplySent(id: string, result: { sentText: string; channel: string }) {
    showToast(`Reply sent on ${result.channel}.`, 'success');
    setSelected(prev => (prev && prev.id === id ? { ...prev, status: 'responded' } : prev));
    await refreshLoaded();
  }

  const newCount = summary?.new ?? 0;
  const intentBreakdown = summary
    ? Object.entries(summary.byIntent)
        .filter(([category]) => category !== 'general_engagement')
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([category, count]) => {
          const labels = INTENT_SUMMARY_LABEL[category];
          if (!labels) return null;
          return `${count} ${count === 1 ? labels.one : labels.many}`;
        })
        .filter((s): s is string => !!s)
    : [];

  return (
    <div className="pop-page">
      <PageHeader
        title="Opportunities"
        subtitle="Populr reviews engagement across your connected accounts and surfaces the people showing real intent."
        action={
          <Button variant="ghost" size="sm" label="Refresh" icon={<RefreshCw size={14} />} isLoading={loading} isDisabled={loading} onClick={load} />
        }
      />

      {!backendConfigured && (
        <Banner
          status="warning"
          title="Populr isn't connected to a backend yet"
          description="Set VITE_API_URL to your Populr backend to see real opportunities here. This page never shows placeholder data in its place."
          className="mb-6"
        />
      )}

      {backendConfigured && (
        <>
          {/* Summary */}
          {summary && summary.total > 0 && (
            <div className="mb-5">
              <Text type="body" weight="bold" display="block">
                {newCount > 0 ? `${newCount} new opportunit${newCount === 1 ? 'y' : 'ies'}` : 'No new opportunities since your last visit'}
              </Text>
              {intentBreakdown.length > 0 && (
                <Text type="supporting" color="secondary" display="block" className="mt-0.5">{intentBreakdown.join(' · ')}</Text>
              )}
            </div>
          )}

          {limitedAccount && (
            <Card padding={4} className="mb-5">
              <div className="flex items-start gap-3">
                <AlertCircle size={16} className="text-[#3B82F6] flex-shrink-0 mt-0.5" />
                <Text type="supporting" color="secondary">
                  <span className="capitalize font-medium text-[#111111]">{limitedAccount.platform}</span> is connected with limited access.
                  Opportunity coverage depends on the permissions available for this account.
                </Text>
              </div>
            </Card>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4 mb-5">
            {/* Platform and intent stay as wrapping pill clouds (5-8 options
                each) — TabList doesn't wrap to multiple lines, and no other
                Astryx primitive reproduces this compact multi-select-look
                filter chip pattern without a real redesign. */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setPlatformFilter(undefined)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${!platformFilter ? 'bg-[#111111] text-white' : 'bg-[#FAFAF8] text-[#6B6B6B] hover:bg-[#F0EFEA]'}`}
              >
                All platforms
              </button>
              {PLATFORM_OPTIONS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPlatformFilter(p.value)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${platformFilter === p.value ? 'bg-[#111111] text-white' : 'bg-[#FAFAF8] text-[#6B6B6B] hover:bg-[#F0EFEA]'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.value}
                  onClick={() => setStatusFilter(s.value)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${statusFilter === s.value ? 'bg-[#111111] text-white' : 'bg-[#FAFAF8] text-[#6B6B6B] hover:bg-[#F0EFEA]'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-6">
            <button
              onClick={() => setIntentFilter(undefined)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${!intentFilter ? 'bg-[rgba(200,255,61,0.15)] text-[#5C6B00]' : 'bg-[#FAFAF8] text-[#6B6B6B] hover:bg-[#F0EFEA]'}`}
            >
              All intents
            </button>
            {INTENT_OPTIONS.map(i => (
              <button
                key={i.value}
                onClick={() => setIntentFilter(i.value)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${intentFilter === i.value ? 'bg-[rgba(200,255,61,0.15)] text-[#5C6B00]' : 'bg-[#FAFAF8] text-[#6B6B6B] hover:bg-[#F0EFEA]'}`}
              >
                {i.label}
              </button>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16 text-[#6B6B6B] gap-2">
              <Spinner size="lg" />
              <Text type="body" color="secondary">Looking for meaningful audience activity...</Text>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <Banner
              status="error"
              title="Couldn't load opportunities"
              description={error}
              endContent={<Button label="Try again" variant="secondary" size="sm" onClick={load} />}
            />
          )}

          {/* Empty states */}
          {/* An account-list load failure is distinct from a genuine zero
              accounts — conflating them told an already-connected user
              whose GET /api/accounts happened to fail to "connect your
              first account", which is both wrong and not actionable. This
              takes priority over the three states below, all of which
              assume the account list itself loaded successfully. */}
          {!loading && !error && !accountsLoading && total === 0 && accountsError && !platformFilter && !intentFilter && statusFilter === 'active' && (
            <Card padding={8} className="text-center">
              <AlertCircle size={24} className="text-[#D97706] mx-auto mb-3" />
              <Text type="body" weight="bold" display="block">Couldn&apos;t check your connected accounts</Text>
              <Text type="supporting" color="secondary" display="block" className="mt-1.5 max-w-sm mx-auto">
                Populr couldn&apos;t confirm which accounts are connected, so it can&apos;t tell whether there&apos;s anything to show here yet.
              </Text>
              <div className="mt-4 inline-flex">
                <Button label="Try again" variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={refreshAccounts} />
              </div>
            </Card>
          )}

          {!loading && !error && !accountsLoading && !accountsError && total === 0 && !hasConnectedAccounts && !platformFilter && !intentFilter && statusFilter === 'active' && (
            <Card padding={8} className="text-center">
              <InboxIcon size={24} className="text-[#9B9B8F] mx-auto mb-3" />
              <Text type="body" weight="bold" display="block">Connect your first account</Text>
              <Text type="supporting" color="secondary" display="block" className="mt-1.5 max-w-sm mx-auto">
                Connect a social account so Populr can begin reviewing engagement for meaningful opportunities.
              </Text>
              <div className="mt-4 inline-flex">
                <Button label="Connect an account" variant="primary" onClick={() => navigate('/connections')} />
              </div>
            </Card>
          )}

          {!loading && !error && !accountsLoading && !accountsError && total === 0 && hasConnectedAccounts && recentlyConnected && !platformFilter && !intentFilter && statusFilter === 'active' && (
            <Card padding={8} className="text-center">
              <InboxIcon size={24} className="text-[#9B9B8F] mx-auto mb-3" />
              <Text type="body" weight="bold" display="block">Reviewing your engagement</Text>
              <Text type="supporting" color="secondary" display="block" className="mt-1.5 max-w-sm mx-auto">
                Populr is reviewing recent activity from your connected accounts. Opportunities will appear here when meaningful intent is found.
              </Text>
              <div className="mt-4 inline-flex">
                <Button label="Refresh" variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={load} />
              </div>
            </Card>
          )}

          {!loading && !error && !accountsLoading && !accountsError && total === 0 && hasConnectedAccounts && !recentlyConnected && !platformFilter && !intentFilter && statusFilter === 'active' && (
            <Card padding={8} className="text-center">
              <InboxIcon size={24} className="text-[#9B9B8F] mx-auto mb-3" />
              <Text type="body" weight="bold" display="block">No opportunities yet</Text>
              <Text type="supporting" color="secondary" display="block" className="mt-1.5 max-w-sm mx-auto">
                Your accounts are connected. New high-intent engagement will appear here when Populr finds something worth your attention.
              </Text>
              <div className="mt-4 inline-flex">
                <Button label="Refresh" variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={load} />
              </div>
              <div className="mt-3">
                <Link hasUnderline type="supporting" onClick={() => navigate('/connections')}>View connected accounts</Link>
              </div>
            </Card>
          )}

          {!loading && !error && total === 0 && (platformFilter || intentFilter || statusFilter !== 'active') && (
            <Card padding={8} className="text-center">
              <InboxIcon size={24} className="text-[#9B9B8F] mx-auto mb-3" />
              <Text type="body" weight="bold" display="block">Nothing matches these filters</Text>
              <Text type="supporting" color="secondary" display="block" className="mt-1.5">Try a different platform, intent, or status.</Text>
            </Card>
          )}

          {/* Rows */}
          {!loading && !error && opportunities.length > 0 && (
            <>
              <div className="space-y-2.5">
                {opportunities.map(o => (
                  <OpportunityRow
                    key={o.id}
                    opportunity={o}
                    onOpen={() => setSelected(o)}
                    onDismiss={() => handleStatusChange(o.id, 'dismissed')}
                  />
                ))}
              </div>
              {opportunities.length < total && (
                <div className="flex flex-col items-center gap-2 mt-5">
                  <Button
                    variant="secondary"
                    size="sm"
                    label={loadingMore ? 'Loading...' : 'Load more'}
                    isLoading={loadingMore}
                    isDisabled={loadingMore}
                    onClick={loadMore}
                  />
                  <Text type="supporting" color="disabled">Showing {opportunities.length} of {total}</Text>
                </div>
              )}
            </>
          )}
        </>
      )}

      {selected && (
        <OpportunityDetailDrawer
          opportunity={selected}
          onClose={() => setSelected(null)}
          onStatusChange={(status) => handleStatusChange(selected.id, status)}
          onReplySent={(result) => handleReplySent(selected.id, result)}
        />
      )}
    </div>
  );
}
