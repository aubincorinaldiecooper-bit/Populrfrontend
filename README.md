# KREW

The Creator Performance Network — landing site for creators and brands.

## Overview

A single-page marketing site (`index.html`) built with:

- **Tailwind CSS** (via CDN) for styling
- **Lucide** icons
- **Syne** + **Inter** fonts (Google Fonts)

It includes three views toggled client-side via `showPage()`:

- **Home** — landing page
- **For Creators** — Instagram automation tooling + pricing
- **For Brands** — CPM clipping campaigns + pricing

## App flow

The "Get Started" / "Log in" buttons and the pricing CTAs on the landing page
link to `onboarding.html`, which is the entry point into the product:

1. **Landing** (`index.html`) → user clicks **Get Started**
2. **Onboarding** (`onboarding.html`) → 3-step welcome + connect-accounts flow
3. **Dashboard** → revealed in-place once onboarding completes ("Open Dashboard")

`onboarding.html` is a self-contained app (onboarding **and** dashboard in one
page) built with **Alpine.js** (CDN) plus Tailwind and Lucide. The dashboard has
sections for Connections, Posts, Analytics, Ads, Inbox, Team, and Settings.

`dashboard.html` is a standalone version of just the dashboard shell (no
onboarding), kept for reference.

## Running locally

No build step required. Open `index.html` directly in a browser, or serve it:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```
