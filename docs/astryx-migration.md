# Astryx migration — status

Meta's [Astryx](https://github.com/facebook/astryx) design system, being adopted
incrementally alongside the existing Tailwind UI. This document tracks what's
actually done, not the full end-state plan — update it as later phases land.

**Current phase: Phase 3 (core pages) under way.** Phase 1's foundations
(theme, provider hierarchy, CSS layer order) are unchanged and still accurate
below. `ConnectionsPage.tsx` is now the first page migrated in full — every
element that has a real Astryx equivalent (Card, Text, Badge, StatusDot,
ProgressBar, Divider, HStack/VStack, Button, Spinner, Banner, AlertDialog)
uses it; hand-rolled `pop-*` Tailwind classes remain only for things Astryx
has no component for (icon tiles, the page-level max-width wrapper).

## What's real vs. what's still to do

Every claim below was verified against the actual installed package contents
(`node_modules/@astryxdesign/*/package.json` exports maps and shipped `.d.ts`
files) or the CLI package's bundled `docs/*.doc.mjs` reference docs — not
against `astryx.atmeta.com`, which this environment's egress policy blocks
(403). If something here looks wrong against a newer Astryx release, re-check
with `npx astryx docs <topic>` (see "Continuing this work" below) rather than
trusting this file blindly.

## Packages installed

- `@astryxdesign/core@0.2.0` — component library
- `@astryxdesign/theme-neutral@0.2.0` — base theme Populr's theme extends
- `@astryxdesign/cli@0.2.0` — `astryx` CLI (component docs, templates, theme
  scaffolding). Not yet wired into `package.json` scripts — see "Continuing
  this work."

Not installed: `@astryxdesign/build` (Babel/PostCSS/Vite plugins for
compiling *product-authored* StyleX with a separate class prefix from the
library). Only needed once Populr code writes its own `stylex.create()` /
`xstyle` overrides, which it doesn't yet — every `@astryxdesign/core`
component ships pre-compiled CSS/JS, so plain `npm install` + import is
enough to consume them as-is.

## Theme: `src/design-system/theme.ts`

`populrTheme = defineTheme({ name: 'populr', extends: neutralTheme, ... })`.
"Warm Editorial Utility" direction, matched to the *exact* hex values already
in use across the pre-Astryx Tailwind UI (`src/index.css`'s `--pop-lime` /
`--pop-cream` custom properties, and the `#111111` / `#6B6B6B` / `#E8E4DF`
literals used throughout `src/pages`), so migrated and not-yet-migrated
surfaces don't visibly disagree during the incremental rollout:

| Token | Value | Matches |
|---|---|---|
| `--color-accent` | `#C5FF3D` | `--pop-lime` (chartreuse) |
| `--color-on-accent` / `--color-text-accent` / `--color-icon-accent` | `#111111` | dark-on-chartreuse used everywhere already (chartreuse is too light for white text) |
| `--color-background-body` | `#F3F0EC` | `--pop-cream` |
| `--color-text-primary` | `#111111` | existing near-black |
| `--color-text-secondary` | `#6B6B6B` | existing muted gray |
| `--color-border` | `#E8E4DF` | existing card/input border |
| `--color-success` / `-warning` / `-error` (+ `on-*`) | `#059669` / `#D97706` / `#DC2626` | existing status colors |

