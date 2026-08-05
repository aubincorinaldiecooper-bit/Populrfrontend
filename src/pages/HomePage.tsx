import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Zap, Users, ArrowRight, AlertCircle, Inbox as InboxIcon, Flame, Plus,
  Pause, TrendingUp, RefreshCw, MousePointerClick, MessageCircleReply, Eye,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import PlatformDot from '../components/PlatformDot';
import { StatGridSkeleton, ListSkeleton } from '../components/Skeleton';
import { isBackendConfigured, fetchDashboard } from '../lib/api';
import type { DashboardData } from '../lib/api';

/**
 * Home answers two questions in one glance, in this order:
 *
 *   1. "What needs me right now?"  — the needs-reply strip, straight into
 *      Inbox, because conversations waiting on the creator are the most
 *      time-sensitive thing the product produces.
 *   2. "Is my system working?"     — numbers the automations generate
 *      (leads, contacts) and WHICH posts are producing warm leads, the
 *      question the dashboard service was built to answer.
 *
 * Creating an automation is the page's one call to action — everything
 * else on screen is evidence of what automations do, so the CTA never has
 * to shout. All data arrives in a single workspace-scoped call.
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

/** Rounded percentage, or an em dash when nothing has been sent yet —
 *  0-of-0 is "no data", never "0%". */
