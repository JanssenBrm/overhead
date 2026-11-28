---
type: API Endpoint
title: GET /api/aircraft
description: JSON list of aircraft (max 40, nearest first) within a radius, with validated routes; used by the website.
resource: https://overhead-liart.vercel.app/api/aircraft
tags: [api, aircraft]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:20:00Z }
---
Source: `api/aircraft.js`, thin wrapper around `getAircraft` in [adsb](/lib/adsb.md).

- Query: `lat`, `lon` (required), `radius` km (5–250, default 40).
- 200: `{ source, at, radius, aircraft: [...] }`; each aircraft has `hex, callsign, reg, type, desc, category, operator,
  lat, lon, alt, onGround, gs, track, rate, dist, bearing, airline, route` where `route` is
  `{ from, to, src: "vrs"|"adsbdb", flipped? }` or `null`.
- 400 invalid coordinates; 502 when all position sources fail.
- Cache: `s-maxage=15, stale-while-revalidate=30`. The website polls every 30 s.
