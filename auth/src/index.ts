import { createApp } from "./app.js";
import { env } from "./env.js";
import { ensureAuthSchema } from "./db.js";

/**
 * Schema migrations are a separate `npm run migrate` step (meant to run as
 * a Railway pre-deploy command), not something this process does on every
 * boot — that avoids multiple instances racing to migrate at once. This
 * only makes sure the `auth` schema itself exists, since that's a
 * prerequisite for the connection pool's own search_path to resolve
 * anything and costs nothing to repeat.
 */
async function main() {
  await ensureAuthSchema();

  const app = createApp();
  const server = app.listen(env.port, "0.0.0.0", () => {
    console.log(`[populr-auth] listening on 0.0.0.0:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal: string) => {
    console.log(`[populr-auth] ${signal} received, shutting down...`);
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[populr-auth] fatal startup error:", err);
  process.exit(1);
});
