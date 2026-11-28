---
type: Firmware
title: Wi-Fi and URL provisioning
description: The three ways a screen gets its Wi-Fi credentials and frame URL (portal, Improv serial, OVERHEAD-URL command).
tags: [firmware, wifi, setup]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
- **Captive portal**: no saved Wi-Fi or no connection in 45 s → AP `Overhead-scherm`, DNS catch-all, page at http://192.168.4.1
  (network list from scan, password, frame URL). Saving restarts. When STA connects while the portal is open, the device restarts normally.
- **Improv Wi-Fi serial** on UART0 (used by [installer](/web/installer.md)): commands WIFI, STATE, INFO, SCAN; returns the frame URL as result.
- **`OVERHEAD-URL <http(s)://…>`** line on UART0: saves URL to NVS, answers `OVERHEAD-OK`, restarts.
- Default URL (`OVERHEAD_DEFAULT_URL`): Dessel, 40 km, 1024 × 600 on overhead-liart.vercel.app.
- Hold the screen 5 s to forget Wi-Fi.
