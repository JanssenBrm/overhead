// Decor voor het scherm: de hemel van nu (zon, wolken, neerslag, sterren, maan) en een straat onderaan.
// De straat is willekeurig maar vast per locatie, zodat ze niet elke minuut verandert.
// De wolken drijven langzaam mee met het uur; ramen gaan 's avonds aan en 's nachts weer uit.

const n = (v) => (Math.round(v * 10) / 10).toString();

// Kleine voorspelbare toevalsgenerator (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (...parts) => parts.join("|").split("").reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);

// Stand van de zon (hoogte en azimut in graden, azimut vanaf het noorden)
export function sunPosition(date, lat, lon) {
  const r = Math.PI / 180, d = (date - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const g = (357.529 + 0.98560028 * d) % 360, q = (280.459 + 0.98564736 * d) % 360;
  const L = q + 1.915 * Math.sin(g * r) + 0.02 * Math.sin(2 * g * r), e = 23.439 - 0.00000036 * d;
  const RA = Math.atan2(Math.cos(e * r) * Math.sin(L * r), Math.cos(L * r)) / r;
  const dec = Math.asin(Math.sin(e * r) * Math.sin(L * r)) / r;
  const GMST = (18.697374558 + 24.06570982441908 * d) % 24;
  const Hh = (((GMST * 15 + lon - RA) % 360) + 360) % 360;
  const alt = Math.asin(Math.sin(lat * r) * Math.sin(dec * r) + Math.cos(lat * r) * Math.cos(dec * r) * Math.cos(Hh * r)) / r;
  const az = ((Math.atan2(-Math.sin(Hh * r), Math.tan(dec * r) * Math.cos(lat * r) - Math.sin(lat * r) * Math.cos(Hh * r)) / r) + 360) % 360;
  return { alt, az };
}

// Leeftijd van de maan in dagen (0 = nieuwe maan, ± 14,8 = volle maan)
export function moonAge(date) {
  const syn = 29.530588;
  return ((((date - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) % syn) + syn) % syn;
}

export function defs(u) {
  return `<radialGradient id="sunglow"><stop offset="0" stop-color="#fff3c4" stop-opacity=".9"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="moonglow"><stop offset="0" stop-color="#d9dcff" stop-opacity=".22"/><stop offset="1" stop-color="#d9dcff" stop-opacity="0"/></radialGradient>` +
    `<filter id="cloud" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="${n(9 * u)}"/></filter>`;
}

// Hoogte van de straat onderaan, zodat de opmaak de toestellen erboven houdt
export const bandHeight = (u) => Math.round(66 * u);

/**
 * @param {object} o
 *   W, H, u          beeldgrootte en schaal
 *   lat, lon, now    plek en tijd
 *   night, phase     nacht ja/nee en dagdeel ("ochtendgloren", "dag", "schemering", "nacht")
 *   cond, cloud      weertoestand en bewolking in %
 *   hour             uur op de plek (0-23)
 */
export function scenery(o) {
  const { W, H, u, lat, lon, now, night, phase, cond, cloud = 40, hour } = o;
  const out = [];
  const horizon = H - bandHeight(u) * 0.6;
  const overcast = ["bewolkt", "regen", "mist", "onweer", "sneeuw"].includes(cond);

  if (!night) {
    // Zon op haar echte plek: oost links, zuid in het midden, west rechts
    const sun = sunPosition(now, lat, lon);
    if (sun.alt > -1 && !overcast && sun.az > 80 && sun.az < 280) {
      const x = ((sun.az - 90) / 180) * W;
      const y = horizon - (Math.max(0, sun.alt) / 50) * (horizon - 90 * u);
      const low = sun.alt < 8;
      out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(92 * u)}" fill="url(#sunglow)"/>`);
      out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(24 * u)}" fill="${low ? "#ffd2a6" : "#fff6d8"}"/>`);
    }
    // Wolken: aantal volgens de bewolking, langzaam drijvend met het uur
    const count = overcast ? 7 : Math.round(clamp(cloud, 0, 100) / 17);
    const r = rng(seedOf("wolken", now.toISOString().slice(0, 10)));
    const drift = ((now.getUTCHours() * 60 + now.getUTCMinutes()) * 0.6 * u);
    const color = cond === "regen" || cond === "onweer" ? "#e3e7eb" : "#ffffff";
    for (let i = 0; i < count; i++) {
      const s = (overcast ? 1.3 : 0.7 + r() * 0.6) * u;
      const span = W + 360 * u;
      const cx = ((r() * span + drift * (0.6 + r() * 0.8)) % span) - 180 * u;
      const cy = (110 + r() * 200) * u;
      const parts = [];
      for (let k = 0; k < 7; k++) parts.push(`<ellipse cx="${n(cx + (r() - 0.5) * 130 * s)}" cy="${n(cy + (r() - 0.5) * 20 * s)}" rx="${n((40 + r() * 42) * s)}" ry="${n((15 + r() * 14) * s)}"/>`);
      out.push(`<g fill="${color}" opacity="${overcast ? 0.62 : 0.8}" filter="url(#cloud)">${parts.join("")}</g>`);
    }
  } else {
    // Sterren, vast per plek; minder zichtbaar bij bewolking
    const r = rng(seedOf("sterren", lat.toFixed(2), lon.toFixed(2)));
    const nStars = Math.round(170 * (W * H) / (1024 * 600) * (overcast ? 0.25 : 1));
    for (let i = 0; i < nStars; i++) {
      const x = r() * W, y = r() * (horizon - 20 * u), rad = (0.5 + r() * r() * 1.6) * u;
      out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(rad)}" fill="#fff" opacity="${n(0.25 + r() * 0.6)}"/>`);
    }
    // Maan in de juiste fase, in de kop tussen titel en klok
    const age = moonAge(now);
    if (age > 1.5 && age < 28 && !overcast) {
      const f = age / 29.530588, k = Math.cos(f * 2 * Math.PI), waxing = f < 0.5;
      const mx = o.moon ? o.moon.x : W * 0.58, my = o.moon ? o.moon.y : 58 * u, R = 20 * u;
      const lit = `M${n(mx)} ${n(my - R)} A${n(R)} ${n(R)} 0 0 ${waxing ? 1 : 0} ${n(mx)} ${n(my + R)} A${n(Math.abs(k) * R)} ${n(R)} 0 0 ${(waxing ? k > 0 : k < 0) ? 0 : 1} ${n(mx)} ${n(my - R)}Z`;
      out.push(`<circle cx="${n(mx)}" cy="${n(my)}" r="${n(58 * u)}" fill="url(#moonglow)"/><circle cx="${n(mx)}" cy="${n(my)}" r="${n(R)}" fill="#1b2442"/><path d="${lit}" fill="#f1ecd8"/>`);
    }
  }

  // Neerslag
  if (cond === "regen" || cond === "onweer" || cond === "sneeuw") {
    const r = rng(seedOf("neerslag", now.getUTCMinutes()));
    for (let i = 0; i < 70; i++) {
      const x = r() * W, y = r() * horizon;
      out.push(cond === "sneeuw"
        ? `<circle cx="${n(x)}" cy="${n(y)}" r="${n((1 + r() * 1.5) * u)}" fill="#fff" opacity=".8"/>`
        : `<path d="M${n(x)} ${n(y)} l${n(-4 * u)} ${n(12 * u)}" stroke="${night ? "#7f8fb0" : "#9aa7b5"}" stroke-width="${n(1.1 * u)}" opacity=".5"/>`);
    }
  }

  out.push(street(o));
  return out.join("");
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Een willekeurige Kempense straat: huizen met puntdak, dennen, loofbomen en een kerktoren
function street({ W, H, u, lat, lon, night, phase, hour }) {
  const r = rng(seedOf("straat", lat.toFixed(3), lon.toFixed(3)));
  const fill = night ? "#03060c" : phase === "schemering" || phase === "ochtendgloren" ? "#8f8a9c" : "#b0b8c2";
  const winColor = "#f5c96a";
  // Kans dat een raam brandt, volgens het uur
  const lit = hour >= 17 && hour < 23 ? 0.55 : hour === 23 || hour === 0 ? 0.3 : hour >= 6 && hour < 8 ? 0.35 : 0.08;
  const winR = rng(seedOf("ramen", lat.toFixed(3), lon.toFixed(3), hour));
  const base = H - Math.round(20 * u);
  const p = [];
  const churchX = W * (0.62 + r() * 0.22);
  let x = -10 * u, church = false;
  while (x < W + 20 * u) {
    if (!church && x > churchX) {
      const cw = 18 * u, ch = 50 * u, sp = 30 * u;
      p.push(`<rect x="${n(x)}" y="${n(base - ch)}" width="${n(cw)}" height="${n(ch + 40 * u)}" fill="${fill}"/>`);
      p.push(`<path d="M${n(x - 2 * u)} ${n(base - ch)} L${n(x + cw / 2)} ${n(base - ch - sp)} L${n(x + cw + 2 * u)} ${n(base - ch)}Z" fill="${fill}"/>`);
      p.push(`<path d="M${n(x + cw / 2)} ${n(base - ch - sp)} v${n(-10 * u)} M${n(x + cw / 2 - 4 * u)} ${n(base - ch - sp - 5 * u)} h${n(8 * u)}" stroke="${fill}" stroke-width="${n(2 * u)}"/>`);
      if (night) p.push(`<rect x="${n(x + cw / 2 - 3 * u)}" y="${n(base - ch + 14 * u)}" width="${n(6 * u)}" height="${n(9 * u)}" rx="${n(3 * u)}" fill="${winColor}" opacity=".55"/>`);
      church = true; x += cw + 8 * u; continue;
    }
    const t = r();
    if (t < 0.42) { // huis met puntdak
      const w = (50 + r() * 55) * u, h = (20 + r() * 16) * u, roof = (12 + r() * 12) * u, y = base - h + r() * 6 * u;
      p.push(`<path d="M${n(x)} ${n(y)} L${n(x + w / 2)} ${n(y - roof)} L${n(x + w)} ${n(y)} V${H} H${n(x)}Z" fill="${fill}"/>`);
      if (r() < 0.5) p.push(`<rect x="${n(x + w * 0.7)}" y="${n(y - roof * 0.75)}" width="${n(7 * u)}" height="${n(roof * 0.6)}" fill="${fill}"/>`);
      for (let i = 0; i < 2; i++) {
        const on = winR() < lit;
        if (night && on) p.push(`<rect x="${n(x + 10 * u + i * (w - 26 * u))}" y="${n(y + 7 * u)}" width="${n(9 * u)}" height="${n(9 * u)}" fill="${winColor}" opacity="${n(0.45 + winR() * 0.4)}"/>`);
      }
      x += w + r() * 8 * u;
    } else if (t < 0.72) { // Kempense den
      const h = (46 + r() * 34) * u, y = base - h;
      p.push(`<rect x="${n(x + 9 * u)}" y="${n(y + 18 * u)}" width="${n(3 * u)}" height="${n(h)}" fill="${fill}"/>`);
      for (let i = 0; i < 4; i++) p.push(`<ellipse cx="${n(x + 10 * u + (r() - 0.5) * 22 * u)}" cy="${n(y + (6 + i * 7) * u)}" rx="${n((12 + r() * 10) * u)}" ry="${n((6 + r() * 4) * u)}" fill="${fill}"/>`);
      x += (22 + r() * 18) * u;
    } else { // loofboom
      const rr = (12 + r() * 12) * u, y = base - rr * 1.5;
      p.push(`<rect x="${n(x + rr - 2 * u)}" y="${n(y + rr)}" width="${n(4 * u)}" height="${n(H - y)}" fill="${fill}"/>`);
      for (let i = 0; i < 5; i++) p.push(`<circle cx="${n(x + rr + (r() - 0.5) * rr * 1.3)}" cy="${n(y + (r() - 0.3) * rr)}" r="${n(rr * (0.55 + r() * 0.35))}" fill="${fill}"/>`);
      x += rr * 2 + r() * 6 * u;
    }
  }
  p.push(`<rect x="0" y="${n(base - 2 * u)}" width="${W}" height="${n(H - base + 2 * u)}" fill="${fill}"/>`);
  return `<g>${p.join("")}</g>`;
}
