/**
 * Deterministic left-to-right layout for a flow graph.
 *
 * Written by hand rather than pulled from a layout library (dagre/elk) for two
 * reasons: the graphs are tiny and tree-shaped, so a general layered algorithm
 * is a lot of bytes for no benefit; and layout here needs one specific
 * behavior a generic engine won't give — a condition's Yes branch continues on
 * the main line while No steps *down*, because that is how creators read a
 * flow ("carry on… unless").
 *
 * Deterministic matters: the AI regenerates the graph on every edit, and a
 * layout that shuffled nodes between runs would make each change look larger
 * than it was.
 */

import type { FlowGraph, FlowNode } from './flowSchema';
import { nextNodeId, triggerNodes } from './flowSchema';

export const NODE_WIDTH = 210;
export const NODE_HEIGHT = 108;
const COLUMN_GAP = 74;
const ROW_GAP = 46;

const COLUMN = NODE_WIDTH + COLUMN_GAP;
const ROW = NODE_HEIGHT + ROW_GAP;

/**
 * Assign every reachable node a column (depth from the trigger) and a row,
 * then place orphans below. Returns a new graph; positions are the only thing
 * that changes.
 */
export function layoutGraph(graph: FlowGraph): FlowGraph {
  if (!graph.nodes.length) return graph;

  const depth = new Map<string, number>();
  const order: string[] = [];

  // Breadth-first from the triggers gives each node its column. Taking the
  // MAX depth (not the first seen) keeps a node that two paths reach to the
  // right of both, so no edge ever points backwards.
  const roots = triggerNodes(graph);
  const queue: { id: string; d: number }[] = roots.map(n => ({ id: n.id, d: 0 }));
  const seen = new Set<string>();

  while (queue.length) {
    const { id, d } = queue.shift()!;
    const known = depth.get(id);
    if (known !== undefined && known >= d) continue;
    depth.set(id, d);
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
    for (const edge of graph.edges) {
      if (edge.source === id) queue.push({ id: edge.target, d: d + 1 });
    }
  }

  // Row assignment. Walk each chain from the trigger; a condition's "yes"
  // stays on the current row and "no" drops to the next free one, which is
  // what makes a branch read as a detour rather than a fork of equals.
  const row = new Map<string, number>();
  let nextFreeRow = 0;

  const walk = (id: string, currentRow: number, guard: Set<string>) => {
    if (guard.has(id)) return;
    guard.add(id);
    // A node reached by two paths keeps its first (higher) row so the main
    // line stays straight.
    if (!row.has(id)) row.set(id, currentRow);
    const here = row.get(id)!;
    nextFreeRow = Math.max(nextFreeRow, here);

    const node = graph.nodes.find(n => n.id === id);
    if (!node) return;

    if (node.type === 'condition') {
      const yes = nextNodeId(graph, id, 'yes');
      const no = nextNodeId(graph, id, 'no');
      if (yes) walk(yes, here, guard);
      if (no) {
        // Drop below everything placed so far, so the branch can't collide
        // with the main line further right.
        nextFreeRow += 1;
        walk(no, nextFreeRow, guard);
      }
      return;
    }

    const next = nextNodeId(graph, id, 'next');
    if (next) walk(next, here, guard);
  };

  for (const root of roots) walk(root.id, nextFreeRow, new Set());

  // Anything unreachable (a step the creator disconnected, or one the AI added
  // before wiring it) still needs somewhere to live — parked on its own row
  // rather than stacked at the origin where it would be invisible.
  const orphans = graph.nodes.filter(n => !depth.has(n.id));
  for (const [i, node] of orphans.entries()) {
    depth.set(node.id, 0);
    row.set(node.id, nextFreeRow + 1 + i);
  }

  const nodes: FlowNode[] = graph.nodes.map(node => ({
    ...node,
    position: {
      x: (depth.get(node.id) ?? 0) * COLUMN,
      y: (row.get(node.id) ?? 0) * ROW,
    },
  }));

  return { ...graph, nodes };
}

/** Bounding box of a laid-out graph, for fit-to-view. */
export function graphBounds(graph: FlowGraph): { x: number; y: number; width: number; height: number } {
  if (!graph.nodes.length) return { x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT };
  const xs = graph.nodes.map(n => n.position.x);
  const ys = graph.nodes.map(n => n.position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX + NODE_WIDTH,
    height: Math.max(...ys) - minY + NODE_HEIGHT,
  };
}

/**
 * Whether a graph's stored positions look unplaced — every node at the origin,
 * or all sharing one point. Lets the builder lay out an imported or
 * AI-generated graph without overriding positions a creator dragged.
 */
export function needsLayout(graph: FlowGraph): boolean {
  if (graph.nodes.length < 2) return false;
  const first = graph.nodes[0].position;
  return graph.nodes.every(n => n.position.x === first.x && n.position.y === first.y);
}

/** React Flow's viewport, in the only terms this module needs. */
export interface Viewport { x: number; y: number; zoom: number }

/**
 * Hold the middle still while the canvas changes width.
 *
 * The contextual panel is a real column now, not an overlay, so opening one
 * takes ~320px off the canvas and closing gives it back. Left alone, the
 * viewport's origin stays put and every step slides sideways — the creator
 * asked to look at a step's settings and the step itself drifted off toward
 * the panel that was supposed to be about it.
 *
 * Re-fitting instead would be worse: it discards the zoom and pan they chose,
 * so a creator inspecting one corner of a large flow gets thrown back to the
 * whole graph for having opened a panel. Shifting by half the delta keeps
 * both — same zoom, same steps in the middle, just a narrower window onto
 * them. Which is what "the canvas reflows" should mean.
 *
 * In screen pixels, so it is independent of zoom: `x` is a screen-space
 * translation in React Flow's transform, and the visible centre moves by half
 * of whatever the container gained or lost regardless of scale.
 */
export function viewportAfterResize(
  viewport: Viewport,
  previousWidth: number,
  nextWidth: number,
): Viewport {
  return { ...viewport, x: viewport.x + (nextWidth - previousWidth) / 2 };
}
