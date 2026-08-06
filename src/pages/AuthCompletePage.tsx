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
/** Map a provider/magic-link callback error to one of LoginPage's specific
 *  error codes, so the accurate copy ("that link has expired") is reachable
 *  via the callback path instead of the generic "couldn't restore your
 *  session." Returns null when the error isn't one we have specific copy for. */
function mapCallbackError(error: string | null, description: string | null): string | null {
  if (!error) return null;
  const haystack = `${error} ${description ?? ""}`.toLowerCase();
  if (haystack.includes("expire")) return "expired_link";
  if (haystack.includes("used") || haystack.includes("already")) return "used_link";
  if (haystack.includes("invalid") || haystack.includes("token")) return "invalid_link";
  return "session_failed";
}

export default function AuthCompletePage() {
  const { session, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const refreshedOnce = useRef(false);
  // Captured BEFORE the params are stripped: whether this arrival actually
  // carried a callback (so a plain, signed-out visit isn't reported as a
  // failed sign-in), and any specific error the callback delivered.
  const arrivalRef = useRef<{ hadCallback: boolean; mappedError: string | null }>({
    hadCallback: false,
    mappedError: null,
  });

  // On mount, strip any OAuth/magic-link query params from the visible
  // URL so a reload doesn't re-trigger anything unexpectedly, then force
  // a fresh session lookup (the cookie may have arrived only just now).
  useEffect(() => {
    const url = new URL(window.location.href);
    arrivalRef.current = {
      hadCallback: ["code", "state", "token", "error"].some(p => url.searchParams.has(p)),
      mappedError: mapCallbackError(url.searchParams.get("error"), url.searchParams.get("error_description")),
    };
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
      return;
    }
    const { hadCallback, mappedError } = arrivalRef.current;
    if (mappedError) {
      // The callback told us exactly what went wrong — forward the specific code.
      navigate(`/login?error=${mappedError}`, { replace: true });
    } else if (hadCallback) {
      // A real sign-in attempt that produced no session — a genuine failure.
      navigate("/login?error=session_failed", { replace: true });
    } else {
      // No callback markers at all — a stale tab, bookmark, or back button
      // after sign-out. Route to /login cleanly; the user never attempted a
      // sign-in here, so "sign-in failed" would be a lie.
      navigate("/login", { replace: true });
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

