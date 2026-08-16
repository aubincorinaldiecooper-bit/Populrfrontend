import { useCallback, useEffect, useState } from 'react';
import { isBackendConfigured, fetchInbox } from '../../lib/api';

/**
 * How many conversations are waiting on the creator — the badge on the
 * Inbox nav item, in the sidebar and the builder's rail alike.
 *
 * This used to live beside a whole conversations queue that powered the
 * inbox DRAWER — a second inbox that opened over every page while /inbox
 * existed as the first. The drawer is retired; the one thing from that era
 * still worth polling for is this number, because someone messaging you
 * while you are mid-build deserves a signal even when the Inbox is a page
 * away rather than an overlay.
 */

const UNREAD_PROBE = 10;
const UNREAD_POLL_MS = 60_000;

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
    if (!backendConfigured) return;

    // Nothing runs against a hidden tab: a laptop left open on this screen
    // overnight should cost nothing, and the visibility handler catches the
    // creator up the moment they come back to it.
    const tick = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const timer = setInterval(tick, UNREAD_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh, backendConfigured]);

  return { count, refresh };
}
