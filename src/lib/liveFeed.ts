import { API_BASE_URL, isBackendConfigured } from './api';
import { getApiAuthToken } from './authClient';

/**
 * The connection that lets the app stop asking every minute.
 *
 * The server holds one response open and writes a line when something in
 * this workspace changes. The line names a FAMILY — conversations,
 * notifications — and carries nothing else, so what arrives here is never
 * data to render, only a reason to re-ask. The cache already knows how to
 * ask; components/app/useLiveFeed.ts is the half that does.
 *
 * `fetch` rather than `EventSource`, because the session is a bearer token
 * and EventSource cannot set a header. That means owning the reconnect,
 * which is fine: it's a backoff and a flag, and the poll behind it means a
 * connection that never comes back costs lateness rather than silence.
 */

export type FeedTopic = 'conversations' | 'notifications';

const TOPICS = new Set<string>(['conversations', 'notifications'] satisfies FeedTopic[]);

/** First retry, doubling to the cap — a server restart shouldn't stampede. */
const FIRST_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

/**
 * Whether anything is currently listening.
 *
 * A count rather than a flag: nothing stops two connections existing for a
 * moment during a remount, and one of them closing does not mean the app
 * has gone deaf. Read through `subscribeToFeedStatus` so the fallback polls
 * can slow down while this is true and speed back up when it isn't.
 */
let liveConnections = 0;
const statusListeners = new Set<() => void>();

export function feedIsLive(): boolean {
  return liveConnections > 0;
}

export function subscribeToFeedStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function changeConnections(delta: number): void {
  const wasLive = liveConnections > 0;
  liveConnections = Math.max(0, liveConnections + delta);
  if (wasLive === liveConnections > 0) return;
  for (const listener of statusListeners) listener();
}

/**
 * Stay connected until the returned function is called.
 *
 * Never throws and never reports a failure to the caller: a feed that is
 * down is a slower app, not a broken one, and there is nothing a creator
 * could usefully do about it.
 */
export function connectLiveFeed(onTopic: (topic: FeedTopic) => void): () => void {
  if (!isBackendConfigured()) return () => {};

  let stopped = false;
  let retryMs = FIRST_RETRY_MS;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let counted = false;

  const hold = () => {
    if (counted) return;
    counted = true;
    changeConnections(1);
  };
  const release = () => {
    if (!counted) return;
    counted = false;
    changeConnections(-1);
  };

  const run = async (): Promise<void> => {
    const token = await getApiAuthToken();
    if (stopped) return;
    // No session, no stream. The retry below brings it back once there is
    // one — signing in doesn't need to know this file exists.
    if (!token) throw new Error('no session');

    controller = new AbortController();
    const response = await fetch(`${API_BASE_URL}/api/feed`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error(`feed unavailable (${response.status})`);

    hold();
    // The connection lasting is itself the evidence it works, so the backoff
    // resets here rather than on the first event — a workspace can be quiet
    // for hours without that meaning anything is wrong.
    retryMs = FIRST_RETRY_MS;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // A frame can arrive split across chunks, so only whole lines are read
      // and the remainder waits for the rest of itself.
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const named = /^event:\s*(\S+)\s*$/.exec(line);
        // `open` and the heartbeat comments say the connection is alive,
        // which the loop still running already says. Only real topics are
        // passed on, and an unknown one is ignored rather than guessed at —
        // a newer server may name something this build has never heard of.
        if (named && TOPICS.has(named[1])) onTopic(named[1] as FeedTopic);
      }
    }
  };

  const loop = () => {
    if (stopped) return;
    run()
      .catch(() => {
        // Every failure is the same failure from here: try again later.
      })
      .finally(() => {
        release();
        if (stopped) return;
        retryTimer = setTimeout(loop, retryMs);
        retryTimer.unref?.();
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
      });
  };

  loop();

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    controller?.abort();
    release();
  };
}
