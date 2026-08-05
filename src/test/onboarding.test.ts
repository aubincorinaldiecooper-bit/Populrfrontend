import { describe, it, expect, beforeEach } from 'vitest';
import { isOnboardingComplete, markOnboardingComplete, adoptLegacyOnboardingFlag } from '../lib/onboarding';
import { rememberReturnTo, consumeReturnTo } from '../lib/returnTo';

/* The onboarding flag used to be one global localStorage key written from
 * three places, so it followed the browser rather than the account: a
 * creator finishing onboarding and signing out left the next person to sign
 * in on that browser skipping onboarding entirely, landing on Home with
 * nothing connected. */

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('onboarding completion flag', () => {
  it('round-trips per user', () => {
    expect(isOnboardingComplete('user_a')).toBe(false);
    markOnboardingComplete('user_a');
    expect(isOnboardingComplete('user_a')).toBe(true);
  });

  it("does not leak one user's completion to another on the same browser", () => {
    markOnboardingComplete('user_a');
    expect(isOnboardingComplete('user_b')).toBe(false);
  });

  it('is false with no signed-in user', () => {
    markOnboardingComplete('user_a');
    expect(isOnboardingComplete(null)).toBe(false);
    expect(isOnboardingComplete(undefined)).toBe(false);
  });

  it('honors the legacy global key so existing creators are not re-onboarded', () => {
    window.localStorage.setItem('populr.onboardingComplete', 'true');
    expect(isOnboardingComplete('user_a')).toBe(true);
  });

  it('adopts the legacy key onto one user, so the next account does not inherit it', () => {
    window.localStorage.setItem('populr.onboardingComplete', 'true');
    adoptLegacyOnboardingFlag('user_a');
    expect(isOnboardingComplete('user_a')).toBe(true);
    expect(isOnboardingComplete('user_b')).toBe(false);
  });

  it('reading the flag has no side effects', () => {
    window.localStorage.setItem('populr.onboardingComplete', 'true');
    isOnboardingComplete('user_a');
    // The route gate reads this during render; it must not mutate storage.
    expect(window.localStorage.getItem('populr.onboardingComplete')).toBe('true');
    expect(window.localStorage.getItem('populr.onboardingComplete.user_a')).toBeNull();
  });

  it('ignores a legacy key that was never set to true', () => {
    window.localStorage.setItem('populr.onboardingComplete', 'false');
    expect(isOnboardingComplete('user_a')).toBe(false);
  });
});

describe('post-sign-in destination', () => {
  it('returns the remembered path exactly once', () => {
    rememberReturnTo('/contacts?stage=warm');
    expect(consumeReturnTo()).toBe('/contacts?stage=warm');
    expect(consumeReturnTo()).toBeNull();
  });

  it('returns null when nothing was remembered', () => {
    expect(consumeReturnTo()).toBeNull();
  });

  it('refuses off-origin destinations', () => {
    // Protocol-relative and backslash forms both resolve to another origin
    // in browsers — the classic open-redirect vector.
    for (const evil of ['https://evil.example/steal', '//evil.example', '/\\evil.example', 'contacts']) {
      rememberReturnTo(evil);
      expect(consumeReturnTo()).toBeNull();
    }
  });

  it('refuses to bounce the user back into the auth flow', () => {
    for (const path of ['/login', '/auth/complete']) {
      rememberReturnTo(path);
      expect(consumeReturnTo()).toBeNull();
    }
  });
});
