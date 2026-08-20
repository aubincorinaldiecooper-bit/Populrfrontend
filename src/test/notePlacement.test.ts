import { describe, it, expect } from 'vitest';
import {
  pinPosition,
  relativeTo,
  spreadOverlaps,
  pickThreadSide,
  placeLabel,
  REL_MIN,
  REL_MAX,
} from '../lib/notePlacement';
import { NODE_HEIGHT, NODE_WIDTH } from '../lib/flowLayout';
import type { CommentThread } from '../lib/api';

/* Where a note is.
 *
 * The whole feature rests on two coordinate systems staying straight. A note
 * on a STEP is a fraction of that step's card, so it travels when the canvas
 * is rearranged. A note on the CANVAS is a world coordinate, so a reflow must
 * never move it. Confusing them would be invisible until somebody tidied
 * their automation and found their feedback had wandered.
 *
 * All pure, all in flow units — the canvas converts, and none of this needs
 * a DOM to be true.
 */

type Placed = Pick<CommentThread, 'nodeId' | 'place'>;

const nodes = {
  'send-1': { x: 300, y: 100 },
  'wait-1': { x: 600, y: 100 },
};
const nodeAt = (id: string) => (nodes as Record<string, { x: number; y: number }>)[id] ?? null;

describe('a note on a step', () => {
  it('is drawn at its fraction of that step’s card', () => {
    const thread: Placed = { nodeId: 'send-1', place: { relX: 0.5, relY: 0.5 } };
    expect(pinPosition(thread, nodeAt)).toEqual({
      x: 300 + NODE_WIDTH / 2,
      y: 100 + NODE_HEIGHT / 2,
    });
  });

  it('moves with the step, because the fraction is what was stored', () => {
    const thread: Placed = { nodeId: 'send-1', place: { relX: 0.25, relY: 0.75 } };
    const before = pinPosition(thread, nodeAt)!;
    // The same automation after a tidy: the step is somewhere else entirely.
    const after = pinPosition(thread, () => ({ x: 900, y: 400 }))!;

    expect(after.x - 900).toBeCloseTo(before.x - 300);
    expect(after.y - 400).toBeCloseTo(before.y - 100);
  });

  it('paints nothing when its step is not on the canvas', () => {
    const thread: Placed = { nodeId: 'gone', place: { relX: 0.5, relY: 0.5 } };
    // Not a pin at the origin, which is a pin in the wrong place — and not a
    // crash. The index still lists it.
    expect(pinPosition(thread, nodeAt)).toBeNull();
  });
});

describe('a note on the canvas', () => {
  it('is drawn at the world coordinates it was given', () => {
    const thread: Placed = { nodeId: null, place: { x: -420.5, y: 96 } };
    expect(pinPosition(thread, nodeAt)).toEqual({ x: -420.5, y: 96 });
  });

  it('does not move when the steps do', () => {
    const thread: Placed = { nodeId: null, place: { x: 40, y: 40 } };
    const before = pinPosition(thread, nodeAt);
    const after = pinPosition(thread, () => ({ x: 9999, y: 9999 }));
    // The whole point of the second anchor: "the gap here feels abrupt" is
    // about a place, and a reflow does not change which place was meant.
    expect(after).toEqual(before);
  });
});

describe('a legacy note about the whole automation', () => {
  it('has no pin at all, rather than an invented one', () => {
    expect(pinPosition({ nodeId: null, place: null }, nodeAt)).toBeNull();
  });
});

describe('turning a click into a placement', () => {
  it('keeps where on the card the person actually pointed', () => {
    const at = relativeTo({ x: 300, y: 100 }, { x: 300 + NODE_WIDTH * 0.74, y: 100 + NODE_HEIGHT * 0.62 });
    expect(at.relX).toBeCloseTo(0.74);
    expect(at.relY).toBeCloseTo(0.62);
  });

  it('allows just outside the card — that is a real thing to point at', () => {
    const at = relativeTo({ x: 300, y: 100 }, { x: 300 - 20, y: 100 - 10 });
    expect(at.relX).toBeLessThan(0);
    expect(at.relX).toBeGreaterThanOrEqual(REL_MIN);
  });

  it('pulls a wild click back rather than storing a pin nobody will find', () => {
    const at = relativeTo({ x: 300, y: 100 }, { x: 99999, y: -99999 });
    expect(at.relX).toBe(REL_MAX);
    expect(at.relY).toBe(REL_MIN);
  });
});

