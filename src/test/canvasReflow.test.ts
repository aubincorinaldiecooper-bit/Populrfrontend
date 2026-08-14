import { describe, it, expect } from 'vitest';
import { viewportAfterResize } from '../lib/flowLayout';

/* What happens to the view when the canvas changes width.
 *
 * The contextual panel is a column, not an overlay, so opening one narrows
 * the canvas by ~320px. The question this answers is what the creator sees
 * when that happens: the steps they were looking at, or a graph that has
 * slid sideways by the width of the thing they just opened.
 */

describe('holding the middle still', () => {
  const view = { x: 100, y: 40, zoom: 0.8 };

  it('moves the origin by half of what the canvas lost', () => {
    // 1200 → 880 is a 320px panel opening. Half of the 320 lost, so the
    // point that was centred is still centred.
    expect(viewportAfterResize(view, 1200, 880)).toEqual({ x: -60, y: 40, zoom: 0.8 });
  });

  it('gives it back exactly when the panel closes', () => {
    const narrowed = viewportAfterResize(view, 1200, 880);
    // Open then close must land where it started, or every open/close cycle
    // would walk the graph a little further off-centre.
    expect(viewportAfterResize(narrowed, 880, 1200)).toEqual(view);
  });

  it('leaves zoom and vertical position alone', () => {
    // Re-fitting would discard both. A creator zoomed into one corner of a
    // large flow should still be there after opening a panel.
    const after = viewportAfterResize(view, 1200, 880);
    expect(after.zoom).toBe(0.8);
    expect(after.y).toBe(40);
  });

  it('shifts by screen pixels, so the correction does not scale with zoom', () => {
    // React Flow's x is a screen-space translation. Dividing by zoom here
    // would over-correct when zoomed out and under-correct when zoomed in.
    const zoomedOut = viewportAfterResize({ x: 0, y: 0, zoom: 0.35 }, 1200, 880);
    const zoomedIn = viewportAfterResize({ x: 0, y: 0, zoom: 1.6 }, 1200, 880);
    expect(zoomedOut.x).toBe(-160);
    expect(zoomedIn.x).toBe(-160);
  });

  it('does nothing when the width did not actually change', () => {
    expect(viewportAfterResize(view, 1200, 1200)).toEqual(view);
  });
});
