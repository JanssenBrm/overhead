---
type: Playbook
title: Release a new firmware version
description: Steps to build both variants, publish them and let deployed screens offer the update.
tags: [playbook, firmware, release]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
1. Bump `OVERHEAD_VERSION` default in `firmware/main/Kconfig.projbuild`.
2. Add an entry at the top of `CHANGELOG` in `lib/changelog.js` (Dutch, 2–3 lines).
3. Build (ESP-IDF **v5.5.4**): `cd firmware && . $IDF_PATH/export.sh && tools/build.sh <version>`.
   This fetches pinned components (esp-hosted-mcu v2.12.13, esp-wifi-remote 1.6.5, esp_lcd_ek79007) into `components/`,
   builds `build-rev1` and `build-rev3`, and writes `../fw/<variant>/{overhead.bin,overhead-full.bin,version.txt,manifest.json}`.
4. Commit `fw/`, Kconfig and changelog together (subject like "Scherm 1.2.3: …") and push `main`. Vercel deploys; screens prompt within an hour.
5. For a quick test, flash the connected screen directly: see [device serial](/playbooks/device-serial.md).
