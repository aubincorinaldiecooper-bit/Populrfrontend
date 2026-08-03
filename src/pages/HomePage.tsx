import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import {
  Zap, Sparkles, Users, ArrowRight, ArrowUpRight, TrendingUp, Loader2, AlertCircle, Plus, Link2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  isBackendConfigured, fetchAutomationsSummary, fetchAutomations, fetchContacts, fetchOpportunities,
} from '../lib/api';
import type { AutomationsSummary, AutomationRecord, ContactRecord, Opportunity } from '../lib/api';

interface HomeData {
  summary: AutomationsSummary;
  activeAutomations: AutomationRecord[];
  contactsTotal: number;
  recentContacts: ContactRecord[];
  opportunitiesNew: number;
  topOpportunities: Opportunity[];
}

const REPLY_CHANNEL_LABEL: Record<string, string> = {
  comment: 'Public reply', dm: 'DM', both: 'Public reply + DM',
};

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const card = 'bg-surface-container-lowest border border-surface-variant rounded-xl';
const fade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const backendConfigured = isBackendConfigured();
  const firstName = user?.name?.split(' ')[0];

  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!backendConfigured) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    Promise.all([
      fetchAutomationsSummary(),
      fetchAutomations(),
      fetchContacts({ limit: 4 }),
      fetchOpportunities({ status: 'new', limit: 3 }),
    ])
      .then(([summary, automations, contacts, opps]) => {
        setData({
          summary,
          activeAutomations: automations.filter(a => a.active).slice(0, 3),
          contactsTotal: contacts.total,
          recentContacts: contacts.contacts.slice(0, 3),
          opportunitiesNew: opps.total,
          topOpportunities: opps.opportunities.slice(0, 2),
        });
      })
      .catch(err => {
        console.error('[home] failed to load dashboard:', err);
        setError(err instanceof Error && err.message ? err.message : 'Could not load your dashboard right now.');
      })
      .finally(() => setLoading(false));
  }, [backendConfigured]);

  useEffect(() => {
    // Data fetch from the backend, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const summaryLine = data
    ? [
        `${data.summary.activeCount} automation${data.summary.activeCount === 1 ? '' : 's'} active`,
        data.opportunitiesNew > 0
          ? `${data.opportunitiesNew} new opportunit${data.opportunitiesNew === 1 ? 'y' : 'ies'} to review`
          : null,
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="px-container-padding-mobile md:px-container-padding-desktop py-8 md:py-10 max-w-[1200px] mx-auto flex flex-col gap-10 md:gap-12 pb-24">
      {/* Hero */}
      <motion.section {...fade} transition={{ duration: 0.4 }} className="max-w-2xl">
        <h1 className="font-display text-display-lg-mobile md:text-display-lg text-on-surface">
          {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        </h1>
        <p className="font-body text-body-lg text-on-surface-variant mt-3">
          {loading ? 'Pulling together what Populr has been handling for you…'
            : summaryLine || "Here's what Populr has been handling for you."}
        </p>
      </motion.section>

      {!backendConfigured ? (
        <div className={`${card} p-8 flex items-start gap-3`}>
          <AlertCircle size={18} className="text-error mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-on-surface">Populr isn&apos;t connected to a backend yet</p>
            <p className="text-body-md text-on-surface-variant mt-1">Set <code className="font-label">VITE_API_URL</code> to see your real metrics here.</p>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-24 text-on-surface-variant gap-2">
          <Loader2 size={22} className="animate-spin" /> Loading your dashboard…
        </div>
      ) : error ? (
        <div className={`${card} p-8 flex flex-col items-start gap-3`}>
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-error mt-0.5 flex-shrink-0" />
            <p className="font-semibold text-on-surface">{error}</p>
          </div>
          <button onClick={load} className="text-body-md font-semibold text-primary underline underline-offset-4">Try again</button>
        </div>
      ) : data && (
        <motion.section
          initial="initial" animate="animate"
          transition={{ staggerChildren: 0.06 }}
          className="grid grid-cols-1 md:grid-cols-12 gap-card-gap"
        >
          {/* Automations at a glance — span 8 */}
          <motion.div variants={fade} transition={{ duration: 0.35 }} className={`md:col-span-8 ${card} p-8 flex flex-col justify-between`}>
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="font-display text-headline-md text-on-surface">Automations at a glance</h2>
                <p className="font-body text-body-md text-on-surface-variant mt-1">Real activity across your workflows</p>
              </div>
              <span className="font-label text-label-sm uppercase bg-surface-container-low text-on-surface-variant px-3 py-1 rounded-full border border-surface-variant">Live</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <StatTile label="Active" value={`${data.summary.activeCount}`} sub={`of ${data.summary.totalCount} total`} />
              <StatTile label="Interactions handled" value={data.summary.interactionsHandled.toLocaleString()} />
              <div className="p-4 bg-secondary-container rounded-lg flex flex-col justify-center items-center text-center">
                <TrendingUp size={30} className="mb-2 text-primary" />
                <p className="font-body font-bold text-primary">{data.summary.repliesSent.toLocaleString()} replies sent</p>
              </div>
            </div>
            {data.summary.failedAutomationsCount > 0 && (
              <button onClick={() => navigate('/automations')} className="mt-5 self-start flex items-center gap-1.5 text-body-md font-semibold text-error hover:underline underline-offset-4">
                <AlertCircle size={15} /> {data.summary.failedAutomationsCount} automation{data.summary.failedAutomationsCount === 1 ? '' : 's'} failing — review
              </button>
            )}
          </motion.div>

          {/* AI Insights (opportunities) — span 4 */}
          <motion.div variants={fade} transition={{ duration: 0.35 }} className="md:col-span-4 bg-primary text-on-primary rounded-xl p-8 relative overflow-hidden flex flex-col">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-secondary-container rounded-full blur-[60px] opacity-20" />
            <div className="flex items-center gap-2 mb-6 relative z-10">
              <Sparkles size={20} className="text-secondary-container" />
              <h2 className="font-display text-headline-md">AI Insights</h2>
            </div>
            <div className="flex-1 flex flex-col gap-3 relative z-10">
              {data.topOpportunities.length === 0 ? (
                <p className="font-body text-body-md text-inverse-primary">
                  No new high-intent conversations yet. Populr will surface them here as your audience engages.
                </p>
              ) : (
                data.topOpportunities.map(o => (
                  <button
                    key={o.id}
                    onClick={() => navigate('/opportunities')}
                    className="text-left bg-inverse-surface p-4 rounded-lg border border-surface-tint hover:border-secondary-container transition-colors"
                  >
                    <p className="font-label text-label-sm text-secondary-container uppercase mb-1">{o.intent.label}</p>
                    <p className="font-body text-body-md text-on-primary line-clamp-2">
                      {o.person.username ? `@${o.person.username}` : o.person.displayName || 'Someone'}: &ldquo;{o.interaction.text}&rdquo;
                    </p>
                  </button>
                ))
              )}
            </div>
            <button
              onClick={() => navigate('/opportunities')}
              className="mt-5 relative z-10 inline-flex items-center gap-1.5 font-semibold text-secondary-container hover:gap-2.5 transition-all"
            >
              {data.opportunitiesNew > 0 ? `View all ${data.opportunitiesNew} opportunities` : 'Go to Opportunities'} <ArrowRight size={16} />
            </button>
          </motion.div>

          {/* Active Workflows — span 6 */}
          <motion.div variants={fade} transition={{ duration: 0.35 }} className={`md:col-span-6 ${card} p-8 flex flex-col`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-display text-headline-md text-on-surface">Active workflows</h2>
              <button onClick={() => navigate('/automations')} className="font-label text-label-sm uppercase text-primary hover:underline">View all</button>
            </div>
            {data.activeAutomations.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-8 gap-3">
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center"><Zap size={22} className="text-on-surface-variant" /></div>
                <p className="font-body text-body-md text-on-surface-variant max-w-xs">No active automations yet. Create one to start replying automatically.</p>
                <button onClick={() => navigate('/automations/new')} className="inline-flex items-center gap-2 bg-secondary-fixed text-primary font-semibold px-5 py-2.5 rounded-full hover:bg-secondary-fixed-dim transition-colors">
                  <Plus size={16} /> Create automation
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {data.activeAutomations.map(a => (
                  <button key={a.id} onClick={() => navigate('/automations')} className="flex items-center justify-between p-4 bg-surface rounded-lg border border-surface-variant text-left hover:border-outline-variant transition-colors">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-primary flex-shrink-0"><Zap size={18} /></div>
                      <div className="min-w-0">
                        <p className="font-body font-bold text-on-surface truncate">{a.name}</p>
                        <p className="font-body text-[14px] text-on-surface-variant capitalize truncate">{a.platform} · {REPLY_CHANNEL_LABEL[a.reply_channel] ?? a.reply_channel}</p>
                      </div>
                    </div>
                    <span className="font-label text-label-sm uppercase bg-surface-container-high text-on-surface px-2 py-1 rounded-full flex-shrink-0">Active</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* Recent Contacts — span 6 */}
          <motion.div variants={fade} transition={{ duration: 0.35 }} className={`md:col-span-6 ${card} p-8 flex flex-col`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-display text-headline-md text-on-surface">
                Recent contacts {data.contactsTotal > 0 && <span className="font-label text-label-sm text-on-surface-variant">({data.contactsTotal})</span>}
              </h2>
              <button onClick={() => navigate('/contacts')} className="font-label text-label-sm uppercase text-primary hover:underline">Directory</button>
            </div>
            <div className="flex flex-col gap-4 flex-1">
              {data.recentContacts.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-6 gap-3">
                  <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center"><Users size={22} className="text-on-surface-variant" /></div>
                  <p className="font-body text-body-md text-on-surface-variant max-w-xs">People who engage your connected accounts show up here as Populr captures them.</p>
                </div>
              ) : (
                data.recentContacts.map(c => (
                  <button key={c.id} onClick={() => navigate('/contacts')} className="flex items-center gap-4 text-left group">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover border border-surface-variant" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-surface-container border border-surface-variant flex items-center justify-center text-on-surface-variant"><Users size={18} /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-body font-bold text-on-surface truncate">{c.handle ? `@${c.handle}` : c.name ?? 'Unknown'}</p>
                      <p className="font-body text-[14px] text-on-surface-variant capitalize truncate">{c.platform} · {relativeTime(c.last_seen)}</p>
                    </div>
                    <span className="w-8 h-8 rounded-full border border-surface-variant flex items-center justify-center text-on-surface-variant group-hover:bg-surface-container transition-colors flex-shrink-0"><ArrowUpRight size={16} /></span>
                  </button>
                ))
              )}
            </div>
            {/* Connect channels nudge — real link */}
            <div className="mt-auto pt-6 border-t border-surface-variant border-dashed flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-body font-bold text-on-surface">Connect more channels</p>
                <p className="font-body text-[14px] text-on-surface-variant">More sources means richer opportunities.</p>
              </div>
              <button onClick={() => navigate('/connections')} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-full font-label text-label-sm uppercase hover:opacity-90 transition-opacity flex-shrink-0">
                <Link2 size={14} /> Connect
              </button>
            </div>
          </motion.div>
        </motion.section>
      )}
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-4 bg-surface rounded-lg border border-surface-variant">
      <p className="font-label text-label-sm text-on-surface-variant uppercase mb-2">{label}</p>
      <p className="font-display text-[32px] md:text-[40px] leading-none text-primary">{value}</p>
      {sub && <p className="font-body text-[13px] text-on-surface-variant mt-2">{sub}</p>}
    </div>
  );
}
