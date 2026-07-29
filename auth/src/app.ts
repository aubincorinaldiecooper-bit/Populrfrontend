import express, { type Express } from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import { env } from "./env.js";

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: env.populrFrontendUrl,
      credentials: true,
    })
  );

  // Mounted before express.json(): Better Auth reads the raw request body
  // itself, so a body parser running first would leave nothing for it to
  // read. Everything under /api/auth is handled entirely by Better Auth,
  // including sign-up, sign-in, sign-out, session lookup, and the JWT/JWKS
  // endpoints from the jwt plugin.
  app.all("/api/auth/*", toNodeHandler(auth));

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  return app;
}
