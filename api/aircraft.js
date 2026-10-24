// GET /api/aircraft?lat=51.24&lon=5.11&radius=40
// Haalt posities op bij adsb.lol (met adsb.fi als reserve) en vult routes aan via adsbdb.
// Alles server-side, zodat de browser geen last heeft van CORS of trage bronnen.
import { getAircraft } from "../lib/adsb.js";

export default async function handler(req, res) {
  const q = req.query || {};
  const lat = Number(q.lat), lon = Number(q.lon);
  const radius = Math.max(5, Math.min(250, Number(q.radius) || 40));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    res.status(400).json({ error: "Geef een geldige lat en lon op." });
    return;
  }
  let data;
  try {
    data = await getAircraft(lat, lon, radius);
  } catch (e) {
    res.status(502).json({ error: "De positiebronnen (adsb.lol en adsb.fi) antwoorden niet." });
    return;
  }
  res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=30");
  res.status(200).json({ source: data.source, at: Date.now(), radius, aircraft: data.aircraft });
}
