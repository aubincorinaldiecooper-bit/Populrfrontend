import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  isBackendConfigured, fetchInbox, sendInboxReply, setInboxNeedsReply, ApiError,
} from '../../lib/api';
import type { InboxItem } from '../../lib/api';

/**
 * The conversations queue, once — used by the Inbox page and by the drawer
 * that opens over the builder.
 *
 * Extracted rather than duplicated: replying is the one thing in this app
 * that sends a real message to a real person, and two copies of "send, then
 * refetch, and say the right thing when the platform refuses" would
 * eventually disagree about something that matters. The two surfaces differ
 * in how they *look* — a page of roomy cards, a compact drawer beside the
 * canvas — not in what they do.
 */

export const INBOX_PAGE_SIZE = 30;

export type InboxTab = 'needs_you' | 'all';

export interface InboxQueue {
  items: InboxItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  /** Which item is mid-send, and which is mid-resolve. */
  sending: string | null;
  resolving: string | null;
  load: () => void;
  loadMore: () => void;
  send: (item: InboxItem, input: { text?: string; useSuggested?: boolean }) => Promise<boolean>;
  resolve: (item: InboxItem) => Promise<void>;
}

export function useInboxQueue(tab: InboxTab, options: { enabled?: boolean } = {}): InboxQueue {
  const enabled = options.enabled ?? true;
  const { showToast } = useApp();
  const backendConfigured = isBackendConfigured();

  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(backendConfigured && enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  // The API returns no total, so "is there more?" is inferred: a full page
  // implies there may be another one behind it.
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  // Monotonic request id: only the newest in-flight fetch may write state.
  // Without it, switching tabs while a slow request is in flight lets the
  // older response land last and show the previous tab's queue under the
  // newly selected one.
  const requestSeq = useRef(0);

  const runFetch = useCallback(async ({ offset, append }: { offset: number; append: boolean }) => {
    if (!backendConfigured || !enabled) return;
    const seq = ++requestSeq.current;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetchInbox({
        needsReply: tab === 'needs_you' ? true : undefined,
        limit: INBOX_PAGE_SIZE,
        offset,
      });
      if (seq !== requestSeq.current) return; // superseded by a newer fetch
      setItems(prev => (append ? [...prev, ...res.items] : res.items));
      setHasMore(res.items.length === INBOX_PAGE_SIZE);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      const msg = err instanceof Error ? err.message : 'Could not load your inbox.';
      if (append) showToast(msg, 'error');
      else setError(msg);
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [backendConfigured, enabled, tab, showToast]);

  const load = useCallback(() => void runFetch({ offset: 0, append: false }), [runFetch]);
  const loadMore = useCallback(
    () => void runFetch({ offset: items.length, append: true }),
    [runFetch, items.length],
  );

  useEffect(() => {
    // Data fetch from the backend, not derived state — see ContactsPage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const send = useCallback(async (
    item: InboxItem,
    input: { text?: string; useSuggested?: boolean },
  ): Promise<boolean> => {
    setSending(item.id);
    try {
      const result = await sendInboxReply(item.id, input);
      showToast(`Reply sent on ${result.channel === 'dm' ? 'DM' : 'the comment thread'}.`, 'success');
      load();
      return true;
    } catch (err) {
      // 422 means the platform genuinely can't carry this reply — say that,
      // not a generic failure.
      const msg = err instanceof ApiError && err.code === 'not_supported_on_platform'
        ? err.message
        : err instanceof Error ? err.message : 'Could not send this reply.';
      showToast(msg, 'error');
      return false;
    } finally {
      setSending(null);
    }
  }, [showToast, load]);

  const resolve = useCallback(async (item: InboxItem) => {
    setResolving(item.id);
    try {
      await setInboxNeedsReply(item.id, false);
      showToast('Marked handled', 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update this conversation.', 'error');
    } finally {
      setResolving(null);
    }
  }, [showToast, load]);

  return {
    items, loading, loadingMore, hasMore, error, sending, resolving,
    load, loadMore, send, resolve,
  };
}

/**
 * Just the number for the top bar's badge.
 *
 * Deliberately its own small request rather than the full queue: the badge
 * has to be right before anything is opened, and every page paying for a
 * page of conversations it isn't showing would be a poor trade. Capped —
 * past a point the exact figure stops being the point.
 */
const UNREAD_PROBE = 10;

export function useInboxUnread(): { count: number; refresh: () => void } {
  const [count, setCount] = useState(0);
  const backendConfigured = isBackendConfigured();

  const refresh = useCallback(() => {
    if (!backendConfigured) return;
    fetchInbox({ needsReply: true, limit: UNREAD_PROBE })
      .then(res => setCount(res.items.length))
      // A badge is not worth a toast. Silence here means "no number yet",
      // which is exactly what an unreachable backend should show.
      .catch(() => setCount(0));
  }, [backendConfigured]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { count, refresh };
}
