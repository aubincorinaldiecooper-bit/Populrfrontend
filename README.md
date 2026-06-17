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

## Dashboard

`dashboard.html` is a self-contained app shell for managing connected social
accounts. It uses **Alpine.js** (CDN) for tab state plus Tailwind and Lucide,
with sections for Connections, Posts, Analytics, Ads, Inbox, Team, and Settings.

## Running locally

No build step required. Open `index.html` directly in a browser, or serve it:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```
