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

export const authClient = createAuthClient({
  baseURL: VITE_AUTH_URL.replace(/\/+$/, ""),
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
