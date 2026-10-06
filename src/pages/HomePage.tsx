import { Card, cardVariants } from '@/components/ui/card';
import { Page } from '@/components/ui/page';
import { useCallback, useEffect, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Link } from 'react-router';
import {
  Zap, AlertCircle, Plus, Pause, TrendingUp, RefreshCw,
  MessageCircleReply, Eye,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import PlatformDot from '../components/PlatformDot';
import { StatGridSkeleton, ListSkeleton } from '../components/Skeleton';
import { isBackendConfigured, fetchDashboard } from '../lib/api';
import type { DashboardData } from '../lib/api';
import { platformMeta } from '../lib/platformMeta';
import { useCreateAutomation } from '../context/CreateAutomationContext';
import { useAuth } from '../context/AuthContext';
import { useConversationsQuery, useInboxWaiting } from '../components/inbox/conversations';
import { timeAgo } from '../lib/timeAgo';

/**
 * Home answers three questions, fast, in this order:
 *
 *   1. WHAT SHOULD I DO?      — conversations that need a human.
 *   2. IS POPULR WORKING?     — running automations and measured results.
 *
 * Honesty rules baked in: a metric a channel can't measure is OMITTED for
 * that row — never rendered as 0%. Nothing here re-states the same number
 * under two names, and nothing leads with lead-scoring vocabulary.
 */

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
      <div className="mb-2 flex items-center gap-1.5 text-muted-foreground">{icon}
        <span className="text-[12px]">{label}</span>
      </div>
      <p className="font-body text-[26px] font-semibold leading-8 tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </>
  );
  return to ? (
    <Link to={to} className={cn(cardVariants({ interactive: true }), "block p-4")}>{body}</Link>
  ) : (
    <Card className="p-4">{body}</Card>
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
      className="flex items-center gap-3 rounded-xl px-2 py-2.5 -mx-2 transition-colors hover:bg-muted"
    >
      <div className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
        row.status === 'live' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
      )}>
        {row.status === 'live' ? <Zap size={16} /> : <Pause size={15} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13.5px] font-semibold text-foreground">{row.name}</p>
          {row.status === 'live' ? (
            <span className="flex-shrink-0 rounded-full bg-chartreuse/25 px-2 py-0.5 text-[10px] font-semibold text-foreground">Live</span>
          ) : (
            <span className="flex-shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Paused</span>
          )}
        </div>
        {row.platform && (
          <div className="flex items-center gap-1.5 mt-1">
            <PlatformDot platform={row.platform} size={6} />
            <p className="text-[11px] text-muted-foreground">
              {platformMeta(row.platform).name}
              {row.account?.handle ? ` · ${row.account.handle}` : row.account?.displayName ? ` · ${row.account.displayName}` : ''}
            </p>
          </div>
        )}
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">
          {facts.length > 0 ? facts.join(' · ') : 'No messages sent yet'}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-body text-[15px] font-semibold tabular-nums text-foreground">{row.audience.toLocaleString()}</p>
        <p className="text-[10px] text-muted-foreground">audience</p>
        {row.audienceGrowth30d > 0 && (
          <p className="mt-0.5 text-[10.5px] font-medium text-success">+{row.audienceGrowth30d} this month</p>
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
  const { beginCreateAutomation } = useCreateAutomation();
  const { user } = useAuth();
  const conversationsQuery = useConversationsQuery('');
  const { count: inboxWaitingCount } = useInboxWaiting();
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
      <Page className="max-w-[900px]">
        <PageHeader title="Home" subtitle="Your automations are working while you're not." />
        <Card className="p-6 flex items-start gap-3">
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-warning" />
          <div>
            <p className="text-[13px] font-semibold text-foreground">Populr isn&apos;t connected to its server yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Populr can&apos;t reach its server, so your dashboard can&apos;t be loaded right now.
            </p>
          </div>
        </Card>
      </Page>
    );
  }

  const totals = data?.totals;
  const now = new Date();
  const hour = now.getHours();
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const waitingConversations = (conversationsQuery.data?.conversations ?? [])
    .filter(conversation => conversation.waiting > 0)
    .slice(0, 3);
  const showWaitingSection = conversationsQuery.data !== undefined && inboxWaitingCount > 0;
  // Nothing is set up or happening yet: lead with getting started rather
  // than a wall of zeros pretending to be analytics.
  const gettingStarted = !!data && totals!.activeAutomations === 0 && totals!.contacts === 0;

  return (
    <Page className="max-w-[900px]">
      <div className="mb-6">
        <p className="text-[12px] font-medium text-muted-foreground">
          {now.toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
        <h1 className="mt-1 text-[28px] font-semibold leading-9 tracking-[-0.02em] text-foreground">
          {firstName ? `${greeting}, ${firstName}` : 'Welcome back'}
        </h1>
        {conversationsQuery.data && (
          <p className="mt-1 text-[14px] text-muted-foreground">
            {inboxWaitingCount > 0
              ? "Here's who's waiting on you, and how your automations are doing."
              : "Nothing is waiting on you. Here's how your automations are doing."}
          </p>
        )}
      </div>

      {loading && (
        <div className="space-y-4">
          <StatGridSkeleton count={4} label="Loading your dashboard" />
          <ListSkeleton count={2} compact label="Loading your activity" />
        </div>
      )}

      {!loading && error && (
        <Card className="p-4 flex items-center gap-3">
          <AlertCircle size={16} className="text-destructive flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-foreground">Couldn&apos;t load your dashboard</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" onClick={load} className="text-[12px] py-1.5 px-3 flex-shrink-0">
            <RefreshCw size={13} />Retry
          </Button>
        </Card>
      )}

      {!loading && !error && data && (
        <div className="space-y-5">
          {/* Paused: the single most important status there is — nothing
              below it is happening while this banner shows. A platform-level
              operator stop isn't the creator's to undo, so it doesn't route
              to Settings (which would show "Running" and contradict this). */}
          {data.globallyPaused && (
            <Card className="flex items-center gap-3 border-l-4 border-warning p-4">
              <Pause size={16} className="flex-shrink-0 text-warning" />
              <p className="flex-1 text-[13px] text-foreground">
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
            </Card>
          )}

          {showWaitingSection && (
            <section className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[16px] font-semibold text-foreground">
                    <Link to="/inbox?f=needs-you" className="hover:underline">
                      {inboxWaitingCount} conversation{inboxWaitingCount === 1 ? '' : 's'} need{inboxWaitingCount === 1 ? 's' : ''} you
                    </Link>
                  </h2>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Questions your automations handed over to you.
                  </p>
                </div>
                <Link
                  to="/inbox?f=needs-you"
                  className="shrink-0 pt-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Open inbox →
                </Link>
              </div>
              <Card className="divide-y divide-border px-4">
                {waitingConversations.map(conversation => {
                  const name = conversation.name ?? conversation.handle ?? 'Someone';
                  return (
                    <div key={conversation.contactId} className="flex items-center gap-3 py-3">
                      {conversation.avatarUrl ? (
                        <img
                          src={conversation.avatarUrl}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted
                            text-[13px] font-semibold text-muted-foreground"
                        >
                          {name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-foreground">{name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {platformMeta(conversation.platform).name} · {timeAgo(conversation.lastMessage.at)}
                        </p>
                        {conversation.lastMessage.text && (
                          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                            {conversation.lastMessage.text}
                          </p>
                        )}
                      </div>
                      <Link
                        to={`/inbox?c=${encodeURIComponent(conversation.contactId)}`}
                        className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}
                      >
                        Reply
                      </Link>
                    </div>
                  );
                })}
              </Card>
            </section>
          )}

          {gettingStarted ? (
            /* First-run: one honest path forward instead of empty analytics. */
            <Card className="p-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-chartreuse flex items-center justify-center mx-auto mb-4">
                <Zap size={22} className="text-primary-foreground" />
              </div>
              <p className="text-[16px] font-bold text-foreground">Set up your first automation</p>
              <p className="mt-2 max-w-md mx-auto text-[13px] leading-relaxed text-muted-foreground">
                Describe it in your own words — Populr answers comments and DMs for you,
                sends your links, and turns engagement into an audience.
              </p>
              <Button onClick={beginCreateAutomation} className="mt-5">
                <Plus size={15} />New automation
              </Button>
              {data.connectedAccounts.length === 0 && (
                <p className="mt-4 text-[12px] text-muted-foreground">
                  You&apos;ll connect an account along the way, or{' '}
                  <Link to="/channels" className="underline underline-offset-2 hover:text-foreground">do it now</Link>.
                </p>
              )}
            </Card>
          ) : (
            <>
              {/* Each automation stays tied to the account it actually runs on. */}
              {data.automationPerformance.length > 0 && (
                <section className={cn(cardVariants(), 'overflow-hidden')}>
                  <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
                    <h2 className="type-section-title">Running for you</h2>
                    <Link
                      to="/automations"
                      className="shrink-0 text-[12px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      All automations →
                    </Link>
                  </div>
                  <div className="divide-y divide-border px-5">
                    {data.automationPerformance.map(row => (
                      <AutomationRow key={row.id} row={row} />
                    ))}
                  </div>
                </section>
              )}

              {/* Metrics whose channel cannot report them remain omitted, not zeroed. */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

              {/* RECENT — a few meaningful things, quietly. */}
              {data.recentActivity.length > 0 && (
                <section className={cn(cardVariants(), 'p-5')}>
                  <h2 className="type-section-title mb-3">Recent</h2>
                  <div className="space-y-2.5">
                    {data.recentActivity.map((event, i) => (
                      <div key={`${event.kind}-${i}`} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-chartreuse" />
                        <p className="flex-1 text-[12px] leading-relaxed text-muted-foreground">
                          {activityLine(event)}
                        </p>
                        <span className="flex-shrink-0 text-[11px] text-muted-foreground">{timeAgo(event.at)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </Page>
  );
}
