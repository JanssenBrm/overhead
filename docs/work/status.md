---
type: Work Status
title: Current state and open work
description: Running record of what is in progress, known issues and follow-ups, kept up to date by the agent.
tags: [work, status]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
# State (2026-11-28)
- Website + API live on Vercel; firmware **1.2.2** published for rev1 and rev3.
- Docs bundle created (this directory).

# Open issues
- **Black screen after replugging power (intermittent).** User report: after unplug/replug the screen flashes white,
  shows the "loading flights" start screen, then goes black. Under investigation — see [log](/log.md).
  Firmware 1.2.2 already added LDO4, a 120 ms settle delay and restart-on-init-failure for this class of problem.
  - 2026-11-28 findings: the device still ran **1.2.1** (rev1, chip v1.3; 1.2.2 was never installed).
    EN-pin reset boots fine. A real power replug reproduced the black screen, but the serial log was fully
    healthy (C6 up, Wi-Fi at 9.7 s, frames decoded with real pixel values, taps handled). The user saw a
    **faint backlight glow**: the backlight is on, the P4 runs, and the **panel itself stops showing the framebuffer** after a cold start.
    Most likely cause: panel analog supply (LDO4) not enabled in 1.2.1. Next step: flash 1.2.2 and repeat replug tests.
  - If 1.2.2 does not fix it: candidates are DSI/panel init timing on cold power (panel has no reset pin),
    and a supply dip when the C6 boots (~2.8–5 s) knocking the panel out. Then add a panel re-init / health check.

# Notes
- README route section was outdated (said adsb.lol routeset); routes now come from VRS standing data + adsbdb.
