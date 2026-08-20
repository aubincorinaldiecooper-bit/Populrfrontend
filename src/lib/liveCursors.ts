/**
 * The arithmetic behind other people's pointers.
 *
 * Kept out of the component and out of the socket so it can be tested without
 * either: what colour somebody is, how a cursor catches up to where it was
 * last reported, and when one has gone quiet long enough to stop drawing.
 */

/**
 * The colours a collaborator can be.
 *
 * Not chartreuse — that belongs to Activate and to nothing else — and not the
 * problem amber either. These read as PEOPLE rather than as states, which is
 * the distinction the rest of the canvas rests on: colour on this canvas has
 * always meant "something is being said about your automation", and a cursor
 * is not that. Chosen to stay apart at small sizes and to hold on the
 * canvas's warm grey.
 */
export const CURSOR_COLOURS = [
  '#2F6BFF', // blue
  '#B44BD8', // violet
  '#12A594', // teal
  '#E8506E', // rose
  '#7A5AF8', // indigo
  '#C2611F', // rust
] as const;

/**
 * Which colour a person gets.
 *
 * By user rather than by connection, so somebody with two tabs open is one
 * colour in two places rather than two strangers. Deterministic, so everybody
 * in the room sees the same person as the same colour — a colour that
 * disagreed between browsers would make "the blue cursor" unsayable.
 */
export function colourFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return CURSOR_COLOURS[Math.abs(hash) % CURSOR_COLOURS.length];
}

/** What to call somebody on a label two centimetres wide. */
export function shortName(person: { name: string | null; email: string | null }): string {
  const name = person.name?.trim();
  if (name) return name.split(/\s+/)[0];
  const email = person.email?.trim();
  if (email) return email.split('@')[0];
  return 'Someone';
}

export interface Point { x: number; y: number }

/**
 * A cursor, caught up a little closer to where it actually is.
 *
 * Frames arrive perhaps twenty times a second and screens draw sixty, so a
 * cursor moved straight to each frame's position advances in visible steps.
 * This eases toward the last reported point instead, which turns the same
 * frames into continuous movement.
 *
 * `alpha` is the fraction of the remaining distance to close on this frame,
 * scaled by how long the frame took so the speed does not change with the
 * refresh rate. Snapping below a fraction of a pixel stops a cursor
 * asymptotically never arriving, which leaves it very slightly wrong forever
 * and re-renders about it.
 */
export function easeToward(from: Point, to: Point, deltaMs: number, perSecond = 18): Point {
  const alpha = 1 - Math.exp(-perSecond * (deltaMs / 1000));
  const next = {
    x: from.x + (to.x - from.x) * alpha,
    y: from.y + (to.y - from.y) * alpha,
  };
  if (Math.abs(to.x - next.x) < 0.05 && Math.abs(to.y - next.y) < 0.05) return { ...to };
  return next;
}

/**
 * How long a pointer may go unmentioned before it stops being drawn.
 *
 * A cursor left sitting where somebody last moved it reads as a person
 * standing there. They are usually in another tab. The socket says so when it
 * can — a close, a pointer leaving the canvas — and this covers the times it
 * cannot.
 */
export const STALE_AFTER_MS = 15_000;

export function isStale(lastSeenAt: number, now: number): boolean {
  return now - lastSeenAt > STALE_AFTER_MS;
}
