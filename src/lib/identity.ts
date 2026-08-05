// ============================================================
// Populr — Account identity resolution
// The single source of truth for "who is this user, for display purposes."
// Used by the Sidebar footer, Settings > Account, and anywhere else the
// signed-in user's name/avatar needs to render, so every surface agrees
// rather than each hand-rolling its own fallback order.
//
// Identity here means the *Populr account* — the Better Auth user, i.e.
// whoever signed in with Google or a magic link. It deliberately says
// nothing about connected social accounts. This previously also resolved a
// `handle` from `accounts.find(a => a.status === 'connected')` and rendered
// it directly beneath the user's name, which meant an arbitrary connected
// platform (whichever the backend happened to return first — a Reddit or
// Twitter account as easily as the creator's main Instagram) was displayed
// as though it were the user's Populr identity. A social handle only
// carries meaning next to the account it belongs to, so it now lives
// exclusively on connected-account surfaces: Channels, the wizard's account
// picker, and post/preview cards.
// ============================================================
import type { AuthUser } from '../context/AuthContext';

export interface ResolvedIdentity {
  /** Better Auth name -> email local-part -> "Populr user". Never invented. */
  name: string;
  /** Better Auth email, or null if unavailable. */
  email: string | null;
  /** Better Auth profile image, or null — callers fall back to `initials`. */
  avatarUrl: string | null;
  /** Derived from `name`, for rendering when there's no avatarUrl. */
  initials: string;
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

export function resolveIdentity(user: AuthUser | null | undefined): ResolvedIdentity {
  const name =
    (user?.name && user.name.trim()) ||
    (user?.email ? emailLocalPart(user.email) : '') ||
    'Populr user';

  return {
    name,
    email: user?.email ?? null,
    avatarUrl: user?.image ?? null,
    initials: initialsFrom(name),
  };
}
