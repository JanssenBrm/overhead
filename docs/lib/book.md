---
type: Module
title: lib/book.js — collection book
description: Per-location record of aircraft types seen this year, stored as JSON in Vercel Blob and shown on the boek page.
tags: [lib, blob, book]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
- Blob key `boek/v1/<lat2>_<lon2>.json` (private). Shape `{ v: 1, years: { "2026": { TYPE: { first, model, callsign, airline } } } }`.
- In-memory cache 30 min; writes only when a new type appears, merged with remote first (`waitUntil`).
- `WISH`: types worth hunting over the Kempen (A380, 747, Beluga, An-124, C-17, …).
