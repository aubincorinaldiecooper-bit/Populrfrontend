import { useSyncExternalStore } from 'react';
import { isBackendConfigured, fetchConversations } from '../../lib/api';

/**
 * How many conversations are waiting on the creator — the badge on the Inbox
 * nav item, in the sidebar and the builder's rail alike.
 *
 * ONE STORE, ONE POLL, ONE DEFINITION. Three ways this number can lie, each
 * of which shaped this module:
 *
 * - Counting inbox ROWS overstates: one person with three flagged messages is
 *   one conversation waiting, not three — and the Inbox page already counts
 *   it that way. The badge asks the same endpoint the page asks
 *   (fetchConversations) and counts conversations with something waiting, so
 *   the pill in the nav and the "N waiting on you" subtitle can never
 *   disagree about what waiting means.
 *
 * - Two components each running their own poll doubles every request: in the
 *   builder the rail AND the (mobile-only, but still mounted) sidebar both
 *   want the number. This is a module-level store with useSyncExternalStore
 *   subscribers — however many badges render, there is one interval, started
 *   by the first subscriber and stopped by the last.
 *
 * - A poll-only badge goes stale the moment the creator acts: reply to the
 *   waiting person and the nav claims they are still waiting for up to a
 *   minute. So the surfaces that CHANGE the answer push it here —
 *   useConversations reports the fresh count it just fetched after every
 *   list refresh (zero extra requests), and a reply sent from the Contacts
 *   conversation asks for a re-count.
 */

let count = 0;
const listeners = new Set<() => void>();

const UNREAD_POLL_MS = 60_000;
let timer: ReturnType<typeof setInterval> | null = null;
/** Held so stop() removes the same handler start() added. */
let visibilityTick: (() => void) | null = null;

function emit(next: number) {
  if (next === count) return;
  count = next;
  for (const l of listeners) l();
}

/** Ask the server again. Fire-and-forget; a badge is not worth a toast. */
export function refreshInboxUnread(): void {
  if (!isBackendConfigured()) return;
  fetchConversations({})
    .then(res => emit(res.conversations.filter(c => c.waiting > 0).length))
    // Silence means "no number yet", which is exactly what an unreachable
    // backend should show.
    .catch(() => emit(0));
}

/**
 * A surface that already holds the fresh answer hands it over — the Inbox
 * page refetches its list after every send and resolve, and re-counting from
 * here would be a second request for a number it is already displaying.
 */
export function reportWaitingConversations(waiting: number): void {
  emit(waiting);
}

function start() {
  refreshInboxUnread();
  // Nothing runs against a hidden tab: a laptop left open overnight should
  // cost nothing, and the visibility handler catches the creator up the
  // moment they come back.
  visibilityTick = () => {
    if (document.visibilityState === 'visible') refreshInboxUnread();
  };
  timer = setInterval(visibilityTick, UNREAD_POLL_MS);
  document.addEventListener('visibilitychange', visibilityTick);
  window.addEventListener('focus', refreshInboxUnread);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  if (visibilityTick) document.removeEventListener('visibilitychange', visibilityTick);
  visibilityTick = null;
  window.removeEventListener('focus', refreshInboxUnread);
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

export function useInboxUnread(): { count: number; refresh: () => void } {
  const current = useSyncExternalStore(subscribe, () => count);
  return { count: current, refresh: refreshInboxUnread };
}

/** Tests only: the store is module-level, so state outlives an unmount. */
export function resetInboxUnreadForTests(): void {
  count = 0;
}
