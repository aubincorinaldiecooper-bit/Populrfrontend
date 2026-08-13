import { Bell, BellDot } from 'lucide-react';

/**
 * The builder's notification bell.
 *
 * It replaced a button called "Review", which named a chore. A bell names
 * something that happens to you — Populr has something to ask — and everyone
 * already knows what one does, which is the whole point of using the ordinary
 * shape here instead of inventing one.
 *
 * The badge counts unresolved questions and warnings. Resolved items are in
 * the feed but never in the count: a number you can't clear is noise.
 */

export interface NotificationBellProps {
  count: number;
  open: boolean;
  /** Set briefly when a refused activation sent the creator here. */
  attention: boolean;
  onClick: () => void;
}

export default function NotificationBell({ count, open, attention, onClick }: NotificationBellProps) {
  const Icon = count > 0 ? BellDot : Bell;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications, nothing unread'}
      aria-expanded={open}
      className={`relative inline-flex items-center justify-center rounded-lg border bg-white
        h-[30px] w-[30px] text-[#111111] transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]
        ${open ? 'border-[#111111]' : 'border-[#E8E4DF] hover:border-[#D8D3CC]'}
        ${attention ? 'ring-2 ring-[#C5FF3D] animate-in zoom-in-95 duration-150' : ''}`}
    >
      <Icon size={15} />
      {count > 0 && (
        <span
          // aria-hidden: the count is already in the button's label, and a
          // screen reader announcing "2" on its own says nothing useful.
          aria-hidden="true"
          className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full
            bg-[#111111] text-white text-[10px] font-semibold leading-[16px] text-center"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}
