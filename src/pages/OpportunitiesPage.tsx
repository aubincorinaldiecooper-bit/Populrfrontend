import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Inbox as InboxIcon, AlertCircle, ExternalLink, Copy, Check, Loader2, Send,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import PlatformDot from '../components/PlatformDot';
import OpportunityDetailDrawer from '../components/OpportunityDetailDrawer';
import {
  isBackendConfigured, fetchOpportunities, updateOpportunityStatus, fetchCapabilities,
} from '../lib/api';
import type { Opportunity, OpportunitySummary, OpportunityStatus, PlatformCapabilities } from '../lib/api';

// No explicit backend "initial sync status" exists for opportunities, so
// recency-of-connection is the most honest available proxy for "Populr
// hasn't plausibly had time to review this account's engagement yet".
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
// working queue stays calm without the client hiding rows the server counted.
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
  new: 'bg-secondary-fixed-dim',
  reviewed: 'bg-[#3b82f6]',
  responded: 'bg-[#0d9f6e]',
  dismissed: 'bg-outline',
};

const card = 'bg-surface-container-lowest border border-outline-variant rounded-xl';
const chipBase = 'px-3 py-1.5 rounded-full font-label text-label-sm uppercase transition-colors';
const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-primary text-on-primary px-4 py-2 text-body-md font-semibold hover:opacity-90 transition-opacity disabled:opacity-50';
const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-outline-variant text-primary px-4 py-2 text-body-md font-medium hover:bg-surface-container-high transition-colors disabled:opacity-50';
const ghostBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-body-md font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors';

function relativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function FilterChip({ active, accent, onClick, children }: {
  active: boolean; accent?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  const on = accent ? 'bg-secondary-container text-on-secondary-container' : 'bg-primary text-on-primary';
  return (
    <button
      onClick={onClick}
      className={`${chipBase} ${active ? on : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'}`}
    >
      {children}
    </button>
  );
}

function CopyResponseButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={secondaryBtn}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard access denied — not worth a hard error here.
        }
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy response'}
    </button>
  );
}

function EmptyState({ icon, title, body, children }: {
  icon: React.ReactNode; title: string; body: string; children?: React.ReactNode;
}) {
  return (
    <div className={`${card} p-10 text-center`}>
      <div className="w-12 h-12 rounded-full bg-surface-container-high mx-auto flex items-center justify-center mb-3">{icon}</div>
      <h3 className="font-display text-headline-md text-on-surface">{title}</h3>
      <p className="text-body-md text-on-surface-variant mt-1.5 max-w-sm mx-auto">{body}</p>
      {children && <div className="mt-5 flex justify-center">{children}</div>}
    </div>
  );
}

