import { useEffect, useMemo, useRef, useState } from 'react';
import {
  derivedNotifications, resolvedFrom, type BuilderNotification,
} from '../../lib/builderNotifications';
import type { FlowProblem } from '../../lib/api';
import type { FlowGraph } from '../../lib/flowSchema';

/**
 * The bell's contents.
 *
 * Everything open is derived from the server's activation problems, so the
 * feed cannot drift from what Activate will actually allow. The only state
 * held here is the part that can't be derived: when each item first appeared
 * (so the feed can say "2m"), and the handful of questions the creator has
 * just answered, which linger briefly as "✓ Message is ready" so answering
 * something feels like it landed rather than like a row disappearing.
 */

/** How many answered questions stay visible. Enough to feel acknowledged. */
const RESOLVED_KEPT = 3;

export interface BuilderNotifications {
  /** Everything the panel shows, unresolved first. */
  feed: BuilderNotification[];
  /** What the badge counts — questions and warnings, never resolved items. */
  unresolvedCount: number;
  open: BuilderNotification[];
}

export function useBuilderNotifications(
  problems: FlowProblem[],
  graph: FlowGraph,
): BuilderNotifications {
  const derived = useMemo(() => derivedNotifications(problems, graph), [problems, graph]);

  const [open, setOpen] = useState<BuilderNotification[]>([]);
  const [resolved, setResolved] = useState<BuilderNotification[]>([]);
  // The previous open list, to spot what has just been answered. A ref rather
  // than state: it is read to compute the next render, never rendered itself.
  const previous = useRef<BuilderNotification[]>([]);

  useEffect(() => {
    const now = Date.now();
    const firstSeen = new Map(previous.current.map(n => [n.id, n.createdAt]));
    const next = derived.map(n => ({ ...n, createdAt: firstSeen.get(n.id) ?? now }));

    // Only a question can be "answered". A warning that goes away — an
    // account reconnected elsewhere, a platform capability changing — is not
    // something the creator did here, and claiming credit for it would be a
    // small lie in a surface whose whole job is telling them what's true.
    const answered = previous.current.filter(
      before => before.kind === 'question' && !derived.some(after => after.id === before.id),
    );

    previous.current = next;
    setOpen(next);
    if (answered.length) {
      setResolved(current => [...answered.map(n => resolvedFrom(n, now)), ...current].slice(0, RESOLVED_KEPT));
    }
  }, [derived]);

  const feed = useMemo(() => {
    // A question that came back — the creator cleared the post again — must
    // not sit in the feed twice, once as a question and once as a boast that
    // it was answered.
    const openIds = new Set(open.map(n => n.id));
    return [...open, ...resolved.filter(r => !openIds.has(r.id.replace(/:resolved:\d+$/, '')))];
  }, [open, resolved]);

  return { feed, open, unresolvedCount: open.length };
}
