---
type: Firmware
title: Screen firmware overview
description: ESP-IDF app for the Elecrow CrowPanel Advanced 10.1" (ESP32-P4 + ESP32-C6 Wi-Fi) that fetches /api/frame as JPEG and shows it.
tags: [firmware, esp32p4]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
Source `firmware/main/`. Current version **1.2.2** (`Kconfig.projbuild` `OVERHEAD_VERSION`). Hardware: [hardware](/firmware/hardware.md).

| File | Role |
|------|------|
| `main.c` | boot sequence, frame loop, touch handling, brightness, update prompt |
| `display.c` | LDO3/LDO4, backlight PWM, MIPI-DSI EK79007 panel, HW JPEG decoder → framebuffer, overlays |
| `touch.c` | GT911 over I2C |
| `net.c` | Wi-Fi STA/AP via esp_hosted (C6 over SDIO), scan |
| `portal.c` | captive portal on AP `Overhead-scherm` (http://192.168.4.1, `/` and `/save`) |
| `improv.c` | Improv Wi-Fi serial + `OVERHEAD-URL` command on UART0 |
| `settings.c` | NVS: ssid, pass, url, ints (`bright`) |
| `ota.c` | version check + HTTPS OTA, see [OTA](/firmware/ota.md) |
| `screens/*.jpg` | embedded start / setup / offline screens (`firmware/tools/make_screens.py`) |

# Boot sequence (`app_main`)
1. NVS init. Log reset reason.
2. `display_init()` — on failure: wait 1 s and `esp_restart()`.
3. Show embedded **start** screen ("Even geduld"), apply saved brightness level, start touch task.
4. Load settings. Reset the C6 via its EN pin (GPIO32 low 50 ms, then input, wait 300 ms).
5. `net_init()` — on failure: wait 2 s and restart. Start Improv.
6. Connect saved Wi-Fi; no Wi-Fi or not connected in 45 s → setup screen + portal (keeps retrying STA).
7. Start `frame_task`.

# Frame loop (`frame_task`)
Fetch `cfg.url` (+`&format=jpg`, + current page query) with UA `overhead-scherm/<ver>`, read headers via
`HTTP_EVENT_ON_HEADER` (not `esp_http_client_get_header`, which reads *request* headers), decode, show.
First success: `esp_ota_mark_app_valid_cancel_rollback()`. 10 consecutive failures (≈ 5 min) → offline screen.
Wait `X-Refresh` (10–3600 s) or until a tap notifies the task. OTA check ~60 s after boot, then hourly.

# Brightness
Base from `X-Brightness` (else day 60 / night 12) plus user offset level (`OFFS`, 10 levels, default 3, stored as `bright`), quartered at night.

# Touch
Tap on a hotspot → page (60 s, then back to overview); tap elsewhere → brightness bar (left darker, right lighter);
hold 5 s → forget Wi-Fi and restart into the portal.
