import { useState } from 'react';
import { MapPin, MessageSquare, Plus } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Sheet, SheetTrigger, SheetContent } from '@/components/ui/sheet';
import { displayName } from '../../lib/people';
import { shortAgo } from '../../lib/builderNotifications';
import { placeLabel } from '../../lib/notePlacement';
import type { CommentThread } from '../../lib/api';

/**
 * Every note on this canvas, as a way of getting to one.
 *
 * A popover over the canvas, not a column beside it. The right-hand side of
 * the builder belongs to the AI, and a second permanent panel there would
 * make the canvas — the actual product — the narrowest thing on screen. So
 * this floats, and closes the moment it has done its job.
 *
 * It is NAVIGATION. Notes are read and replied to at their pin, where the
 * feedback is; picking a row here flies there and opens the thread. The only
 * thing you do from the index itself is start a new note, because that is the
 * one path a touch screen has — there is no right-click on a phone.
 *
 * On a narrow screen it arrives from the bottom instead of hanging off the
 * header — same list, same rows, a container a thumb can reach.
 */

export default function NotesIndex({
  threads,
  count,
  stepLabel,
  onPick,
  onLeaveNote,
  sheet = false,
  loading = false,
}: {
  /** Unresolved first; resolved are behind the disclosure below. */
  threads: CommentThread[];
  /** Unresolved threads — what the control counts. */
  count: number;
  /** What to call a step, in the builder's own words. */
  stepLabel: (id: string) => string | null;
  onPick: (thread: CommentThread) => void;
  onLeaveNote: () => void;
  /** Narrow screens: from the bottom rather than out of the header. */
  sheet?: boolean;
  /** The notes have not arrived yet — which is not the same as none. */
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const unresolved = threads.filter(t => !t.resolved);
  const resolved = threads.filter(t => t.resolved);
  const shown = showResolved ? [...unresolved, ...resolved] : unresolved;

  const pick = (thread: CommentThread) => {
    // The index has done its job the moment it points somewhere. Leaving it
    // open would put a panel over the note it just took you to.
    setOpen(false);
    onPick(thread);
  };

  const trigger = (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5
        text-[12.5px] font-medium text-[#111111] transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]
        ${open ? 'border-[#111111] bg-[#F7F5F2]' : 'border-[#E8E4DF] bg-white hover:border-[#D8D3CC]'}`}
    >
      <MessageSquare size={14} />
      <span className="hidden md:inline">Notes</span>
      {/* Only when there is something to count. At zero the control
          stays — it is the way in, and on a touch screen the only one —
          but a "0" would be a number nobody asked for. */}
      {count > 0 && (
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full
          bg-[#111111] px-1 text-[9.5px] font-semibold text-white">
          {count}
        </span>
      )}
    </button>
  );

  const body = (
    <>
        <button
          type="button"
          onClick={() => { setOpen(false); onLeaveNote(); }}
          className="flex w-full items-center gap-2 border-b border-[#F0EDE8] px-3 py-2.5
            text-left text-[12.5px] font-medium text-[#111111] hover:bg-[#F7F5F2]"
        >
          <Plus size={14} /> Leave a note
        </button>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto">
          {loading && shown.length === 0 ? (
            /* "No notes yet" before they have arrived is a claim we cannot
               make — and the one it makes is that nobody has said anything,
               which is exactly the thing somebody opened this to find out. */
            <div className="space-y-2 px-3 py-3" aria-busy="true" aria-label="Loading notes">
              {[0, 1].map(row => (
                <div key={row} className="space-y-1.5">
                  <div className="h-2 w-24 rounded bg-[#F0EDE8]" />
                  <div className="h-2 w-full rounded bg-[#F4F1EC]" />
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[12.5px] font-medium text-[#111111]">No notes yet</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-[#6B6B6B]">
                Point at a step, or anywhere on the canvas, and say what you think.
              </p>
            </div>
          ) : (
            <ul>
              {shown.map(thread => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => pick(thread)}
                    className={`w-full border-b border-[#F4F1EC] px-3 py-2.5 text-left
                      hover:bg-[#F7F5F2] ${thread.resolved ? 'opacity-55' : ''}`}
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#6B6B6B]">
                      <MapPin size={10} className="flex-shrink-0" />
                      {thread.you ? 'You' : displayName(thread.by)} · {placeLabel(thread, stepLabel)}
                    </span>
                    <span className="mt-0.5 block line-clamp-2 text-[12.5px] leading-relaxed text-[#111111]">
                      {thread.body}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-[11px] text-[#9B9B8F]">
                      <span>{shortAgo(Date.parse(thread.at))}</span>
                      {/* Reply counts live here and in the thread. Never on a
                          pin, where "2" could mean replies, unread, or people. */}
                      {thread.replies.length > 0 && (
                        <span>
                          {thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {resolved.length > 0 && (
          <button
            type="button"
            onClick={() => setShowResolved(v => !v)}
            className="w-full border-t border-[#F0EDE8] px-3 py-2 text-left text-[11.5px]
              text-[#6B6B6B] hover:text-[#111111]"
          >
            {showResolved
              ? 'Hide resolved'
              : `Show ${resolved.length} resolved`}
          </button>
        )}
    </>
  );

  // Same list, same rows, same closing-on-pick. Only the container differs,
  // and it differs because a popover hanging off a header button is a hard
  // thing to reach — and a hard thing to read — on a phone.
  if (sheet) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={trigger} />
        <SheetContent
          side="bottom"
          aria-label="Notes"
          className="max-h-[85vh] overflow-hidden rounded-t-2xl bg-white
            pb-[env(safe-area-inset-bottom)]"
        >
          <div aria-hidden className="mx-auto my-2 h-1 w-9 rounded-full bg-[#E8E4DF]" />
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent sideOffset={8} align="end" className="w-[300px] p-0" aria-label="Notes">
        {body}
      </PopoverContent>
    </Popover>
  );
}
