import { useState } from 'react';
import { useNavigate } from 'react-router';
import { MoreVertical, Settings as SettingsIcon, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { resolveIdentity } from '../lib/identity';

/**
 * The signed-in user's row in the sidebar, plus the menu its kebab opens.
 * The menu is the shared DropdownMenu now — arrow keys, typeahead, Escape,
 * outside click and focus return all come from the primitive instead of
 * the hand-rolled listeners this component used to carry.
 *
 * Shows the Populr account (Better Auth) only: no connected-platform handle,
 * which would otherwise label the user with whichever social account the
 * backend happened to list first. See lib/identity.ts.
 */
export default function AccountMenu({
  onNavigate,
  /**
   * Rail variant: the avatar alone, and it IS the trigger.
   *
   * At 60px there is no room for a name and email beside it, and the menu
   * they sat next to is the only thing that block actually did. The full
   * sidebar keeps its identity block untouched.
   */
  compact = false,
}: { onNavigate?: () => void; compact?: boolean }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { showToast } = useApp();
  const identity = resolveIdentity(user);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't sign out. Try again.", 'error');
      setSigningOut(false);
    }
  };

  const goToSettings = () => {
    // Only the mobile drawer has anything to close on navigation; the rail
    // and the desktop sidebar pass nothing.
    onNavigate?.();
    navigate('/settings');
  };

  const menu = (
    <DropdownMenuContent aria-label="Account" side="top" align={compact ? 'start' : 'end'}>
      <DropdownMenuItem onClick={goToSettings}>
        <SettingsIcon size={15} className="text-muted-foreground" />
        Settings
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => void handleSignOut()} disabled={signingOut}>
        <LogOut size={15} className="text-muted-foreground" />
        {signingOut ? 'Signing out…' : 'Sign out'}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              aria-label="Account menu"
              className="group relative flex h-10 w-10 items-center justify-center rounded-full
                transition-colors hover:bg-surface-container-high focus-visible:outline-none
                focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
            >
              {identity.avatarUrl ? (
                <img src={identity.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover border border-surface-variant" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high
                  border border-surface-variant text-[12px] font-semibold text-on-surface-variant">
                  {identity.initials}
                </span>
              )}
            </button>
          }
        />
        {menu}
      </DropdownMenu>
    );
  }

  return (
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
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              aria-label="Account menu"
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-on-surface-variant hover:bg-surface-container-highest transition-colors"
            >
              <MoreVertical size={18} />
            </button>
          }
        />
        {menu}
      </DropdownMenu>
    </div>
  );
}
