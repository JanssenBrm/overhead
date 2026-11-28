---
okf_version: "0.2"
---
# System
* [Overhead system overview](system/overview.md) - What Overhead is, its three parts and how data flows between them.
* [Vercel deployment and configuration](system/deployment.md) - Hosting, function config, environment variables and free-tier budget.
* [Coding and documentation conventions](system/conventions.md) - House rules, including how to keep this bundle up to date.

# API
* [GET /api/frame](api/frame.md) - Server-side screen renderer with control headers and touch hotspots.
* [GET /api/aircraft](api/aircraft.md) - Aircraft within a radius with validated routes.
* [GET /api/painting and /api/painting-img](api/painting.md) - AI paintings per type + airline in Vercel Blob.
* [Small endpoints](api/misc.md) - sky, geocode, photo and status.

# Libraries
* [lib/adsb.js](lib/adsb.md) - Positions from three ADS-B feeds and route plausibility.
* [lib/art.js](lib/art.md) - Aircraft illustrations, type table and liveries.
* [lib/sky.js and lib/scenery.js](lib/scenery.md) - Sky of now and the street band.
* [lib/book.js](lib/book.md) - Collection book in Blob.
* [lib/changelog.js](lib/changelog.md) - Firmware release notes.
* [lib/world.json](lib/world.md) - Country borders for the route map.

# Web pages
* [Website](web/website.md) - Single-file browser dashboard.
* [Frame preview](web/frame-page.md) - Server-rendered image in a frame.
* [Screen installer](web/installer.md) - Flash, Wi-Fi and URL from the browser.

# Firmware
* [Screen firmware overview](firmware/overview.md) - Boot sequence, frame loop, touch and brightness.
* [CrowPanel hardware](firmware/hardware.md) - Board facts, pins and power.
* [OTA updates](firmware/ota.md) - Version check, install, rollback.
* [Provisioning](firmware/provisioning.md) - Portal, Improv and OVERHEAD-URL.

# Playbooks
* [Release firmware](playbooks/release-firmware.md) - Build, publish and roll out.
* [Device over serial](playbooks/device-serial.md) - Logs and flashing on /dev/cu.wchusbserial130.
* [Local development](playbooks/local-dev.md) - Run the site and API locally.

# Work
* [Current state and open work](work/status.md) - What is in progress and known issues.
