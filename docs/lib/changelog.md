---
type: Module
title: lib/changelog.js — firmware release notes
description: Per-version notes shown on the screen's update prompt; must get an entry for every firmware release.
tags: [lib, firmware, release]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
`CHANGELOG` newest first, 2–3 short Dutch lines per version. `notesBetween(from, to)` returns notes for
versions in (from, to]. Rendered by the `update` page of [/api/frame](/api/frame.md). See [release playbook](/playbooks/release-firmware.md).
