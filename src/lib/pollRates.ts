/**
 * How often a surface asks again on its own.
 *
 * Two numbers, in one place, because they only mean anything relative to
 * each other: the rate the app ran at before the live feed existed, and the
 * rate it drops to once the feed is carrying the news.
 *
 * The slow one is not "the feed made polling unnecessary" — it is the
 * fallback the feed was built on top of rather than in place of. The
 * server's hub is per-instance, so an event can land on an instance a tab
 * isn't connected to, and the honest answer to that is a quiet tick, not a
 * promise. If the feed drops, POLL_MS comes back on its own.
 */

/** What every polled surface ran at before there was anything better. */
export const POLL_MS = 60_000;

/** The tick that stays behind a connected feed. */
export const FEED_SAFETY_NET_MS = 5 * 60_000;

/**
 * How often to ask, given whether the feed is carrying the news.
 *
 * A function rather than a ternary at each call site, because it is one
 * decision that two surfaces happen to make — and a decision written twice
 * is a decision that will eventually be made two different ways.
 */
export function pollRate(feedIsLive: boolean): number {
  return feedIsLive ? FEED_SAFETY_NET_MS : POLL_MS;
}
