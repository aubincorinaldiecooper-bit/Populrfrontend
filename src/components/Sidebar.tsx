import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Zap, Compass, Users, Waypoints, Settings, Menu, X, Plus, MoreVertical,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { resolveIdentity } from '../lib/identity';

// Populr's beta direction is automation-first: the primary CTA leads
// straight to the automation builder. "Channels" is the product label for
// the /connections route. Publishing surfaces (Create Post, Content, etc.)
// stay reachable by URL but out of primary nav.
const navItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/automations', label: 'Automations', icon: Zap },
  { path: '/opportunities', label: 'Opportunities', icon: Compass },
  { path: '/contacts', label: 'Contacts', icon: Users },
  { path: '/channels', label: 'Channels', icon: Waypoints },
  { path: '/settings', label: 'Settings', icon: Settings },
];

function isActivePath(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname.startsWith(path);
}

function NavContent({
  pathname, identity, onNavigate,
}: {
  pathname: string;
  identity: ReturnType<typeof resolveIdentity>;
  onNavigate: () => void;
}) {
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

      {/* User */}
      <Link
        to="/settings"
        onClick={onNavigate}
        className="flex items-center gap-3 w-full p-2 rounded-full hover:bg-surface-container-high transition-colors"
      >
        {identity.avatarUrl ? (
          <img src={identity.avatarUrl} alt={identity.name} className="w-10 h-10 rounded-full object-cover border border-surface-variant" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-surface-container-high border border-surface-variant flex items-center justify-center text-[13px] font-semibold text-on-surface-variant flex-shrink-0">
            {identity.initials}
          </div>
        )}
        <div className="text-left flex-1 min-w-0">
          <p className="font-semibold text-[14px] text-on-surface truncate">{identity.name}</p>
          {identity.handle && <p className="font-label text-[11px] text-on-surface-variant truncate">{identity.handle}</p>}
        </div>
        <MoreVertical size={18} className="text-on-surface-variant flex-shrink-0" />
      </Link>
    </>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const { accounts } = useApp();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const identity = resolveIdentity(user, accounts);

  // The drawer closes via each nav link's onNavigate handler below, so a
  // route-change effect would be redundant.
  const closeMobileNav = () => setMobileOpen(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-surface/90 backdrop-blur-md border-b border-surface-variant z-[55] flex items-center px-4 gap-3">
        <button
          onClick={() => setMobileOpen(v => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <span className="font-display text-[22px] font-bold text-on-surface">Populr</span>
      </div>

      {/* Desktop sidebar */}
      <motion.aside
        initial={{ x: -24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.24, 1, 0.4, 1] }}
        className="hidden md:flex fixed left-0 top-0 h-screen w-[280px] bg-transparent border-r border-surface-variant z-50 flex-col p-6 gap-7"
      >
        <NavContent pathname={location.pathname} identity={identity} onNavigate={closeMobileNav} />
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
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.28, ease: [0.24, 1, 0.4, 1] }}
              className="md:hidden fixed left-0 top-0 h-screen w-[280px] bg-surface border-r border-surface-variant z-[50] flex flex-col p-6 gap-7"
            >
              <NavContent pathname={location.pathname} identity={identity} onNavigate={closeMobileNav} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