function OpportunityRow({ opportunity, onOpen, onDismiss }: {
  opportunity: Opportunity; onOpen: () => void; onDismiss: () => void;
}) {
  const canRespond = opportunity.availableActions.includes('reply') || opportunity.availableActions.includes('message');
  const canOpenOnPlatform = opportunity.availableActions.includes('open_on_platform');
  const canCopy = opportunity.availableActions.includes('copy_response') && !!opportunity.suggestedResponse;
  const openUrl = opportunity.interaction.externalUrl ?? opportunity.source?.externalUrl ?? null;
  const personLabel = opportunity.person.username ? `@${opportunity.person.username}` : opportunity.person.displayName || 'Unknown person';
  const confidence = opportunity.intent.confidence;

  return (
    <div className={`${card} p-4 hover:border-outline transition-colors`}>
      <button onClick={onOpen} className="w-full text-left flex items-start gap-3">
        {opportunity.person.avatarUrl ? (
          <img src={opportunity.person.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-surface-container-high flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-body-md font-semibold text-on-surface">{personLabel}</span>
            <PlatformDot platform={opportunity.platform} size={7} />
            <span className="font-label text-label-sm text-on-surface-variant capitalize">{opportunity.platform}</span>
            <span className="font-label text-label-sm text-on-surface-variant">· {relativeTime(opportunity.interaction.occurredAt)}</span>
            <span className={`inline-block w-2 h-2 rounded-full ml-auto flex-shrink-0 ${STATUS_DOT[opportunity.status]}`} title={opportunity.status} />
          </div>
          <p className="text-body-md text-on-surface mt-1.5 line-clamp-2">&ldquo;{opportunity.interaction.text}&rdquo;</p>
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full font-label text-label-sm uppercase bg-surface-container-high text-on-surface">
              {opportunity.intent.label}
            </span>
            {confidence !== null && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-12 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(confidence * 100)}%` }} />
                </span>
                <span className="font-label text-label-sm text-on-surface-variant">{Math.round(confidence * 100)}%</span>
              </span>
            )}
          </div>
          <p className="text-[13px] text-on-surface-variant mt-1.5">{opportunity.intent.reason}</p>
        </div>
      </button>

      <div className="flex items-center gap-2 mt-3 ml-12 flex-wrap">
        {canRespond && (
          <button onClick={onOpen} className={primaryBtn}><Send size={13} /> Reply</button>
        )}
        {!canRespond && canOpenOnPlatform && openUrl && (
          <a href={openUrl} target="_blank" rel="noreferrer" className={primaryBtn}>
            <ExternalLink size={13} /> Open on platform
          </a>
        )}
        {!canRespond && canCopy && opportunity.suggestedResponse && (
          <CopyResponseButton text={opportunity.suggestedResponse} />
        )}
        {!canRespond && !canOpenOnPlatform && !canCopy && (
          <button onClick={onOpen} className={secondaryBtn}>Review</button>
        )}
        {opportunity.status !== 'dismissed' && (
          <button onClick={onDismiss} className={ghostBtn}>Dismiss</button>
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
  // rule) — captured once at mount and refreshed periodically instead.
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
  // (comment replies + DMs) is still connected — just flagged.
  const limitedAccount = connectedAccounts.find(a => {
    const caps = capabilities[a.platform];
    return caps && (!caps.supportsCommentReplies || !caps.supportsDMs);
  });

  // Monotonic request id: only the newest in-flight fetch may write state.
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
    // Data fetch from the backend, not derived state.
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

  const filtersActive = !!platformFilter || !!intentFilter || statusFilter !== 'active';

  return (
    <div className="px-container-padding-mobile md:px-container-padding-desktop py-8 md:py-10 max-w-[1100px] mx-auto pb-24">
      <div className="flex items-start justify-between gap-4 mb-7">
        <div>
          <h1 className="font-display text-headline-md md:text-display-lg-mobile text-on-surface">Opportunities</h1>
          <p className="font-body text-body-md text-on-surface-variant mt-1.5 max-w-2xl">
            Populr reviews engagement across your connected accounts and surfaces the people showing real intent.
          </p>
        </div>
        <button onClick={load} disabled={loading} className={`${secondaryBtn} flex-shrink-0`}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {!backendConfigured && (
        <div className={`${card} p-4 mb-6 flex items-start gap-2.5`}>
          <AlertCircle size={16} className="text-on-surface-variant flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-body-md font-semibold text-on-surface">Populr isn’t connected to a backend yet</p>
            <p className="text-[13px] text-on-surface-variant mt-0.5">
              Set VITE_API_URL to your Populr backend to see real opportunities here. This page never shows placeholder data in its place.
            </p>
          </div>
        </div>
      )}

      {backendConfigured && (
        <>
          {/* Summary */}
          {summary && summary.total > 0 && (
            <div className="mb-5">
              <p className="text-body-lg font-semibold text-on-surface">
                {newCount > 0 ? `${newCount} new opportunit${newCount === 1 ? 'y' : 'ies'}` : 'No new opportunities since your last visit'}
              </p>
              {intentBreakdown.length > 0 && (
                <p className="text-body-md text-on-surface-variant mt-0.5">{intentBreakdown.join(' · ')}</p>
              )}
            </div>
          )}

          {limitedAccount && (
            <div className={`${card} p-4 mb-5 flex items-start gap-2.5`}>
              <AlertCircle size={16} className="text-on-surface-variant flex-shrink-0 mt-0.5" />
              <p className="text-body-md text-on-surface-variant">
                <span className="capitalize font-medium text-on-surface">{limitedAccount.platform}</span> is connected with limited access.
                Opportunity coverage depends on the permissions available for this account.
              </p>
            </div>
          )}

          {/* Filters */}
          <div className="space-y-2.5 mb-6">
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={!platformFilter} onClick={() => setPlatformFilter(undefined)}>All platforms</FilterChip>
              {PLATFORM_OPTIONS.map(p => (
                <FilterChip key={p.value} active={platformFilter === p.value} onClick={() => setPlatformFilter(p.value)}>{p.label}</FilterChip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map(s => (
                <FilterChip key={s.value} active={statusFilter === s.value} onClick={() => setStatusFilter(s.value)}>{s.label}</FilterChip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={!intentFilter} accent onClick={() => setIntentFilter(undefined)}>All intents</FilterChip>
              {INTENT_OPTIONS.map(i => (
                <FilterChip key={i.value} active={intentFilter === i.value} accent onClick={() => setIntentFilter(i.value)}>{i.label}</FilterChip>
              ))}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16 text-on-surface-variant gap-2">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-body-md">Looking for meaningful audience activity…</span>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="rounded-xl border border-error/40 bg-error-container/40 p-5">
              <p className="flex items-center gap-2 text-body-md font-semibold text-on-error-container">
                <AlertCircle size={16} /> Couldn’t load opportunities
              </p>
              <p className="text-[14px] text-on-error-container mt-1">{error}</p>
              <button onClick={load} className={`${secondaryBtn} mt-3`}>Try again</button>
            </div>
          )}

          {/* Empty states — an account-list load failure is distinct from a
              genuine zero-accounts. This takes priority over the three states
              below, all of which assume the account list itself loaded. */}
          {!loading && !error && !accountsLoading && total === 0 && accountsError && !filtersActive && (
            <EmptyState
              icon={<AlertCircle size={22} className="text-error" />}
              title="Couldn’t check your connected accounts"
              body="Populr couldn’t confirm which accounts are connected, so it can’t tell whether there’s anything to show here yet."
            >
              <button onClick={refreshAccounts} className={secondaryBtn}><RefreshCw size={13} /> Try again</button>
            </EmptyState>
          )}

          {!loading && !error && !accountsLoading && !accountsError && total === 0 && !hasConnectedAccounts && !filtersActive && (
            <EmptyState
              icon={<InboxIcon size={22} className="text-on-surface-variant" />}
              title="Connect your first account"
              body="Connect a social account so Populr can begin reviewing engagement for meaningful opportunities."
            >
              <button onClick={() => navigate('/connections')} className={primaryBtn}>Connect an account</button>
            </EmptyState>
          )}

          {!loading && !error && !accountsLoading && !accountsError && total === 0 && hasConnectedAccounts && recentlyConnected && !filtersActive && (
            <EmptyState
              icon={<InboxIcon size={22} className="text-on-surface-variant" />}
              title="Reviewing your engagement"
              body="Populr is reviewing recent activity from your connected accounts. Opportunities will appear here when meaningful intent is found."
            >
              <button onClick={load} className={secondaryBtn}><RefreshCw size={13} /> Refresh</button>
            </EmptyState>
          )}

          {!loading && !error && !accountsLoading && !accountsError && total === 0 && hasConnectedAccounts && !recentlyConnected && !filtersActive && (
            <EmptyState
              icon={<InboxIcon size={22} className="text-on-surface-variant" />}
              title="No opportunities yet"
              body="Your accounts are connected. New high-intent engagement will appear here when Populr finds something worth your attention."
            >
              <div className="flex flex-col items-center gap-3">
                <button onClick={load} className={secondaryBtn}><RefreshCw size={13} /> Refresh</button>
                <button onClick={() => navigate('/connections')} className="text-[13px] text-on-surface-variant underline hover:text-primary">View connected accounts</button>
              </div>
            </EmptyState>
          )}

          {!loading && !error && total === 0 && filtersActive && (
            <EmptyState
              icon={<InboxIcon size={22} className="text-on-surface-variant" />}
              title="Nothing matches these filters"
              body="Try a different platform, intent, or status."
            />
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
                  <button onClick={loadMore} disabled={loadingMore} className={secondaryBtn}>
                    {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                  <span className="font-label text-label-sm text-on-surface-variant">Showing {opportunities.length} of {total}</span>
                </div>
              )}
            </>
          )}
        </>
      )}

      <AnimatePresence>
        {selected && (
          <OpportunityDetailDrawer
            key={selected.id}
            opportunity={selected}
            onClose={() => setSelected(null)}
            onStatusChange={(status) => handleStatusChange(selected.id, status)}
            onReplySent={(result) => handleReplySent(selected.id, result)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
