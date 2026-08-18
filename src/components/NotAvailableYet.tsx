import { buttonVariants } from '@/components/ui/button';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import PageHeader from './PageHeader';
import EmptyState from './EmptyState';

/**
 * Placeholder for a surface that is routed but not built.
 *
 * Populr has several pages that were only ever wired to fabricated demo data
 * from src/data/index.ts — an Inbox of invented conversations, an Analytics
 * screen with hardcoded "+12 this week" deltas and a written-in-advance
 * "insight" paragraph, a Segments builder whose inputs were pinned to
 * `value="" onChange={() => {}}`. None is reachable from the navigation, but
 * all are reachable by URL, where they read as working features backed by
 * the user's real account.
 *
 * They stay routed so their URLs don't 404, and say plainly that they aren't
 * built yet rather than showing numbers nobody can act on.
 */
export default function NotAvailableYet({
  title, icon, description,
}: {
  title: string;
  icon: string;
  description: string;
}) {
  return (
    <div className="pop-page">
      <PageHeader title={title} />
      <EmptyState
        icon={icon}
        title={`${title} isn't available yet`}
        description={description}
        action={
          <Link to="/automations" className={buttonVariants()}>
            Go to Automations <ArrowRight size={14} />
          </Link>
        }
      />
    </div>
  );
}
