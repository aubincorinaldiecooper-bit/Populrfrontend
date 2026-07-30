// ============================================================
// Populr — Account identity resolution
// The single source of truth for "who is this user, for display purposes."
// Used by the Sidebar footer, Settings > Account, and anywhere else the
// signed-in user's name/avatar/handle needs to render, so every surface
// agrees rather than each hand-rolling its own fallback order.
// ============================================================
import type { AuthUser } from '../context/AuthContext';
import type { ConnectedAccount } from './api';

export interface ResolvedIdentity {
  /** Better Auth name -> email local-part -> "Populr user". Never invented. */
  name: string;
  /** Better Auth email, or null if unavailable. */
  email: string | null;
  /** Better Auth profile image, or null — callers fall back to `initials`. */
  avatarUrl: string | null;
  /** Derived from `name`, for rendering when there's no avatarUrl. */
  initials: string;
  /** username of the first connected account -> its display name -> null (no handle line). */
  handle: string | null;
}

function emailLocalPart(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function resolveIdentity(
  user: AuthUser | null | undefined,
  accounts: ConnectedAccount[],
): ResolvedIdentity {
  const name =
    (user?.name && user.name.trim()) ||
    (user?.email ? emailLocalPart(user.email) : '') ||
    'Populr user';

  const firstConnected = accounts.find(a => a.status === 'connected');
  const handle = firstConnected
    ? (firstConnected.username ? `@${firstConnected.username}` : firstConnected.display_name ?? null)
    : null;

  return {
    name,
    email: user?.email ?? null,
    avatarUrl: user?.image ?? null,
    initials: initialsFrom(name),
    handle,
  };
}
