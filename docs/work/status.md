---
type: Work Status
title: Current state and open work
description: Running record of what is in progress, known issues and follow-ups, kept up to date by the agent.
tags: [work, status]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:40:00Z }
---
# State (2026-11-28)
- Website + API live on Vercel; firmware **1.2.2** published for rev1 and rev3; the attached screen (rev1) runs 1.2.2.
- Docs bundle created (this directory).

# Open issues
- None known.

# Resolved
- **Black screen after replugging power** (fixed by firmware 1.2.2, verified 2026-11-28).
  Symptom: white flash, start screen, then black with a faint backlight glow. On 1.2.1 the serial log stayed fully
  healthy (Wi-Fi up, frames decoded, taps handled): the panel itself dropped out after a cold start.
  Cause: 1.2.1 did not enable the panel's analog 3.3 V supply (on-chip **LDO4**). 1.2.2 acquires LDO4 next to LDO3
  and waits 120 ms before panel init ([hardware](/firmware/hardware.md)). Reproduced on 1.2.1 with a real power replug;
  after flashing 1.2.2 over serial, 4/4 replugs (including one with ~1.5 s off) showed the flights.
  A plain EN-pin reset never reproduced it, so always test power issues with a real replug.
  Other screens still on 1.2.1 will get the 1.2.2 update prompt via [OTA](/firmware/ota.md).

# Notes
- README route section was outdated (said adsb.lol routeset); routes now come from VRS standing data + adsbdb.
