---
type: Dataset
title: lib/world.json — country borders
description: Compact simplified Natural Earth 1:50m borders used for the route map on the detail page.
tags: [data, map]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
Built by `tools/make_world.py <ne_50m_admin_0_countries.geojson>`. Rings are integer arrays
`[lon0*50, lat0*50, dlon1, dlat1, …]` (0.02° steps, deltas), simplified at 0.04°. Bundled into the frame function via `includeFiles`.
