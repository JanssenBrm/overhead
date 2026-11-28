---
type: Firmware
title: Over-the-air updates and published binaries
description: How screens discover and install new firmware from /fw/<variant>/ on the website, with rollback.
tags: [firmware, ota, release]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
- Published under `fw/rev1/` and `fw/rev3/`: `overhead.bin` (app, for OTA), `overhead-full.bin` (merged, for the installer),
  `version.txt`, `manifest.json` (ESP Web Tools). Origin is derived from the configured frame URL.
- Device fetches `<origin>/fw/<variant>/version.txt` ~60 s after boot and hourly; newer (semver compare) → shows
  `pagina=update&naar=<v>` for 10 min. *Later* → ask again in 24 h; no answer → 6 h. *Installeren* → `esp_https_ota` with progress bar → restart.
- Failure → `stap=mislukt` page, retry after 6 h. New image is only marked valid after the first frame is shown; otherwise the bootloader rolls back.
- Release procedure: [release playbook](/playbooks/release-firmware.md).
