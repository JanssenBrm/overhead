// Gedeelde data-ophaling: posities (adsb.lol, reserve adsb.fi) en routes (adsbdb).
// Gebruikt door /api/aircraft (de website) en /api/frame (het scherm).
const ROUTE_TTL = 6 * 3600e3;
const routeCache = new Map(); // callsign -> { at, value }

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
export function distKm(a, b, c, d) {
  const x = rad(c - a), y = rad(d - b);
  const h = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function bearing(a, b, c, d) {
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


export async function getAircraft(lat, lon, radius) {
  const nm = Math.max(1, Math.ceil(radius / 1.852));
  const pos = await positions(lat.toFixed(4), lon.toFixed(4), nm);
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
  });
  return { source: pos.source, aircraft: list };
}
