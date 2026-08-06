import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchConnectedAccounts, fetchCapabilities, onUnauthorized } from '../lib/api';
import { clearApiAuthToken } from '../lib/authClient';

/* A backend 401 must invalidate the cached API token.
 *
 * getApiAuthToken hands back the cached JWT until ~30s before its own expiry,
 * so a token the backend rejects while still "unexpired" by the clock (secret
 * rotation, clock skew) would be reused on every subsequent call — the app
 * stuck erroring under an authenticated shell with no auto-recovery. apiFetch
 * now calls clearApiAuthToken() on 401 so the next call re-exchanges the
 * session cookie for a fresh token. Proven here by counting token-endpoint
 * fetches: without the clear, a second call within the 60s cache window reuses
 * the token (1 fetch); with it, the second call re-fetches (2). */

let tokenFetches = 0;

function stubFetch() {
  tokenFetches = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/auth/token')) {
      tokenFetches += 1;
      return { ok: true, status: 200, json: async () => ({ token: `tok-${tokenFetches}` }) } as Response;
    }
    if (url.includes('/api/accounts')) {
      // The rejected-but-time-valid call.
      return { ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) } as Response;
    }
    // Any other authenticated GET (used as the "next call").
    return { ok: true, status: 200, json: async () => ({ platforms: [] }) } as Response;
  }));
}

beforeEach(() => {
  clearApiAuthToken();
  onUnauthorized(null);
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  onUnauthorized(null);
  clearApiAuthToken();
});

describe('apiFetch — 401 clears the cached backend token', () => {
  it('re-exchanges the session cookie on the next call after a 401', async () => {
    // First authenticated call fetches a token (1), then 401s.
    await expect(fetchConnectedAccounts()).rejects.toBeTruthy();
    expect(tokenFetches).toBe(1);

    // The next call must NOT reuse the rejected token — it re-fetches (2).
    await fetchCapabilities();
    expect(tokenFetches).toBe(2);
  });

  it('notifies the unauthorized handler so AuthContext can re-check the session', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    await expect(fetchConnectedAccounts()).rejects.toBeTruthy();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
