import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  isBackendConfigured,
  fetchNotifications,
  markNotificationsRead,
  type WorkspaceNotification,
} from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import { serverStateEpoch } from '../../lib/queryClient';

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

/**
 * One notification, un-read — the exact inverse of applyRead, for a read the
 * server refused. Surgical on purpose: restoring a whole snapshot would also
 * take back a DIFFERENT row that a second click read while this request was
 * out, undoing something the creator watched happen.
 */
export function applyUnread(data: NotificationsData, id: string): NotificationsData {
  const target = data.notifications.find(n => n.id === id);
  if (!target || target.readAt === null) return data;
  return {
    notifications: data.notifications.map(n => (n.id === id ? { ...n, readAt: null } : n)),
    unread: data.unread + 1,
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
/**
 * Both mutations share one key so each can see the other in flight. Reading
 * is not a one-at-a-time act — two rows get clicked in the time one request
 * takes — and a rollback or a refetch that ignores its sibling undoes work
 * the creator watched land.
 */
const MARK_READ_KEY = ['notifications', 'mark-read'] as const;

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: MARK_READ_KEY,
    mutationFn: (id: string) => markNotificationsRead(id),
    onMutate: async (id: string) => optimistically(queryClient, prev => applyRead(prev, id)),
    // Un-read exactly this row. Its siblings keep what they earned.
    onError: (_error, id, context) =>
      revert(queryClient, context, prev => applyUnread(prev, id)),
    onSettled: () => settle(queryClient),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: MARK_READ_KEY,
    mutationFn: () => markNotificationsRead(),
    onMutate: async () => optimistically(queryClient, applyAllRead),
    onError: (_error, _vars, context) => revert(queryClient, context),
    onSettled: () => settle(queryClient),
  });
}

interface Rollback {
  previous: NotificationsData | undefined;
  /** Which session this work belongs to — see serverStateEpoch. */
  epoch: number;
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
  return { previous, epoch: serverStateEpoch() };
}

/**
 * Put back what a failed request had already shown as done.
 *
 * `undo` is the change's own inverse where the operation has one — that is
 * the only kind of rollback that can run while a sibling mutation is still
 * in flight without trampling it. Without an inverse (marking everything
 * read), the pre-change snapshot is all we have, so that path waits until
 * it is the last one standing and otherwise leaves the truth to the
 * settling refetch.
 */
function revert(
  queryClient: QueryClient,
  context: Rollback | undefined,
  undo?: (data: NotificationsData) => NotificationsData,
): void {
  if (!context) return;
  // The session that asked this question has ended. Its answer is not ours
  // to put back — writing it here would hand the next person to sign in on
  // this browser the previous one's notifications.
  if (context.epoch !== serverStateEpoch()) return;

  if (undo) {
    const current = queryClient.getQueryData<NotificationsData>(queryKeys.notifications);
    if (current) queryClient.setQueryData(queryKeys.notifications, undo(current));
    return;
  }

  if (!context.previous) return;
  if (queryClient.isMutating({ mutationKey: MARK_READ_KEY }) > 1) return;
  queryClient.setQueryData(queryKeys.notifications, context.previous);
}

/**
 * Ask the server again — but only once everyone is done. A refetch fired
 * while a sibling is still in flight returns a truth that predates it, and
 * lands on top of that sibling's optimistic read.
 */
function settle(queryClient: QueryClient): void {
  if (queryClient.isMutating({ mutationKey: MARK_READ_KEY }) > 1) return;
  void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
}
