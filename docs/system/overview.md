---
type: System
title: Overhead system overview
description: What Overhead is, its three parts (website, frame renderer, ESP32-P4 screen) and how data flows between them.
resource: https://overhead-liart.vercel.app/
tags: [overview, architecture]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:20:00Z }
---
# What it is

Overhead shows every aircraft within a chosen radius of a place as side-view pictures on a sheet of paper,
scaled to their real length, with model, altitude, climb/descent, route and a compass hint for where to look.
UI text, code comments and commit messages are in **Dutch**.

Repo: https://github.com/JanssenBrm/overhead · Live: https://overhead-liart.vercel.app/

# Parts

| Part | Where | Concept |
|------|-------|---------|
| Website (tablet/browser) | `index.html` | [website](/web/website.md) |
| Frame preview page | `frame.html` (`/frame`) | [frame page](/web/frame-page.md) |
| Browser installer for the screen | `installeer.html` (`/installeer`) | [installer](/web/installer.md) |
| Serverless API (Vercel, Node ≥ 20, ESM) | `api/*.js` | [API index](/api/index.md) |
| Shared server logic | `lib/*.js` | see [lib](/index.md) |
| Screen firmware (ESP-IDF, ESP32-P4) | `firmware/` | [firmware](/firmware/overview.md) |
| Published firmware binaries | `fw/rev1`, `fw/rev3` | [OTA](/firmware/ota.md) |

# Data flow

```
adsb.lol / adsb.fi / airplanes.live ──┐
VRS standing data (routes, CC0) ──────┼─> lib/adsb.js ─> /api/aircraft ─> index.html (browser draws SVG)
adsbdb (route fallback) ──────────────┘                └> /api/frame ──> SVG -> resvg -> jpg ─> ESP32-P4 screen
Open-Meteo (weather, geocoding) ─> lib/sky.js, /api/sky, /api/geocode
Cloudflare Workers AI / Gemini ─> lib/painting.js ─> Vercel Blob (paintings/v2/)
```

The **website** renders in the browser; the **screen** gets a fully server-rendered JPEG from
[/api/frame](/api/frame.md) and only decodes and displays it, plus reports taps back via hotspot URLs.

# Key invariants

- No build step for the web side: plain HTML + ESM serverless functions.
- Drawing code in [lib/art.js](/lib/art.md) and scenery in [lib/scenery.js](/lib/scenery.md) are **duplicated** inside `index.html`. Change both.
- Must stay within the Vercel Hobby free tier, see [deployment](/system/deployment.md).
- Routes are only shown when they fit the aircraft's position and track ("route onbekend" otherwise), see [adsb](/lib/adsb.md).
