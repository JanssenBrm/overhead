---
type: Playbook
title: Work with the connected screen over USB serial
description: How to read logs from and flash the screen attached to this Mac.
tags: [playbook, firmware, debug]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
- Port: `/dev/cu.wchusbserial130` (CH340 on the UART0 USB-C port), 115200 baud.
- Opening the port with DTR/RTS toggling (esptool, `idf.py monitor`) **resets** the board — useful to capture boot logs.
- Logs: `idf.py -p /dev/cu.wchusbserial130 monitor` or a small pyserial reader. Tags: `overhead`, `display`, `net`, `ota`, `touch`, `portal`.
- Flash a build: `python -m esptool --chip esp32p4 -p /dev/cu.wchusbserial130 write-flash 0x20000 build-<variant>/overhead.bin`
  (app only, keeps NVS/Wi-Fi) or `write-flash 0 ../fw/<variant>/overhead-full.bin` (full image).
- Detect variant: `python -m esptool -p /dev/cu.wchusbserial130 chip-id` → revision v3.x → `rev3`, else `rev1`.
