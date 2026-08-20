import { useMemo } from 'react';
import { useStore } from '@xyflow/react';
import Avatar from '../inbox/Avatar';
import { displayName } from '../../lib/people';
import {
  PIN_SIZE,
  pickThreadSide,
  pinPosition,
  placeLabel,
  spreadOverlaps,
} from '../../lib/notePlacement';
import NoteThread, { NoteComposer } from './NoteThread';
import type { Placement } from './useCanvasNotes';
import type { CommentThread } from '../../lib/api';

/**
 * The notes, on the canvas.
 *
 * Pins are positioned in SCREEN space, converted from the world coordinates
 * the placement module works in. They therefore pan and zoom with the canvas
 * but never shrink with it: a pin is a control, and a control that becomes
 * four pixels at low zoom is a control nobody can hit. The same goes for an
 * open thread, which stays readable at every zoom for the same reason.
 *
 * Rendered inside the canvas host, above React Flow, below nothing. Never a
 * column: the automation keeps its width and the AI keeps the right side.
 */

const THREAD_WIDTH = 300;
const THREAD_HEIGHT = 260;

export interface CanvasNotesLayerProps {
  threads: CommentThread[];
  nodes: { id: string; position: { x: number; y: number } }[];
  /** The thread whose conversation is open, if any. */
  openId: string | null;
  /** A placement chosen and waiting for words. */
  composing: Placement | null;
  stepLabel: (id: string) => string | null;
  maySettle: (thread: CommentThread) => boolean;
  onOpen: (id: string | null) => void;
  onReply: (threadId: string, body: string) => Promise<void>;
  onSettle: (threadId: string, resolved: boolean) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onLeave: (placement: Placement, body: string) => Promise<void>;
  onCancelCompose: () => void;
}

export default function CanvasNotesLayer({
  threads, nodes, openId, composing, stepLabel, maySettle,
  onOpen, onReply, onSettle, onDelete, onLeave, onCancelCompose,
}: CanvasNotesLayerProps) {
  // The live viewport, straight from React Flow's store: [x, y, zoom].
  // Subscribed rather than polled — this re-renders exactly when the canvas
  // moves and never in between, so pins track a drag frame for frame without
  // a timer running for the lifetime of the builder.
  const [tx, ty, zoom] = useStore(s => s.transform);
  const toScreen = (world: { x: number; y: number }) => ({
    x: world.x * zoom + tx,
    y: world.y * zoom + ty,
  });

  const nodeAt = useMemo(() => {
    const byId = new Map(nodes.map(n => [n.id, n.position]));
    return (id: string) => byId.get(id) ?? null;
  }, [nodes]);

  /**
   * Unresolved notes that have somewhere to be, spread so two in one spot are
   * two clickable pins. Resolved notes paint nothing — they are settled, and
   * the canvas is for what is still open; the index still has them.
   *
   * Sorted by id so the spread is the same arrangement for everybody.
   */
  const pins = useMemo(() => {
    const placed = threads
      .filter(t => !t.resolved)
      .map(t => ({ thread: t, at: pinPosition(t, nodeAt) }))
      .filter((p): p is { thread: CommentThread; at: { x: number; y: number } } => p.at !== null)
      .sort((a, b) => a.thread.id.localeCompare(b.thread.id));
    const spread = spreadOverlaps(placed.map(p => ({ id: p.thread.id, at: p.at })));
    return placed.map(p => ({ thread: p.thread, at: spread.get(p.thread.id) ?? p.at }));
  }, [threads, nodeAt]);

  const open = openId ? threads.find(t => t.id === openId) ?? null : null;
  const openPin = open ? pins.find(p => p.thread.id === open.id)?.at ?? null : null;

  const cardFor = (world: { x: number; y: number }) => {
    const side = pickThreadSide({
      pin: world,
      nodes,
      // The card is a fixed size on SCREEN, so its footprint in world
      // units — which is what the geometry reasons about — grows as you zoom out.
      width: THREAD_WIDTH / zoom,
      height: THREAD_HEIGHT / zoom,
    });
    const screen = toScreen(world);
    const gap = 10;
    switch (side) {
      case 'right': return { left: screen.x + PIN_SIZE + gap, top: screen.y };
      case 'left': return { left: screen.x - gap - THREAD_WIDTH, top: screen.y };
      case 'bottom': return { left: screen.x, top: screen.y + PIN_SIZE + gap };
      case 'top': return { left: screen.x, top: screen.y - gap - THREAD_HEIGHT };
    }
  };

  return (
    // pointer-events-none so the canvas underneath keeps its drags and its
    // right-click; each pin and card turns them back on for itself.
    <div className="pointer-events-none absolute inset-0 z-20" data-testid="notes-layer">
      {pins.map(({ thread, at }) => {
        const screen = toScreen(at);
        const who = thread.you ? 'you' : displayName(thread.by);
        return (
          <button
            key={thread.id}
            type="button"
            data-note-pin={thread.id}
            onClick={() => onOpen(thread.id === openId ? null : thread.id)}
            aria-label={`Note from ${who}, ${placeLabel(thread, stepLabel)}`}
            style={{ left: screen.x, top: screen.y, width: PIN_SIZE, height: PIN_SIZE }}
            className={`pointer-events-auto absolute flex items-center justify-center
              rounded-[13px_13px_13px_4px] border transition-shadow
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]
              ${thread.id === openId
                ? 'border-[#111111] bg-[#111111] shadow-[0_4px_14px_rgba(17,17,17,0.22)]'
                : 'border-[#E8E4DF] bg-white shadow-[0_2px_8px_rgba(17,17,17,0.12)] hover:border-[#D8D3CC]'}`}
          >
            {/* Who, and nothing else. A number here would be ambiguous —
                replies, unread, people — and we track none of those per
                reader, so it would be a claim we cannot keep. */}
            <Avatar
              handle={thread.by.email}
              name={thread.by.name}
              avatarUrl={thread.by.avatarUrl}
              size="sm"
            />
          </button>
        );
      })}

      {open && openPin && (
        <div
          className="pointer-events-auto absolute"
          style={cardFor(openPin)}
        >
          <NoteThread
            thread={open}
            where={placeLabel(open, stepLabel)}
            maySettle={maySettle(open)}
            onReply={body => onReply(open.id, body)}
            onSettle={resolved => onSettle(open.id, resolved)}
            onDelete={onDelete}
            onClose={() => onOpen(null)}
          />
        </div>
      )}

      {composing && (
        <div
          className="pointer-events-auto absolute"
          style={cardFor(placementWorld(composing, nodeAt))}
        >
          <NoteComposer
            where={
              'nodeId' in composing
                ? stepLabel(composing.nodeId) ?? 'On a step'
                : 'On the canvas'
            }
            onSubmit={body => onLeave(composing, body)}
            onCancel={onCancelCompose}
          />
        </div>
      )}
    </div>
  );
}

/** Where a not-yet-saved placement sits, in world coordinates. */
function placementWorld(
  placement: Placement,
  nodeAt: (id: string) => { x: number; y: number } | null,
): { x: number; y: number } {
  if (!('nodeId' in placement)) return placement.at;
  const origin = nodeAt(placement.nodeId);
  // The step vanished between choosing a spot and typing — rare, and the
  // composer is better placed at the origin than not shown at all.
  if (!origin) return { x: 0, y: 0 };
  return pinPosition(
    { nodeId: placement.nodeId, place: placement.at },
    () => origin,
  ) ?? { x: 0, y: 0 };
}
