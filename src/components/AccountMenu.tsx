import { useState } from 'react';
import { useNavigate } from 'react-router';
import { MoreVertical, Settings as SettingsIcon, LogOut, Check, DoorOpen } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import ConfirmDialog from './app/ConfirmDialog';
import type { WorkspaceOption } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { isGuestView } from '../lib/access';
import { resolveIdentity } from '../lib/identity';
import { workspaceName } from '../lib/workspaceName';

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
  const { showToast, workspaces, workspaceAccess, switchToWorkspace, leaveCurrentWorkspace } = useApp();
  const identity = resolveIdentity(user);
  const [signingOut, setSigningOut] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  // A workspace and a canvas grant inside it are two entries with the same
  // workspace id, so identity is the pair.
  const keyOf = (w: WorkspaceOption) => `${w.id}:${w.automation?.id ?? ''}`;
  const isCurrent = (w: WorkspaceOption) =>
    w.id === workspaceAccess?.id &&
    (w.automation?.id ?? null) === (workspaceAccess?.canvasAutomation?.id ?? null);
  const others = workspaces.filter(w => !isCurrent(w));

  // Whose workspace this is, when it isn't yours. Also the gate on Leave:
  // an owner has nothing to leave, and the server refuses it anyway.
  //
  // Through the name guard, and the gate is now the ROLE alone rather than
  // the role and a non-empty name: whether somebody can leave a workspace has
  // nothing to do with what it happens to be called, and hiding the way out
  // because a label came back odd is the worst version of this bug.
  const guestOf = isGuestView(workspaceAccess)
    ? workspaceName(workspaceAccess?.name)
    : null;

  const roleWord = (w: WorkspaceOption) =>
    w.role === 'owner' ? 'Yours' : w.role === 'canvas' ? 'Shared' : 'Joined';

  const move = async (w: WorkspaceOption) => {
    if (switching || isCurrent(w)) return;
    setSwitching(keyOf(w));
    try {
      await switchToWorkspace(w.id, w.automation?.id ?? null);
      onNavigate?.();
      // Home, always: the page they were on belongs to the workspace they
      // just left. A contact, an automation, an inbox thread — none of them
      // exist over here, and following them would land on a 404 that reads
      // like the switch failed.
      navigate('/');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Couldn't open that workspace. Try again.",
        'error',
      );
    } finally {
      setSwitching(null);
    }
  };

  /**
   * Give back access you were granted.
   *
   * The only exit used to be asking the owner to remove you, which means
   * someone who has stopped working with a creator carries their workspace
   * around indefinitely. The server forgets the stale selection on its way
   * out, so re-resolving lands them back in their own.
   *
   * Through the context rather than calling the endpoint here: leaving is a
   * workspace change, and everything a workspace change has to do — ending
   * the server-state session so mounted observers stop rendering the old
   * one, re-reading the accounts — lives with switching.
   */
  const leave = async () => {
    try {
      await leaveCurrentWorkspace();
      onNavigate?.();
      navigate('/');
      showToast(
        guestOf ? `You've left ${guestOf}.` : "You've left that workspace.",
        'success',
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Couldn't leave just now. Try again.",
        'error',
      );
    }
  };

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
      {/* Which workspace, above who you are: the account never changes and
          the workspace does, so the changeable thing goes where a creator
          looks first. Absent entirely for someone who only has their own —
          a menu offering one choice is not a choice. */}
      {others.length > 0 && (
        <>
          <p className="px-3 pb-1.5 pt-1 font-label text-[10.5px] uppercase tracking-widest text-muted-foreground">
            Workspace
          </p>
          {workspaces.map(w => {
            const active = isCurrent(w);
            return (
              <DropdownMenuItem
                key={`${w.id}:${w.automation?.id ?? ''}`}
                disabled={switching !== null}
                onClick={() => void move(w)}
              >
                <Check
                  size={15}
                  className={active ? 'text-on-surface' : 'invisible'}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">
                  {/* A canvas grant is one automation, not a workspace — say
                      the automation's name, because that is the thing they
                      were given and the only thing they will find inside. */}
                  {w.automation
                    ? w.automation.name
                    : workspaceName(w.name, { yours: w.role === 'owner' })}
                  {switching === keyOf(w) && ' …'}
                </span>
                <span className="font-label text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  {roleWord(w)}
                </span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuItem onClick={goToSettings}>
        <SettingsIcon size={15} className="text-muted-foreground" />
        Settings
      </DropdownMenuItem>
      {/* Leaving is not signing out, so it does not sit beside it without a
          rule between them: one gives back somebody else's workspace, the
          other ends the session. */}
      {guestOf && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setConfirmingLeave(true)}>
            <DoorOpen size={15} className="text-muted-foreground" />
            Leave {guestOf}
          </DropdownMenuItem>
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => void handleSignOut()} disabled={signingOut}>
        <LogOut size={15} className="text-muted-foreground" />
        {signingOut ? 'Signing out…' : 'Sign out'}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  const leaveConfirm = (
    <ConfirmDialog
      open={confirmingLeave}
      onOpenChange={setConfirmingLeave}
      title={guestOf ? `Leave ${guestOf}?` : 'Leave this workspace?'}
      description={
        workspaceAccess?.canvasAutomation
          ? `You'll lose access to “${workspaceAccess.canvasAutomation.name}”. Whoever shared it can invite you again.`
          : "You'll lose access to this workspace. Whoever invited you can invite you again."
      }
      confirmLabel="Leave"
      onConfirm={() => void leave()}
    />
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
        {leaveConfirm}
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
        {leaveConfirm}
      </DropdownMenu>
    </div>
  );
}
