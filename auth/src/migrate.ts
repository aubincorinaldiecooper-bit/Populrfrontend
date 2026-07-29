import { getMigrations } from "better-auth/db/migration";
import { ensureAuthSchema, pool } from "./db.js";
import { authOptions } from "./auth.js";

/**
 * Safe to run on every deploy: getMigrations() diffs the `auth` schema's
 * actual tables/columns against what Better Auth's config expects and only
 * creates what's missing (toBeCreated/toBeAdded), so a schema that's
 * already current is a fast no-op. Non-interactive — no prompts — so it's
 * safe as a Railway pre-deploy command.
 */
async function migrate(): Promise<void> {
  await ensureAuthSchema();

  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(authOptions);

  if (toBeCreated.length === 0 && toBeAdded.length === 0) {
    console.log("[auth-migrate] schema already up to date, nothing to do");
    return;
  }

  const newTables = toBeCreated.map((t) => t.table).join(", ") || "none";
  const alteredTables = toBeAdded.map((t) => t.table).join(", ") || "none";
  console.log(
    `[auth-migrate] applying schema: new tables [${newTables}], columns added to [${alteredTables}]`
  );
  await runMigrations();
  console.log("[auth-migrate] schema applied.");
}

migrate()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[auth-migrate] failed:", err);
    process.exit(1);
  });