describe('two notes in the same spot', () => {
  it('are nudged apart so both can be clicked', () => {
    const spread = spreadOverlaps([
      { id: 'a', at: { x: 100, y: 100 } },
      { id: 'b', at: { x: 102, y: 101 } },
    ]);
    const a = spread.get('a')!;
    const b = spread.get('b')!;
    expect(Math.abs(a.x - b.x) >= 18 || Math.abs(a.y - b.y) >= 18).toBe(true);
  });

  it('leaves notes that were never on top of each other exactly where they are', () => {
    const spread = spreadOverlaps([
      { id: 'a', at: { x: 100, y: 100 } },
      { id: 'b', at: { x: 400, y: 300 } },
    ]);
    expect(spread.get('a')).toEqual({ x: 100, y: 100 });
    expect(spread.get('b')).toEqual({ x: 400, y: 300 });
  });

  it('arranges them the same way for everyone', () => {
    const pins = [
      { id: 'a', at: { x: 100, y: 100 } },
      { id: 'b', at: { x: 101, y: 100 } },
      { id: 'c', at: { x: 102, y: 100 } },
    ];
    // Same input, same output — the canvas is a shared surface, and a layout
    // that depended on fetch order would put one person's pin where another
    // person's isn't.
    expect([...spreadOverlaps(pins)]).toEqual([...spreadOverlaps(pins)]);
  });
});

describe('where a thread opens', () => {
  const card = { width: 300, height: 220 };

  it('opens beside its pin when there is room', () => {
    expect(pickThreadSide({ pin: { x: 100, y: 100 }, nodes: [], ...card })).toBe('right');
  });

  it('flips rather than clipping out of the viewport', () => {
    const side = pickThreadSide({
      pin: { x: 900, y: 100 },
      nodes: [],
      ...card,
      viewport: { left: 0, top: 0, right: 1000, bottom: 800 },
    });
    // 900 + 26 + 10 + 300 is past the right edge; left fits.
    expect(side).toBe('left');
  });

  it('dodges the steps rather than burying them', () => {
    const side = pickThreadSide({
      pin: { x: 100, y: 100 },
      // A step sitting exactly where a right-opening card would land.
      nodes: [{ position: { x: 140, y: 100 } }],
      ...card,
    });
    expect(side).not.toBe('right');
  });

  it('prefers a side that fits over a side that merely covers less', () => {
    const side = pickThreadSide({
      pin: { x: 900, y: 100 },
      // Covering one step on the left, nothing on the right — but the right
      // clips out of the viewport, and a card half off screen is worse than
      // a card over a step you can still scroll to.
      nodes: [{ position: { x: 560, y: 100 } }],
      ...card,
      viewport: { left: 0, top: 0, right: 1000, bottom: 800 },
    });
    expect(side).toBe('left');
  });
});

describe('what the index calls a place', () => {
  const label = (id: string) => (id === 'send-1' ? 'Message' : null);

  it('names the step', () => {
    expect(placeLabel({ nodeId: 'send-1', place: { relX: 0, relY: 0 } }, label)).toBe('Message');
  });

  it('says the canvas when it belongs to no step', () => {
    expect(placeLabel({ nodeId: null, place: { x: 1, y: 2 } }, label)).toBe('On the canvas');
  });

  it('and names a legacy note for what it is', () => {
    expect(placeLabel({ nodeId: null, place: null }, label)).toBe('On the whole automation');
  });

  it('falls back rather than showing an id when a step has no name', () => {
    expect(placeLabel({ nodeId: 'mystery', place: { relX: 0, relY: 0 } }, label)).toBe('On a step');
  });
});
