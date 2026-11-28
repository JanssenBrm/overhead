---
type: Module
title: lib/adsb.js — positions and route validation
description: Fetches aircraft positions from three community ADS-B feeds and attaches routes only when they fit position and track.
tags: [lib, adsb, routes]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
Used by [/api/aircraft](/api/aircraft.md) and [/api/frame](/api/frame.md). Entry point: `getAircraft(lat, lon, radiusKm)`.

# Positions
Tries in order (same ADSBExchange v2 shape, free non-commercial, ≤ 1 req/s): **adsb.lol** → **adsb.fi** → **airplanes.live**.
Radius converted to NM; results filtered to the km radius, sorted by distance, capped at 40. 6 s timeout each.

# Routes
1. **VRS standing data** (CC0, `raw.githubusercontent.com/vradarserver/standing-data`): route CSV per airline prefix
   (`routes/schema-01/<L>/<AAA>-all.csv`) and airport CSVs; files cached 6 h (10 min after failure).
   Only callsigns matching `^[A-Z]{3}\d`.
2. **adsbdb** fallback (`api.adsbdb.com/v0/callsign`): one fixed route per callsign; 6 h cache, 2 min after transient errors.
   Also supplies the airline name.

(The adsb.lol / adsb.im routeset APIs are no longer used: one answers empty, the other needs prior permission.)

# Plausibility (`plausible`, `fitsLeg`, `orient`)
- Picks the leg (multi-stop routes) the aircraft lies on: cross-track ≤ max(90 km, 12 % of leg) (+40 km near an airport) and roughly between endpoints.
- Flips the route when the aircraft clearly flies toward origin and away from destination (same callsign both ways).
- Rejects: below 6,000 ft and > 60 km from both airports; track > 100° off destination while > 40 km away.
- No fit → `route: null` → UI shows "route onbekend". Showing no route is preferred over a wrong one.
