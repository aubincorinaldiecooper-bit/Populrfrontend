import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

export default function AutomationBuilderPage() {
  const navigate = useNavigate();
  return (
    <div className="pop-page">
      <PageHeader
        title="Create automation"
        subtitle="Build a new automated response flow."
        action={
          <button onClick={() => navigate('/automations')} className="pop-btn-secondary">
            <ArrowLeft size={14} strokeWidth={2.5} />Back to automations
          </button>
        }
      />
      <EmptyState
        icon="automations"
        title="Automation builder coming soon"
        description="This page is under construction. Check back soon to build automations from here."
      />
    </div>
  );
}
