import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authClient, clearApiAuthToken } from "../lib/authClient";
import { onUnauthorized } from "../lib/api";

/**
 * Minimal projection of the Better Auth session/user shape we actually
 * consume — kept narrow so a change on the auth server (e.g. adding
 * plugins that widen the User type) doesn't cascade into every consumer.
 */
export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: string;
}

interface AuthContextValue {
  /** Undefined while the first getSession() call is in flight, then null
   * for unauthenticated or an object for authenticated. Consumers use the
   * undefined state to render "loading" without ever assuming "logged
   * out" prematurely (which would flash the login screen on refresh). */
  session: AuthSession | null | undefined;
  user: AuthUser | null;
  loading: boolean;
  /** Re-fetch the session from the auth service. Used after the OAuth or
   * magic-link return trip lands on /auth/complete, before deciding
   * where to route the user. */
  refresh: () => Promise<void>;
  /** Ends the session on the server and clears local state. Callers are
   * responsible for routing to /login afterward — this function does not
   * touch the router. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);
  const [user, setUser] = useState<AuthUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await authClient.getSession();
      // Better Auth's client returns { data: {...} | null } from
      // getSession(); an actual network/parse error propagates as thrown.
      const data = (res as { data: unknown }).data;
      if (data && typeof data === "object") {
        const record = data as { session?: AuthSession; user?: AuthUser };
        if (record.session && record.user) {
          setSession(record.session);
          setUser(record.user);
          return;
        }
      }
      setSession(null);
      setUser(null);
    } catch (err) {
      // Any failure to reach the auth service is treated as "no session,
      // but visible" — we don't want a temporary outage to trap the user
      // in a permanent loading spinner. The caller (route gate) can then
      // send them to /login.
      console.warn("[auth] session lookup failed:", err);
      setSession(null);
      setUser(null);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch (err) {
      // Even if the server-side call fails, clear the local view so the
      // UI stops treating the user as authenticated. The server's
      // authoritative getSession() will confirm on the next request.
      console.warn("[auth] sign-out call failed:", err);
    }
    clearApiAuthToken();
    setSession(null);
    setUser(null);
  }, []);

  // Everything cached was an answer to "what does THIS person's workspace
  // look like", so none of it survives them leaving. This watches the
  // SESSION rather than the sign-out button, because a session also ends by
  // expiring and by the backend refusing it — and the next person to sign
  // in on this browser must not see the previous one's workspace for as
  // long as it takes the first request to land. `undefined` is "still
  // asking", which is not the same as gone.
  const hadSession = useRef(false);
  useEffect(() => {
    if (session) {
      hadSession.current = true;
    } else if (session === null && hadSession.current) {
      hadSession.current = false;
      queryClient.clear();
    }
  }, [session, queryClient]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // The backend is the authority on whether this session is still good. When
  // it answers 401, end the session here so the route gate sends the user to
  // /login — previously nothing inspected the status, so an expired session
  // left the full authenticated shell (name, avatar, nav) rendering over
  // pages that could only show "couldn't load" banners, until a manual
  // reload. Re-verify with the auth service first so a single stray 401
  // can't sign out a user whose session is actually fine.
  useEffect(() => {
    onUnauthorized(() => { void refresh(); });
    return () => onUnauthorized(null);
  }, [refresh]);

  // A session that has already expired by the clock shouldn't keep rendering
  // an authenticated shell until something happens to make a request.
  useEffect(() => {
    if (!session?.expiresAt) return;
    const msLeft = new Date(session.expiresAt).getTime() - Date.now();
    if (!Number.isFinite(msLeft)) return;
    // setTimeout clamps above ~24.8 days; re-checking on that boundary is
    // harmless and keeps the arithmetic honest for long-lived sessions.
    // An already-expired session uses the same path with a zero delay, so
    // the re-check always lands in its own tick rather than mid-render.
    const delay = Math.min(Math.max(msLeft, 0), 2_147_483_647);
    const timer = setTimeout(() => { void refresh(); }, delay);
    return () => clearTimeout(timer);
  }, [session?.expiresAt, refresh]);

  return (
    <AuthContext.Provider value={{ session, user, loading: session === undefined, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
