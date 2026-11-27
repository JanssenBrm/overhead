// Gedeelde data-ophaling: posities (adsb.lol, reserve adsb.fi) en routes (VRS standing data, reserve adsbdb).
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

// adsbdb kent per roepnaam één vaste route, geen live vluchtplan. Toestellen die heen en terug onder dezelfde
// roepnaam vliegen (vaak privétoestellen met hun registratie als roepnaam) krijgen op de terugweg dus de omgekeerde
// route. Daarom: vliegt het toestel duidelijk naar de vertrekluchthaven en van de bestemming weg, draai de route om.
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
function orient(a, rt) {
  const { from, to } = rt;
  if (a.track == null || a.onGround || (a.gs != null && a.gs < 60)) return rt;
  if (from.lat == null || to.lat == null) return rt;
  if (from.iata && from.iata === to.iata) return rt;
  const toDest = angDiff(a.track, bearing(a.lat, a.lon, to.lat, to.lon));
  const toOrig = angDiff(a.track, bearing(a.lat, a.lon, from.lat, from.lon));
  // Pas omdraaien bij een duidelijk verschil, zodat een toestel dat net vertrekt of een bocht maakt niet verspringt
  if (toDest > 110 && toOrig < 70) return { from: to, to: from, flipped: true };
  return rt;
}

async function route(callsign) {
  if (!callsign) return null;
  const hit = routeCache.get(callsign);
  if (hit && Date.now() - hit.at < (hit.ttl ?? ROUTE_TTL)) return hit.value;
  let value = null, ttl = ROUTE_TTL;
  try {
    const r = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "overhead-dashboard (github.com/JanssenBrm/overhead)", Accept: "application/json" },
    });
    if (r.status === 404) {
      // adsbdb kent deze roepnaam niet: dat mag lang onthouden worden
    } else if (!r.ok) {
      throw new Error(String(r.status));
    } else {
      const j = await r.json();
      const f = j?.response?.flightroute;
      if (f && typeof f === "object") {
        const ap = (a) => a && { iata: a.iata_code || a.icao_code, city: a.municipality || a.name, country: a.country_iso_name, lat: a.latitude ?? null, lon: a.longitude ?? null };
        value = { from: ap(f.origin), to: ap(f.destination), airline: f.airline?.name || null };
      }
    }
  } catch (e) {
    // Tijdelijke fout (traag, overbelast): maar kort onthouden en dan opnieuw proberen
    ttl = 2 * 60e3;
  }
  routeCache.set(callsign, { at: Date.now(), value, ttl });
  return value;
}

/* ---------- Routes uit de standing data van Virtual Radar Server (CC0) ---------- */
// Dezelfde routetabel die adsb.lol gebruikte, nu rechtstreeks uit github.com/vradarserver/standing-data
// (dagelijks bijgewerkt). De routeset-API van adsb.lol antwoordt leeg en die van adsb.im vraagt toestemming
// vooraf, dus die gebruiken we niet meer.
//   routes:   routes/schema-01/<eerste letter>/<maatschappij>-all.csv   Callsign,Code,Number,AirlineCode,AirportCodes
//   airports: airports/schema-01/<eerste letter>/<eerste twee>.csv      Code,Name,ICAO,IATA,Location,CountryISO2,Latitude,Longitude,AltitudeFeet
const SD = "https://raw.githubusercontent.com/vradarserver/standing-data/main";
const SD_TTL = 6 * 3600e3;
const sdFiles = new Map(); // pad -> { at, rows: Map, pending }

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const head = lines.shift()?.split(",") || [];
  return lines.map((l) => {
    // Velden kunnen tussen aanhalingstekens staan (namen met komma's)
    const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === "," && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return Object.fromEntries(head.map((h, i) => [h, out[i]]));
  });
}

async function sdFile(path, keyField) {
  const hit = sdFiles.get(path);
  if (hit && (hit.pending || Date.now() - hit.at < (hit.rows ? SD_TTL : 10 * 60e3))) return hit.pending || hit.rows;
  const pending = (async () => {
    try {
      const r = await fetch(`${SD}/${path}`, { signal: AbortSignal.timeout(6000), headers: { "User-Agent": "overhead-dashboard (github.com/JanssenBrm/overhead)" } });
      if (r.status === 404) return new Map(); // geen bestand: deze maatschappij of dit voorvoegsel bestaat niet
      if (!r.ok) throw new Error(String(r.status));
      return new Map(parseCsv(await r.text()).map((row) => [row[keyField], row]));
    } catch (e) {
      console.error("standing data", path, String(e));
      return null;
    }
  })();
  sdFiles.set(path, { at: Date.now(), pending });
  const rows = await pending;
  sdFiles.set(path, { at: Date.now(), rows });
  return rows;
}

