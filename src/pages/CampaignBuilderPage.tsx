import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

export default function CampaignBuilderPage() {
  const navigate = useNavigate();
  return (
    <div className="pop-page">
      <PageHeader
        title="Create campaign"
        subtitle="Build a new campaign to reach your audience."
        action={
          <button onClick={() => navigate('/campaigns')} className="pop-btn-secondary">
            <ArrowLeft size={14} strokeWidth={2.5} />Back to campaigns
          </button>
        }
      />
      <EmptyState
        icon="campaigns"
        title="Campaign builder coming soon"
        description="This page is under construction. Check back soon to build campaigns from here."
      />
    </div>
  );
}
