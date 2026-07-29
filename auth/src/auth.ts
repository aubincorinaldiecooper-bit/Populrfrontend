import { betterAuth, type BetterAuthOptions } from "better-auth";
import { jwt } from "better-auth/plugins/jwt";
import { env, googleEnabled } from "./env.js";
import { dialect } from "./db.js";

/**
 * The raw config object, kept separate from the constructed `auth` instance
 * so migrate.ts can pass the exact same options into Better Auth's
 * getMigrations() without depending on whatever shape the constructed
 * instance happens to re-expose its options as.
 */
export const authOptions: BetterAuthOptions = {
  baseURL: env.betterAuthUrl,
  secret: env.betterAuthSecret,
  basePath: "/api/auth",

  // casing deliberately left at its "camel" default: Better Auth's own
  // schema generator (getMigrations, used by npm run migrate) ignores the
  // `casing` option entirely and always creates camelCase columns —
  // confirmed by inspecting the generated auth.user/auth.session tables —
  // while the runtime query adapter *would* honor a "snake" setting if one
  // were passed here. Setting casing: "snake" would silently break every
  // query against the actual (camelCase) schema. This is unrelated to the
  // snake_case convention in Populr's own public-schema tables; the two
  // schemas don't need to agree on column casing.
  database: {
    dialect,
    type: "postgres",
  },

  emailAndPassword: {
    enabled: true,
  },

  // Only the Populr frontend's own origin is trusted for cookies/CSRF and
  // for the OAuth-style `callbackURL` params Better Auth accepts.
  trustedOrigins: [env.populrFrontendUrl],

  // BETTER_AUTH_URL (this service's own Railway domain) and
  // POPULR_FRONTEND_URL are expected to be different sites in production,
  // not just different paths on the same origin. Being in trustedOrigins
  // only gets a cross-site request past CORS/CSRF checks — it does nothing
  // about the session cookie itself. Better Auth's default cookie is
  // SameSite=Lax, and Lax cookies are withheld by the browser on
  // cross-site fetch/XHR (only same-site requests, or top-level
  // navigations, carry them). Without this, sign-in succeeds (the
  // Set-Cookie response doesn't need the cookie to be sent), but every
  // later request — get-session, token, sign-out — arrives with no cookie
  // and looks unauthenticated. SameSite=None requires Secure, which is why
  // this is production-only: a Secure cookie is dropped by the browser
  // entirely over plain http://, which is what local dev uses.
  advanced: {
    defaultCookieAttributes: env.isProduction
      ? { sameSite: "none", secure: true }
      : undefined,
  },

  // Prepared but left out entirely until real credentials exist — Google
  // sign-in is unreachable, not just failing, until GOOGLE_CLIENT_ID and
  // GOOGLE_CLIENT_SECRET are both set.
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

  // Issues JWTs (GET /api/auth/token, authenticated) and exposes the public
  // signing keys (GET /api/auth/jwks) so the separate Populr backend can
  // verify sessions itself without calling back into this service.
  plugins: [jwt()],
};

export const auth = betterAuth(authOptions);