async function sdAirport(icao) {
  if (!/^[A-Z0-9]{3,4}$/.test(icao || "")) return null;
  const rows = await sdFile(`airports/schema-01/${icao[0]}/${icao.slice(0, 2)}.csv`, "ICAO");
  const a = rows?.get(icao);
  if (!a || a.Latitude == null) return null;
  return { iata: a.IATA || a.ICAO, icao: a.ICAO, city: a.Location || a.Name, country: a.CountryISO2, lat: Number(a.Latitude), lon: Number(a.Longitude) };
}

const lolCache = new Map(); // callsign -> { at, airports, ttl }
async function lolRoutes(list) {
  const now = Date.now();
  await Promise.all(list.map(async (a) => {
    const cs = a.callsign;
    if (!cs) return;
    const h = lolCache.get(cs);
    if (h && now - h.at < h.ttl) return;
    const m = /^([A-Z]{3})\d/.exec(cs);
    if (!m) { lolCache.set(cs, { at: now, airports: null, ttl: SD_TTL }); return; }
    const rows = await sdFile(`routes/schema-01/${m[1][0]}/${m[1]}-all.csv`, "Callsign");
    if (!rows) { lolCache.set(cs, { at: now, airports: null, ttl: 2 * 60e3 }); return; }
    const codes = rows.get(cs)?.AirportCodes;
    let airports = null;
    if (codes) {
      airports = (await Promise.all(codes.split("-").map(sdAirport))).filter(Boolean);
      if (airports.length < 2) airports = null;
    }
    lolCache.set(cs, { at: now, airports, ttl: 30 * 60e3 });
  }));
}

/* ---------- Plausibiliteit: ligt het toestel op (of vlak naast) de lijn van vertrek naar bestemming? ---------- */
const deg2rad = (d) => (d * Math.PI) / 180;
function fitsLeg(a, from, to) {
  const d12 = distKm(from.lat, from.lon, to.lat, to.lon);
  const d13 = distKm(from.lat, from.lon, a.lat, a.lon);
  const d23 = distKm(to.lat, to.lon, a.lat, a.lon);
  if (d12 < 1) return null;
  const xt = Math.abs(Math.asin(Math.sin(d13 / R) * Math.sin(deg2rad(bearing(from.lat, from.lon, a.lat, a.lon) - bearing(from.lat, from.lon, to.lat, to.lon)))) * R);
  // Toegelaten afwijking: ruimer voor lange vluchten en vlak bij een luchthaven (naderingen, wachtpatronen)
  const allow = Math.max(90, d12 * 0.12) + (Math.min(d13, d23) < 60 ? 40 : 0);
  const between = d13 + d23 <= d12 * 1.35 + 60;
  if (xt > allow || !between) return null;
  return { xt };
}
function plausible(a, airports) {
  // Bij tussenlandingen: kies het traject waar het toestel op zit, en ook omgekeerd (heen en terug onder één roepnaam)
  const legs = [];
  for (let i = 0; i + 1 < airports.length; i++) legs.push([airports[i], airports[i + 1]]);
  let best = null;
  for (const [f, t] of legs) {
    const fit = fitsLeg(a, f, t);
    if (fit && (!best || fit.xt < best.fit.xt)) best = { from: f, to: t, fit };
  }
  if (!best) return null;
  const rt = orient(a, { from: best.from, to: best.to });
  // Laag (onder 6.000 ft) en ver van beide luchthavens: het toestel stijgt of daalt bij een ander vliegveld
  if (a.alt != null && a.alt < 6000 && !a.onGround) {
    const near = Math.min(distKm(a.lat, a.lon, rt.from.lat, rt.from.lon), distKm(a.lat, a.lon, rt.to.lat, rt.to.lon));
    if (near > 60) return null;
  }
  // Na eventueel omdraaien moet het toestel nog ongeveer richting bestemming vliegen
  if (a.track != null && !a.onGround && (a.gs == null || a.gs >= 60)) {
    const off = angDiff(a.track, bearing(a.lat, a.lon, rt.to.lat, rt.to.lon));
    if (off > 100 && distKm(a.lat, a.lon, rt.to.lat, rt.to.lon) > 40) return null;
  }
  return rt;
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

  // Eerst de standing data van VRS (actueler), dan adsbdb; een route die niet bij positie en koers past, tonen we niet
  await lolRoutes(list);
  await mapLimit(list, 6, async (a) => {
    const db = await route(a.callsign);
    a.airline = db?.airline || null;
    const lol = a.callsign ? lolCache.get(a.callsign)?.airports : null;
    let rt = lol ? plausible(a, lol) : null;
    let src = rt ? "vrs" : null;
    if (!rt && db && db.from && db.to && db.from.lat != null && db.to.lat != null) {
      rt = plausible(a, [db.from, db.to]);
      if (rt) src = "adsbdb";
    }
    a.route = rt ? { from: rt.from, to: rt.to, src, ...(rt.flipped ? { flipped: true } : {}) } : null;
  });
  return { source: pos.source, aircraft: list };
}
