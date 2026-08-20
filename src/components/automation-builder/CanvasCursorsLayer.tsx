import { useStore } from '@xyflow/react';
import { shortName } from '../../lib/liveCursors';
import type { LiveCursor } from './useLiveCursors';

/**
 * Other people, moving.
 *
 * The canvas is otherwise deliberately quiet — colour on it means something
 * needs attention, and motion means something changed. Cursors are the one
 * exception, and they earn it: this is the only surface where two people work
 * on the same object at the same time, and the whole point of the seat we
 * built is that somebody else is there. Quiet is right for a person working
 * alone and wrong for a room.
 *
 * Positioned in SCREEN space, converted from the world coordinates the socket
 * carries, so a cursor pans and zooms with the canvas — it points at a step,
 * not at a place on glass. It does not SCALE with zoom: a cursor is a person,
 * and a person does not get smaller because you zoomed out.
 */

export default function CanvasCursorsLayer({ cursors }: { cursors: LiveCursor[] }) {
  // The live viewport, straight from React Flow's store: [x, y, zoom].
  const [tx, ty, zoom] = useStore(s => s.transform);

  if (cursors.length === 0) return null;

  return (
    // Never in the way: the whole layer is untouchable, so a cursor can pass
    // over a step without stealing the click meant for it.
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden="true">
      {cursors.map(cursor => {
        const left = cursor.at.x * zoom + tx;
        const top = cursor.at.y * zoom + ty;
        return (
          <div
            key={cursor.id}
            className="absolute will-change-transform"
            // No CSS transition: the easing already happened, frame by frame,
            // in the hook. A transition on top would fight it and lag behind.
            style={{ transform: `translate3d(${left}px, ${top}px, 0)` }}
          >
            <Arrow colour={cursor.colour} />
            <span
              className="absolute left-[13px] top-[15px] whitespace-nowrap rounded-full px-2 py-[3px]
                text-[10.5px] font-semibold leading-none text-white shadow-[0_1px_4px_rgba(17,17,17,0.25)]"
              style={{ backgroundColor: cursor.colour }}
            >
              {shortName(cursor)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The pointer itself. A filled arrow with a white edge, because it has to
 * stay legible over a white step card, over the canvas's warm grey, and over
 * a dark note pin — and a stroke is what survives all three.
 */
function Arrow({ colour }: { colour: string }) {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" fill="none" className="block drop-shadow-sm">
      <path
        d="M2 1.5 L2 15.2 L5.6 11.9 L8.1 17.6 L10.9 16.4 L8.5 10.9 L13.4 10.6 Z"
        fill={colour}
        stroke="#FFFFFF"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
