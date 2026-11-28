---
type: Guide
title: Coding and documentation conventions
description: House rules for changing this repo, including language, duplication, versioning and how to keep the docs bundle up to date.
tags: [conventions, process]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:20:00Z }
---
# Code

- UI strings, code comments and commit messages are Dutch; keep them Dutch. Short, descriptive commit subjects
  (e.g. "Scherm 1.2.2: LDO4 voor het paneel, …"). Firmware releases mention the version in the subject.
- Plain JS (ESM), no framework, no bundler. `index.html` holds the whole website including the drawing code.
- `lib/art.js` and `lib/scenery.js` are copies of code inside `index.html`: edit both in the same commit.
- Outbound requests use User-Agent `overhead-dashboard (github.com/JanssenBrm/overhead)`.
- Every API handler sets an explicit `Cache-Control` (CDN `s-maxage`), errors return `no-store`.
- Firmware User-Agent is `overhead-scherm/<version>`; [/api/frame](/api/frame.md) uses it (`Vary: User-Agent`)
  to apply the screen colour curve and show the firmware version.

# Documentation (this bundle)

- `docs/` is an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) v0.2 bundle:
  one concept per `.md` file, YAML frontmatter with at least `type`, links as bundle-absolute paths (`/api/frame.md`).
- `index.md` lists every concept; `log.md` records changes newest first under `## YYYY-MM-DD`.
- When code changes behaviour, update the matching concept, bump its `generated.at`, add a line to `/log.md`,
  and update [work status](/work/status.md). `README.md` stays the human-facing Dutch intro.