function rate(numerator: number, denominator: number): string {
  if (denominator === 0) return '—';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function RateTile({ icon, value, label, basis }: {
  icon: React.ReactNode; value: string; label: string; basis: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[#9B9B8F] mb-1.5">{icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <p className="font-geist-mono font-bold text-xl text-[#111111]">{value}</p>
      <p className="text-[11px] text-[#9B9B8F] mt-0.5">{basis}</p>
    </div>
  );
}

function StatTile({ to, icon, iconBg, value, label, accent = false }: {
  to: string; icon: React.ReactNode; iconBg: string; value: number; label: string;
  /** Draws the eye when the number demands action (e.g. needs-reply > 0). */
  accent?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`pop-card pop-card-hover p-4 block ${accent ? 'ring-2 ring-chartreuse' : ''}`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${iconBg}`}>
        {icon}
      </div>
      <p className="font-geist-mono font-bold text-2xl text-[#111111]">{value}</p>
      <p className="text-[12px] text-[#6B6B6B] mt-1">{label}</p>
    </Link>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
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
        <PageHeader title="Home" subtitle="Your automations, working while you don't." />
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to a backend yet</p>
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
        subtitle="Your automations, working while you don't."
        action={
          <Link to="/automations/new" className="pop-btn-primary">
            <Plus size={15} />Create an automation
          </Link>
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
          <button onClick={load} className="pop-btn-tertiary text-[12px] py-1.5 px-3 flex-shrink-0">
            <RefreshCw size={13} />Retry
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-5">
          {/* Paused: the single most important status there is — nothing
              below it is happening while this banner shows. */}
          {data.globallyPaused && (
            <div className="pop-card p-4 flex items-center gap-3 border-l-4 border-[#D97706]">
              <Pause size={16} className="text-[#D97706] flex-shrink-0" />
              <p className="text-[13px] text-[#111111] flex-1">
                Your automations are paused — nothing is being sent automatically.
              </p>
              <Link to="/settings" className="pop-btn-tertiary text-[12px] py-1.5 px-3 flex-shrink-0">
                Go to Settings
              </Link>
            </div>
          )}

          {/* Needs-you strip: time-sensitive, so it outranks the numbers. */}
          {totals!.needsReply > 0 && (
            <button
              onClick={() => navigate('/inbox')}
              className="pop-card pop-card-hover p-4 w-full flex items-center gap-3 text-left ring-2 ring-chartreuse"
            >
              <div className="w-9 h-9 rounded-xl bg-chartreuse flex items-center justify-center flex-shrink-0">
                <InboxIcon size={16} className="text-[#111111]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#111111]">
                  {totals!.needsReply} conversation{totals!.needsReply === 1 ? '' : 's'} waiting on you
                </p>
                <p className="text-[12px] text-[#6B6B6B]">
                  Questions your automations couldn&apos;t answer — AI drafts are ready where possible.
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
                Pick a post, choose trigger words, and write the reply — Populr answers comments
                and DMs for you, sends your tracked link, and turns engagement into contacts.
              </p>
              <Link to="/automations/new" className="pop-btn-primary mt-5 inline-flex">
                <Plus size={15} />Create an automation
              </Link>
              {data.connectedAccounts.length === 0 && (
                <p className="text-[12px] text-[#9B9B8F] mt-4">
                  You&apos;ll connect an account along the way, or{' '}
                  <Link to="/channels" className="underline underline-offset-2 hover:text-[#111111]">do it now</Link>.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* The numbers automations generate — every tile opens the
                  surface where that number lives. */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile
                  to="/automations"
                  icon={<Zap size={16} className="text-[#111111]" />}
                  iconBg="bg-chartreuse/20"
                  value={totals!.activeAutomations}
                  label="Active automations"
                />
                <StatTile
                  to="/inbox"
                  icon={<InboxIcon size={16} className={totals!.needsReply > 0 ? 'text-[#111111]' : 'text-[#6B6B6B]'} />}
                  iconBg={totals!.needsReply > 0 ? 'bg-chartreuse/20' : 'bg-[#FAFAF8]'}
                  value={totals!.needsReply}
                  label="Need your reply"
                />
                <StatTile
                  to="/contacts"
                  icon={<Flame size={16} className="text-[#D97706]" />}
                  iconBg="bg-[#FFF3E0]"
                  value={totals!.warmLeads}
                  label="Warm leads"
                />
                <StatTile
                  to="/contacts"
                  icon={<Users size={16} className="text-[#6B6B6B]" />}
                  iconBg="bg-[#FAFAF8]"
                  value={totals!.contacts}
                  label="Contacts"
                />
              </div>

              {/* How fans respond to what automations send: real platform
                  activity — link taps, replies, read receipts — as rates
                  with their denominators in view. Hidden until something
                  has actually been sent; empty analytics teach nothing.
                  The optional check also covers a backend that predates the
                  engagement block — Home must render without it, not crash. */}
              {data.engagement && (data.engagement.dmsSent > 0 || data.engagement.linkSends > 0) && (
                <section className="pop-card p-5">
                  <h2 className="pop-card-title mb-1">How fans respond</h2>
                  <p className="text-[12px] text-[#6B6B6B] mb-4">
                    From platform receipts, replies, and tracked-link taps.
                  </p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <RateTile
                      icon={<MousePointerClick size={13} />}
                      label="Link taps"
                      value={rate(data.engagement.uniqueLinkClicks, data.engagement.linkSends)}
                      basis={`of ${data.engagement.linkSends} link${data.engagement.linkSends === 1 ? '' : 's'} sent`}
                    />
                    <RateTile
                      icon={<MessageCircleReply size={13} />}
                      label="Wrote back"
                      value={rate(data.engagement.contactsReplied, data.engagement.contactsDmd)}
                      basis={`of ${data.engagement.contactsDmd} fan${data.engagement.contactsDmd === 1 ? '' : 's'} DM'd`}
                    />
                    <RateTile
                      icon={<Eye size={13} />}
                      label="DMs read"
                      value={rate(data.engagement.dmsRead, data.engagement.dmsSent)}
                      basis={`of ${data.engagement.dmsSent} DM${data.engagement.dmsSent === 1 ? '' : 's'} sent`}
                    />
                    <RateTile
                      icon={<TrendingUp size={13} />}
                      label="With media"
                      value={String(data.engagement.mediaDmsSent)}
                      basis={`DM${data.engagement.mediaDmsSent === 1 ? '' : 's'} carried media`}
                    />
                  </div>
                </section>
              )}

              {/* The question this product exists to answer: which content
                  is actually producing leads. */}
              {data.topPostsByWarmLeads.length > 0 && (
                <section className="pop-card p-5">
                  <h2 className="pop-card-title mb-1 flex items-center gap-2">
                    <TrendingUp size={15} />What&apos;s bringing you leads
                  </h2>
                  <p className="text-[12px] text-[#6B6B6B] mb-4">
                    Posts ranked by the warm leads their automations generated.
                  </p>
                  <div className="space-y-3">
                    {data.topPostsByWarmLeads.slice(0, 3).map(post => (
                      <div key={post.id} className="flex items-center gap-3">
                        {post.media_url ? (
                          <img src={post.media_url} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-11 h-11 rounded-lg bg-[#FAFAF8] flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-[#111111] line-clamp-1">{post.caption || 'Untitled post'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <PlatformDot platform={post.platform} size={6} />
                            <p className="text-[11px] text-[#9B9B8F]">
                              {post.account_username ? `@${post.account_username}` : post.platform} · {post.contacts} contact{post.contacts === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-geist-mono font-bold text-[15px] text-[#111111]">{post.warm_leads}</p>
                          <p className="text-[10px] text-[#9B9B8F]">warm leads</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Proof of work: the last few things automations did. */}
              {data.recentActivity.length > 0 && (
                <section className="pop-card p-5">
                  <h2 className="pop-card-title mb-3">Recent activity</h2>
                  <div className="space-y-2.5">
                    {data.recentActivity.slice(0, 5).map(event => (
                      <div key={event.id} className="flex items-start gap-2.5">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${event.status === 'failed' ? 'bg-[#DC2626]' : event.status === 'skipped' ? 'bg-[#9B9B8F]' : 'bg-chartreuse'}`} />
                        <p className="text-[12px] text-[#6B6B6B] flex-1 leading-relaxed line-clamp-2">
                          {event.detail || event.event_type.replace(/_/g, ' ')}
                        </p>
                        <span className="text-[11px] text-[#9B9B8F] flex-shrink-0">{timeAgo(event.created_at)}</span>
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
