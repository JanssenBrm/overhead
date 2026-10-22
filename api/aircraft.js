// GET /api/aircraft?lat=51.24&lon=5.11&radius=40
// Haalt posities op bij adsb.lol (met adsb.fi als reserve) en vult routes aan via adsbdb.
// Alles server-side, zodat de browser geen last heeft van CORS of trage bronnen.

const ROUTE_TTL = 6 * 3600e3;
const routeCache = new Map(); // callsign -> { at, value }
const PHOTO_TTL = 24 * 3600e3;
const photoCache = new Map(); // hex -> { at, value }

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
function distKm(a, b, c, d) {
  const x = rad(c - a), y = rad(d - b);
  const h = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b, c, d) {
  const y = Math.sin(rad(d - b)) * Math.cos(rad(c));
  const x = Math.cos(rad(a)) * Math.sin(rad(c)) - Math.sin(rad(a)) * Math.cos(rad(c)) * Math.cos(rad(d - b));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

async function getJSON(url, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "overhead-dashboard (github.com/JanssenBrm/overhead)", Accept: "application/json" },
    });
    if (!r.ok) throw new Error(`${url} -> ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function positions(lat, lon, nm) {
  try {
    const j = await getJSON(`https://api.adsb.lol/v2/point/${lat}/${lon}/${nm}`);
    return { source: "adsb.lol", ac: j.ac || [] };
  } catch (e) {
    const j = await getJSON(`https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${nm}`);
    return { source: "adsb.fi", ac: j.ac || j.aircraft || [] };
  }
}

async function route(callsign) {
  if (!callsign) return null;
  const hit = routeCache.get(callsign);
  if (hit && Date.now() - hit.at < ROUTE_TTL) return hit.value;
  let value = null;
  try {
    const j = await getJSON(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`, 4000);
    const f = j?.response?.flightroute;
    if (f && typeof f === "object") {
      const ap = (a) => a && { iata: a.iata_code || a.icao_code, city: a.municipality || a.name, country: a.country_iso_name };
      value = { from: ap(f.origin), to: ap(f.destination), airline: f.airline?.name || null };
    }
  } catch (e) {
    // onbekende roepnaam of trage bron: geen route
  }
  routeCache.set(callsign, { at: Date.now(), value });
  return value;
}

// Foto van precies dit toestel (op ICAO-hexcode), met fotograaf en link terug zoals planespotters vraagt
async function photo(hex) {
  if (!hex) return null;
  const hit = photoCache.get(hex);
  if (hit && Date.now() - hit.at < PHOTO_TTL) return hit.value;
  let value = null;
  try {
    const j = await getJSON(`https://api.planespotters.net/pub/photos/hex/${encodeURIComponent(hex)}`, 4000);
    const ph = j?.photos?.[0];
    if (ph) {
      const big = ph.thumbnail_large || ph.thumbnail;
      value = {
        src: big?.src,
        w: big?.size?.width || null,
        h: big?.size?.height || null,
        by: ph.photographer || null,
        link: ph.link || null,
      };
      if (!value.src) value = null;
    }
  } catch (e) {
    console.error("planespotters", hex, String(e));
    return null; // niet cachen bij een fout, volgende keer opnieuw proberen
  }
  photoCache.set(hex, { at: Date.now(), value });
  return value;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    })
  );
  return out;
}

export default async function handler(req, res) {
  const q = req.query || {};
  const lat = Number(q.lat), lon = Number(q.lon);
  const radius = Math.max(5, Math.min(250, Number(q.radius) || 40));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    res.status(400).json({ error: "Geef een geldige lat en lon op." });
    return;
  }
  const nm = Math.max(1, Math.ceil(radius / 1.852));

  let pos;
  try {
    pos = await positions(lat.toFixed(4), lon.toFixed(4), nm);
  } catch (e) {
    res.status(502).json({ error: "De positiebronnen (adsb.lol en adsb.fi) antwoorden niet." });
    return;
  }

  const list = pos.ac
    .filter((a) => a.lat != null && a.lon != null)
    .map((a) => {
      const alt = a.alt_baro === "ground" ? 0 : a.alt_baro ?? a.alt_geom ?? null;
      return {
        hex: a.hex,
        callsign: (a.flight || "").trim() || null,
        reg: a.r || null,
        type: a.t || null,
        desc: a.desc || null,
        category: a.category || null,
        operator: a.ownOp || null,
        lat: a.lat,
        lon: a.lon,
        alt,
        onGround: a.alt_baro === "ground",
        gs: a.gs ?? null,
        track: a.track ?? a.true_heading ?? null,
        rate: a.baro_rate ?? a.geom_rate ?? null,
        dist: distKm(lat, lon, a.lat, a.lon),
        bearing: bearing(lat, lon, a.lat, a.lon),
      };
    })
    .filter((a) => a.dist <= radius)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 40);

  await mapLimit(list, 6, async (a) => {
    const r = await route(a.callsign);
    a.route = r && r.from && r.to ? { from: r.from, to: r.to } : null;
    a.airline = r?.airline || null;
    a.photo = q.photos === "0" ? null : await photo(a.hex);
  });

  res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=30");
  res.status(200).json({ source: pos.source, at: Date.now(), radius, aircraft: list });
}
