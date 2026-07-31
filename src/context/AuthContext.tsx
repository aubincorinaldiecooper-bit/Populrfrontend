import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authClient, clearApiAuthToken } from "../lib/authClient";

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

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
