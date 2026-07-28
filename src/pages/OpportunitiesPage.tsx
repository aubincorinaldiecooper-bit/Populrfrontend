import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Loader2, RefreshCw, Inbox as InboxIcon, AlertCircle, ExternalLink, Copy, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/PageHeader';
import PlatformDot from '../components/PlatformDot';
import OpportunityDetailDrawer from '../components/OpportunityDetailDrawer';
import {
  isBackendConfigured, fetchOpportunities, updateOpportunityStatus,
} from '../lib/api';
import type { Opportunity, OpportunitySummary, OpportunityStatus } from '../lib/api';

const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'linkedin', label: 'LinkedIn' },
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

const STATUS_OPTIONS: { value: 'all' | OpportunityStatus; label: string }[] = [
  { value: 'all', label: 'Active' },
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
    <button
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard access denied — not worth a hard error here.
        }
      }}
      className="pop-btn-secondary text-[12px] py-1.5 px-3 flex-shrink-0"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied' : 'Copy response'}
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

  return (
    <div className="pop-card p-4 pop-card-hover cursor-pointer" onClick={onOpen}>
      <div className="flex items-start gap-3">
        {opportunity.person.avatarUrl ? (
          <img src={opportunity.person.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-[#FAFAF8] flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[#111111]">
              {opportunity.person.username ? `@${opportunity.person.username}` : opportunity.person.displayName || 'Unknown person'}
            </span>
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

      <div className="flex items-center gap-2 mt-3 ml-12 flex-wrap" onClick={(e) => e.stopPropagation()}>
        {canRespond && (
          <button onClick={onOpen} className="pop-btn-primary text-[12px] py-1.5 px-3">
            Reply
          </button>
        )}
        {!canRespond && canOpenOnPlatform && openUrl && (
          <a href={openUrl} target="_blank" rel="noreferrer" className="pop-btn-primary text-[12px] py-1.5 px-3">
            <ExternalLink size={13} /> Open on platform
          </a>
        )}
        {!canRespond && canCopy && opportunity.suggestedResponse && (
          <CopyResponseButton text={opportunity.suggestedResponse} />
        )}
        {!canRespond && !canOpenOnPlatform && !canCopy && (
          <button onClick={onOpen} className="pop-btn-secondary text-[12px] py-1.5 px-3">Review</button>
        )}
        {opportunity.status !== 'dismissed' && (
          <button onClick={onDismiss} className="pop-btn-ghost text-[12px] py-1.5 px-3">Dismiss</button>
        )}
      </div>
    </div>
  );
}

export default function OpportunitiesPage() {
  const { showToast } = useApp();
  const backendConfigured = isBackendConfigured();

  const [platformFilter, setPlatformFilter] = useState<string | undefined>(undefined);
  const [intentFilter, setIntentFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<'all' | OpportunityStatus>('all');

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [summary, setSummary] = useState<OpportunitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!backendConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOpportunities({
        platform: platformFilter,
        intent: intentFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        limit: 100,
      });
      setOpportunities(result.opportunities);
      setSummary(result.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load opportunities right now.');
    } finally {
      setLoading(false);
    }
  }, [backendConfigured, platformFilter, intentFilter, statusFilter]);

  useEffect(() => {
    // Data fetch from the backend, not derived state — the setState calls
    // inside `load` are the effect synchronizing with an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Default "Active" view hides dismissed items so the queue stays calm;
  // they remain fully reachable via the Dismissed status filter above.
  const visibleOpportunities = statusFilter === 'all'
    ? opportunities.filter(o => o.status !== 'dismissed')
    : opportunities;

  const selected = selectedId ? opportunities.find(o => o.id === selectedId) ?? null : null;

  async function handleStatusChange(id: string, status: 'reviewed' | 'responded' | 'dismissed') {
    try {
      const updated = await updateOpportunityStatus(id, status);
      setOpportunities(prev => prev.map(o => (o.id === id ? updated : o)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update this opportunity.', 'error');
    }
  }

  function handleReplySent(id: string, result: { sentText: string; channel: string }) {
    showToast(`Reply sent on ${result.channel}.`, 'success');
    setOpportunities(prev => prev.map(o => (o.id === id ? { ...o, status: 'responded' } : o)));
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
          <button onClick={load} className="pop-btn-ghost text-[12px] py-2" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {!backendConfigured && (
        <div className="pop-card p-6 mb-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to a backend yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Set <code className="bg-[#FAFAF8] px-1 py-0.5 rounded">VITE_API_URL</code> to your Populr backend to see real opportunities here. This page never shows placeholder data in its place.
            </p>
          </div>
        </div>
      )}

      {backendConfigured && (
        <>
          {/* Summary */}
          {summary && summary.total > 0 && (
            <div className="mb-5">
              <p className="text-[14px] font-semibold text-[#111111]">
                {newCount > 0 ? `${newCount} new opportunit${newCount === 1 ? 'y' : 'ies'}` : 'No new opportunities since your last visit'}
              </p>
              {intentBreakdown.length > 0 && (
                <p className="text-[12px] text-[#6B6B6B] mt-0.5">{intentBreakdown.join(' · ')}</p>
              )}
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4 mb-5">
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
            <div className="flex items-center justify-center py-16 text-[#6B6B6B]">
              <Loader2 size={20} className="animate-spin mr-2" /> Looking for meaningful audience activity...
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="pop-card p-6 flex items-start gap-3">
              <AlertCircle size={18} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-[#111111]">Couldn&apos;t load opportunities</p>
                <p className="text-[12px] text-[#6B6B6B] mt-1">{error}</p>
                <button onClick={load} className="pop-btn-secondary text-[12px] py-1.5 px-3 mt-3">Try again</button>
              </div>
            </div>
          )}

          {/* Empty states */}
          {!loading && !error && summary && summary.total === 0 && !platformFilter && !intentFilter && (
            <div className="pop-card p-8 text-center">
              <InboxIcon size={24} className="text-[#9B9B8F] mx-auto mb-3" />
              <p className="text-[14px] font-semibold text-[#111111]">No opportunities yet</p>
              <p className="text-[12px] text-[#6B6B6B] mt-1.5 max-w-sm mx-auto">
                Once you connect an account, Populr reviews your engagement and surfaces people showing real intent here. This can mean no engagement has synced yet, or nothing meaningful has been found so far.
              </p>
              <Link to="/connections" className="pop-btn-primary text-[12px] py-2 px-4 mt-4 inline-flex">Connect an account</Link>
            </div>
          )}

          {!loading && !error && summary && summary.total > 0 && visibleOpportunities.length === 0 && (
            <div className="pop-card p-8 text-center">
              <InboxIcon size={24} className="text-[#9B9B8F] mx-auto mb-3" />
              <p className="text-[14px] font-semibold text-[#111111]">Nothing matches these filters</p>
              <p className="text-[12px] text-[#6B6B6B] mt-1.5">Try a different platform, intent, or status.</p>
            </div>
          )}

          {/* Rows */}
          {!loading && !error && visibleOpportunities.length > 0 && (
            <div className="space-y-2.5">
              {visibleOpportunities.map(o => (
                <OpportunityRow
                  key={o.id}
                  opportunity={o}
                  onOpen={() => setSelectedId(o.id)}
                  onDismiss={() => handleStatusChange(o.id, 'dismissed')}
                />
              ))}
            </div>
          )}
        </>
      )}

      {selected && (
        <OpportunityDetailDrawer
          opportunity={selected}
          onClose={() => setSelectedId(null)}
          onStatusChange={(status) => handleStatusChange(selected.id, status)}
          onReplySent={(result) => handleReplySent(selected.id, result)}
        />
      )}
    </div>
  );
}
