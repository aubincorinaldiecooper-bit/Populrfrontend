import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Menu, X, Plus, PanelLeftClose } from 'lucide-react';
import AccountMenu from './AccountMenu';
import { navItems, isActivePath } from '../lib/nav';
import { useInboxUnread } from './inbox/useInboxUnread';
import { useCreateAutomation } from '../context/CreateAutomationContext';


function NavContent({ pathname, onNavigate, inboxCount }: {
  pathname: string; onNavigate: () => void; inboxCount: number;
}) {
  const { beginCreateAutomation } = useCreateAutomation();
  return (
    <>
      {/* Brand */}
      <div className="px-4">
        <h1 className="font-display text-[26px] font-bold text-on-surface tracking-tight leading-none">Populr</h1>
        <p className="font-label text-[11px] text-on-surface-variant uppercase tracking-widest mt-1.5">Creator Suite</p>
      </div>

      {/* Create CTA — the same action as Home's "Create an automation":
          one creation experience, two entry points. */}
      <button
        type="button"
        onClick={() => { onNavigate?.(); beginCreateAutomation(); }}
        className="mx-1 flex items-center justify-center gap-2 bg-secondary-fixed text-primary font-semibold py-3.5 px-6 rounded-full hover:bg-secondary-fixed-dim transition-colors"
      >
        <Plus size={18} strokeWidth={2.5} />
        Create
      </button>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-1.5 mt-2">
        {navItems.map(item => {
          const active = isActivePath(pathname, item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={`group flex items-center gap-3 px-4 py-3 rounded-full transition-colors duration-200 ${
                active
                  ? 'bg-secondary-container text-on-secondary-container font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} className="transition-transform group-hover:scale-110" />
              <span className="text-[15px]">{item.label}</span>
              {item.path === '/inbox' && inboxCount > 0 && (
                // The waiting count the retired drawer-launcher used to
                // carry. The number is in the pill; the words are for ears.
                <span className="ml-auto rounded-full bg-[#111111] px-1.5 text-[10.5px] font-semibold
                  leading-[17px] text-white">
                  {inboxCount > 9 ? '9+' : inboxCount}
                  <span className="sr-only"> conversations waiting</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <AccountMenu onNavigate={onNavigate} />
    </>
  );
}

/**
 * `railMode` hides only the DESKTOP sidebar, because the builder replaces it
 * with EditorRail there. The mobile bar and drawer stay: the rail is
 * `hidden md:flex`, so without them a phone in the builder would have no
 * navigation at all.
 */
export default function Sidebar({
  railMode = false,
  /**
   * Offered only inside the builder, where a narrower navigation buys the
   * canvas something. Absent everywhere else — there is nothing to gain by
   * collapsing the nav on Contacts, so the control would just be a lever that
   * makes the app worse.
   */
  onCollapse,
}: { railMode?: boolean; onCollapse?: () => void } = {}) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Hoisted so the desktop column and the mobile drawer share one poll
  // instead of running one each.
  const { count: inboxCount } = useInboxUnread();
  const reduceMotion = useReducedMotion();
  const drawerRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  // The drawer closes via each nav link's onNavigate handler below, so a
  // route-change effect would be redundant.
  const closeMobileNav = () => setMobileOpen(false);

  // The drawer is a modal surface: it covers the page behind a scrim, so it
  // has to behave like one. Without this it was reachable only by sighted
  // pointer users — Escape did nothing, Tab walked out of the drawer into the
  // page underneath it, and the body kept scrolling behind the overlay (on
  // iOS that means the page visibly slides under a "fixed" drawer).
  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Captured now rather than read in cleanup: by the time cleanup runs the
    // ref may point elsewhere, and this is the element focus must return to.
    const toggle = toggleRef.current;

    // Move focus into the drawer so the first Tab lands inside it.
    drawerRef.current?.querySelector<HTMLElement>(
      'a[href], button:not([disabled])'
    )?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      // Cycle focus within the drawer.
      const focusables = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !drawerRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Return focus to the control that opened it, so closing doesn't drop
      // the user back at the top of the document.
      toggle?.focus();
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Mobile top bar. The safe-area inset is added to the bar's HEIGHT,
          not just as inner padding: padding alone would push the control
          down inside a still-64px-tall bar, so on a notched device the
          button drops past the bar's own background onto the page. Layout's
          main offset uses the identical expression — keep the two in sync. */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] bg-surface/90 backdrop-blur-md border-b border-surface-variant z-[55] flex items-center px-4 gap-3">
        <button
          ref={toggleRef}
          onClick={() => setMobileOpen(v => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          className="w-11 h-11 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <span className="font-display text-[22px] font-bold text-on-surface">Populr</span>
      </div>

      {/* Desktop sidebar. The entrance runs once per mount; it's suppressed
          outright when the user prefers reduced motion (Framer drives this
          through the Web Animations API, so the CSS override can't reach
          it — hence useReducedMotion here). */}
      {!railMode && (
      <motion.aside
        initial={reduceMotion ? false : { x: -24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.24, 1, 0.4, 1] }}
        className="hidden md:flex fixed left-0 top-0 h-screen w-[280px] bg-transparent border-r border-surface-variant z-50 flex-col p-6 gap-7"
      >
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse navigation"
            title="Collapse navigation"
            className="absolute right-3 top-6 rounded-lg p-1.5 text-on-surface-variant
              transition-colors hover:bg-surface-container-high hover:text-on-surface
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
          >
            <PanelLeftClose size={17} strokeWidth={1.9} />
          </button>
        )}
        <NavContent pathname={location.pathname} onNavigate={closeMobileNav} inboxCount={inboxCount} />
      </motion.aside>
      )}

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 bg-black/30 z-[45]"
              onClick={closeMobileNav}
            />
            <motion.aside
              id="mobile-nav"
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Main menu"
              initial={reduceMotion ? false : { x: '-100%' }}
              animate={{ x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { x: '-100%' }}
              transition={{ type: 'tween', duration: reduceMotion ? 0 : 0.28, ease: [0.24, 1, 0.4, 1] }}
              // Same inset treatment as the bar: the drawer starts at top-0,
              // so its own 24px padding would put the brand block under a
              // notch without this.
              className="md:hidden fixed left-0 top-0 h-screen w-[280px] bg-surface border-r border-surface-variant z-[50] flex flex-col p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] gap-7 overflow-y-auto"
            >
              <NavContent pathname={location.pathname} onNavigate={closeMobileNav} inboxCount={inboxCount} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
