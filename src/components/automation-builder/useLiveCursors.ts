import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL, isBackendConfigured } from '../../lib/api';
import { getApiAuthToken } from '../../lib/authClient';
import { colourFor, easeToward, isStale, type Point } from '../../lib/liveCursors';

/**
 * Other people's pointers, on this canvas, now.
 *
 * The one channel in the app whose loss costs nothing. If the socket never
 * connects — an old proxy, a network that eats upgrades, a backend that
 * predates it — the builder behaves exactly as it did before and the facepile
 * still says who is here. So there is no error state and nothing is reported:
 * a failure to connect is a canvas without cursors, which is what every
 * canvas was until now.
 *
 * Positions are WORLD coordinates. A cursor means a place on the automation,
 * not a place on a screen, so two people at different zoom levels agree about
 * where somebody is pointing.
 */

export interface LiveCursor {
  /** Per CONNECTION: one person with two tabs open is two cursors. */
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  colour: string;
  /** Where the cursor is drawn — eased toward `target` every frame. */
  at: Point;
  /** The last place the socket reported. */
  target: Point;
  lastSeenAt: number;
}

interface Person {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

/** Twenty a second: below what a screen draws, far above what an eye needs,
 *  and a twentieth of what an untouched pointermove handler would send. */
const SEND_EVERY_MS = 50;

/** A dropped socket is retried on a widening delay, so a backend that is
 *  down does not get hammered by every open builder. */
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

export function useLiveCursors(flowId: string | null): {
  cursors: LiveCursor[];
  /** Report where this session's pointer is, in world coordinates. */
  report: (at: Point) => void;
  /** This session's pointer has left the canvas. */
  leftCanvas: () => void;
} {
  const [cursors, setCursors] = useState<LiveCursor[]>([]);
  const socket = useRef<WebSocket | null>(null);
  const people = useRef(new Map<string, LiveCursor>());
  const lastSentAt = useRef(0);

  /**
   * Somebody we have not drawn before. Declared above the socket that calls
   * it, and a useCallback so the effect below can depend on it honestly.
   */
  const remember = useCallback((who: Person) => {
    if (people.current.has(who.id)) return;
    // Starts where it will be drawn, so a newcomer's first frame does not fly
    // in from the origin across the whole automation.
    const start = { x: 0, y: 0 };
    people.current.set(who.id, {
      ...who,
      colour: colourFor(who.userId),
      at: start,
      target: start,
      lastSeenAt: Date.now(),
    });
  }, []);

  /* ── the connection ───────────────────────────────────────────────────── */
  useEffect(() => {
    if (!flowId || !isBackendConfigured()) return;
    if (typeof WebSocket === 'undefined') return;

    let closed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    // Captured here rather than read off the ref during cleanup: by the time
    // the cleanup runs the ref may point at a different render's map, and the
    // one this effect filled is the one that has to be emptied.
    const room = people.current;

    const forget = (id: string) => {
      people.current.delete(id);
      setCursors([...people.current.values()]);
    };

    const connect = async () => {
      if (closed) return;
      const token = await getApiAuthToken();
      if (closed || !token) return;

      const base = API_BASE_URL || window.location.origin;
      const url = new URL(`/api/flows/${flowId}/live`, base);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

      let ws: WebSocket;
      try {
        // The token rides in the subprotocol rather than the query string:
        // a URL ends up in access logs and proxy logs, and this does not.
        ws = new WebSocket(url.toString(), ['populr-token', token]);
      } catch {
        return;
      }
      socket.current = ws;

      ws.onmessage = event => {
        let message: unknown;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!message || typeof message !== 'object') return;
        const m = message as Record<string, unknown>;

        if (m.t === 'here' && Array.isArray(m.who)) {
          // Everybody already on the canvas, so a cursor is not invisible
          // until its owner happens to move.
          for (const who of m.who as Person[]) remember(who);
          setCursors([...people.current.values()]);
        } else if (m.t === 'joined' && m.who) {
          remember(m.who as Person);
          setCursors([...people.current.values()]);
        } else if (m.t === 'moved' && typeof m.id === 'string') {
          const found = people.current.get(m.id);
          if (!found) return;
          found.target = { x: Number(m.x) || 0, y: Number(m.y) || 0 };
          found.lastSeenAt = Date.now();
        } else if ((m.t === 'left' || m.t === 'away') && typeof m.id === 'string') {
          forget(m.id);
        }
      };

      ws.onclose = () => {
        if (socket.current === ws) socket.current = null;
        people.current.clear();
        setCursors([]);
        if (closed) return;
        const wait = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)];
        attempt += 1;
        retry = setTimeout(() => void connect(), wait);
      };

      ws.onopen = () => { attempt = 0; };
      // Deliberately silent. See the note at the top: no cursors is a
      // perfectly good canvas, and an error here is not the creator's
      // problem to hear about.
      ws.onerror = () => {};
    };

    void connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      const ws = socket.current;
      socket.current = null;
      room.clear();
      setCursors([]);
      // 1000 is a normal close: the builder was left, nothing went wrong.
      try { ws?.close(1000); } catch { /* already gone */ }
    };
  }, [flowId, remember]);

  /* ── drawing them ─────────────────────────────────────────────────────── */
  useEffect(() => {
    let frame = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      const delta = now - previous;
      previous = now;
      let changed = false;
      const stamp = Date.now();

      for (const [id, cursor] of people.current) {
        if (isStale(cursor.lastSeenAt, stamp)) {
          people.current.delete(id);
          changed = true;
          continue;
        }
        const next = easeToward(cursor.at, cursor.target, delta);
        if (next.x !== cursor.at.x || next.y !== cursor.at.y) {
          cursor.at = next;
          changed = true;
        }
      }

      // One state update per frame, and only when something moved — a canvas
      // where nobody is moving costs nothing to have this open.
      if (changed) setCursors([...people.current.values()]);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  /* ── reporting this session's pointer ─────────────────────────────────── */
  const report = useCallback((at: Point) => {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    if (now - lastSentAt.current < SEND_EVERY_MS) return;
    lastSentAt.current = now;
    try {
      ws.send(JSON.stringify({ t: 'moved', x: at.x, y: at.y }));
    } catch {
      // A socket that closed between the check and the write. The next
      // pointermove is 50ms away and the reconnect is already scheduled.
    }
  }, []);

  const leftCanvas = useCallback(() => {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ t: 'away' }));
    } catch { /* as above */ }
  }, []);

  return { cursors, report, leftCanvas };
}
