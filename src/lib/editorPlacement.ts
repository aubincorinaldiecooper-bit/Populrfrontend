import { NODE_HEIGHT, NODE_WIDTH } from './flowLayout';

/**
 * Which side of a selected node the contextual editor should open on.
 *
 * The card floats above the canvas plane, so whatever it sits over is
 * unreachable until it closes. Viewport edges aren't the only thing worth
 * dodging — the graph itself is: selecting an If whose No-branch row sits
 * directly below must not bury that row under the editor. Node positions are
 * all known, so this is geometry, not guesswork.
 *
 * Sides are tried in reading order — below, above, right, left — and scored
 * by how many OTHER steps the card would cover there, with sides that fit
 * inside the viewport preferred over sides that clip. Ties keep the earlier
 * side, so a card with nothing to dodge still opens where the eye goes
 * after a click: just below the step.
 *
 * Pure and in flow coordinates on purpose: the caller converts the card's
 * on-screen size by the current zoom, and this stays unit-testable without
 * a DOM.
 */

export type EditorSide = 'bottom' | 'top' | 'right' | 'left';

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function cardRect(
  side: EditorSide,
  node: { x: number; y: number },
  cardWidth: number,
  cardHeight: number,
  gap: number,
): Rect {
  const centerX = node.x + NODE_WIDTH / 2;
  switch (side) {
    case 'bottom':
      return {
        left: centerX - cardWidth / 2, right: centerX + cardWidth / 2,
        top: node.y + NODE_HEIGHT + gap, bottom: node.y + NODE_HEIGHT + gap + cardHeight,
      };
    case 'top':
      return {
        left: centerX - cardWidth / 2, right: centerX + cardWidth / 2,
        top: node.y - gap - cardHeight, bottom: node.y - gap,
      };
    case 'right':
      return {
        left: node.x + NODE_WIDTH + gap, right: node.x + NODE_WIDTH + gap + cardWidth,
        top: node.y, bottom: node.y + cardHeight,
      };
    case 'left':
      return {
        left: node.x - gap - cardWidth, right: node.x - gap,
        top: node.y, bottom: node.y + cardHeight,
      };
  }
}

export function pickEditorSide(input: {
  selectedId: string;
  nodes: { id: string; position: { x: number; y: number } }[];
  /** The card's footprint in FLOW units — screen pixels divided by zoom. */
  cardWidth: number;
  cardHeight: number;
  gap?: number;
  /** The visible canvas in flow coordinates, when known. Sides whose card
   *  would clip out of it lose to sides whose card fits. */
  viewport?: Rect | null;
}): EditorSide {
  const { selectedId, nodes, cardWidth, cardHeight, gap = 12, viewport = null } = input;
  const selected = nodes.find(n => n.id === selectedId);
  if (!selected) return 'bottom';

  const others = nodes
    .filter(n => n.id !== selectedId)
    .map(n => ({
      left: n.position.x, right: n.position.x + NODE_WIDTH,
      top: n.position.y, bottom: n.position.y + NODE_HEIGHT,
    }));

  const sides: EditorSide[] = ['bottom', 'top', 'right', 'left'];
  let best: { side: EditorSide; covered: number; fits: boolean } | null = null;
  for (const side of sides) {
    const rect = cardRect(side, selected.position, cardWidth, cardHeight, gap);
    const covered = others.filter(o => overlaps(rect, o)).length;
    const fits =
      !viewport ||
      (rect.left >= viewport.left && rect.right <= viewport.right &&
        rect.top >= viewport.top && rect.bottom <= viewport.bottom);
    // Strictly better only — earlier sides win ties, keeping "below unless
    // there's a reason" the default feel.
    if (
      !best ||
      (fits && !best.fits) ||
      (fits === best.fits && covered < best.covered)
    ) {
      best = { side, covered, fits };
    }
  }
  return best!.side;
}
