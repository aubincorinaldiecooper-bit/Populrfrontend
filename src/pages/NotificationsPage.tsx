import { AlertCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import NotificationRow from '../components/app/NotificationRow';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isBackendConfigured, type WorkspaceNotification } from '../lib/api';
import { useNotifications, useMarkRead, useMarkAllRead } from '../components/app/useNotifications';

/**
 * The whole feed, on a page — the same rows the bell's popover shows
 * (NotificationRow is shared), with room to scroll back further than a
 * glance. Following a row marks it read; Mark all read clears the dot.
 *
 * This page holds no copy of any of it. The rows, the count and the reading
 * of them are the cached feed, so what's shown here and what the bell shows
 * are the same fact — and a row followed to somewhere else finishes being
 * marked read long after this page has gone.
 */
export default function NotificationsPage() {
  const configured = isBackendConfigured();
  const { data, isPending, isError } = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const items = data?.notifications ?? null;
  const unread = data?.unread ?? 0;
  const failed = isError || !configured;

  const openOne = (n: WorkspaceNotification) => {
    if (n.readAt === null) markRead.mutate(n.id);
  };

  return (
    <div className="pop-page">
      <PageHeader
        title="Notifications"
        subtitle="What happened while you weren't looking."
        action={
          unread > 0 ? (
            <Button
              variant="outline"
              onClick={() => markAll.mutate()}
              className="text-[12.5px] py-2 px-3.5"
            >
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {failed && !items ? (
        <div className="pop-card flex items-start gap-3 p-6">
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-[#D97706]" />
          <div>
            <p className="text-[13px] font-semibold text-foreground">
              Populr isn&apos;t connected to its server yet
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Populr can&apos;t reach its server, so your notifications can&apos;t be loaded right now.
            </p>
          </div>
        </div>
      ) : isPending && !items ? (
        <div className="pop-card space-y-3 p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items && items.length === 0 ? (
        <div className="pop-card">
          <EmptyState
            icon="alert"
            title="Nothing needs you right now"
            description="When something happens while you're away — an automation going live, a teammate joining, an account needing attention — it lands here."
          />
        </div>
      ) : (
        <div className="pop-card overflow-hidden py-1">
          <ul className="divide-y divide-border-subtle">
            {(items ?? []).map(n => (
              <li key={n.id}>
                <NotificationRow notification={n} onOpen={openOne} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
