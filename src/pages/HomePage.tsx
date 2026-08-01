import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Zap, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { isBackendConfigured, fetchAutomationsSummary, fetchContacts, fetchOpportunities } from '../lib/api';
import type { AutomationsSummary } from '../lib/api';

interface HomeMetrics {
  summary: AutomationsSummary;
  contactsTotal: number;
  opportunitiesNeedingReview: number;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const backendConfigured = isBackendConfigured();
  const firstName = user?.name?.split(' ')[0];

  const [metrics, setMetrics] = useState<HomeMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!backendConfigured) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    Promise.all([
      fetchAutomationsSummary(),
      fetchContacts({ limit: 1 }),
      fetchOpportunities({ status: 'new', limit: 1 }),
    ])
      .then(([summary, contacts, opportunities]) => {
        setMetrics({ summary, contactsTotal: contacts.total, opportunitiesNeedingReview: opportunities.total });
      })
      .catch(err => {
        console.error('[home] failed to load automation metrics:', err);
        setError(err instanceof Error && err.message ? err.message : 'Could not load your metrics right now.');
      })
      .finally(() => setLoading(false));
  }, [backendConfigured]);

  useEffect(() => {
    // Data fetch from the backend, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <div className="pop-page">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        subtitle="Here's what Populr has been handling for you."
      />

      <button
        onClick={() => navigate('/automations/new')}
        className="pop-card p-6 w-full flex items-center gap-4 mb-10 border-chartreuse hover:bg-[#FAFAF8] transition-all text-left group"
      >
        <span className="w-12 h-12 rounded-2xl bg-chartreuse flex items-center justify-center flex-shrink-0">
          <Zap size={22} className="text-[#111111]" />
        </span>
        <div className="min-w-0">
          <p className="pop-card-title">Create an automation</p>
          <p className="pop-body mt-0.5">Reply to comments and DMs automatically when someone uses a keyword, and start capturing contacts.</p>
        </div>
        <ArrowRight size={18} className="ml-auto flex-shrink-0 text-[#9B9B8F] group-hover:text-[#111111] transition-colors" />
      </button>

      <h2 className="pop-section-heading mb-4">Your automations at a glance</h2>

      {!backendConfigured ? (
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-[#111111]">
            Populr isn&apos;t connected to a backend yet — set <code className="bg-[#FAFAF8] px-1 py-0.5 rounded">VITE_API_URL</code> to see your real metrics here.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-14">
          <Loader2 size={20} className="animate-spin text-[#6B6B6B]" />
        </div>
      ) : error ? (
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[13px] text-[#111111]">{error}</p>
            <button onClick={load} className="pop-btn-secondary text-[12px] py-1.5 px-3 mt-3">Try again</button>
          </div>
        </div>
      ) : !metrics || metrics.summary.totalCount === 0 ? (
        <div className="pop-card p-8 text-center">
          <Zap size={24} className="text-[#9B9B8F] mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-[#111111]">No automations yet</p>
          <p className="text-[12px] text-[#6B6B6B] mt-1.5 max-w-sm mx-auto">
            Create your first automation to start replying to comments and DMs automatically.
          </p>
          <button onClick={() => navigate('/automations/new')} className="pop-btn-primary text-[12px] py-2 px-4 mt-4 inline-flex">
            Create automation
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <div className="pop-card p-4">
              <p className="font-geist-mono font-bold text-2xl text-[#111111]">{metrics.summary.activeCount}</p>
              <p className="text-[11px] text-[#6B6B6B] mt-1">Active automations</p>
              <p className="text-[10px] text-[#9B9B8F] mt-0.5">of {metrics.summary.totalCount} total</p>
            </div>
            <div className="pop-card p-4">
              <p className="font-geist-mono font-bold text-2xl text-[#111111]">{metrics.summary.interactionsHandled}</p>
              <p className="text-[11px] text-[#6B6B6B] mt-1">Interactions handled</p>
            </div>
            <div className="pop-card p-4">
              <p className="font-geist-mono font-bold text-2xl text-[#111111]">{metrics.summary.repliesSent}</p>
              <p className="text-[11px] text-[#6B6B6B] mt-1">Replies sent</p>
            </div>
            <button onClick={() => navigate('/contacts')} className="pop-card p-4 pop-card-hover cursor-pointer text-left">
              <p className="font-geist-mono font-bold text-2xl text-[#111111]">{metrics.contactsTotal}</p>
              <p className="text-[11px] text-[#6B6B6B] mt-1">Contacts captured</p>
            </button>
            <button onClick={() => navigate('/opportunities')} className="pop-card p-4 pop-card-hover cursor-pointer text-left">
              <p className={`font-geist-mono font-bold text-2xl ${metrics.opportunitiesNeedingReview > 0 ? 'text-[#D97706]' : 'text-[#111111]'}`}>
                {metrics.opportunitiesNeedingReview}
              </p>
              <p className="text-[11px] text-[#6B6B6B] mt-1">Opportunities needing review</p>
            </button>
            <div className="pop-card p-4">
              <p className={`font-geist-mono font-bold text-2xl ${metrics.summary.failedAutomationsCount > 0 ? 'text-[#DC2626]' : 'text-[#111111]'}`}>
                {metrics.summary.failedAutomationsCount}
              </p>
              <p className="text-[11px] text-[#6B6B6B] mt-1">Automations with a failure</p>
            </div>
          </div>

          <div className="pop-card p-5">
            <p className="pop-meta mb-1.5">Best-performing automation</p>
            {metrics.summary.bestPerforming ? (
              <button onClick={() => navigate('/automations')} className="flex items-center justify-between w-full text-left group">
                <span className="text-[14px] font-semibold text-[#111111] group-hover:underline">{metrics.summary.bestPerforming.name}</span>
                <span className="text-[12px] text-[#6B6B6B]">{metrics.summary.bestPerforming.repliesSent} replies sent</span>
              </button>
            ) : (
              <p className="text-[13px] text-[#6B6B6B]">Not enough data yet — this fills in once your automations start replying.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
