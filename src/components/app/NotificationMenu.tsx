import { useState } from 'react';
import { Link } from 'react-router';
import { Bell } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { isBackendConfigured, type WorkspaceNotification } from '../../lib/api';
import { headerIconButton } from './headerIconButton';
import { useNotifications, useMarkRead, useMarkAllRead } from './useNotifications';
import NotificationRow from './NotificationRow';

/**
 * The header's bell, fed by the workspace notification feed: automations
 * going live, teammates joining, accounts needing reconnection. Each row
 * deep-links to the place in the app to act on it and is marked read as
 * it's followed.
 *
 * The list and the dot are the same cached fact, so opening this can't
 * disagree with the badge that invited the creator to open it — and
 * following a row updates both at once, whether or not this menu (or the
 * page it links to) is still mounted when the server answers.
 */
export default function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const { data, isPending, isError } = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const count = data?.unread ?? 0;
  const items = data?.notifications ?? null;

  const openOne = (n: WorkspaceNotification) => {
    setOpen(false);
    if (n.readAt === null) markRead.mutate(n.id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
              onClick={() => markAll.mutate()}
              className="text-[12px] font-medium text-muted-foreground underline underline-offset-2
                transition-colors hover:text-foreground"
            >
              Mark all read
            </button>
          )}
        </div>

        {(isError || !isBackendConfigured()) && !items ? (
          <p className="px-4 py-3 text-[13px] text-muted-foreground">
            Populr can&rsquo;t reach its server right now, so this can&rsquo;t be loaded.
          </p>
        ) : isPending || items === null ? (
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
