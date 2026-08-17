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

/** May this view offer automation editing? Canvas invitees may — for their
 *  one canvas, which is the only one they can reach anyway. */
export function canEditAutomations(access: MaybeAccess): boolean {
  if (access == null || access.role === 'owner' || access.role === 'canvas') return true;
  return access.permissions.editAutomations;
}
