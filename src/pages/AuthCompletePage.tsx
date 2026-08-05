import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { consumeReturnTo } from "../lib/returnTo";

const CREAM = "#F3F0EC";
const BLACK = "#111111";

/**
 * Landing route for both Google and magic-link callbacks.
 *
 * The auth service has already set the session cookie by the time the
 * browser arrives here (it's HttpOnly + SameSite=None + Secure in
 * production). This page's job is to:
 *   1. Ask Better Auth's session endpoint whether that cookie is valid.
 *   2. Route accordingly.
 *
 * We deliberately do NOT trust localStorage as evidence of a session —
 * the server's getSession() is the sole source of truth.
 */
export default function AuthCompletePage() {
  const { session, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const refreshedOnce = useRef(false);

  // On mount, strip any OAuth/magic-link query params from the visible
  // URL so a reload doesn't re-trigger anything unexpectedly, then force
  // a fresh session lookup (the cookie may have arrived only just now).
  useEffect(() => {
    const url = new URL(window.location.href);
    let dirty = false;
    for (const param of ["code", "state", "token", "callbackURL", "error", "error_description"]) {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        dirty = true;
      }
    }
    if (dirty) window.history.replaceState(null, "", url.toString());

    if (!refreshedOnce.current) {
      refreshedOnce.current = true;
      refresh();
    }
  }, [refresh]);

  // Route once the session state stops being undefined ("still loading")
  // and settles into either "logged in" or "not logged in".
  useEffect(() => {
    if (loading) return;
    if (session) {
      // Land where the user was actually headed before the auth bounce.
      navigate(consumeReturnTo() ?? "/", { replace: true });
    } else {
      // No session after the callback resolved → treat as a failed
      // restoration and bounce back to /login with a safe error code.
      // The LoginPage renders human copy for this code.
      navigate("/login?error=session_failed", { replace: true });
    }
  }, [loading, session, navigate]);

  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ backgroundColor: CREAM, color: BLACK }}
    >
      <div className="flex items-center gap-3 text-sm opacity-75">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Signing you in…
      </div>
    </div>
  );
}

