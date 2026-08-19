import type { WorkspaceAccess } from './api';

type MaybeAccess = WorkspaceAccess | null | undefined;

/**
 * Chrome-side reading of the workspace access the backend enforces.
 *
 * null/undefined means "not resolved yet" (loading, or the backend unreachable) and is
 * treated as the unrestricted view: the majority of sessions are owners, and
 * wrongly hiding an owner's controls during load would be a worse lie than
 * briefly showing a member a button the API will refuse. The API is always
 * the judge; this only decides what's worth rendering.
 */
export function isOwnerView(access: MaybeAccess): boolean {
  return access == null || access.role === 'owner';
}

/**
 * May this view offer automation editing?
 *
 * A canvas seat used to be waved through on the reasoning that it could only
 * mean edit. It can mean read now, so the role is no longer the answer and
 * the grant is: for a canvas seat, editAutomations means "may change THIS
 * automation", scoped by construction since it is the only one they can
 * reach.
 */
export function canEditAutomations(access: MaybeAccess): boolean {
  if (access == null || access.role === 'owner') return true;
  return access.permissions.editAutomations;
}

/**
 * Is this session looking at somebody else's workspace?
 *
 * Used by the shell to say whose workspace this is. A guest could work for an
 * hour without ever being told they were a visitor in someone else's account
 * — the workspace name lived only inside the account dropdown, and only once
 * they held more than one.
 */
export function isGuestView(access: MaybeAccess): boolean {
  return access != null && access.role !== 'owner';
}

/** How to name this session's standing, in one word a creator would use. */
export function roleLabel(access: MaybeAccess): string | null {
  if (access == null || access.role === 'owner') return null;
  if (access.role === 'canvas') {
    return access.permissions.editAutomations ? 'Guest · can edit' : 'Guest · view only';
  }
  return access.permissions.editAutomations ? 'Member · can edit' : 'Member · view only';
}
