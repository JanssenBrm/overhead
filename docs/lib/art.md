---
type: Module
title: lib/art.js — aircraft illustrations and type table
description: Vector side-view drawing code, ICAO type table (span, length, shape) and airline livery colours, shared by website and frame.
tags: [lib, drawing, liveries]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
- Exports `Illustrate`, `T` (type table), `CAT` (ADS-B category fallbacks), `spec(aircraft)`.
- Everything in metres; caller picks px/m. Aircraft are scaled by **length**.
- `LIVERY` keyed by ICAO callsign prefix (tail, belly, top, stripe, engine, body). Colours only — never logos or names.
- Unknown types fall back to the ADS-B category silhouette.
- **Duplicated in `index.html`** — edit both. Livery colours also feed the painting prompt ([painting](/api/painting.md)).
