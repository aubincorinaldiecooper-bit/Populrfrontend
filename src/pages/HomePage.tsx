import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Zap, ArrowRight, Loader2 } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { isBackendConfigured, fetchAutomationsSummary, fetchContacts, fetchOpportunities } from '../lib/api';
import type { AutomationsSummary } from '../lib/api';

interface HomeMetrics {
  summary: AutomationsSummary;
  contactsTotal: number;
  opportunitiesNeedingReview: number;
}

function StatCard({ value, label, sub, tone }: { value: number; label: string; sub?: string; tone?: 'warning' | 'error' }) {
  const toneColor = tone === 'error' ? 'text-[#DC2626]' : tone === 'warning' ? 'text-[#D97706]' : 'text-[#111111]';
  return (
    <Card padding={4}>
      <p className={`font-geist-mono font-bold text-2xl ${toneColor}`}>{value}</p>
      <Text type="supporting" display="block" className="mt-1">{label}</Text>
      {sub && <Text type="supporting" display="block" className="mt-0.5" color="disabled">{sub}</Text>}
    </Card>
  );
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

      <ClickableCard label="Create an automation" onClick={() => navigate('/automations/new')} padding={6} className="mb-10 border-chartreuse hover:bg-[#FAFAF8] transition-all">
        <div className="flex items-center gap-4">
          <span className="w-12 h-12 rounded-2xl bg-chartreuse flex items-center justify-center flex-shrink-0">
            <Zap size={22} className="text-[#111111]" />
          </span>
          <div className="min-w-0">
            <Text type="body" weight="bold" display="block">Create an automation</Text>
            <Text type="supporting" color="secondary" display="block" className="mt-0.5">
              Reply to comments and DMs automatically when someone uses a keyword, and start capturing contacts.
            </Text>
          </div>
          <ArrowRight size={18} className="ml-auto flex-shrink-0 text-[#9B9B8F]" />
        </div>
      </ClickableCard>

      <Heading level={2} className="mb-4">Your automations at a glance</Heading>

      {!backendConfigured ? (
        <Banner status="warning" title="Populr isn't connected to a backend yet" description="Set VITE_API_URL to see your real metrics here." />
      ) : loading ? (
        <div className="flex items-center justify-center py-14">
          <Loader2 size={20} className="animate-spin text-[#6B6B6B]" />
        </div>
      ) : error ? (
        <Banner status="error" title={error} endContent={<Button label="Try again" variant="secondary" size="sm" onClick={load} />} />
      ) : !metrics || metrics.summary.totalCount === 0 ? (
        <Card padding={8} className="text-center">
          <Zap size={24} className="text-[#9B9B8F] mx-auto mb-3" />
          <Text type="body" weight="bold" display="block">No automations yet</Text>
          <Text type="supporting" color="secondary" display="block" className="mt-1.5 max-w-sm mx-auto">
            Create your first automation to start replying to comments and DMs automatically.
          </Text>
          <div className="mt-4 inline-flex">
            <Button label="Create automation" variant="primary" onClick={() => navigate('/automations/new')} />
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <StatCard value={metrics.summary.activeCount} label="Active automations" sub={`of ${metrics.summary.totalCount} total`} />
            <StatCard value={metrics.summary.interactionsHandled} label="Interactions handled" />
            <StatCard value={metrics.summary.repliesSent} label="Replies sent" />
            <ClickableCard label="Contacts captured" onClick={() => navigate('/contacts')} padding={4}>
              <p className="font-geist-mono font-bold text-2xl text-[#111111]">{metrics.contactsTotal}</p>
              <Text type="supporting" display="block" className="mt-1">Contacts captured</Text>
            </ClickableCard>
            <ClickableCard label="Opportunities needing review" onClick={() => navigate('/opportunities')} padding={4}>
              <p className={`font-geist-mono font-bold text-2xl ${metrics.opportunitiesNeedingReview > 0 ? 'text-[#D97706]' : 'text-[#111111]'}`}>
                {metrics.opportunitiesNeedingReview}
              </p>
              <Text type="supporting" display="block" className="mt-1">Opportunities needing review</Text>
            </ClickableCard>
            <StatCard value={metrics.summary.failedAutomationsCount} label="Automations with a failure" tone={metrics.summary.failedAutomationsCount > 0 ? 'error' : undefined} />
          </div>

          <Card padding={5}>
            <Text type="supporting" display="block" className="mb-1.5">Best-performing automation</Text>
            {metrics.summary.bestPerforming ? (
              <button onClick={() => navigate('/automations')} className="flex items-center justify-between w-full text-left group">
                <span className="text-[14px] font-semibold text-[#111111] group-hover:underline">{metrics.summary.bestPerforming.name}</span>
                <span className="text-[12px] text-[#6B6B6B]">{metrics.summary.bestPerforming.repliesSent} replies sent</span>
              </button>
            ) : (
              <Text type="body" color="secondary" display="block">Not enough data yet — this fills in once your automations start replying.</Text>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
