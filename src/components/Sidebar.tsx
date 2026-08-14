import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Home, Zap, Users, Waypoints, Settings, Menu, X, Plus,
} from 'lucide-react';
import AccountMenu from './AccountMenu';

// Populr's beta direction is automation-first: the primary CTA leads
// straight to the automation builder. "Channels" is this surface's own
// route (/connections redirects to it). Publishing surfaces (Create Post,
// Content, etc.) stay reachable by URL but out of primary nav.
//
// Inbox is deliberately absent. It is not a place you go — it is something
// that happens to you while you are building — so it lives with the
// top-right controls and opens over whatever you are already doing. The
// /inbox route still exists for a long triage session and for the links
// that point at it.
const navItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/automations', label: 'Automations', icon: Zap },
  { path: '/contacts', label: 'Contacts', icon: Users },
  { path: '/channels', label: 'Channels', icon: Waypoints },
  { path: '/settings', label: 'Settings', icon: Settings },
];

function isActivePath(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname.startsWith(path);
}

function NavContent({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <>
      {/* Brand */}
      <div className="px-4">
        <h1 className="font-display text-[26px] font-bold text-on-surface tracking-tight leading-none">Populr</h1>
        <p className="font-label text-[11px] text-on-surface-variant uppercase tracking-widest mt-1.5">Creator Suite</p>
      </div>

      {/* Create CTA */}
      <Link
        to="/automations/new"
        onClick={onNavigate}
        className="mx-1 flex items-center justify-center gap-2 bg-secondary-fixed text-primary font-semibold py-3.5 px-6 rounded-full hover:bg-secondary-fixed-dim transition-colors"
      >
        <Plus size={18} strokeWidth={2.5} />
        Create
      </Link>

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
            </Link>
          );
        })}
      </nav>

      <AccountMenu onNavigate={onNavigate} />
    </>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
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
      <motion.aside
        initial={reduceMotion ? false : { x: -24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.24, 1, 0.4, 1] }}
        className="hidden md:flex fixed left-0 top-0 h-screen w-[280px] bg-transparent border-r border-surface-variant z-50 flex-col p-6 gap-7"
      >
        <NavContent pathname={location.pathname} onNavigate={closeMobileNav} />
      </motion.aside>

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
              <NavContent pathname={location.pathname} onNavigate={closeMobileNav} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
