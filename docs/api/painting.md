---
type: API Endpoint
title: GET /api/painting and /api/painting-img
description: Generates (once) and serves AI paintings per aircraft type + airline, stored privately in Vercel Blob.
resource: https://overhead-liart.vercel.app/api/painting
tags: [api, painting, blob, ai]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:20:00Z }
---
Sources: `api/painting.js`, `api/painting-img.js`, shared logic in `lib/painting.js`.

# /api/painting
Query: `type` (ICAO, 2–4 chars), `op` (3-letter ICAO airline, optional → `GEN`), `airline`, `model`, `mil=1`.
Returns `{ url }` (a `/api/painting-img?key=TYPE-OP&v=2` URL) or `{ url: null, reason }` with reason
`not-configured` | `limit` | `error`. Blob key: `paintings/v2/<TYPE>-<OP>.png`.

- Source: Cloudflare Workers AI FLUX.1 schnell (free) or Gemini (`PAINT_SOURCE`), see [deployment](/system/deployment.md).
- Prompt includes the airline's main colours from the livery table in [art](/lib/art.md); style from `PAINT_STYLE`.
- Never repainted once stored. Daily cap `DAILY_PAINT_LIMIT`. Failed attempts are not retried for 30 min.
- Existence check uses `head()` + memory cache, not `list()` (free-tier ops budget).

# /api/painting-img
Query `key` matching `^[A-Z0-9]{2,4}-[A-Z]{3}$`. Streams the private blob; `immutable`, 1 year CDN cache. 404 cached 60 s.
