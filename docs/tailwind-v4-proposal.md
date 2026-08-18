# Tailwind v4: a proposal, not a plan

Written at the close of the shadcn arc, which deliberately kept Tailwind at
**3.4** the whole way — combining a design-system migration with a build-tool
major version would have made every visual regression ambiguous about its
cause. That reason has now expired: the design system is settled, so the
question can be asked on its own terms.

This document argues for **doing it, but not yet**, and says what "yet" means.

## Where we are

| | |
|---|---|
| Tailwind | `3.4.19` |
| Build | Vite `7.2.4`, PostCSS `8.5.6` |
| Config | `tailwind.config.js`, 194 lines |
| Stylesheet | `src/index.css`, 379 lines |
| CSS shipped | 12.88 kB gzip |

The token layer is already the shape v4 wants. Colours are HSL channel
triplets on `:root`, consumed as `hsl(var(--token))` through the config —
which is v3's way of doing what v4 does natively with `@theme`. That is the
single biggest reason this migration is smaller for us than for a typical v3
codebase.

## What v4 actually changes

1. **The config moves into CSS.** `tailwind.config.js` is replaced by
   `@theme { --color-chartreuse: …; }` in the stylesheet. Our config is
   almost entirely colour, font-family, radius and keyframe declarations, all
   of which have direct `@theme` equivalents.
2. **The engine is rewritten.** Full builds are several times faster and
   incremental rebuilds dramatically so. At our size this is a developer
   comfort, not a user-facing win.
3. **`@tailwind` directives become one `@import "tailwindcss"`.**
4. **The PostCSS plugin moves** to `@tailwindcss/postcss`, or the build can
   use the dedicated Vite plugin.
5. **Browser floor rises**: Safari 16.4+, Chrome 111+, Firefox 128+. v4 uses
   `@property` and `color-mix()`, which have no polyfill path. **This is the
   only decision here that is about users rather than about us** — it needs a
   look at analytics before anyone signs off.

## What it would cost us

**Small, and mostly mechanical:**
- Port 194 config lines to `@theme`. Colour tokens are already channel
  triplets; the syntax changes, the values don't.
- Replace the directive block and the PostCSS plugin.
- `@layer components` blocks in `index.css` — the remaining `pop-*`
  animations, status colours and semantic classes — need review: v4 changes
  how `@layer` and `@apply` interact, and `@apply` inside `@layer components`
  is the pattern most likely to need rewriting.

**Genuinely uncertain, and the reason to sequence carefully:**
- **Base UI's styling assumptions.** Every overlay we ship (dialog, sheet,
  popover, menu, context menu) animates through `data-[starting-style]` and
  `data-[ending-style]` attributes. These are plain attribute selectors and
  should be unaffected — but "should be" is doing work in that sentence, and
  overlay animation is exactly the kind of thing that breaks quietly.
- **The arbitrary-value vocabulary.** The codebase leans on `text-[13.5px]`,
  `max-w-[1200px]`, `shadow-[0_1px_3px_rgba(…)]`. v4 keeps arbitrary values,
  but the parser is new. Volume alone makes a surprise likely somewhere.
- **`ring` defaults changed** (v3's 3px blue → v4's 1px currentColor). We use
  `ring-2` with explicit colours nearly everywhere, so this is probably a
  non-event — but "nearly" wants a grep before, not a bug report after.

## What we'd gain

Honestly: **not much that a creator would notice.** Faster rebuilds, a
smaller config surface, and staying on the version that gets features. The
CSS bundle is already 12.88 kB gzip; v4 will not meaningfully shrink it.

This is maintenance work with a real but modest payoff, and it should be
scheduled as such — not sold as a performance project.

## Recommended sequence

1. **Check the browser floor first.** If a meaningful share of creators are
   on Safari < 16.4, everything below is moot until that changes. This is the
   one blocking question and it is answered with data, not opinion.
2. **Port the config to `@theme` on a branch**, and diff the *rendered* token
   values — computed styles on a page of samples, before and after. The
   colours must come out bit-identical; if they don't, the port is wrong, and
   this is the cheapest possible place to find that out.
3. **Then the directives and the build plugin.** Build, and compare bundle
   sizes and the full test suite.
4. **Then the `@layer components` blocks**, which is where the real work is.
5. **Screenshot every surface** — particularly the overlays, at both
   breakpoints, with animations running and with `prefers-reduced-motion`
   set. Overlay motion is the highest-risk area and the least likely to be
   caught by a test.

Steps 2–4 are each independently revertible. Step 5 is the gate.

## Recommendation

**Do it, in its own arc, after the current work settles — and start with the
browser-support question, because it's the only one that can end the
conversation.** There is no urgency: 3.4 is stable, supported, and shipping a
12.88 kB stylesheet. The right time is when someone has a week that isn't
promised to a creator-facing change, not squeezed alongside one.
