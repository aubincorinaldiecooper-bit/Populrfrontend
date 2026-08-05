import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowRight, Loader2 } from "lucide-react";
import { authClient } from "../lib/authClient";
import { useAuth } from "../context/AuthContext";
import { consumeReturnTo } from "../lib/returnTo";

const LIME = "#C5FF3D";
const CREAM = "#F3F0EC";
const BLACK = "#111111";

/** Where the auth service must send the browser after Google or magic-link
 * verification succeeds. Fixed and trusted — never derived from
 * ?redirect= or ?returnTo= query params, which would be an open redirect
 * off the end of the OAuth flow. */
function callbackURL(): string {
  return `${window.location.origin}/auth/complete`;
}

/** Minimal, no-regex-over-Unicode email validation: presence of a single
 * @ with content on both sides, and no whitespace. The browser's native
 * type="email" adds a real parse check; this only exists to keep an
 * obviously-broken submit from hitting the server. */
function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  const at = trimmed.indexOf("@");
  return at > 0 && at < trimmed.length - 1;
}

type ErrorKind =
  | "invalid_email"
  | "send_failed"
  | "google_failed"
  | "expired_link"
  | "used_link"
  | "invalid_link"
  | "session_failed"
  | null;

/** Human-readable copy for the deep-linked error codes /auth/complete
 * bounces the user back to /login with, plus form-local error copy. */
function errorMessage(kind: ErrorKind): string | null {
  switch (kind) {
    case "invalid_email":
      return "Enter a valid email address.";
    case "send_failed":
      return "We couldn't send your sign-in email. Please try again in a moment.";
    case "google_failed":
      return "We couldn't start Google sign-in. Please try again.";
    case "expired_link":
      return "That sign-in link has expired. Request a new one below.";
    case "used_link":
      return "That sign-in link has already been used. Request a new one below.";
    case "invalid_link":
      return "That sign-in link isn't valid. Request a new one below.";
    case "session_failed":
      return "We couldn't restore your session. Please try signing in again.";
    default:
      return null;
  }
}

/** Cooldown before the "Resend link" button re-enables — mirrors the
 * server-side rate limit and stops accidental double-taps. */
const RESEND_COOLDOWN_SECONDS = 30;

