import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { RefreshCw, Inbox as InboxIcon, AlertCircle, ExternalLink, Copy, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/PageHeader';
import PlatformDot from '../components/PlatformDot';
import OpportunityDetailDrawer from '../components/OpportunityDetailDrawer';
import { ListSkeleton } from '../components/Skeleton';
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

/** Shared pill styling for the three filter rows. */
function FilterPill({ active, accent = false, onClick, children }: {
  active: boolean; accent?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  const activeClasses = accent
    ? 'bg-[rgba(200,255,61,0.15)] text-[#5C6B00]'
    : 'bg-[#111111] text-white';
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${active ? activeClasses : 'bg-[#FAFAF8] text-[#6B6B6B] hover:bg-[#F0EFEA]'}`}
    >
      {children}
    </button>
  );
}

function CopyResponseButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async e => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard access denied — not worth a hard error here.
        }
      }}
      className="pop-btn-tertiary text-[12px] py-1.5 px-3"
    >
      {copied ? <><Check size={13} />Copied</> : <><Copy size={13} />Copy response</>}
    </button>
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
    <div
      role="button"
      tabIndex={0}
      aria-label={`Opportunity from ${personLabel}`}
      onClick={onOpen}
      onKeyDown={e => {
        // Only keys pressed on the row itself open the drawer. A keydown on
        // a nested action (Dismiss, Copy, Open on platform) bubbles up here,
        // and preventDefault would cancel that button's own Enter/Space
        // activation while hijacking it into opening the drawer.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
      className="pop-card pop-card-hover p-4 cursor-pointer focus-visible:ring-2 focus-visible:ring-chartreuse/40 outline-none"
    >
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
          <button onClick={e => { e.stopPropagation(); onOpen(); }} className="pop-btn-primary text-[12px] py-1.5 px-3">
            Reply
          </button>
        )}
        {!canRespond && canOpenOnPlatform && openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="pop-btn-primary text-[12px] py-1.5 px-3 inline-flex items-center gap-1.5"
          >
            <ExternalLink size={13} />Open on platform
          </a>
        )}
        {!canRespond && canCopy && opportunity.suggestedResponse && (
          <CopyResponseButton text={opportunity.suggestedResponse} />
        )}
        {!canRespond && !canOpenOnPlatform && !canCopy && (
          <button onClick={e => { e.stopPropagation(); onOpen(); }} className="pop-btn-tertiary text-[12px] py-1.5 px-3">
            Review
          </button>
        )}
        {opportunity.status !== 'dismissed' && (
          <button onClick={e => { e.stopPropagation(); onDismiss(); }} className="pop-btn-ghost text-[12px] py-1.5 px-3">
            Dismiss
          </button>
        )}
      </div>
    </div>
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
          <button onClick={load} disabled={loading} className="pop-btn-ghost text-[12px] py-1.5 px-3 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh
          </button>
        }
      />

      {!backendConfigured && (
        <div className="pop-card p-6 mb-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to a backend yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Populr can&apos;t reach its server, so your opportunities can&apos;t be loaded right now. This page never shows placeholder data in their place.
            </p>
          </div>
        </div>
      )}

      {backendConfigured && (
        <>
          {/* Summary */}
          {summary && summary.total > 0 && (
            <div className="mb-5">
              <p className="text-[14px] font-bold text-[#111111]">
                {newCount > 0 ? `${newCount} new opportunit${newCount === 1 ? 'y' : 'ies'}` : 'No new opportunities since your last visit'}
              </p>
              {intentBreakdown.length > 0 && (
                <p className="text-[12px] text-[#6B6B6B] mt-0.5">{intentBreakdown.join(' · ')}</p>
              )}
            </div>
          )}

          {limitedAccount && (
            <div className="pop-card p-4 mb-5 flex items-start gap-3">
              <AlertCircle size={16} className="text-[#3B82F6] flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-[#6B6B6B]">
                <span className="capitalize font-medium text-[#111111]">{limitedAccount.platform}</span> is connected with limited access.
                Opportunity coverage depends on the permissions available for this account.
              </p>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4 mb-5">
            <div className="flex flex-wrap gap-1.5">
              <FilterPill active={!platformFilter} onClick={() => setPlatformFilter(undefined)}>All platforms</FilterPill>
              {PLATFORM_OPTIONS.map(p => (
                <FilterPill key={p.value} active={platformFilter === p.value} onClick={() => setPlatformFilter(p.value)}>
                  {p.label}
                </FilterPill>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map(s => (
                <FilterPill key={s.value} active={statusFilter === s.value} onClick={() => setStatusFilter(s.value)}>
                  {s.label}
                </FilterPill>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-6">
            <FilterPill accent active={!intentFilter} onClick={() => setIntentFilter(undefined)}>All intents</FilterPill>
            {INTENT_OPTIONS.map(i => (
              <FilterPill key={i.value} accent active={intentFilter === i.value} onClick={() => setIntentFilter(i.value)}>
                {i.label}
              </FilterPill>
            ))}
          </div>

          {/* Loading: rows shaped like the content that's arriving, same as
              every other page since the skeleton pass. */}
          {loading && <ListSkeleton count={4} label="Looking for meaningful audience activity" />}

          {/* Error */}
          {!loading && error && (
            <div className="pop-card p-4 mb-5 flex items-center gap-3">
              <AlertCircle size={16} className="text-[#DC2626] flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-[#111111]">Couldn&apos;t load opportunities</p>
                <p className="text-[12px] text-[#6B6B6B] mt-0.5">{error}</p>
              </div>
              <button onClick={load} className="pop-btn-tertiary text-[12px] py-1.5 px-3 flex-shrink-0">Try again</button>
            </div>
          )}

          {/* Empty states */}
          {/* An account-list load failure is distinct from a genuine zero
              accounts — conflating them told an already-connected user
              whose GET /api/accounts happened to fail to "connect your
              first account", which is both wrong and not actionable. This
              takes priority over the three states below, all of which
              assume the account list itself loaded successfully. */}
          {!loading && !error && !accountsLoading && total === 0 && accountsError && !platformFilter && !intentFilter && statusFilter === 'active' && (
            <div className="pop-card p-8 text-center">
              <AlertCircle size={24} className="text-[#D97706] mx-auto mb-3" />
              <p className="text-[14px] font-bold text-[#111111]">Couldn&apos;t check your connected accounts</p>
              <p className="text-[12px] text-[#6B6B6B] mt-1.5 max-w-sm mx-auto">
                Populr couldn&apos;t confirm which accounts are connected, so it can&apos;t tell whether there&apos;s anything to show here yet.
              </p>
              <button onClick={refreshAccounts} className="pop-btn-tertiary text-[12px] py-1.5 px-3 mt-4 inline-flex">
                <RefreshCw size={13} />Try again
              </button>
            </div>
          )}

          {!loading && !error && !accountsLoading && !accountsError && total === 0 && !hasConnectedAccounts && !platformFilter && !intentFilter && statusFilter === 'active' && (
            <div className="pop-card p-8 text-center">
              <InboxIcon size={24} className="text-[#9B9B8F] mx-auto mb-3" />
              <p className="text-[14px] font-bold text-[#111111]">Connect your first account</p>
              <p className="text-[12px] text-[#6B6B6B] mt-1.5 max-w-sm mx-auto">
                Connect a social account so Populr can begin reviewing engagement for meaningful opportunities.
              </p>
              <button onClick={() => navigate('/channels')} className="pop-btn-primary mt-4 inline-flex">
                Connect an account
              </button>
            </div>
          )}

          {!loading && !error && !accountsLoading && !accountsError && total === 0 && hasConnectedAccounts && recentlyConnected && !platformFilter && !intentFilter && statusFilter === 'active' && (
            <div className="pop-card p-8 text-center">
              <InboxIcon size={24} className="text-[#9B9B8F] mx-auto mb-3" />
              <p className="text-[14px] font-bold text-[#111111]">Reviewing your engagement</p>
              <p className="text-[12px] text-[#6B6B6B] mt-1.5 max-w-sm mx-auto">
                Populr is reviewing recent activity from your connected accounts. Opportunities will appear here when meaningful intent is found.
              </p>
              <button onClick={load} className="pop-btn-tertiary text-[12px] py-1.5 px-3 mt-4 inline-flex">
                <RefreshCw size={13} />Refresh
              </button>
            </div>
          )}

          {!loading && !error && !accountsLoading && !accountsError && total === 0 && hasConnectedAccounts && !recentlyConnected && !platformFilter && !intentFilter && statusFilter === 'active' && (
            <div className="pop-card p-8 text-center">
              <InboxIcon size={24} className="text-[#9B9B8F] mx-auto mb-3" />
              <p className="text-[14px] font-bold text-[#111111]">No opportunities yet</p>
              <p className="text-[12px] text-[#6B6B6B] mt-1.5 max-w-sm mx-auto">
                Your accounts are connected. New high-intent engagement will appear here when Populr finds something worth your attention.
              </p>
              <div className="mt-4">
                <button onClick={load} className="pop-btn-tertiary text-[12px] py-1.5 px-3 inline-flex">
                  <RefreshCw size={13} />Refresh
                </button>
              </div>
              <button
                onClick={() => navigate('/channels')}
                className="text-[12px] text-[#6B6B6B] underline underline-offset-2 hover:text-[#111111] mt-3"
              >
                View connected accounts
              </button>
            </div>
          )}

          {!loading && !error && total === 0 && (platformFilter || intentFilter || statusFilter !== 'active') && (
            <div className="pop-card p-8 text-center">
              <InboxIcon size={24} className="text-[#9B9B8F] mx-auto mb-3" />
              <p className="text-[14px] font-bold text-[#111111]">Nothing matches these filters</p>
              <p className="text-[12px] text-[#6B6B6B] mt-1.5">Try a different platform, intent, or status.</p>
            </div>
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
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="pop-btn-tertiary text-[12px] py-1.5 px-4 disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                  <p className="text-[11px] text-[#9B9B8F]">Showing {opportunities.length} of {total}</p>
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
