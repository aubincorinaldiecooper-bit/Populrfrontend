import { NODE_HEIGHT, NODE_WIDTH } from './flowLayout';
import type { CommentThread, NoteAnchor } from './api';

/**
 * Where a note is, and where its thread should open.
 *
 * Two coordinate systems meet here and the whole feature rests on keeping
 * them straight. A note anchored to a STEP stores a fraction of that step's
 * card, so it travels when the step moves and survives a card that grows. A
 * note dropped on empty canvas stores world coordinates, the same space node
 * positions live in, so pan and zoom are transforms rather than edits.
 *
 * Everything below is pure and in flow units. The canvas converts.
 */

/** The pin's own footprint, in flow units at zoom 1. */
export const PIN_SIZE = 26;

/**
 * Where a thread's pin sits, in world coordinates.
 *
 * Returns null for a note with no place — a legacy whole-automation note, or
 * one whose step went away outside the server's conversion path. Those live
 * in the index and paint nothing, which is honest: a pin somewhere invented
 * is worse than no pin.
 */
export function pinPosition(
  thread: Pick<CommentThread, 'nodeId' | 'place'>,
  nodeAt: (id: string) => { x: number; y: number } | null,
): { x: number; y: number } | null {
  const place = thread.place;
  if (!place) return null;
  if (thread.nodeId) {
    if (!('relX' in place)) return null;
    const origin = nodeAt(thread.nodeId);
    if (!origin) return null;
    return {
      x: origin.x + place.relX * NODE_WIDTH,
      y: origin.y + place.relY * NODE_HEIGHT,
    };
  }
  return 'x' in place ? { x: place.x, y: place.y } : null;
}

/**
 * A click on a step, as a fraction of that step's card.
 *
 * Clamped to a little outside the card on purpose: pointing just past an
 * edge is how somebody says "this side of it" without covering the words
 * they mean. The same bounds the server clamps to — stated in both places
 * because a pin that survives the client and is moved by the server would
 * jump under the creator's hand.
 */
export const REL_MIN = -0.35;
export const REL_MAX = 1.35;

export function relativeTo(
  node: { x: number; y: number },
  worldPoint: { x: number; y: number },
): { relX: number; relY: number } {
  const clamp = (n: number) => Math.min(REL_MAX, Math.max(REL_MIN, n));
  return {
    relX: clamp((worldPoint.x - node.x) / NODE_WIDTH),
    relY: clamp((worldPoint.y - node.y) / NODE_HEIGHT),
  };
}

/**
 * Two pins in the same spot are one unreadable pin.
 *
 * Nudges anything that lands within `spread` of an earlier pin along a short
 * diagonal. Deterministic in the order given — the caller sorts by id — so
 * every person looking at this canvas sees the same arrangement rather than
 * a layout that depends on fetch order.
 *
 * Deliberately not clustering: two notes on one step is the ordinary case
 * and deserves two pins, not a badge that has to be opened to be understood.
 */
export function spreadOverlaps(
  pins: { id: string; at: { x: number; y: number } }[],
  spread = 18,
  step = 14,
): Map<string, { x: number; y: number }> {
  const placed: { x: number; y: number }[] = [];
  const out = new Map<string, { x: number; y: number }>();
  for (const pin of pins) {
    let { x, y } = pin.at;
    let nudges = 0;
    while (
      placed.some(p => Math.abs(p.x - x) < spread && Math.abs(p.y - y) < spread) &&
      nudges < 12
    ) {
      nudges += 1;
      x = pin.at.x + step * nudges;
      y = pin.at.y + step * nudges * 0.5;
    }
    placed.push({ x, y });
    out.set(pin.id, { x, y });
  }
  return out;
}

export type ThreadSide = 'right' | 'left' | 'bottom' | 'top';

interface Rect { left: number; top: number; right: number; bottom: number; }

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function threadRect(
  side: ThreadSide,
  pin: { x: number; y: number },
  width: number,
  height: number,
  gap: number,
): Rect {
  switch (side) {
    case 'right':
      return { left: pin.x + PIN_SIZE + gap, right: pin.x + PIN_SIZE + gap + width,
               top: pin.y, bottom: pin.y + height };
    case 'left':
      return { left: pin.x - gap - width, right: pin.x - gap,
               top: pin.y, bottom: pin.y + height };
    case 'bottom':
      return { left: pin.x, right: pin.x + width,
               top: pin.y + PIN_SIZE + gap, bottom: pin.y + PIN_SIZE + gap + height };
    case 'top':
      return { left: pin.x, right: pin.x + width,
               top: pin.y - gap - height, bottom: pin.y - gap };
  }
}

/**
 * Which side of a pin its thread opens on.
 *
 * The same reasoning the step editor uses, and for the same reason: the card
 * floats above the canvas, so whatever it covers is unreachable until it
 * closes. Sides are tried in reading order and scored by how many STEPS the
 * card would bury, with sides that fit the viewport beating sides that clip.
 * Ties keep the earlier side, so a thread with nothing to dodge always opens
 * to the right of its pin — where the eye already is after clicking it.
 */
export function pickThreadSide(input: {
  pin: { x: number; y: number };
  nodes: { position: { x: number; y: number } }[];
  /** The card's footprint in FLOW units — screen pixels divided by zoom. */
  width: number;
  height: number;
  gap?: number;
  /** The visible canvas in flow coordinates, when known. */
  viewport?: Rect | null;
}): ThreadSide {
  const { pin, nodes, width, height, gap = 10, viewport = null } = input;
  const steps = nodes.map(n => ({
    left: n.position.x, right: n.position.x + NODE_WIDTH,
    top: n.position.y, bottom: n.position.y + NODE_HEIGHT,
  }));

  const sides: ThreadSide[] = ['right', 'left', 'bottom', 'top'];
  let best: { side: ThreadSide; covered: number; fits: boolean } | null = null;
  for (const side of sides) {
    const rect = threadRect(side, pin, width, height, gap);
    const covered = steps.filter(s => overlaps(rect, s)).length;
    const fits =
      !viewport ||
      (rect.left >= viewport.left && rect.right <= viewport.right &&
        rect.top >= viewport.top && rect.bottom <= viewport.bottom);
    if (!best || (fits && !best.fits) || (fits === best.fits && covered < best.covered)) {
      best = { side, covered, fits };
    }
  }
  return best!.side;
}

/** What to call the place a note is about, in the index. */
export function placeLabel(
  thread: Pick<CommentThread, 'nodeId' | 'place'>,
  stepLabel: (id: string) => string | null,
): string {
  if (thread.nodeId) return stepLabel(thread.nodeId) ?? 'On a step';
  if (thread.place && 'x' in (thread.place as NoteAnchor)) return 'On the canvas';
  return 'On the whole automation';
}
