---
type: Deployment
title: Vercel deployment and configuration
description: How Overhead is hosted on Vercel, its function config, environment variables and free-tier budget.
resource: https://overhead-liart.vercel.app/
tags: [vercel, config, env]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:20:00Z }
---
# Hosting

- Vercel project, production URL https://overhead-liart.vercel.app/ (auto-deploys from `main` on GitHub `JanssenBrm/overhead`).
- `vercel.json`: region `cdg1`; `cleanUrls: true` (so `/frame` → `frame.html`, `/installeer` → `installeer.html`).
- `api/painting.js`: maxDuration 60 s. `api/frame.js`: maxDuration 30 s, 1024 MB, `includeFiles: {fonts/**,lib/world.json}`.
- Static files served as-is, including firmware under `/fw/<variant>/` (see [OTA](/firmware/ota.md)).
- Dependencies (`package.json`): `@resvg/resvg-js`, `@vercel/blob`, `@vercel/functions`, `opentype.js`, `sharp`.

# Environment variables

| Name | Purpose |
|------|---------|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (private store): paintings, cutouts, collection book. Added automatically when a Blob store is linked. |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Free painting source: Workers AI FLUX.1 schnell. |
| `GEMINI_API_KEY` | Paid painting source (≈ $0.034/image, once per type+airline). |
| `PAINT_SOURCE` | `gemini` or `cloudflare` when both are set (default: Cloudflare). |
| `DAILY_PAINT_LIMIT` | Max new paintings per UTC day (default 30). |
| `GEMINI_IMAGE_MODEL` | Default `gemini-nano-banana-2.1`. |
| `PAINT_STYLE` | Override the painting style prompt. |

[/api/status](/api/status.md) reports which of these are configured (booleans only, never values).
Without painting config the site falls back to vector illustrations.

# Free-tier budget (Hobby plan)

Measured ≈ 0.17 s CPU and ≈ 75 KB per JPEG frame. One screen (every minute by day, every 15 min at night)
≈ 1.5 CPU-h and 2 GB transfer per month, within 4 CPU-h / 10 GB Fast Origin Transfer.
Blob `list()` is limited (2,000 ops/month free): code uses `head()` plus in-memory caches and counts
paintings with at most one `list()` per hour per instance. Avoid adding `list()` calls or frequent writes.
CDN caching (`s-maxage`) on every endpoint is part of this budget; keep it when changing handlers.
