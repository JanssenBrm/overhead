---
type: API Endpoint
title: GET /api/frame
description: Server-side renderer that draws the whole screen as one image (SVG → resvg → PNG/JPEG) for the ESP32-P4 frame, with control headers and touch hotspots.
resource: https://overhead-liart.vercel.app/api/frame
tags: [api, frame, rendering, screen]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:20:00Z }
---
Source: `api/frame.js` (~940 lines). Biggest and most delicate file in the repo.
Uses [adsb](/lib/adsb.md), [art](/lib/art.md), [sky + scenery](/lib/scenery.md), [book](/lib/book.md),
[painting](/api/painting.md) and [changelog](/lib/changelog.md).

# Parameters

| Param | Values / default |
|-------|------------------|
| `lat`, `lon` | default 51.2387, 5.1159 (Dessel) |
| `straal` (or `radius`) | km, 5–250, default 40 |
| `plaats`, `titel` | place label (max 40), title (max 60, default "Nu in de lucht") |
| `w`, `h` | 200–2400, default 1024 × 600 (portrait: `w=600&h=1024`) |
| `weergave` | `schilderij` (default; falls back to illustration until a painting exists) or `illustratie` |
| `nacht` | `auto` (sun phase at the place), `aan`, `uit` |
| `decor` | `straat` (default: live sky + street band) or `effen` |
| `format` | `png` (default), `jpg` (screen, ≈ 75 KB, q88), `rgb565`, `rgb565be`, `svg` |
| `pagina` | none = overview; `detail` (+`hex`), `radar`, `boek`, `update` (+`naar`, `stap` = vraag/bezig/mislukt) |

# Pages

- **overzicht**: all aircraft (max 40) laid out to scale; badges *zeldzaam* (`RARE` set), *militair*; alert border when one is in view.
- **detail**: big image, route on a zoomed map with country borders (`lib/world.json`, great-circle path), altitude, speed, look direction + elevation angle, dimensions, first flight.
- **radar**: range rings, nearby airports, aircraft with headings.
- **boek**: collection book of types seen this year at this place + wish list (`WISH`).
- **update**: firmware update prompt (*Later* / *Installeren*), progress, failure message; release notes from `lib/changelog.js` between current (from User-Agent) and `naar`.

# Response headers (contract with the firmware)

| Header | Meaning |
|--------|---------|
| `X-Night` | `1` at night |
| `X-Refresh` | seconds until next fetch: 60 by day, 900 at night, 30 on error, page-specific otherwise |
| `X-Brightness` | backlight 0–100: day 45 (60 with alert), night 3 (8 with alert) |
| `X-Aircraft` | aircraft count |
| `X-Page` | rendered page name |
| `X-Hotspots` | `id:x,y,w,h;…` touch zones. ids: hex code → detail, `@boek`, `@radar`, `@terug`, `@later`, `@installeren` |

The firmware parses these in `firmware/main/main.c` (`on_http`, `parse_hotspots`, `open_hotspot`); see
[firmware](/firmware/overview.md). Changing header names or hotspot ids is a **breaking change** for deployed screens.

# Screen-specific behaviour

When the User-Agent is `overhead-scherm/<ver>`: daytime background is mixed toward paper colour `#cdc5b6`,
JPEG gets a gamma LUT (`GAMMA` 1.45, ceiling 232) for the IPS panel, and the version is drawn small bottom-right.
`Vary: User-Agent`; `Cache-Control: public, s-maxage=20, stale-while-revalidate=40`.

Paintings are turned into cut-outs (`paintings/cut-v2/` in Blob); at most 2 missing paintings are started per
frame in the background via `waitUntil`. Rendering the overview also records sightings in the [book](/lib/book.md).

# Examples

```
/api/frame?lat=51.2387&lon=5.1159&straal=40&plaats=Dessel&titel=Nu%20in%20de%20lucht&w=1024&h=600&format=jpg
```
