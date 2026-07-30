import { useRef, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import {
  Sparkles, Link2, Settings, Menu, X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { resolveIdentity } from '../lib/identity';
import gsap from 'gsap';

// Primary nav is intentionally limited to the two-step Populr journey:
// find opportunities, and manage the connections that feed them. Campaigns,
// Inbox, and other broader surfaces still exist and are reachable directly
// by URL — they're hidden from primary nav, not deleted.
const navItems = [
  { path: '/', label: 'Opportunities', icon: Sparkles },
  { path: '/connections', label: 'Connections', icon: Link2 },
];

export default function Sidebar() {
  const location = useLocation();
  const { onboardingComplete, accounts } = useApp();
  const { user } = useAuth();
  const sidebarRef = useRef<HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const identity = resolveIdentity(user, accounts);

  useEffect(() => {
    if (sidebarRef.current && onboardingComplete) {
      gsap.fromTo(sidebarRef.current, { x: -220, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: 'power3.out', delay: 0.1 });
    }
  }, [onboardingComplete]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const NavContent = () => (
    <>
      <Link to="/" className="px-6 pt-6 pb-4 flex items-center gap-2 shrink-0" onClick={() => setMobileOpen(false)}>
        <div className="w-2 h-2 rounded-full bg-chartreuse" />
        <span className="font-geist font-bold text-lg text-[#111111]">Populr</span>
      </Link>

      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const active = isActive(item.path);
          const Icon = item.icon;
          return (
            <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${active ? 'bg-[rgba(200,255,61,0.08)] text-[#111111] font-semibold border-l-[3px] border-chartreuse' : 'bg-transparent text-[#6B6B6B] font-medium border-l-[3px] border-transparent hover:bg-[#FAFAF8] hover:text-[#111111]'}`}>
              <Icon size={18} strokeWidth={active ? 2.5 : 2} />
              <span className="text-[13px]">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-3 space-y-0.5 shrink-0 border-t border-[#E8E4DF] pt-2">
        <Link to="/settings" onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[#FAFAF8] transition-all">
          {identity.avatarUrl ? (
            <img src={identity.avatarUrl} alt={identity.name} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#FAFAF8] flex items-center justify-center text-[11px] font-semibold text-[#6B6B6B] flex-shrink-0">
              {identity.initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[13px] text-[#111111] truncate">{identity.name}</p>
            {identity.handle && <p className="text-[11px] text-[#9B9B8F] truncate">{identity.handle}</p>}
          </div>
          <Settings size={16} className="text-[#9B9B8F]" />
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-[#E8E4DF] z-[55] flex items-center px-4 gap-3">
        <button onClick={() => setMobileOpen(!mobileOpen)} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[#FAFAF8] transition-all">
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <Link to="/" className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-chartreuse" />
          <span className="font-geist font-bold text-lg text-[#111111]">Populr</span>
        </Link>
      </div>

      {/* Desktop sidebar */}
      <aside ref={sidebarRef} className="hidden lg:flex fixed left-0 top-0 h-screen w-[220px] bg-white border-r border-[#E8E4DF] z-50 flex-col">
        <NavContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-[rgba(0,0,0,0.3)] z-[45]" onClick={() => setMobileOpen(false)} />}

      <aside className={`lg:hidden fixed left-0 top-0 h-screen w-[260px] bg-white border-r border-[#E8E4DF] z-[50] flex-col transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <NavContent />
      </aside>
    </>
  );
}
