import { useSyncExternalStore } from 'react';
import { isBackendConfigured, fetchNotifications } from '../../lib/api';

/**
 * The bell's dot — one store, one poll, however many bells render (the
 * mobile bar and the desktop strip both mount one). Same shape as the
 * Inbox badge's store: surfaces that CHANGE the answer (opening the menu,
 * marking read) push the fresh count here instead of waiting a minute for
 * the poll to notice.
 */

let unread = 0;
const listeners = new Set<() => void>();

const POLL_MS = 60_000;
let timer: ReturnType<typeof setInterval> | null = null;

function emit(next: number) {
  if (next === unread) return;
  unread = next;
  for (const l of listeners) l();
}

/** Ask the server again. Fire-and-forget; a dot is not worth a toast. */
export function refreshNotificationsUnread(): void {
  if (!isBackendConfigured()) return;
  fetchNotifications()
    .then(res => emit(res.unread))
    .catch(() => emit(0));
}

/** A surface that already holds the fresh answer hands it over. */
export function reportNotificationsUnread(count: number): void {
  emit(count);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    refreshNotificationsUnread();
    timer = setInterval(refreshNotificationsUnread, POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNotificationsUnread(): { count: number } {
  return { count: useSyncExternalStore(subscribe, () => unread) };
}

export function resetNotificationsUnreadForTests(): void {
  unread = 0;
}
