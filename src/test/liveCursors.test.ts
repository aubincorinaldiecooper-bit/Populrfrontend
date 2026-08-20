import { describe, it, expect } from 'vitest';
import {
  CURSOR_COLOURS, colourFor, easeToward, isStale, shortName, STALE_AFTER_MS,
} from '../lib/liveCursors';

/* The arithmetic behind other people's pointers.
 *
 * Cursors are the one place this canvas is deliberately loud — the seat we
 * built exists so somebody else can be here, and a canvas that never shows
 * them is a canvas that never says so. What that costs is a set of small
 * rules that all have to hold at once, and this is them.
 */

describe('what colour somebody is', () => {
  it('is the same answer every time, so a person keeps their colour', () => {
    expect(colourFor('user_abc')).toBe(colourFor('user_abc'));
  });

  it('is the same answer in everybody else’s browser too', () => {
    // Nothing random and nothing about arrival order: if two people saw the
    // same collaborator as different colours, "the blue cursor" would stop
    // being a thing anybody could say out loud.
    const seen = ['u1', 'u2', 'u3'].map(colourFor);
    const again = ['u3', 'u1', 'u2'].map(colourFor);
    expect(again).toEqual([seen[2], seen[0], seen[1]]);
  });

  it('is one of the ones we chose', () => {
    for (const id of ['a', 'bb', 'ccc', 'user_1234567890', '']) {
      expect(CURSOR_COLOURS).toContain(colourFor(id) as typeof CURSOR_COLOURS[number]);
    }
  });

  it('is never the colour that means Activate', () => {
    // Chartreuse is spent on turning an automation on and on nothing else.
    // A person wearing it would be saying something about the automation.
    expect(CURSOR_COLOURS).not.toContain('#C5FF3D' as never);
  });
});

describe('what to call somebody on a label two centimetres wide', () => {
  it('is their first name when there is one', () => {
    expect(shortName({ name: 'Robin Hale', email: 'r@example.com' })).toBe('Robin');
  });

  it('falls back to the part of the address that is a name', () => {
    expect(shortName({ name: null, email: 'robin.hale@example.com' })).toBe('robin.hale');
  });

  it('says something rather than nothing when we know neither', () => {
    // A blank label reads as a rendering bug. "Someone" is true.
    expect(shortName({ name: null, email: null })).toBe('Someone');
    expect(shortName({ name: '   ', email: null })).toBe('Someone');
  });
});

describe('catching up to where a cursor actually is', () => {
  it('moves toward the target rather than jumping to it', () => {
    // Frames arrive about twenty times a second and screens draw sixty. Moved
    // straight to each frame's position, a cursor advances in visible steps.
    const next = easeToward({ x: 0, y: 0 }, { x: 100, y: 0 }, 16);
    expect(next.x).toBeGreaterThan(0);
    expect(next.x).toBeLessThan(100);
  });

  it('covers more ground in a longer frame', () => {
    // Otherwise the speed of everybody's cursor would depend on the refresh
    // rate of the screen watching them.
    const short = easeToward({ x: 0, y: 0 }, { x: 100, y: 0 }, 8);
    const long = easeToward({ x: 0, y: 0 }, { x: 100, y: 0 }, 32);
    expect(long.x).toBeGreaterThan(short.x);
  });

  it('arrives instead of getting forever closer', () => {
    // Easing alone approaches without reaching, which leaves a cursor a
    // fraction of a pixel wrong forever and re-rendering about it.
    let at = { x: 0, y: 0 };
    for (let i = 0; i < 200; i += 1) at = easeToward(at, { x: 10, y: 5 }, 16);
    expect(at).toEqual({ x: 10, y: 5 });
  });

  it('stays put when it is already there', () => {
    expect(easeToward({ x: 7, y: 3 }, { x: 7, y: 3 }, 16)).toEqual({ x: 7, y: 3 });
  });

  it('handles both axes at once', () => {
    const next = easeToward({ x: 0, y: 0 }, { x: 100, y: -50 }, 16);
    expect(next.x).toBeGreaterThan(0);
    expect(next.y).toBeLessThan(0);
  });
});

describe('a pointer that has gone quiet', () => {
  it('stops being drawn', () => {
    // A cursor left where somebody last moved it reads as a person standing
    // there. They are usually in another tab.
    expect(isStale(0, STALE_AFTER_MS + 1)).toBe(true);
  });

  it('is left alone while it is still recent', () => {
    // Somebody reading a step rather than moving over it is still here.
    expect(isStale(0, STALE_AFTER_MS - 1)).toBe(false);
  });
});
