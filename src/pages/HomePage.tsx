import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Zap, ArrowRight, Users, Sparkles, Trophy } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Badge } from '@astryxdesign/core/Badge';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import MiniStat from '../components/MiniStat';
import { isBackendConfigured, fetchAutomationsSummary, fetchContacts, fetchOpportunities } from '../lib/api';
import type { AutomationsSummary } from '../lib/api';

interface HomeMetrics {
  summary: AutomationsSummary;
  contactsTotal: number;
  opportunitiesNeedingReview: number;
}

function ExploreCard({ icon, value, label, tone, onClick }: {
  icon: React.ReactNode; value: number; label: string; tone?: 'warning'; onClick: () => void;
}) {
  return (
    <ClickableCard label={label} onClick={onClick} padding={4}>
      <HStack gap={3} align="center">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: tone === 'warning' ? '#FFF3E0' : '#FAFAF8' }}
        >
          {icon}
        </span>
        <VStack gap={0}>
          <Text size="xl" weight="bold" className="font-geist-mono" style={tone === 'warning' ? { color: 'var(--color-warning)' } : undefined}>{value}</Text>
          <Text type="supporting" color="secondary">{label}</Text>
        </VStack>
      </HStack>
    </ClickableCard>
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
        <HStack justify="center" style={{ paddingBlock: 56 }}>
          <Spinner size="lg" />
        </HStack>
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
          {/* Summary panel: mirrors the Connections page's "N of M" pattern —
              everything here is computed from the real automations summary,
              no invented numbers. */}
          <Card padding={5} style={{ marginBottom: 20 }}>
            <HStack wrap="wrap" gap={5} align="center">
              <VStack gap={3} style={{ flex: 1, minWidth: 220 }}>
                <Text type="large" weight="bold">
                  <span className="font-geist-mono">{metrics.summary.activeCount}</span> of <span className="font-geist-mono">{metrics.summary.totalCount}</span> automations active
                </Text>
                <ProgressBar value={metrics.summary.activeCount} max={metrics.summary.totalCount} label="Active automations" isLabelHidden variant="accent" />
                <Text type="supporting" color="secondary">Populr watches for these triggers across your connected accounts.</Text>
              </VStack>
              <Divider orientation="vertical" className="hidden sm:block" style={{ alignSelf: 'stretch' }} />
              <HStack wrap="wrap" gap={6}>
                <MiniStat value={metrics.summary.interactionsHandled} label="Interactions" />
                <MiniStat value={metrics.summary.repliesSent} label="Replies sent" />
                <MiniStat
                  value={metrics.summary.failedAutomationsCount}
                  label="Failing"
                  tone={metrics.summary.failedAutomationsCount > 0 ? 'error' : undefined}
                />
              </HStack>
            </HStack>
          </Card>

          <HStack wrap="wrap" gap={3} style={{ marginBottom: 20 }}>
            <div style={{ flex: '1 1 200px' }}>
              <ExploreCard
                icon={<Users size={18} className="text-[#111111]" />}
                value={metrics.contactsTotal}
                label="Contacts captured"
                onClick={() => navigate('/contacts')}
              />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <ExploreCard
                icon={<Sparkles size={18} className={metrics.opportunitiesNeedingReview > 0 ? '' : 'text-[#111111]'} style={metrics.opportunitiesNeedingReview > 0 ? { color: 'var(--color-warning)' } : undefined} />}
                value={metrics.opportunitiesNeedingReview}
                label="Opportunities needing review"
                tone={metrics.opportunitiesNeedingReview > 0 ? 'warning' : undefined}
                onClick={() => navigate('/opportunities')}
              />
            </div>
          </HStack>

          <Card padding={5}>
            <HStack gap={2} align="center" style={{ marginBottom: 12 }}>
              <Trophy size={15} className="text-[#9B9B8F]" />
              <Text type="supporting" color="secondary">Best-performing automation</Text>
            </HStack>
            {metrics.summary.bestPerforming ? (
              <button onClick={() => navigate('/automations')} className="flex items-center justify-between w-full text-left group">
                <Text type="body" weight="semibold" className="group-hover:underline">{metrics.summary.bestPerforming.name}</Text>
                <Badge variant="success" label={`${metrics.summary.bestPerforming.repliesSent} replies sent`} />
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
