import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Bell } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchNotifications,
  markNotificationsRead,
  type WorkspaceNotification,
} from '../../lib/api';
import { headerIconButton } from './headerIconButton';
import { useNotificationsUnread, reportNotificationsUnread } from './useNotificationsUnread';
import NotificationRow from './NotificationRow';

/**
 * The header's bell, fed by the workspace notification feed: automations
 * going live, teammates joining, accounts needing reconnection. Each row
 * deep-links to the place in the app to act on it and is marked read as
 * it's followed; the dot runs on the shared unread store, so however many
 * bells render there is one count and one poll.
 *
 * Fetched when the menu opens, not polled: the dot carries the ambient
 * signal, and the list is asked for at the moment the creator looks.
 */
export default function NotificationMenu() {
  const { count } = useNotificationsUnread();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<WorkspaceNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Close-and-reopen before a fetch settles leaves two requests in flight;
  // only the newest opening may write. Same rule as the Inbox glance.
  const generation = useRef(0);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    const mine = ++generation.current;
    setFailed(false);
    setItems(null);
    fetchNotifications()
      .then(res => {
        if (generation.current !== mine) return;
        setItems(res.notifications);
        reportNotificationsUnread(res.unread);
      })
      .catch(() => {
        if (generation.current !== mine) return;
        setFailed(true);
      });
  };

  const openOne = (n: WorkspaceNotification) => {
    setOpen(false);
    if (n.readAt === null) {
      void markNotificationsRead(n.id).then(() =>
        reportNotificationsUnread(Math.max(0, count - 1)),
      );
    }
  };

  const markAll = () => {
    void markNotificationsRead().then(() => {
      reportNotificationsUnread(0);
      setItems(prev =>
        prev ? prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) : prev,
      );
    });
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
            className={headerIconButton}
          >
            <Bell size={19} strokeWidth={2} />
            {count > 0 && (
              <span
                aria-hidden="true"
                className="absolute right-0.5 top-0.5 h-[15px] min-w-[15px] rounded-full
                  bg-sidebar-primary px-1 text-center text-[9.5px] font-semibold
                  leading-[15px] text-sidebar-primary-foreground"
              >
                {count > 9 ? '9+' : count}
              </span>
            )}
          </button>
        }
      />
      <PopoverContent className="w-[360px] max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-baseline justify-between px-4 pb-1 pt-3.5">
          <p className="type-label">Notifications</p>
          {count > 0 && (
            <button
              type="button"
              onClick={markAll}
              className="text-[12px] font-medium text-muted-foreground underline underline-offset-2
                transition-colors hover:text-foreground"
            >
              Mark all read
            </button>
          )}
        </div>

        {failed ? (
          <p className="px-4 py-3 text-[13px] text-muted-foreground">
            Populr can&rsquo;t reach its server right now, so this can&rsquo;t be loaded.
          </p>
        ) : items === null ? (
          <div className="space-y-2 px-4 py-3" aria-label="Loading notifications">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 pb-4 pt-1 text-[13px] leading-relaxed text-muted-foreground">
            You&rsquo;re all caught up. When something needs you — an automation going live, a
            teammate joining, an account needing attention — it will land here.
          </p>
        ) : (
          <ul className="max-h-[420px] overflow-y-auto py-1">
            {items.slice(0, 8).map(n => (
              <li key={n.id}>
                <NotificationRow notification={n} onOpen={openOne} />
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border-subtle p-1.5">
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-2.5 py-2 text-center text-[13px] font-medium
              text-foreground transition-colors hover:bg-muted"
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
