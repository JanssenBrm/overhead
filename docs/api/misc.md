---
type: API Endpoint
title: Small endpoints (sky, geocode, photo, status)
description: The four small helper endpoints used by the website and installer.
tags: [api]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:20:00Z }
---
| Endpoint | Source | What it does | Cache |
|----------|--------|--------------|-------|
| `GET /api/sky?lat&lon` | `api/sky.js` | Current weather from Open-Meteo: `{ temp, code, cloud, isDay }` | 600 s |
| `GET /api/geocode?q` | `api/geocode.js` | Place search via Open-Meteo geocoding (Dutch names), max 6 results `{ name, region, lat, lon }` | 1 day |
| `GET /api/photo?hex` | `api/photo.js` | Fallback proxy for planespotters.net photo of an airframe `{ photo: { src, by, link } }`; retries once on 403/429 | 1 day |
| `GET /api/status` | `api/status.js` | Which features are configured: `{ opslag, beeldbron, schilderijen }` (booleans/names only) | no-store |

The frame renderer uses `getWeather` from [lib/sky.js](/lib/scenery.md) directly rather than `/api/sky`.
