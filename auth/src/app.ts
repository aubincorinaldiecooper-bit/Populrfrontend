import express, { type Express } from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import type { Auth } from "better-auth";
import { auth as defaultAuth } from "./auth.js";
import { env } from "./env.js";

/**
 * Optionally accepts a custom Better Auth instance so tests can drive
 * the same Express shape with a mailer-injected auth build (see
 * tests/run.ts). The default is the production `auth` from ./auth.
 */
export function createApp(auth: Auth = defaultAuth): Express {
  const app = express();

  app.use(
    cors({
      origin: env.populrFrontendUrl,
      credentials: true,
    })
  );

  // Mounted before express.json(): Better Auth reads the raw request body
  // itself, so a body parser running first would leave nothing for it to
  // read. Everything under /api/auth is handled entirely by Better Auth.
  app.all("/api/auth/*", toNodeHandler(auth));

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  return app;
}
