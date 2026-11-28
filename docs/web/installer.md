---
type: Web Page
title: Screen installer (/installeer)
description: Browser (Web Serial) flow that detects the board revision, flashes firmware with ESP Web Tools, sets Wi-Fi via Improv and sends the frame URL.
resource: https://overhead-liart.vercel.app/installeer
tags: [web, firmware, install]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
`installeer.html`, Chrome/Edge only.
1. Connect the **UART0** USB-C port (CH340; Mac may need the CH340 driver), POWER switch ON.
2. Detect chip revision with esptool-js 0.7.1 (unpkg, lazy-loaded): rev ≥ 3.0 → `rev3` (boards V2.0), else `rev1` (V1.x).
3. ESP Web Tools installs `/fw/<variant>/manifest.json` (full image at offset 0, erases) and asks Wi-Fi via Improv serial.
4. Choose place/title/radius/view; sends `OVERHEAD-URL <url>\n` over serial → device saves it in NVS, replies `OVERHEAD-OK`, reboots.
See [provisioning](/firmware/provisioning.md).
