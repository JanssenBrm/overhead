---
type: Hardware
title: Elecrow CrowPanel Advanced 10.1" (ESP32-P4)
description: Board facts, pins and power details the firmware depends on.
tags: [hardware, pins]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
- SoC ESP32-P4 @ 360 MHz, 16 MB flash (DIO 80 MHz), 32 MB hex PSRAM. Two board generations:
  **V1.x** = P4 rev v1.x → firmware variant `rev1`; **V2.0** = P4 rev v3.x → `rev3`.
- Display 1024 × 600 IPS, MIPI-DSI 2 lanes @ 900 Mbps, EK79007 controller, DPI 51 MHz RGB565, **no reset pin**.
  PHY powered by on-chip **LDO3 (2.5 V)**, panel analog by **LDO4 (3.3 V)**. Backlight PWM on **GPIO31** (LEDC 30 kHz, 11-bit; < ~200/2047 stays dark).
- Touch GT911 on I2C0: SDA 45, SCL 46, RST 40, INT 42 (address 0x5D).
- Wi-Fi: on-board ESP32-C6 via esp_hosted over SDIO slot 1 (CMD 19, CLK 18, D0–D3 17/16/15/14, 40 MHz).
  C6 EN pin is **GPIO32** (reset manually at boot). Hosted config reset GPIO 54 (as in Elecrow examples).
- USB-C **UART0** (CH340) = console 115200 + Improv + flashing. On this Mac it shows up as `/dev/cu.wchusbserial130`.
- Partitions: nvs 0x9000, otadata, phy_init, ota_0 @ 0x20000 (4 MB), ota_1 (4 MB). Rollback enabled.
