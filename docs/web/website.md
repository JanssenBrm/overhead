---
type: Web Page
title: Website (index.html)
description: Single-file browser dashboard that polls the API and draws aircraft, sky and today's log client-side.
resource: https://overhead-liart.vercel.app/
tags: [web, frontend]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-28T08:25:00Z }
---
- Settings (gear icon): title, place (search via [/api/geocode](/api/misc.md) or device location), radius; stored in `localStorage` `overhead.cfg`.
  URL params `lat, lon, plaats, straal, titel` prefill.
- Views: paintings ([/api/painting](/api/painting.md)), vector illustrations ([art](/lib/art.md)), or planespotters photo ([/api/photo](/api/misc.md)).
- Labels *zeldzaam*, *nieuw type* (first hour after a type's first sighting, once the log has run a day), *militair*.
- Compass arrow + distance + wind direction, approaching/receding, closest approach on wide screens.
- *Vandaag* log kept in localStorage while the page is open. Sky of now / white / dark modes.
- Timers: aircraft every 30 s, weather every 15 min, night check every minute; requests a Wake Lock.
- Settings dialog builds the `/api/frame` URL for the screen.
