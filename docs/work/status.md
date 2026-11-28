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

# Notes
- README route section was outdated (said adsb.lol routeset); routes now come from VRS standing data + adsbdb.
