---
type: Module
title: lib/sky.js and lib/scenery.js — sky of now and street
description: Weather, sun/moon maths, day-phase colours and the deterministic per-location street band drawn at the bottom.
tags: [lib, sky, weather, scenery]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
- `lib/sky.js`: `getWeather` (Open-Meteo, cached 10 min per 0.01°), `sunTimes`, `phase` (dawn/day/dusk/night),
  `condition(code)`, `skyColors`.
- `lib/scenery.js`: `sunPosition`, `moonAge`, `scenery(o)` draws sun, clouds by cloud cover, rain/snow, stars,
  moon phase, and a Kempen street (pines, houses, church tower) seeded per location (mulberry32), windows lit in the evening.
- Scenery is **duplicated in `index.html`**.
