import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { NODE_ENTER_MS } from '../../lib/nodeEntrance';

/**
 * A connector that draws itself when it first appears.
 *
 * The built-in edge was fine, but it can only fade: its path is rendered for
 * us, so there is no way to reach the geometry a drawing animation needs.
 * Here the path is ours, which buys two things — `pathLength={1}` normalises
 * every connector to the same "length" whatever its actual shape, so one
 * keyframe draws a 90px hop and a 400px sweep at the same speed; and the
 * Yes/No label becomes real text in the DOM rather than SVG text on a painted
 * rectangle.
 *
 * It draws once, when it arrives, and then holds still. A canvas of
 * permanently animated lines is a diagram of itself.
 */

export interface DrawnEdgeData extends Record<string, unknown> {
  /** Milliseconds to wait before drawing; null for an edge that was already here. */
  drawDelay: number | null;
  /** On the path the last Preview took. */
  active: boolean;
  branch: 'next' | 'yes' | 'no';
}

/** Fast: the connector is the consequence of the step, not an event itself. */
const DRAW_MS = 260;

export default function DrawnEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data,
}: EdgeProps) {
  const { drawDelay, active, branch } = (data ?? {}) as DrawnEdgeData;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8,
  });

  const drawing = drawDelay !== null;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        // pathLength normalises the dash maths: 1 unit long, 1 unit hidden.
        pathLength={1}
        style={{
          stroke: active ? '#C5FF3D' : '#D8D3CC',
          strokeWidth: active ? 2.5 : 1.5,
          // The Preview's path lights up along the connectors rather than
          // snapping on: colour and weight ease with the builder's shared
          // curve. Collapsed wholesale by the reduced-motion rule in
          // index.css, like every other transition in the product.
          transition:
            'stroke 200ms cubic-bezier(0.23, 1, 0.32, 1), stroke-width 200ms cubic-bezier(0.23, 1, 0.32, 1)',
          ...(drawing
            ? {
                strokeDasharray: 1,
                strokeDashoffset: 1,
                animation: `pop-edge-draw ${DRAW_MS}ms ease-out both`,
                // Lands as its destination step settles, so the line arrives
                // with the step rather than chasing it.
                animationDelay: `${drawDelay + NODE_ENTER_MS * 0.5}ms`,
              }
            : null),
        }}
      />
      {branch !== 'next' && (
        // Rendered as DOM rather than SVG text: crisper, and it inherits the
        // same type as the rest of the product instead of approximating it.
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className="pointer-events-none absolute rounded border border-[#E8E4DF] bg-white
              px-1.5 py-px text-[10px] font-medium text-[#6B6B6B]"
          >
            {branch === 'yes' ? 'Yes' : 'No'}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
