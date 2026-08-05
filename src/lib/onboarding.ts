// ============================================================
// Populr — onboarding completion flag
//
// Onboarding completion outlives the tab because the OAuth connect flow
// leaves the app entirely and comes back via a full page load. Without
// persistence, the return trip lands on the marketing page instead of the
// route that reads ?connected= and pulls the freshly linked account.
//
// The flag is scoped to the signed-in user. It used to be a single global
// key, written from three separate places with three copies of the same
// read function, which meant it followed the *browser* rather than the
// account: one creator finishing onboarding and signing out left the next
// person to sign in on that browser skipping onboarding entirely, landing
// on Home with nothing connected. Keying by user id ends that.
// ============================================================

const KEY_PREFIX = 'populr.onboardingComplete';
/** The pre-scoping global key. Read as a fallback, adopted by `adoptLegacyOnboardingFlag`. */
const LEGACY_KEY = 'populr.onboardingComplete';

function keyFor(userId: string): string {
  return `${KEY_PREFIX}.${userId}`;
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Storage can be unavailable (private mode, blocked cookies) — fall back
    // to the pre-onboarding experience rather than breaking the app.
    return null;
  }
}

/**
 * Whether this user has finished onboarding on this device.
 *
 * Pure and synchronous by design: the route gate reads it during render, and
 * any window where the user is known but this hasn't resolved yet would
 * bounce them to /connect and destroy the route they were actually opening.
 * With no user id (session still loading, or signed out) this is always
 * false — there is nobody to have completed anything, and the gate treats
 * unauthenticated visitors separately.
 */
export function isOnboardingComplete(userId: string | null | undefined): boolean {
  if (!userId) return false;
  if (read(keyFor(userId)) === 'true') return true;
  // Fall back to the pre-scoping key so an existing creator isn't sent
  // through onboarding again the first time this ships.
  return read(LEGACY_KEY) === 'true';
}

export function markOnboardingComplete(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(keyFor(userId), 'true');
  } catch {
    // Non-fatal: onboarding still completes for this session, it just won't
    // be remembered after a reload.
  }
}

/**
 * Migrates the old global key onto this user, once.
 *
 * Kept out of the read path so that stays free of side effects. The first
 * signed-in user to arrive after this ships inherits the flag — for the
 * overwhelmingly common single-user browser that's the same person who set
 * it, and consuming the key means nobody signing in after them inherits it.
 */
export function adoptLegacyOnboardingFlag(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    if (window.localStorage.getItem(LEGACY_KEY) !== 'true') return;
    window.localStorage.setItem(keyFor(userId), 'true');
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Nothing to migrate if storage is unavailable.
  }
}
