/* Integration tests for the Populr Auth service, against a real Postgres
 * and a real running Express + Better Auth server. Conventions mirror the
 * populrbackend test suites: a plain check() assertion helper, no test
 * framework, run directly via tsx. */
import http from "node:http";
import { spawn } from "node:child_process";
import { createApp } from "../src/app.js";
import { pool } from "../src/db.js";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name}`, extra !== undefined ? JSON.stringify(extra)?.slice(0, 500) : ""); }
}

interface Res { status: number; headers: http.IncomingHttpHeaders; body: any; }

function req(
  port: number,
  method: string,
  path: string,
  opts: { body?: unknown; origin?: string; cookie?: string } = {}
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const data = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string> = {
      Origin: opts.origin ?? "http://localhost:5173",
    };
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(Buffer.byteLength(data));
    }
    if (opts.cookie) headers["Cookie"] = opts.cookie;

    const r = http.request({ host: "localhost", port, path, method, headers }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        let body: any = null;
        if (d) {
          try { body = JSON.parse(d); } catch { body = d; }
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
      });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

/** Extracts a `name=value` pair suitable for a Cookie request header from a
 * Set-Cookie response (Better Auth's session cookie is httpOnly, so this is
 * the only way tests can carry it forward — same as a real browser would). */
function cookieHeaderFrom(res: Res): string | undefined {
  const setCookie = res.headers["set-cookie"];
  if (!setCookie) return undefined;
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

function startServer(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const app = createApp();
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      resolve({ port, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

async function main() {
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `test_${runId}@example.com`;
  const password = "correct-horse-battery-1";

  const server = await startServer();

  console.log("\n== GET /health ==");
  const health = await req(server.port, "GET", "/health");
  check("returns 200", health.status === 200, health);
  check("reports ok", health.body?.status === "ok", health.body);

  console.log("\n== POST /api/auth/sign-up/email ==");
  const signUp = await req(server.port, "POST", "/api/auth/sign-up/email", {
    body: { name: "Test User", email, password },
  });
  check("200 OK", signUp.status === 200, signUp.body);
  check("returns the created user with the right email", signUp.body?.user?.email === email, signUp.body);
  check("returns a session token", typeof signUp.body?.token === "string" && signUp.body.token.length > 0, signUp.body);

  console.log("\n== POST /api/auth/sign-up/email rejects a duplicate email ==");
  const dupeSignUp = await req(server.port, "POST", "/api/auth/sign-up/email", {
    body: { name: "Test User", email, password },
  });
  check("duplicate sign-up is rejected, not silently accepted", dupeSignUp.status >= 400, dupeSignUp.body);

  console.log("\n== POST /api/auth/sign-in/email ==");
  const signIn = await req(server.port, "POST", "/api/auth/sign-in/email", {
    body: { email, password },
  });
  check("200 OK", signIn.status === 200, signIn.body);
  check("returns the same user", signIn.body?.user?.email === email, signIn.body);
  const sessionCookie = cookieHeaderFrom(signIn);
  check("sets a session cookie", typeof sessionCookie === "string" && sessionCookie.length > 0, signIn.headers["set-cookie"]);

  console.log("\n== POST /api/auth/sign-in/email rejects the wrong password ==");
  const badSignIn = await req(server.port, "POST", "/api/auth/sign-in/email", {
    body: { email, password: "definitely-not-the-password" },
  });
  check("wrong password is rejected", badSignIn.status >= 400, badSignIn.body);

  console.log("\n== GET /api/auth/get-session (session lookup) ==");
  const noCookieSession = await req(server.port, "GET", "/api/auth/get-session");
  check("no cookie -> no session", noCookieSession.body === null, noCookieSession.body);

  const session = await req(server.port, "GET", "/api/auth/get-session", { cookie: sessionCookie });
  check("200 OK", session.status === 200, session.body);
  check("session belongs to the signed-in user", session.body?.user?.email === email, session.body);
  check("session has an expiry", typeof session.body?.session?.expiresAt === "string", session.body);

  console.log("\n== GET /api/auth/jwks (JWT/JWKS support) ==");
  const jwks = await req(server.port, "GET", "/api/auth/jwks");
  check("200 OK", jwks.status === 200, jwks.body);
  check("returns at least one signing key", Array.isArray(jwks.body?.keys) && jwks.body.keys.length > 0, jwks.body);

  console.log("\n== GET /api/auth/token issues a JWT for the active session ==");
  const token = await req(server.port, "GET", "/api/auth/token", { cookie: sessionCookie });
  check("200 OK", token.status === 200, token.body);
  check("returns a JWT-shaped token", typeof token.body?.token === "string" && token.body.token.split(".").length === 3, token.body);

  console.log("\n== POST /api/auth/sign-out ==");
  const signOut = await req(server.port, "POST", "/api/auth/sign-out", { cookie: sessionCookie });
  check("200 OK", signOut.status === 200, signOut.body);
  check("reports success", signOut.body?.success === true, signOut.body);

  const afterSignOut = await req(server.port, "GET", "/api/auth/get-session", { cookie: sessionCookie });
  check("session is gone after sign-out", afterSignOut.body === null, afterSignOut.body);

  console.log("\n== Trusted-origin rejection ==");
  const untrusted = await req(server.port, "POST", "/api/auth/sign-up/email", {
    origin: "https://evil.example",
    body: { name: "Evil", email: `evil_${runId}@example.com`, password },
  });
  check("an untrusted Origin is rejected, not processed", untrusted.status === 403, untrusted.body);
  check("rejection is the expected invalid-origin error", untrusted.body?.code === "INVALID_ORIGIN", untrusted.body);

  const trustedStillWorks = await req(server.port, "POST", "/api/auth/sign-in/email", {
    origin: "http://localhost:5173",
    body: { email, password },
  });
  check("the configured POPULR_FRONTEND_URL origin is still allowed", trustedStillWorks.status === 200, trustedStillWorks.body);

  await server.close();

  console.log("\n== Production session cookies are SameSite=None; Secure ==");
  // BETTER_AUTH_URL and POPULR_FRONTEND_URL are different sites in
  // production, so the session cookie has to survive a cross-site fetch —
  // which requires SameSite=None + Secure (see auth.ts). That's gated on
  // NODE_ENV=production, and env.ts reads NODE_ENV once at module load, so
  // proving it actually takes effect means booting a real second instance
  // with NODE_ENV=production rather than just re-importing this process's
  // already-loaded config.
  const prodPort = 4099;
  const prodChild = spawn("npx", ["tsx", "src/index.ts"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(prodPort),
      BETTER_AUTH_URL: `http://localhost:${prodPort}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const ready = await Promise.race([
      new Promise<boolean>((resolve) => {
        const tryHealth = async () => {
          try {
            const res = await req(prodPort, "GET", "/health");
            if (res.status === 200) return resolve(true);
          } catch {
            // not up yet
          }
          setTimeout(tryHealth, 200);
        };
        tryHealth();
      }),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10_000)),
    ]);
    check("production instance boots", ready);

    if (ready) {
      const prodSignUp = await req(prodPort, "POST", "/api/auth/sign-up/email", {
        body: { name: "Prod Cookie Test", email: `prodcookie_${runId}@example.com`, password },
      });
      const setCookie = prodSignUp.headers["set-cookie"]?.[0] ?? "";
      check("sign-up succeeds against the production instance", prodSignUp.status === 200, prodSignUp.body);
      check("session cookie is SameSite=None", /SameSite=None/i.test(setCookie), setCookie);
      check("session cookie is Secure", /(^|;\s*)Secure(;|$)/i.test(setCookie), setCookie);
    }
  } finally {
    prodChild.kill();
  }

  console.log(`\n===== RESULTS: ${pass} passed, ${fail} failed =====`);
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
