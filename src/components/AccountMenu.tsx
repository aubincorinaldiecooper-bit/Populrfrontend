import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { MoreVertical, Settings as SettingsIcon, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { resolveIdentity } from '../lib/identity';

/**
 * The signed-in user's row in the sidebar, plus the menu its kebab opens.
 *
 * The kebab previously rendered as decoration on a plain link to Settings —
 * the one affordance in the app that universally means "a menu opens here"
 * opened nothing, and Sign out existed only inside Settings > Profile. It is
 * a real menu now, which also gives sign-out a reachable home from anywhere.
 *
 * Shows the Populr account (Better Auth) only: no connected-platform handle,
 * which would otherwise label the user with whichever social account the
 * backend happened to list first. See lib/identity.ts.
 */
export default function AccountMenu({ onNavigate }: { onNavigate: () => void }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { showToast } = useApp();
  const identity = resolveIdentity(user);

  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      // Escape should hand focus back to what opened the menu, not drop it
      // to the top of the document.
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      setOpen(false);
      navigate('/login', { replace: true });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sign out failed.', 'error');
      setSigningOut(false);
    }
  };

  const goToSettings = () => {
    setOpen(false);
    onNavigate();
    navigate('/settings');
  };

  return (
    <div ref={containerRef} className="relative">
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-[#E8E4DF] rounded-xl shadow-lg overflow-hidden py-1 z-10"
        >
          <button
            role="menuitem"
            onClick={goToSettings}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[13px] text-[#111111] hover:bg-[#FAFAF8] transition-colors"
          >
            <SettingsIcon size={15} className="text-[#6B6B6B]" />Settings
          </button>
          <button
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[13px] text-[#111111] hover:bg-[#FAFAF8] transition-colors disabled:opacity-50"
          >
            <LogOut size={15} className="text-[#6B6B6B]" />{signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 w-full p-2 rounded-full hover:bg-surface-container-high transition-colors">
        {identity.avatarUrl ? (
          <img src={identity.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-surface-variant flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-surface-container-high border border-surface-variant flex items-center justify-center text-[13px] font-semibold text-on-surface-variant flex-shrink-0">
            {identity.initials}
          </div>
        )}
        <div className="text-left flex-1 min-w-0">
          <p className="font-semibold text-[14px] text-on-surface truncate">{identity.name}</p>
          {identity.email && (
            <p className="font-label text-[11px] text-on-surface-variant truncate">{identity.email}</p>
          )}
        </div>
        <button
          ref={triggerRef}
          onClick={() => setOpen(v => !v)}
          aria-label="Account menu"
          aria-haspopup="menu"
          aria-expanded={open}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-on-surface-variant hover:bg-surface-container-highest transition-colors"
        >
          <MoreVertical size={18} />
        </button>
      </div>
    </div>
  );
}
