import { useCallback, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import NotificationRow from '../components/app/NotificationRow';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  isBackendConfigured,
  fetchNotifications,
  markNotificationsRead,
  type WorkspaceNotification,
} from '../lib/api';
import {
  reportNotificationsUnread,
  adjustNotificationsUnread,
} from '../components/app/useNotificationsUnread';

/**
 * The whole feed, on a page — the same rows the bell's popover shows
 * (NotificationRow is shared), with room to scroll back further than a
 * glance. Following a row marks it read; Mark all read clears the dot.
 */
export default function NotificationsPage() {
  // Decided once, before any effect: an unconfigured backend renders the
  // calm error card from the first frame instead of flashing a skeleton.
  const configured = isBackendConfigured();
  const [items, setItems] = useState<WorkspaceNotification[] | null>(configured ? null : []);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState(!configured);

  const load = useCallback(async () => {
    try {
      const res = await fetchNotifications();
      setItems(res.notifications);
      setUnread(res.unread);
      reportNotificationsUnread(res.unread);
      setError(false);
    } catch {
      setError(true);
      setItems([]);
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    // Data fetch from the backend, not derived state — the setState calls
    // inside `load` are the effect synchronizing with an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, configured]);

  const openOne = (n: WorkspaceNotification) => {
    if (n.readAt !== null) return;
    // The row turns read where it stands, before the request leaves — a
    // linkless notification stays on this page, and an impatient second
    // click would otherwise send a second request and spend a second
    // decrement the badge never owed. If the server never hears it, the
    // dot comes back.
    setItems(prev =>
      prev
        ? prev.map(row => (row.id === n.id ? { ...row, readAt: new Date().toISOString() } : row))
        : prev,
    );
    setUnread(u => Math.max(0, u - 1));
    // The shared badge is moved outside the state updater deliberately: a
    // row WITH a link navigates as it's followed, so this page can be gone
    // by the time the request settles. React drops state updates on an
    // unmounted page — the store's count doesn't live here, and survives.
    adjustNotificationsUnread(-1);
    void markNotificationsRead(n.id).catch(() => {
      adjustNotificationsUnread(1);
      setItems(prev =>
        prev ? prev.map(row => (row.id === n.id ? { ...row, readAt: null } : row)) : prev,
      );
      setUnread(u => u + 1);
    });
  };

  const markAll = () => {
    void markNotificationsRead().then(() => {
      setUnread(0);
      reportNotificationsUnread(0);
      setItems(prev =>
        prev ? prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) : prev,
      );
    });
  };

  return (
    <div className="pop-page">
      <PageHeader
        title="Notifications"
        subtitle="What happened while you weren't looking."
        action={
          unread > 0 ? (
            <Button variant="outline" onClick={markAll} className="text-[12.5px] py-2 px-3.5">
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {error ? (
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
      ) : items === null ? (
        <div className="pop-card space-y-3 p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.length === 0 ? (
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
            {items.map(n => (
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
