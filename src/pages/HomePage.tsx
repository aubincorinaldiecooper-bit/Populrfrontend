import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Zap, Sparkles, Users, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { isBackendConfigured, fetchAutomations, fetchOpportunities, fetchContacts } from '../lib/api';

interface HomeStats {
  activeAutomations: number;
  opportunitiesNeedingAttention: number;
  contactsTotal: number;
}

export default function HomePage() {
  const backendConfigured = isBackendConfigured();
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [loading, setLoading] = useState(backendConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!backendConfigured) return;
    let cancelled = false;
    // Data fetch from the backend, not derived state — see OpportunitiesPage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    Promise.all([
      fetchAutomations({ active: true }),
      fetchOpportunities({ status: 'new', limit: 1 }),
      fetchContacts({ limit: 1 }),
    ])
      .then(([automations, opportunities, contacts]) => {
        if (cancelled) return;
        setStats({
          activeAutomations: automations.length,
          opportunitiesNeedingAttention: opportunities.summary.new,
          contactsTotal: contacts.total,
        });
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load your dashboard.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [backendConfigured]);

  return (
    <div className="pop-page max-w-[900px]">
      <PageHeader title="Home" subtitle="Your automations, at a glance." />

      {!backendConfigured && (
        <div className="pop-card p-6 mb-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to a backend yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Set <code className="bg-[#FAFAF8] px-1 py-0.5 rounded">VITE_API_URL</code> to your Populr backend to see your live stats here.
            </p>
          </div>
        </div>
      )}

      {backendConfigured && loading && (
        <div className="flex items-center justify-center py-16 text-[#6B6B6B]">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading your dashboard...
        </div>
      )}

      {backendConfigured && !loading && error && (
        <div className="pop-card p-6 mb-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Couldn&apos;t load your dashboard</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">{error}</p>
          </div>
        </div>
      )}

      {backendConfigured && !loading && !error && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="pop-card p-5">
            <div className="w-9 h-9 rounded-xl bg-chartreuse/20 flex items-center justify-center mb-3">
              <Zap size={16} className="text-[#111111]" />
            </div>
            <p className="font-geist-mono font-bold text-2xl text-[#111111]">{stats.activeAutomations}</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">Active automations</p>
          </div>
          <div className="pop-card p-5">
            <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] flex items-center justify-center mb-3">
              <Sparkles size={16} className="text-[#3B82F6]" />
            </div>
            <p className="font-geist-mono font-bold text-2xl text-[#111111]">{stats.opportunitiesNeedingAttention}</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">Opportunities need attention</p>
          </div>
          <div className="pop-card p-5">
            <div className="w-9 h-9 rounded-xl bg-[#FAFAF8] flex items-center justify-center mb-3">
              <Users size={16} className="text-[#6B6B6B]" />
            </div>
            <p className="font-geist-mono font-bold text-2xl text-[#111111]">{stats.contactsTotal}</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">Contacts</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Link to="/automations/new" className="pop-card p-4 pop-card-hover flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-chartreuse flex items-center justify-center flex-shrink-0">
            <Zap size={16} className="text-[#111111]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#111111]">Create an automation</p>
            <p className="text-[12px] text-[#6B6B6B]">Turn a comment or DM into an autopilot conversation.</p>
          </div>
          <ArrowRight size={16} className="text-[#9B9B8F] flex-shrink-0" />
        </Link>
        <Link to="/opportunities" className="pop-card p-4 pop-card-hover flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FAFAF8] flex items-center justify-center flex-shrink-0">
            <Sparkles size={16} className="text-[#6B6B6B]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#111111]">Review opportunities</p>
            <p className="text-[12px] text-[#6B6B6B]">See who's engaging and needs a reply.</p>
          </div>
          <ArrowRight size={16} className="text-[#9B9B8F] flex-shrink-0" />
        </Link>
        <Link to="/contacts" className="pop-card p-4 pop-card-hover flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FAFAF8] flex items-center justify-center flex-shrink-0">
            <Users size={16} className="text-[#6B6B6B]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#111111]">View contacts</p>
            <p className="text-[12px] text-[#6B6B6B]">Your community, scored and organized.</p>
          </div>
          <ArrowRight size={16} className="text-[#9B9B8F] flex-shrink-0" />
        </Link>
      </div>
    </div>
  );
}