`color: {accent, neutralStyle: 'warm'}` (Astryx's derived-color-scale config)
drives everything else — background/border/overlay shades not explicitly
pinned above. Radius and motion are left at `neutralTheme`'s defaults for
now (its `--radius-container: 12px` default is already close to Populr's
`rounded-xl` convention); revisit for precision once real pages migrate.
Body typography is pinned to `Geist` (the font already loaded via
`@font-face` in `index.css`) rather than left at neutral's default.

`mode` is fixed to `'light'` — Populr has no dark mode anywhere yet, on
either the legacy UI or the Astryx side.

## Provider hierarchy (`src/main.tsx`)

```
<Theme theme={populrTheme} mode="light">
  <LayerProvider>
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <App />
```

Both `Theme` and `LayerProvider` are mounted once, at the true root, outside
the router — never per-page. `LayerProvider` currently has no toast config
passed; toasts are Populr's own, implemented in `AppContext` and rendered by
`ToastContainer` (the `sonner` package this file once credited was never
wired up — it lived only in the unused generated kit, and has been removed).

## CSS layer order (`src/index.css`)

This project is Tailwind **v3** (confirmed via `package.json`), which has no
`preflight.css` to import as a separate file the way Tailwind v4 does, so the
v3-specific coexistence recipe applies:

```css
@layer reset, tw-preflight, astryx-base, astryx-theme;

@import '@astryxdesign/core/reset.css';
@import '@astryxdesign/core/astryx.css';

/* ... @font-face blocks (must come after @import — CSS requires @import
   to be a leading rule, ahead of everything except @charset) ... */

@layer tw-preflight {
  @tailwind base;
}
@tailwind components;
@tailwind utilities;
```

`@tailwind components` / `@tailwind utilities` are deliberately left
**unlayered** so every existing `pop-*` utility class keeps winning on
not-yet-migrated pages exactly as before — matching Astryx's own documented
recipe ("unlayered: legacy utility classes keep winning").

### The one real bug this setup caught — and the fix

`<Theme>` auto-generates "prose" defaults (explicit `color` on bare
`h1`–`h6`/`p`) and injects them into `@layer reset`, `@scope`'d to the whole
document (Theme mounts with no nested-theme boundary anywhere in this app,
so the scope covers everything). That's correct for content actually built
with Astryx, but it collided with this app's existing pattern of setting
`color` once on a distant ancestor and relying on inheritance down through
several levels (e.g. `LandingPage`'s dark sections: `color: '#fff'` on a
wrapper div, no color class on the heading itself). An explicit rule — even
a zero-specificity one in the lowest-priority layer — always wins over plain
inheritance, so every heading and paragraph across the app started
rendering in `--color-text-primary` (`#111111`) regardless of its actual
background, including headings on `#111111` sections rendering as
functionally invisible.

Fix, at the bottom of `index.css`:

```css
@layer tw-preflight {
  :where(h1, h2, h3, h4, h5, h6, p) {
    color: inherit;
  }
}
```

This is deliberately placed in `@layer tw-preflight` (which outranks
`@layer reset` in the declared order above), **not** left unlayered — an
unlayered version would also incorrectly win over real Astryx components in
later phases (`Heading`/`Text` render as the same bare tags, styled via
`@layer astryx-base` / `astryx-theme`, both of which must keep outranking
this override once pages actually adopt them).

This was caught by literally following Astryx's own documented "Foundation
Smoke Test" step (`astryx docs migration`) — render a real page, check
computed styles, compare against unmodified `main` — before building
anything further. Do this again after any theme or layer-order change.

## Components migrated so far

- **`src/components/PageHeader.tsx`** (shared by every page that uses it) —
  `Heading` (`level={1} type="display-3"`) + `Text` for the title/subtitle,
  `HStack`/`VStack` for layout, replacing bare `h1`/`p`/flex-div markup.

- **`src/pages/ConnectionsPage.tsx`** — full page, not just primitives:
  `Card` for the summary panel and each platform row (`variant="red"` for
  the error/reconnect-required attention state), `ProgressBar` for the
  connected-accounts progress (`variant="accent"`), `Badge` for the
  Locked/Unlocked and Limited-access indicators, `StatusDot` paired with
  `Text` for each connection-status line (`StatusDot`'s `label` is
  tooltip/a11y-only, not visible text — the visible label is a sibling
  `Text`), `Divider` (`orientation="vertical"`) to split the summary panel,
  `HStack`/`VStack` for every layout that was previously a flex/space-y
  Tailwind div, and `Button` end-to-end including the full-width primary CTA
  (`width="100%"`, `endContent` for the trailing arrow instead of a raw
  `<button className="pop-btn-primary">`). Verified by rendering the page in
  isolation (a throwaway harness bypassing the auth-gated route tree, since
  this sandbox can't reach the real auth service) and screenshotting both
  the default and a real error-state (via an actual failed-connect click) —
  not just `tsc`/`eslint`.

  What's intentionally still plain Tailwind: the platform icon tile (a
  fixed-size rounded square with a brand-colored icon — no matching Astryx
  primitive) and the outer `pop-page` max-width/padding wrapper (Astryx has
  no page-level container component; `AppShell` is for a full app frame, not
  per-page content).

This is now the reference pattern for migrating the remaining pages (Home,
Automations, Contacts, Settings) per the redesign work in progress — full
component adoption per page, not scattered primitive swaps.

## Remaining legacy dependencies

Phase 5 turned out to be smaller than planned, because the Radix layer was
never actually wired into the product. The whole of `src/components/ui/` —
54 shadcn-style primitives — was imported by nothing outside itself: the app
was built from its own components plus Astryx, and the generated kit sat
beside it unused. It has been deleted, along with the 38 packages that
existed only to serve it (every `@radix-ui/*`, `recharts`, `cmdk`, `vaul`,
`sonner`, `react-day-picker`, `react-hook-form`, `gsap`, ...).

What that leaves is genuinely in use and stays: `framer-motion` (Sidebar's
motion and `useReducedMotion`), `@xyflow/react` (the automation canvas),
`lucide-react`, `@fontsource-variable/*`, and the Astryx packages
themselves. There is no longer a Radix-backed primitive waiting for an
Astryx replacement — the mapping table in the migration doc applies only to
whatever a future page needs, not to code sitting in this repo.

`components.json` (the shadcn config) is deliberately kept, so a single
primitive can still be pulled in deliberately if a real need appears.

## Why only Phase 1

The full task as given describes 5 phases (foundations → shared primitives
→ core pages → Create Post/Content/Calendar → Radix cleanup) in one PR. That
was deliberately cut down after a scope check: a from-scratch full-frontend
redesign is a multi-hour, very large change, and the person driving this
work asked for the smallest reviewable slice first, given the same pattern
had already come up once earlier in this session on unrelated work. This PR
is that slice: real dependencies, a real theme matched to the existing
brand, the provider/layer foundation mounted correctly (with one real
integration bug found and fixed), and a small proof that a page can
actually consume Astryx components without visual regressions. Phases 2-5
are not started.

## Continuing this work

1. Add the CLI script the getting-started doc recommends, for reliable
   invocation (works even though the bare `astryx` npm package name is an
   unrelated squatted placeholder — the real CLI only exists at
   `@astryxdesign/cli`):
   ```json
   "scripts": { "astryx": "node node_modules/@astryxdesign/cli/bin/astryx.mjs" }
   ```
   Then `npm run astryx -- docs migration`, `npm run astryx -- component Button`,
   `npm run astryx -- template --list`, etc.
2. Before touching a new page or primitive, read that component's real docs
   via the CLI (or the bundled `node_modules/@astryxdesign/cli/docs/*.doc.mjs`
   files directly, same as this phase did) — don't guess prop names.
3. After any change, re-run the Foundation Smoke Test pattern used above:
   render a real page, diff computed styles / a screenshot against
   unmodified `main`, before assuming a change is safe.
4. Follow the migration doc's own recommended order (`astryx docs migration`):
   app frame first (AppShell/TopNav/SideNav — i.e. `Sidebar.tsx`), then
   shared primitives (Input, Select, Dialog, Tabs, Toast — mapping onto this
   app's current Radix usage per the migration doc's own shadcn/Radix →
   Astryx table), then page-by-page.
