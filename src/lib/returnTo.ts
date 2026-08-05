// ============================================================
// Populr — post-sign-in destination
//
// Hitting a protected route without a session bounces to /login. That bounce
// used to discard the path entirely, so a bookmarked or emailed link to
// /contacts always landed the user on Home after signing in.
//
// The destination is stored rather than passed through the URL on purpose:
// an attacker-supplied ?returnTo= is the classic open-redirect vector, and
// the auth service rejects unvalidated callbackURLs anyway. Only same-origin
// application paths are ever accepted or returned.
// ============================================================

const KEY = 'populr.returnTo';

/** True for a path this app may navigate to after sign-in. */
function isSafeAppPath(path: string): boolean {
  // Must be a root-relative path, and must not begin "//" or "/\\", which
  // browsers resolve as protocol-relative URLs to another origin.
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//') || path.startsWith('/\\')) return false;
  // Never send the user back into the auth flow itself.
  if (path === '/login' || path.startsWith('/auth/')) return false;
  return true;
}

export function rememberReturnTo(path: string): void {
  if (!isSafeAppPath(path)) return;
  try {
    window.sessionStorage.setItem(KEY, path);
  } catch {
    // Storage unavailable — sign-in still works, it just lands on Home.
  }
}

/** Reads and clears the stored destination. Returns null when there isn't a usable one. */
export function consumeReturnTo(): string | null {
  try {
    const path = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return path && isSafeAppPath(path) ? path : null;
  } catch {
    return null;
  }
}
