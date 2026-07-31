import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";

/**
 * Base URL of the standalone Populr Auth service. In production this is a
 * different origin from the frontend (a separate Railway service), so
 * every fetch through this client is cross-site and needs
 * credentials:"include" for the session cookie to travel.
 *
 * Missing in dev → fail loudly so nobody discovers the wiring is broken
 * mid-flow. Missing in production → same, no silent localhost fallback:
 * a prod build without VITE_AUTH_URL would send auth traffic to whatever
 * the current page origin is, which is definitely wrong.
 */
const VITE_AUTH_URL = import.meta.env.VITE_AUTH_URL as string | undefined;

if (!VITE_AUTH_URL || VITE_AUTH_URL.trim() === "") {
  throw new Error(
    "VITE_AUTH_URL is required. Set it to the Populr Auth service origin " +
      "(e.g. https://populr-auth.up.railway.app) in the environment before " +
      "building or serving this app."
  );
}

// Captured as its own constant (rather than referencing VITE_AUTH_URL
// directly below) because TypeScript's control-flow narrowing from the
// guard above doesn't survive into the closures further down this file.
const AUTH_BASE_URL = VITE_AUTH_URL.replace(/\/+$/, "");

export const authClient = createAuthClient({
  baseURL: AUTH_BASE_URL,
  // The server mounts routes under /api/auth (see auth service's
  // basePath); the client defaults to this too, but stating it here keeps
  // the two ends explicitly aligned in one place.
  basePath: "/api/auth",
  fetchOptions: {
    // Session cookie is HttpOnly + SameSite=None + Secure in production
    // (see auth service's advanced.defaultCookieAttributes). It only
    // reaches the auth service if every request opts into credentials —
    // browsers won't send SameSite=None cookies on cross-site fetches
    // otherwise, even with SameSite=None set.
    credentials: "include",
  },
  plugins: [magicLinkClient()],
});

export type AuthClient = typeof authClient;

// ============================================================
// Backend API auth token — the populrbackend service verifies callers via
// a JWT (see populrbackend/src/middleware/requireAuth.ts), not the session
// cookie directly (that cookie belongs to this separate auth service's
// origin). GET /api/auth/token exchanges the caller's existing session
// cookie for a short-lived signed JWT (jwt() plugin, ~15min default expiry)
// carrying `sub: user.id`. Cached in memory and refetched only once it's
// close to expiring, so a normal page session doesn't re-request a token on
// every single API call.
// ============================================================

let cachedToken: { token: string; expiresAtMs: number } | null = null;
let inFlight: Promise<string | null> | null = null;

/** Reads a JWT's `exp` claim (seconds since epoch) without verifying it — this
 * is only ever used to decide when to proactively refetch; the backend is
 * the one place that actually verifies the token. */
function decodeExpMs(token: string): number | null {
  try {
    const payloadSegment = token.split(".")[1];
    const json = atob(payloadSegment.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Returns a valid backend auth token for the signed-in caller, or null if
 * there's no session (the caller then gets a real 401 from populrbackend,
 * same as any other unauthenticated request). Refetches ~30s before the
 * cached token's own expiry rather than waiting for it to actually fail, so
 * an in-flight page action doesn't get cut off mid-request by an expiring
 * token.
 */
export async function getApiAuthToken(): Promise<string | null> {
  const REFRESH_SKEW_MS = 30_000;
  if (cachedToken && cachedToken.expiresAtMs - REFRESH_SKEW_MS > Date.now()) {
    return cachedToken.token;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(`${AUTH_BASE_URL}/api/auth/token`, {
        credentials: "include",
      });
      if (!res.ok) {
        cachedToken = null;
        return null;
      }
      const data = (await res.json()) as { token?: string };
      if (!data.token) {
        cachedToken = null;
        return null;
      }
      const expiresAtMs = decodeExpMs(data.token) ?? Date.now() + 60_000;
      cachedToken = { token: data.token, expiresAtMs };
      return data.token;
    } catch (err) {
      console.warn("[auth] failed to fetch backend API token:", err);
      cachedToken = null;
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Drops the cached backend token. Called on sign-out so a subsequent
 * sign-in (by a different user, in the same tab) never reuses it. */
export function clearApiAuthToken(): void {
  cachedToken = null;
}
