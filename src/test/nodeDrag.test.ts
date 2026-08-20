import { describe, it, expect } from 'vitest';
import type { NodeChange } from '@xyflow/react';
import { moved, readDrag, releaseDrag } from '../lib/nodeDrag';

/* Dragging a step, when the canvas is controlled.
 *
 * The bug this exists to prevent: the canvas builds its `nodes` from the
 * graph, and the graph only learns a position when the gesture ENDS. So
 * while a step is being dragged there are two answers to "where is it" —
 * React Flow's live one, and the graph's older one — and every re-render of
 * the builder handed React Flow the older one back. The builder re-renders
 * plenty mid-drag: a collaborator heartbeat every 20 seconds, the notes
 * query, an autosave settling. Each one yanked the card out from under the
 * cursor, which is what made steps feel stuck.
 *
 * So the canvas holds the live position itself, and this is the reading of a
 * change batch that decides what to hold and what to write down.
 */

const moving = (id: string, x: number, y: number): NodeChange =>
  ({ type: 'position', id, position: { x, y }, dragging: true }) as NodeChange;

const dropped = (id: string, x: number, y: number): NodeChange =>
  ({ type: 'position', id, position: { x, y }, dragging: false }) as NodeChange;

describe('reading a batch of changes as a drag', () => {
  it('holds a step that is still moving, and writes nothing down', () => {
    const { live, settled } = readDrag([moving('send', 120, 40)]);
    expect(live).toEqual({ send: { x: 120, y: 40 } });
    // Committing here would be a save per pointermove, and a drag is not an
    // edit anybody wants to find in their history.
    expect(settled).toEqual([]);
  });

  it('writes down a step that has been let go, and stops holding it', () => {
    const { live, settled } = readDrag([dropped('send', 300, 90)]);
    expect(settled).toEqual([{ id: 'send', position: { x: 300, y: 90 } }]);
    expect(live).toEqual({});
  });

  it('settles a step that moved and let go inside one batch', () => {
    // Both arrive together at the end of a fast gesture. Holding the last
    // frame as well would pin the step there and the graph's own position
    // would never show through again.
    const { live, settled } = readDrag([
      moving('send', 298, 88),
      dropped('send', 300, 90),
    ]);
    expect(live).toEqual({});
    expect(settled).toEqual([{ id: 'send', position: { x: 300, y: 90 } }]);
  });

  it('keeps two steps apart when both are in flight', () => {
    const { live } = readDrag([moving('a', 1, 2), moving('b', 3, 4)]);
    expect(live).toEqual({ a: { x: 1, y: 2 }, b: { x: 3, y: 4 } });
  });

  it('ignores everything that is not a step being moved', () => {
    const changes = [
      { type: 'select', id: 'send', selected: true },
      { type: 'dimensions', id: 'send', dimensions: { width: 210, height: 108 } },
      { type: 'remove', id: 'gone' },
      // React Flow reports the gesture starting with no position of its own.
      { type: 'position', id: 'send', dragging: true },
    ] as NodeChange[];
    const { live, settled } = readDrag(changes);
    expect(live).toEqual({});
    expect(settled).toEqual([]);
  });
});

describe('releasing', () => {
  it('drops only what was named', () => {
    const held = { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } };
    expect(releaseDrag(held, ['a'])).toEqual({ b: { x: 2, y: 2 } });
  });

  it('hands back the same object when there is nothing to drop', () => {
    // Identity matters: a new object every batch would re-run the memo that
    // builds the node list, on every change React Flow reports.
    const held = { a: { x: 1, y: 1 } };
    expect(releaseDrag(held, [])).toBe(held);
  });
});

describe('a gesture that changed nothing', () => {
  it('is not written down', () => {
    // Dragged out and brought back. Committing would mark the automation
    // dirty and spend a save on a step that is exactly where it was.
    expect(moved({ x: 40, y: 10 }, { x: 40, y: 10 })).toBe(false);
  });

  it('is written down when either axis actually changed', () => {
    expect(moved({ x: 40, y: 10 }, { x: 41, y: 10 })).toBe(true);
    expect(moved({ x: 40, y: 10 }, { x: 40, y: 11 })).toBe(true);
  });

  it('is written down when the step had no position to compare against', () => {
    expect(moved(undefined, { x: 0, y: 0 })).toBe(true);
  });
});
