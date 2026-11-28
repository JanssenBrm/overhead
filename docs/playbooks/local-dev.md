---
type: Playbook
title: Run and check locally
description: Local development of the website and API.
tags: [playbook, dev]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
- `npm install`, then `npx vercel dev`. Open `/`, `/frame`, `/api/frame?format=png`.
- Paintings need `BLOB_READ_WRITE_TOKEN` + an image source; without them the illustrations are used.
- No test suite; verify by rendering `/api/frame` pages (`pagina=detail&hex=…`, `radar`, `boek`, `update&naar=9.9.9`).
