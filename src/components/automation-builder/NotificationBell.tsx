import { ListChecks } from 'lucide-react';

/**
 * The builder's checks control.
 *
 * It was a bell called "Notifications" — which was fine while the builder
 * had a header of its own, and stopped being fine the moment the builder
 * joined the shell's header, where the workspace bell already lives. Two
 * bells with one name in one bar: a screen reader heard the same words for
 * different things, and an eye had to click to find out which was which.
 *
 * So this one says what it actually holds: the questions and warnings
 * Populr has about THIS automation — the things standing between the canvas
 * and Activate. The workspace bell keeps the bell, because workspace news
 * is the thing that happens to you; these are checks you clear.
 *
 * The badge counts unresolved ones. Resolved items are in the panel but
 * never in the count: a number you can't clear is noise.
 */

export interface NotificationBellProps {
  count: number;
  open: boolean;
  /** Set briefly when a refused activation sent the creator here. */
  attention: boolean;
  onClick: () => void;
}

export default function NotificationBell({ count, open, attention, onClick }: NotificationBellProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `Automation checks, ${count} need attention` : 'Automation checks, all clear'}
      aria-expanded={open}
      // Borderless: it reports rather than acts, and giving it Preview's
      // outline made equal weights out of a question and an action.
      className={`relative inline-flex items-center justify-center rounded-lg
        h-[30px] w-[30px] text-[#111111] transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]
        ${open ? 'bg-[#F0EDE8]' : 'hover:bg-[#F4F1EC]'}
        ${attention ? 'ring-2 ring-[#C5FF3D] animate-in zoom-in-95 duration-150' : ''}`}
    >
      <ListChecks size={15} />
      {count > 0 && (
        <span
          // Keyed on the count so a change remounts it and the bump replays.
          // A number that quietly swaps from 2 to 3 in the corner of the eye
          // is a change nobody sees; this is the smallest thing that says
          // "that number just moved" without asking to be looked at.
          key={count}
          // aria-hidden: the count is already in the button's label, and a
          // screen reader announcing "2" on its own says nothing useful.
          aria-hidden="true"
          className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full
            bg-[#111111] text-white text-[10px] font-semibold leading-[16px] text-center
            motion-safe:animate-[pop-badge-bump_320ms_ease-out]"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}