export default function LoginPage() {
  const { session, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const initialError = useMemo<ErrorKind>(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("error");
    if (
      code === "invalid_email" ||
      code === "send_failed" ||
      code === "google_failed" ||
      code === "expired_link" ||
      code === "used_link" ||
      code === "invalid_link" ||
      code === "session_failed"
    ) {
      return code;
    }
    return null;
  }, [location.search]);

  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<ErrorKind>(initialError);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean the ?error= param out of the visible URL once we've picked it
  // up (so a browser reload doesn't re-render the same stale error).
  useEffect(() => {
    if (!initialError) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route authenticated users away from /login — they don't belong here.
  // We drive off AuthContext (Better Auth's session endpoint), not a
  // client-held flag, so a refresh always reconciles with the server.
  useEffect(() => {
    if (loading) return;
    if (!session) return;
    navigate(consumeReturnTo() ?? "/", { replace: true });
  }, [loading, session, navigate]);

  // Countdown for the resend cooldown.
  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return Math.max(0, c - 1);
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedEmail]);

  const startGoogle = useCallback(async () => {
    setError(null);
    setGoogleBusy(true);
    try {
      // Better Auth's client for social sign-in either navigates directly
      // or returns { data: { url } } to navigate to.
      const res = await authClient.signIn.social({
        provider: "google",
        callbackURL: callbackURL(),
      });
      const url = (res as { data?: { url?: string } })?.data?.url;
      if (url) {
        window.location.href = url;
      }
      // If the client handled the redirect itself, we're already leaving.
    } catch (err) {
      console.warn("[auth] google sign-in failed to start:", err);
      setError("google_failed");
      setGoogleBusy(false);
    }
  }, []);

  const submitMagicLink = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (sending) return;
      const normalized = email.trim().toLowerCase();
      if (!isPlausibleEmail(normalized)) {
        setError("invalid_email");
        return;
      }
      setError(null);
      setSending(true);
      try {
        await authClient.signIn.magicLink({
          email: normalized,
          callbackURL: callbackURL(),
        });
        setSubmittedEmail(normalized);
        setCooldown(RESEND_COOLDOWN_SECONDS);
      } catch (err) {
        console.warn("[auth] magic-link send failed:", err);
        setError("send_failed");
      } finally {
        setSending(false);
      }
    },
    [email, sending]
  );

  const resendLink = useCallback(async () => {
    if (!submittedEmail || cooldown > 0 || sending) return;
    setError(null);
    setSending(true);
    try {
      await authClient.signIn.magicLink({
        email: submittedEmail,
        callbackURL: callbackURL(),
      });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      console.warn("[auth] magic-link resend failed:", err);
      setError("send_failed");
    } finally {
      setSending(false);
    }
  }, [cooldown, sending, submittedEmail]);

  const useDifferentEmail = useCallback(() => {
    setSubmittedEmail(null);
    setEmail("");
    setError(null);
  }, []);

  // The auth service redirects to /auth/complete on success, which
  // handles session restoration. But if the user navigated to /login
  // while already partway through a Google redirect, refresh() will pick
  // that up.
  useEffect(() => {
    if (!loading && !session) refresh();
    // Only on mount; effectively a "did the URL bring us back with a
    // fresh session?" nudge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errorText = errorMessage(error);

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: CREAM, color: BLACK }}>
      <div className="grid min-h-screen w-full lg:grid-cols-2">
        {/* Photo half — hidden on mobile to keep the login flow tight,
            shown as a banner on tablet-and-up. Uses an existing landing
            asset, no new image files. */}
        <div className="relative hidden overflow-hidden lg:block" style={{ backgroundColor: BLACK }}>
          <img
            src="/images/landing/friends-reacting.webp"
            alt="Three friends reacting to something on a phone together"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-10 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: LIME }}>
              Populr
            </p>
            <p className="mt-3 max-w-md text-2xl font-semibold leading-snug">
              Keep the conversation moving.
            </p>
          </div>
        </div>

        {/* Sign-in half */}
        <div className="flex min-h-screen items-center justify-center p-6 lg:min-h-0">
          <div className="w-full max-w-md">
            <p className="text-xs font-bold uppercase tracking-[0.2em]" aria-label="Populr">
              Populr
            </p>
            <h1 className="mt-6 text-3xl font-bold uppercase leading-[0.95] tracking-tight sm:text-4xl">
              Keep the conversation moving.
            </h1>
            <p className="mt-3 text-base opacity-75">
              Sign in to manage the people engaging with your content.
            </p>

            {errorText && (
              <div
                role="alert"
                aria-live="polite"
                className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-700"
              >
                {errorText}
              </div>
            )}

            {!submittedEmail ? (
              <>
                <button
                  type="button"
                  onClick={startGoogle}
                  disabled={googleBusy}
                  aria-label="Continue with Google"
                  className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-black/15 bg-white px-4 py-3.5 text-sm font-semibold text-black shadow-sm transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {googleBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Starting Google…
                    </>
                  ) : (
                    <>
                      <GoogleIcon /> Continue with Google
                    </>
                  )}
                </button>

                <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] opacity-60">
                  <div className="h-px flex-1 bg-black/15" />
                  or
                  <div className="h-px flex-1 bg-black/15" />
                </div>

                <form onSubmit={submitMagicLink} noValidate className="mt-6" aria-describedby="email-help">
                  <label htmlFor="login-email" className="block text-sm font-semibold">
                    Email address
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-black/15 bg-white px-4 py-3.5 text-sm text-black outline-none placeholder:text-black/40 focus:border-black/40"
                    aria-invalid={error === "invalid_email" || undefined}
                  />
                  <button
                    type="submit"
                    disabled={sending}
                    className="group mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold text-[#111111] shadow-md transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ backgroundColor: LIME }}
                  >
                    {sending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Sending link…
                      </>
                    ) : (
                      <>
                        Email me a sign-in link
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                      </>
                    )}
                  </button>
                  <p id="email-help" className="sr-only">
                    We'll email you a secure one-time sign-in link. No password required.
                  </p>
                </form>
              </>
            ) : (
              <section
                aria-live="polite"
                className="mt-8 rounded-2xl border border-black/10 bg-white p-6"
                data-testid="magic-link-sent"
              >
                <h2 className="text-2xl font-bold uppercase tracking-tight">Check your email.</h2>
                <p className="mt-3 text-sm">
                  We sent a secure sign-in link to <span className="font-semibold">{submittedEmail}</span>.
                </p>
                <p className="mt-2 text-sm opacity-75">The link expires in 5 minutes.</p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={resendLink}
                    disabled={cooldown > 0 || sending}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/15 bg-white px-4 py-3 text-sm font-semibold text-black transition hover:border-black/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Sending…
                      </>
                    ) : cooldown > 0 ? (
                      `Resend link in ${cooldown}s`
                    ) : (
                      "Resend link"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={useDifferentEmail}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-transparent bg-black/5 px-4 py-3 text-sm font-semibold text-black transition hover:bg-black/10"
                  >
                    Use a different email
                  </button>
                </div>
              </section>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

/** localStorage-only onboarding flag — matches AppContext's own reader.
 * Duplicated intentionally: LoginPage only needs the read side, and
 * importing AppContext just for this would create a cycle since
 * AuthProvider wraps AppProvider. */

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
