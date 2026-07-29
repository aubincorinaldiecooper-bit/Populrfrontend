import { Pool } from "pg";
import { PostgresDialect } from "kysely";
import { env } from "./env.js";

/**
 * Populr's existing Postgres database, reached through AUTH_DATABASE_URL —
 * a dedicated connection string rather than sharing the main backend's
 * DATABASE_URL, so this service's database access is configured and
 * revocable independently.
 *
 * Every table Better Auth creates (user, session, account, verification,
 * jwks, ...) must stay out of the existing Populr application tables. Since
 * Better Auth itself has no schema option, isolation is enforced the
 * standard Postgres way: search_path is set to the `auth` schema first
 * (falling back to `public` for shared types/extensions).
 *
 * This is set via the `options` startup parameter rather than a
 * post-connect `SET search_path` query. A `pool.on("connect", ...)` handler
 * fires as a notification only — pg-pool does not wait for it before handing
 * the connection to the next caller, so a query issued right after connect
 * (exactly what Better Auth's Kysely dialect does) can race a `SET`
 * statement and run before it applies. `options` is applied by Postgres as
 * part of the connection handshake itself, before the connection is usable
 * for anything, so there's no window where a query can see the wrong
 * search_path.
 */
export const pool = new Pool({
  connectionString: env.authDatabaseUrl,
  options: "-c search_path=auth,public",
  ssl: env.isProduction ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  console.error("[populr-auth] unexpected idle client error", err);
});

/**
 * Creates the `auth` schema if it doesn't exist yet. Schema creation isn't
 * affected by search_path, so this is safe to call before anything else
 * touches the pool. Idempotent.
 */
export async function ensureAuthSchema(): Promise<void> {
  await pool.query("CREATE SCHEMA IF NOT EXISTS auth");
}

export const dialect = new PostgresDialect({ pool });
