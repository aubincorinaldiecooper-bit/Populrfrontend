import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import InboxDrawer from './InboxDrawer';
import { useInboxUnread } from './useInboxQueue';

/**
 * The Inbox control, and the badge that says someone is waiting.
 *
 * Inbox left the sidebar because it isn't a place you go — it's something
 * that happens to you while you're doing something else. So it sits with the
 * other top-right controls and opens over the surface you're already on.
 *
 * Two pieces on purpose: the button is presentational so the builder can
 * place its own drawer inside the canvas (where panels are positioned
 * relative to the canvas, not the window), and the launcher is the
 * self-contained version every ordinary page uses.
 */

export interface InboxButtonProps {
  count: number;
  open: boolean;
  onClick: () => void;
}

export function InboxButton({ count, open, onClick }: InboxButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `Inbox, ${count} waiting` : 'Inbox, nothing waiting'}
      aria-expanded={open}
      className={`relative inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg
        text-[#111111] transition-colors focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[#C5FF3D]
        ${open ? 'bg-[#F0EDE8]' : 'hover:bg-[#F4F1EC]'}`}
    >
      <MessageCircle size={16} />
      {count > 0 && (
        // The number is already in the button's label; announcing it twice
        // helps nobody.
        <span
          // Keyed on the count so a change remounts it and the bump replays:
          // someone messaging you while you are mid-build is the whole reason
          // this control exists, and a number that changes invisibly doesn't
          // tell them.
          key={count}
          aria-hidden="true"
          className="absolute -top-1 -right-1 h-[15px] min-w-[15px] rounded-full bg-[#111111]
            px-1 text-center text-[9.5px] font-semibold leading-[15px] text-white
            motion-safe:animate-[pop-badge-bump_320ms_ease-out]"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}

/** Button + drawer, for pages that don't manage their own panel layer. */
export default function InboxLauncher() {
  const [open, setOpen] = useState(false);
  const { count, refresh } = useInboxUnread();

  return (
    <>
      <InboxButton count={count} open={open} onClick={() => setOpen(v => !v)} />
      {open && (
        // Above the mobile header (z-[55], see Sidebar) and below toasts
        // (z-[100]). On a phone this drawer is full-width and starts at the
        // top of the viewport, so anything layered over it covers its own
        // close button — and with no exposed click-away either, that left
        // no way out of the drawer at all.
        <div className="fixed inset-0 z-[60]">
          {/* Click-away, not a scrim: the page behind stays legible, because
              the point of this drawer is that you haven't left it. */}
          <div className="absolute inset-0" onClick={() => setOpen(false)} />
          <InboxDrawer onClose={() => setOpen(false)} onChanged={refresh} />
        </div>
      )}
    </>
  );
}
