# Populrfrontend

Populr is a creator DM-automation app. This repository contains its creator-facing web app for managing conversations, automations, contacts, connected accounts, and tools.

## Product areas

- **Home** — workspace overview.
- **Inbox** — conversations waiting for a creator.
- **Automations** — create and manage DM workflows.
- **Contacts** — people who have engaged with connected accounts.
- **Channels** — connected social accounts.
- **Tools** — connected Composio apps, at `/integrations`.
- **Team** and **Settings** — workspace membership and configuration.

## Stack

React 19, TypeScript, Vite, Tailwind CSS 3.4, React Router, TanStack Query, and Better Auth. Shared shadcn-style UI primitives live in `src/components/ui/`.

## Prerequisites

Use Node.js **20.19.0**, as specified in `.nvmrc`.

## Getting started

```sh
npm install
cp .env.example .env.local
```

Set the values in `.env.local`, then start the frontend:

```sh
npm run dev
```

Vite embeds `VITE_*` values in the client bundle at build time, so set production values before building or deploying.

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Base URL of the `populrbackend` service. If unset, the app uses its local/simulated connect flow. |
| `VITE_AUTH_URL` | **Required.** Origin of the standalone Populr Auth service. |
| `VITE_SUBSCRIPTION_CHECKOUT_URL` | Optional hosted checkout link shown when a plan does not cover an action. |

`VITE_AUTH_URL` must be set before running the app; the auth client throws when it is missing.

## Frontend scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check and build the production bundle into `dist/`. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run preview` | Preview the built bundle with Vite. |
| `npm start` | Serve `dist/` on `PORT` or port 3000. |

## Project layout

- `src/pages/` — route-level pages.
- `src/components/` — shared components and feature UI.
- `src/lib/` — API clients, domain logic, and utilities.
- `src/context/` — application and authentication providers.
- `src/test/` — tests and test helpers.
- `auth/` — standalone authentication service.

## Authentication service

`auth/` contains the standalone Better Auth service that provides sessions and JWT/JWKS for the backend. It has its own `.env.example`, `package.json`, lockfile, and scripts. Install its dependencies and configure it from that directory:

```sh
cd auth
npm install
cp .env.example .env
```

The auth service deploys as a separate Railway service. `auth/railway.json` builds and starts it, runs migrations before deploy, and checks `/health`.

| Command (from `auth/`) | Purpose |
| --- | --- |
| `npm run dev` | Run the service with watch mode. |
| `npm run build` | Compile the service. |
| `npm start` | Run the compiled service. |
| `npm run typecheck` | Type-check without emitting files. |
| `npm run migrate` | Apply Better Auth database migrations. |
| `npm test` | Run the service tests. |

## Backend

The API is maintained in [`populrbackend`](https://github.com/aubincorinaldiecooper-bit/populrbackend).

## Deployment

The frontend deploys on Railway. `railway.json` selects Nixpacks, runs `npm run build`, starts with `npm start`, health-checks `/`, and restarts on failure up to five times. `railpack.toml` pins Node.js to 20.19.0.

## CI

GitHub Actions runs on pull requests and pushes to `main`. The workflow installs the frontend dependencies and runs lint, build, and tests, then installs `auth/` dependencies and runs its typecheck.
