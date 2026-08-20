import type { NodeChange } from '@xyflow/react';

/**
 * Reading a batch of React Flow node changes as a drag.
 *
 * The canvas is controlled: its `nodes` prop is built from the graph, and
 * React Flow re-syncs from that prop whenever it changes. A drag therefore
 * has two positions at once — the live one React Flow is tracking, and the
 * older one the graph still holds — and the canvas has to hold the live one
 * itself. Without that, any re-render of the builder mid-drag (the
 * collaborator heartbeat, the notes query, an autosave settling) handed the
 * step's old position back and the card jumped out from under the cursor.
 *
 * Only the settled position reaches the graph. Committing every frame would
 * be a save per pointermove, and a drag is not an edit anyone wants to find
 * in their history.
 */

export interface Point { x: number; y: number }

export interface DragUpdate {
  /** Positions to hold locally: these gestures are still in flight. */
  live: Record<string, Point>;
  /** Gestures that ended — commit these, then stop holding them. */
  settled: { id: string; position: Point }[];
}

export function readDrag(changes: NodeChange[]): DragUpdate {
  const live: Record<string, Point> = {};
  const settled: { id: string; position: Point }[] = [];

  for (const change of changes) {
    // Selection, dimension and removal changes say nothing about where a
    // step is; a position change with no position is React Flow reporting
    // the gesture rather than a move.
    if (change.type !== 'position' || !change.position) continue;
    if (change.dragging) live[change.id] = change.position;
    else settled.push({ id: change.id, position: change.position });
  }

  // A step that moved and then let go inside one batch is settled, not live.
  // Leaving the live entry behind would pin it at the last frame before the
  // release and the graph's own position would never show through again.
  for (const done of settled) delete live[done.id];

  return { live, settled };
}

/** Stop holding the gestures that have ended. */
export function releaseDrag(
  current: Record<string, Point>,
  ids: string[],
): Record<string, Point> {
  if (ids.length === 0) return current;
  const next = { ...current };
  for (const id of ids) delete next[id];
  return next;
}
