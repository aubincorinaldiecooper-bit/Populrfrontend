import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}. See .env.example.`);
  }
  return value.trim();
}

function optional(name: string, fallback = ""): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

// Better Auth requires a fully-qualified URL (with protocol) for its base
// URL. Railway's generated domains are sometimes injected as bare hostnames,
// so we defensively add the protocol rather than fail the deploy.
function withProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  isProduction: optional("NODE_ENV", "development") === "production",

  // Railway injects PORT; 4001 only matters for local dev.
  port: Number(optional("PORT", "4001")),

  // Auth-specific config. All required in every environment: an auth
  // service booting with a placeholder secret or no known frontend origin
  // is a security bug, not a degraded-but-usable state.
  betterAuthSecret: required("BETTER_AUTH_SECRET"),
  betterAuthUrl: withProtocol(required("BETTER_AUTH_URL")),
  populrFrontendUrl: required("POPULR_FRONTEND_URL"),

  // Populr's existing Postgres database, reached through a dedicated
  // connection string so this service's access is independently
  // configurable (and revocable) from the main backend's.
  authDatabaseUrl: required("AUTH_DATABASE_URL"),

  google: {
    clientId: optional("GOOGLE_CLIENT_ID"),
    clientSecret: optional("GOOGLE_CLIENT_SECRET"),
  },
};

// Google sign-in is wired up but only switched on once real credentials are
// supplied — until then socialProviders.google is omitted entirely, so the
// provider doesn't exist rather than existing-but-failing.
export const googleEnabled = Boolean(env.google.clientId && env.google.clientSecret);

export type Env = typeof env;
