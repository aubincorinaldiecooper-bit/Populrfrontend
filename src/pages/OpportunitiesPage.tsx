import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

export default function OpportunitiesPage() {
  return (
    <div className="pop-page">
      <PageHeader
        title="Opportunities"
        subtitle="Audiences and moments Populr has identified for you."
      />
      <EmptyState
        icon="search"
        title="Opportunities coming soon"
        description="This page is under construction. Check back soon to see the audiences and moments Populr has identified for you."
      />
    </div>
  );
}
