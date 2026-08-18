import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  isBackendConfigured,
  fetchNotifications,
  markNotificationsRead,
  type WorkspaceNotification,
} from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

/**
 * The workspace's notifications: the rows and the unread count, as ONE
 * cached fact.
 *
 * They used to be two. The bell held a number in a module-level store, the
 * page held a list in component state, and every read had to move both by
 * hand — which is how a double-click spent two decrements, how a rollback
 * went missing when a linked row navigated the page away mid-request, and
 * how a failed refresh could claim everything was read. There is one value
 * here now. Reading a notification is a pure function of it, applied
 * immediately and reverted by the cache itself if the server disagrees, so
 * no surface does arithmetic on a count and no surface has to be mounted
 * for the truth to find its way back.
 */

export interface NotificationsData {
  notifications: WorkspaceNotification[];
  unread: number;
}

/**
 * One notification, read. The count comes from the server rather than the
 * rows (there can be more unread than the page holds), so it moves with
 * them — which is exactly why it must move in the same breath, here.
 */
export function applyRead(data: NotificationsData, id: string): NotificationsData {
  const target = data.notifications.find(n => n.id === id);
  if (!target || target.readAt !== null) return data;
  return {
    notifications: data.notifications.map(n =>
      n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
    ),
    unread: Math.max(0, data.unread - 1),
  };
}

/** Everything read at once. */
export function applyAllRead(data: NotificationsData): NotificationsData {
  const now = new Date().toISOString();
  return {
    notifications: data.notifications.map(n => ({ ...n, readAt: n.readAt ?? now })),
    unread: 0,
  };
}

/**
 * The feed. Polled while something is watching it — the interval pauses on
 * a hidden tab, and coming back asks straight away.
 */
export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: fetchNotifications,
    enabled: isBackendConfigured(),
    refetchInterval: 60_000,
  });
}

/**
 * The bell's dot. However many bells render, they read one cached value and
 * share one request — the count can't disagree with the list it came from.
 */
export function useNotificationsUnread(): { count: number } {
  const { data } = useNotifications();
  return { count: data?.unread ?? 0 };
}

/**
 * Applied to the cache before the request leaves, and put back by the cache
 * if the request fails. `onMutate`/`onError` belong to the mutation rather
 * than to whoever called it, which is what makes this survive the caller
 * navigating away — the common case here, since most notifications are
 * links to the thing that happened.
 */
export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationsRead(id),
    onMutate: async (id: string) => optimistically(queryClient, prev => applyRead(prev, id)),
    onError: (_error, _id, context) => revert(queryClient, context),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markNotificationsRead(),
    onMutate: async () => optimistically(queryClient, applyAllRead),
    onError: (_error, _vars, context) => revert(queryClient, context),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
}

interface Rollback {
  previous: NotificationsData | undefined;
}

async function optimistically(
  queryClient: QueryClient,
  change: (data: NotificationsData) => NotificationsData,
): Promise<Rollback> {
  // A refetch already in flight would land after this and undo it with an
  // answer from before it happened.
  await queryClient.cancelQueries({ queryKey: queryKeys.notifications });
  const previous = queryClient.getQueryData<NotificationsData>(queryKeys.notifications);
  if (previous) queryClient.setQueryData(queryKeys.notifications, change(previous));
  return { previous };
}

function revert(queryClient: QueryClient, context: Rollback | undefined): void {
  if (context?.previous) queryClient.setQueryData(queryKeys.notifications, context.previous);
}
