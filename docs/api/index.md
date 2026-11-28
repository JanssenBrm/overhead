# Endpoints
* [GET /api/frame](frame.md) - Server-side renderer that draws the whole screen as one image for the ESP32-P4 frame, with control headers and touch hotspots.
* [GET /api/aircraft](aircraft.md) - JSON list of aircraft within a radius, with validated routes; used by the website.
* [GET /api/painting and /api/painting-img](painting.md) - Generates (once) and serves AI paintings per aircraft type + airline, stored in Vercel Blob.
* [Small endpoints](misc.md) - sky, geocode, photo and status helpers.
