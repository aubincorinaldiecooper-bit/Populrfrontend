import { useCallback, useEffect, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router';
import {
  Zap, ArrowRight, AlertCircle, Inbox as InboxIcon, Plus, Pause,
  TrendingUp, RefreshCw, MessageCircleReply, Eye,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import PlatformDot from '../components/PlatformDot';
import { StatGridSkeleton, ListSkeleton } from '../components/Skeleton';
import { isBackendConfigured, fetchDashboard } from '../lib/api';
import type { DashboardData } from '../lib/api';
import { platformMeta } from '../lib/platformMeta';
import { useCreateAutomation } from '../context/CreateAutomationContext';

/**
 * Home answers three questions, fast, in this order:
 *
 *   1. WHAT SHOULD I DO?      — one attention banner, straight into the
 *      Inbox conversations that actually need a human.
 *   2. IS POPULR WORKING?     — four marketer tiles (live automations,
 *      reply rate, audience growth, read rate) and per-automation
 *      performance, each row wearing the account it actually runs on.
 *   3. WHAT NEXT?             — Create an automation, the page's one
 *      primary action, opening the creation experience directly.
 *
 * Honesty rules baked in: a metric a channel can't measure is OMITTED for
 * that row — never rendered as 0%. Nothing here re-states the same number
 * under two names, and nothing leads with lead-scoring vocabulary.
 */

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Rounded percentage — callers only invoke this when the denominator is
 *  real, so "—" never masquerades as measurement. */
function pct(numerator: number, denominator: number): string {
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function Tile({ icon, value, label, sub, to }: {
  icon: React.ReactNode; value: string; label: string; sub?: string; to?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[#9B9B8F] mb-2">{icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <p className="font-geist-mono font-bold text-2xl text-[#111111]">{value}</p>
      {sub && <p className="text-[11px] text-[#9B9B8F] mt-0.5">{sub}</p>}
    </>
  );
  return to ? (
    <Link to={to} className="pop-card pop-card-hover p-4 block">{body}</Link>
  ) : (
    <div className="pop-card p-4">{body}</div>
  );
}

/** "Booking inquiries · Instagram · @aubin · Live · the numbers that are
 *  real for that channel" — one compact row per automation. */
function AutomationRow({ row }: { row: DashboardData['automationPerformance'][number] }) {
  const facts: string[] = [];
  if (row.replied && row.replied.messaged > 0) {
    facts.push(`${pct(row.replied.contacts, row.replied.messaged)} replied`);
  }
  if (row.read && row.read.sent > 0) {
    facts.push(`${pct(row.read.read, row.read.sent)} read`);
  }
  return (
    <Link
      to={`/automations/${row.id}`}
      className="flex items-center gap-3 rounded-xl px-2 py-2.5 -mx-2 hover:bg-[#FAFAF8] transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[13.5px] font-semibold text-[#111111] truncate">{row.name}</p>
          {row.status === 'live' ? (
            <span className="flex-shrink-0 rounded-full bg-chartreuse/25 px-2 py-0.5 text-[10px] font-semibold text-[#3F5212]">Live</span>
          ) : (
            <span className="flex-shrink-0 rounded-full bg-[#F0EDE8] px-2 py-0.5 text-[10px] font-medium text-[#8A857E]">Paused</span>
          )}
        </div>
        {row.platform && (
          <div className="flex items-center gap-1.5 mt-1">
            <PlatformDot platform={row.platform} size={6} />
            <p className="text-[11px] text-[#9B9B8F]">
              {platformMeta(row.platform).name}
              {row.account?.handle ? ` · ${row.account.handle}` : row.account?.displayName ? ` · ${row.account.displayName}` : ''}
            </p>
          </div>
        )}
        <p className="text-[11.5px] text-[#6B6B6B] mt-1.5">
          {facts.length > 0 ? facts.join(' · ') : 'No messages sent yet'}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-geist-mono font-bold text-[15px] text-[#111111]">{row.audience.toLocaleString()}</p>
        <p className="text-[10px] text-[#9B9B8F]">audience</p>
        {row.audienceGrowth30d > 0 && (
          <p className="text-[10.5px] font-medium text-[#5F8B18] mt-0.5">+{row.audienceGrowth30d} this month</p>
        )}
      </div>
    </Link>
  );
}

function activityLine(event: DashboardData['recentActivity'][number]): string {
  switch (event.kind) {
    case 'went_live':
      return `${event.automationName} went live${event.accountHandle ? ` on ${event.accountHandle}` : ''}`;
    case 'audience_joined':
      return `${event.count} ${event.count === 1 ? 'person' : 'people'} entered ${event.automationName} this week`;
    case 'member_joined':
      return `${event.email} joined your workspace`;
    case 'conversation_started':
      return `${event.contactHandle ?? event.contactName ?? 'Someone'} started a conversation`;
    case 'messages_sent':
      return `${event.automationName} sent ${event.count} message${event.count === 1 ? '' : 's'} today`;
  }
}

export default function HomePage() {
  const navigate = useNavigate();
  const { beginCreateAutomation } = useCreateAutomation();
  const backendConfigured = isBackendConfigured();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(backendConfigured);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!backendConfigured) return;
    setLoading(true);
    setError(null);
    fetchDashboard()
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load your dashboard.'))
      .finally(() => setLoading(false));
  }, [backendConfigured]);

  useEffect(() => {
    // Data fetch from the backend, not derived state — see ContactsPage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (!backendConfigured) {
    return (
      <div className="pop-page max-w-[900px]">
        <PageHeader title="Home" subtitle="Your automations are working while you're not." />
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to its server yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Populr can&apos;t reach its server, so your dashboard can&apos;t be loaded right now.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totals = data?.totals;
  // Nothing is set up or happening yet: lead with getting started rather
  // than a wall of zeros pretending to be analytics.
  const gettingStarted = !!data && totals!.activeAutomations === 0 && totals!.contacts === 0;

  return (
    <div className="pop-page max-w-[900px]">
      <PageHeader
        title="Home"
        subtitle="Your automations are working while you're not."
        action={
          <Button onClick={beginCreateAutomation}>
            <Plus size={15} />Create an automation
          </Button>
        }
      />

      {loading && (
        <div className="space-y-4">
          <StatGridSkeleton count={4} label="Loading your dashboard" />
          <ListSkeleton count={2} compact label="Loading your activity" />
        </div>
      )}

      {!loading && error && (
        <div className="pop-card p-4 flex items-center gap-3">
          <AlertCircle size={16} className="text-[#DC2626] flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[#111111]">Couldn&apos;t load your dashboard</p>
            <p className="text-[12px] text-[#6B6B6B] mt-0.5">{error}</p>
          </div>
          <Button variant="outline" onClick={load} className="text-[12px] py-1.5 px-3 flex-shrink-0">
            <RefreshCw size={13} />Retry
          </Button>
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-5">
          {/* Paused: the single most important status there is — nothing
              below it is happening while this banner shows. A platform-level
              operator stop isn't the creator's to undo, so it doesn't route
              to Settings (which would show "Running" and contradict this). */}
          {data.globallyPaused && (
            <div className="pop-card p-4 flex items-center gap-3 border-l-4 border-[#D97706]">
              <Pause size={16} className="text-[#D97706] flex-shrink-0" />
              <p className="text-[13px] text-[#111111] flex-1">
                {data.pauseScope === 'platform'
                  ? 'Automations are paused platform-wide by Populr right now — nothing is being sent. This will resume automatically.'
                  : 'Your automations are paused — nothing is being sent automatically.'}
              </p>
              {data.pauseScope !== 'platform' && (
                <Link
                  to="/settings"
                  className={cn(buttonVariants({ variant: 'outline' }), 'text-[12px] py-1.5 px-3 flex-shrink-0')}
                >
                  Go to Settings
                </Link>
              )}
            </div>
          )}

          {/* ATTENTION — the one place this count appears. Opens Inbox
              already filtered to the conversations that need a human. */}
          {totals!.needsReply > 0 && (
            <button
              onClick={() => navigate('/inbox?f=needs-you')}
              className="pop-card pop-card-hover p-4 w-full flex items-center gap-3 text-left ring-2 ring-chartreuse"
            >
              <div className="w-9 h-9 rounded-xl bg-chartreuse flex items-center justify-center flex-shrink-0">
                <InboxIcon size={16} className="text-[#111111]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#111111]">
                  {totals!.needsReply} conversation{totals!.needsReply === 1 ? '' : 's'} need{totals!.needsReply === 1 ? 's' : ''} you
                </p>
                <p className="text-[12px] text-[#6B6B6B]">
                  Questions your automations handed over to you.
                </p>
              </div>
              <ArrowRight size={16} className="text-[#9B9B8F] flex-shrink-0" />
            </button>
          )}

          {gettingStarted ? (
            /* First-run: one honest path forward instead of empty analytics. */
            <div className="pop-card p-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-chartreuse flex items-center justify-center mx-auto mb-4">
                <Zap size={22} className="text-[#111111]" />
              </div>
              <p className="text-[16px] font-bold text-[#111111]">Set up your first automation</p>
              <p className="text-[13px] text-[#6B6B6B] mt-2 max-w-md mx-auto leading-relaxed">
                Describe it in your own words — Populr answers comments and DMs for you,
                sends your links, and turns engagement into an audience.
              </p>
              <Button onClick={beginCreateAutomation} className="mt-5">
                <Plus size={15} />Create an automation
              </Button>
              {data.connectedAccounts.length === 0 && (
                <p className="text-[12px] text-[#9B9B8F] mt-4">
                  You&apos;ll connect an account along the way, or{' '}
                  <Link to="/channels" className="underline underline-offset-2 hover:text-[#111111]">do it now</Link>.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* PERFORMANCE — four marketer tiles. Tiles whose metric can't
                  be measured for this workspace are omitted, never zeroed. */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Tile
                  to="/automations"
                  icon={<Zap size={13} />}
                  value={String(totals!.activeAutomations)}
                  label="Live automations"
                />
                {data.engagement && data.engagement.contactsDmd > 0 && (
                  <Tile
                    icon={<MessageCircleReply size={13} />}
                    value={pct(data.engagement.contactsReplied, data.engagement.contactsDmd)}
                    label="Reply rate"
                    sub={`of ${data.engagement.contactsDmd} ${data.engagement.contactsDmd === 1 ? 'person' : 'people'} messaged`}
                  />
                )}
                <Tile
                  to="/contacts"
                  icon={<TrendingUp size={13} />}
                  value={`+${data.performance.audienceGrowth30d}`}
                  label="Audience growth"
                  sub="this month"
                />
                {data.performance.readRate && (
                  <Tile
                    icon={<Eye size={13} />}
                    value={pct(data.performance.readRate.read, data.performance.readRate.sent)}
                    label="Read rate"
                    sub={`of ${data.performance.readRate.sent} DM${data.performance.readRate.sent === 1 ? '' : 's'} sent`}
                  />
                )}
              </div>

              {/* AUTOMATION PERFORMANCE — per automation, from the account
                  it actually runs on. */}
              {data.automationPerformance.length > 0 && (
                <section className="pop-card p-5">
                  <h2 className="pop-card-title mb-1">Automation performance</h2>
                  <p className="text-[12px] text-[#6B6B6B] mb-3">
                    Only what each channel can really measure — nothing padded with zeros.
                  </p>
                  <div className="divide-y divide-[#F0EDE8]">
                    {data.automationPerformance.map(row => (
                      <AutomationRow key={row.id} row={row} />
                    ))}
                  </div>
                  <div className="mt-3 text-right">
                    <Link to="/automations" className="text-[12px] text-[#6B6B6B] hover:text-[#111111] inline-flex items-center gap-1">
                      View all automations <ArrowRight size={12} />
                    </Link>
                  </div>
                </section>
              )}

              {/* RECENT — a few meaningful things, quietly. */}
              {data.recentActivity.length > 0 && (
                <section className="pop-card p-5">
                  <h2 className="pop-card-title mb-3">Recent</h2>
                  <div className="space-y-2.5">
                    {data.recentActivity.map((event, i) => (
                      <div key={`${event.kind}-${i}`} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-chartreuse" />
                        <p className="text-[12px] text-[#6B6B6B] flex-1 leading-relaxed">
                          {activityLine(event)}
                        </p>
                        <span className="text-[11px] text-[#9B9B8F] flex-shrink-0">{timeAgo(event.at)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
