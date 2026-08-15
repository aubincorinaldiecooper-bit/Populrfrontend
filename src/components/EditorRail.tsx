import { Link, useLocation } from 'react-router';
import { PanelLeftOpen } from 'lucide-react';
import AccountMenu from './AccountMenu';
import { navItems, isActivePath } from '../lib/nav';

/**
 * The application's navigation, compressed to the width of an icon.
 *
 * The builder is the one place in Populr where the canvas IS the product, and
 * the full 280px sidebar spends a quarter of a laptop's width on a Create
 * button you cannot use from here and a wordmark you already know. Inside the
 * editor that space belongs to the automation.
 *
 * It is the same navigation, not a different one: the same items in the same
 * order from the same source, so nothing becomes unreachable and the active
 * item still reads as the place you are. Everywhere outside the builder the
 * full sidebar is untouched — this is a mode, not a redesign.
 *
 * Icon-only navigation is only navigation if you can tell what the icons are,
 * so each carries a real accessible name and a tooltip on hover and focus.
 */

export default function EditorRail({ onExpand }: { onExpand?: () => void }) {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Populr"
      className="hidden md:flex fixed left-0 top-0 h-screen w-[60px] z-50 flex-col items-center
        gap-1 border-r border-surface-variant bg-surface/60 py-4"
    >
      {/* The mark, not the wordmark: at this width the word would not fit and
          the P is already the thing people recognise on the tab. */}
      <Link
        to="/automations"
        aria-label="Populr — back to Automations"
        className="group relative mb-2 flex h-9 w-9 items-center justify-center rounded-xl
          font-display text-[19px] font-bold leading-none text-on-surface
          hover:bg-[#EFEDE8] transition-colors focus-visible:outline-none
          focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
      >
        P
        <Tip>Automations</Tip>
      </Link>

      {navItems.map(item => {
        const active = isActivePath(pathname, item.path);
        const Icon = item.icon;
        return (
          <Link
            key={item.path}
            to={item.path}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            className={`group relative flex h-10 w-10 items-center justify-center rounded-xl
              transition-colors focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-[#C5FF3D]
              ${active
                // The same lime the full sidebar uses for "you are here" —
                // a tint rather than a pill, because a pill at this width is
                // just a coloured square.
                ? 'bg-[#EDFBCD] text-on-surface'
                : 'text-on-surface-variant hover:bg-[#EFEDE8] hover:text-on-surface'}`}
          >
            <Icon size={18} strokeWidth={active ? 2.2 : 1.9} />
            <Tip>{item.label}</Tip>
          </Link>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-1">
        {/* The way back to the full navigation.
            Without this the rail is a mode imposed by the route — you arrive
            inside an automation and the navigation has shrunk, with nothing to
            say you would rather it hadn't. One click, and it is remembered. */}
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            aria-label="Expand navigation"
            className="group relative mb-1 flex h-10 w-10 items-center justify-center rounded-xl
              text-on-surface-variant transition-colors hover:bg-[#EFEDE8] hover:text-on-surface
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
          >
            <PanelLeftOpen size={18} strokeWidth={1.9} />
            <Tip>Expand navigation</Tip>
          </button>
        )}
        <AccountMenu compact />
      </div>
    </nav>
  );
}

/**
 * Hover/focus label. Rendered aria-hidden because the control it belongs to
 * already has an accessible name — a screen reader should hear "Contacts"
 * once, not twice.
 */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2
        whitespace-nowrap rounded-lg bg-[#111111] px-2 py-1 text-[11.5px] font-medium text-white
        opacity-0 shadow-[0_2px_10px_rgba(17,17,17,0.18)] transition-opacity duration-100
        group-hover:opacity-100 group-focus-visible:opacity-100 z-10"
    >
      {children}
    </span>
  );
}
