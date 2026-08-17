import { describe, it, expect } from 'vitest';
import { pickEditorSide } from '../lib/editorPlacement';
import { NODE_HEIGHT, NODE_WIDTH } from '../lib/flowLayout';

/* Where the contextual editor opens, as pure geometry.
 *
 * The card floats above the canvas plane, so whichever side it takes is a
 * side the creator temporarily can't click. These cases pin the promise the
 * card makes about that: it opens below by default, and it moves out of the
 * way of real steps — a condition's branch row directly below the selected
 * step must not be buried under a form.
 */

const CARD = { cardWidth: 312, cardHeight: 440 };

function node(id: string, x: number, y: number) {
  return { id, position: { x, y } };
}

describe('pickEditorSide', () => {
  it('opens below by default — a linear chain leaves the space under a step empty', () => {
    // trigger → send → wait, left to right: nothing below anything.
    const nodes = [node('trigger', 0, 0), node('send', 300, 0), node('wait', 600, 0)];
    expect(pickEditorSide({ selectedId: 'send', nodes, ...CARD })).toBe('bottom');
  });

  it('dodges a branch row sitting directly below the selected step', () => {
    // An If with its No-branch row underneath — the layout branches produce.
    // Below would bury tag-no; above is empty.
    const nodes = [
      node('if-1', 300, 0),
      node('tag-yes', 600, 0),
      node('tag-no', 600, NODE_HEIGHT + 60),
      node('ask-next', 300, NODE_HEIGHT + 60),
    ];
    const side = pickEditorSide({ selectedId: 'if-1', nodes, ...CARD });
    expect(side).toBe('top');
  });

  it('goes beside when rows sit both above and below', () => {
    const nodes = [
      node('mid', 300, 300),
      node('row-above', 300, 300 - NODE_HEIGHT - 60),
      node('row-below', 300, 300 + NODE_HEIGHT + 60),
    ];
    const side = pickEditorSide({ selectedId: 'mid', nodes, ...CARD });
    expect(side === 'right' || side === 'left').toBe(true);
  });

  it('boxed in on every side, it picks the side covering the fewest steps', () => {
    // Two steps below, one above, right and left crowded harder: above wins.
    const nodes = [
      node('mid', 300, 600),
      node('below-1', 220, 600 + NODE_HEIGHT + 40),
      node('below-2', 480, 600 + NODE_HEIGHT + 40),
      node('above-1', 300, 600 - NODE_HEIGHT - 40),
      node('right-1', 300 + NODE_WIDTH + 40, 600),
      node('right-2', 300 + NODE_WIDTH + 40, 600 + NODE_HEIGHT + 40),
      node('left-1', 300 - NODE_WIDTH - 40, 600),
      node('left-2', 300 - NODE_WIDTH - 40, 600 + NODE_HEIGHT + 40),
    ];
    expect(pickEditorSide({ selectedId: 'mid', nodes, ...CARD })).toBe('top');
  });

  it('prefers a side that fits the viewport over one that clips', () => {
    // Empty canvas around the node, but the node sits near the viewport's
    // bottom edge: below would clip, above fits.
    const nodes = [node('solo', 300, 900)];
    const side = pickEditorSide({
      selectedId: 'solo', nodes, ...CARD,
      viewport: { left: -200, top: 0, right: 1400, bottom: 900 + NODE_HEIGHT + 100 },
    });
    expect(side).toBe('top');
  });

  it('an unknown selection falls back to below rather than guessing', () => {
    expect(pickEditorSide({ selectedId: 'ghost', nodes: [node('a', 0, 0)], ...CARD })).toBe('bottom');
  });
});
