import { betterAuth, type BetterAuthOptions } from "better-auth";
import { jwt } from "better-auth/plugins/jwt";
import { magicLink } from "better-auth/plugins/magic-link";
import { env, googleEnabled } from "./env.js";
import { dialect } from "./db.js";
import {
  ResendMailer,
  renderMagicLinkHtml,
  renderMagicLinkText,
  type Mailer,
} from "./mailer.js";

/**
 * Build the Better Auth options object. Kept as a factory that accepts an
 * injected Mailer so tests can substitute a recording stub without
 * touching Resend; production callers get the real ResendMailer by default.
 *
 * Two things kept explicit in this shape:
 * - The mailer is a hard dependency of the magic-link plugin, so it's
 *   accepted as a parameter (rather than lazily grabbed inside
 *   sendMagicLink) — that makes it impossible to accidentally boot the
 *   service with no mailer wired.
 * - migrate.ts imports this factory and calls it with the same real
 *   mailer, so getMigrations() sees the same plugin set the runtime does.
 *   Without that, the magic-link plugin's tables (if it added any) could
 *   be missing from the migrated schema.
 */
export function buildAuthOptions(mailer: Mailer): BetterAuthOptions {
  return {
    baseURL: env.betterAuthUrl,
    secret: env.betterAuthSecret,
    basePath: "/api/auth",

    // See prior review: casing left at Better Auth's camel default,
    // matching the actual generated auth.user/auth.session tables.
    database: {
      dialect,
      type: "postgres",
    },

    // Passwordless product: Google + magic link are the intended methods.
    // emailAndPassword is deliberately absent (not `enabled: false`) so no
    // password-related endpoints are mounted at all.

    // trustedOrigins is enforced by Better Auth's built-in origin check on
    // every callback/redirect param, so passing a fixed
    // POPULR_FRONTEND_URL/auth/complete as the magic-link callbackURL (in
    // sendMagicLink below) is exactly what the client already sends.
    trustedOrigins: [env.populrFrontendUrl],

    // Cross-site session cookies in production. See auth.ts review:
    // BETTER_AUTH_URL and POPULR_FRONTEND_URL are different sites, so a
    // Lax cookie is withheld on cross-site fetch — SameSite=None + Secure
    // is required. Local dev uses http:// which drops Secure cookies, so
    // this is production-only.
    advanced: {
      defaultCookieAttributes: env.isProduction
        ? { sameSite: "none", secure: true }
        : undefined,
    },

    // Optional Google provider — omitted entirely (not disabled) until
    // both credentials exist, so an unfinished OAuth setup can never
    // silently 500 on a Google button press.
    ...(googleEnabled
      ? {
          socialProviders: {
            google: {
              clientId: env.google.clientId,
              clientSecret: env.google.clientSecret,
            },
          },
        }
      : {}),

    plugins: [
      // JWT + JWKS for the separate Populr backend to verify sessions
      // itself without calling back into this service.
      jwt(),

      // Passwordless sign-in and first-time registration in one flow.
      // - expiresIn is 5 minutes (300s) per the product spec.
      // - allowedAttempts stays at the plugin's default of 1: each token
      //   is consumed atomically on the first verification, so it can't
      //   be reused. (The option is documented as deprecated, but the
      //   underlying one-time-use guarantee is exactly what we want and
      //   is unconditional in current Better Auth.)
      // - disableSignUp is left off (default `false`), so a first-time
      //   user is registered when they use a valid link — same page
      //   handles both sign-up and sign-in.
      // - Rate limit is left at the plugin's default (5/min per IP) to
      //   block obvious enumeration bursts without paperwork here.
      magicLink({
        expiresIn: 60 * 5,
        sendMagicLink: async ({ email, url }) => {
          const html = renderMagicLinkHtml(url);
          const text = renderMagicLinkText(url);
          try {
            await mailer.sendEmail({
              to: email,
              subject: "Sign in to Populr",
              html,
              text,
            });
          } catch (err) {
            // Redacted log: never include the token, magic-link URL, or
            // the recipient address. The error message is only the
            // provider's error-name label ("delivery_failed" etc.) —
            // Resend's raw payloads can enumerate what's wrong per
            // address, which is user-existence leakage.
            const reason = err instanceof Error ? err.name : "unknown";
            console.error(`[populr-auth] magic-link mailer failed: ${reason}`);
            // Rethrow so Better Auth surfaces a generic failure to the
            // client instead of reporting success. We never report an
            // email as sent when delivery failed.
            throw err;
          }
        },
      }),
    ],
  };
}

// Deferred until first actual send: constructing the ResendMailer eagerly
// would throw at import time whenever RESEND_API_KEY is unset (local dev,
// migrate.ts, test files that build their own auth instance), even though
// no email is about to be sent. Wrapping it means only a real magic-link
// request in a misconfigured environment surfaces the missing key — an
// import (or a getMigrations() call, or a JWKS fetch) never does.
let cachedProductionMailer: ResendMailer | null = null;
function productionMailer(): ResendMailer {
  if (!cachedProductionMailer) cachedProductionMailer = new ResendMailer();
  return cachedProductionMailer;
}

const productionMailerProxy: Mailer = {
  sendEmail: (input) => productionMailer().sendEmail(input),
};

// Production runtime: real Resend transport (constructed lazily). In
// tests, tests/run.ts calls buildAuthOptions() directly with an injected
// mailer instead of importing this default export.
export const authOptions: BetterAuthOptions = buildAuthOptions(productionMailerProxy);
export const auth = betterAuth(authOptions);
