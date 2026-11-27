// GET /api/frame?lat=51.2387&lon=5.1159&straal=40&plaats=Dessel&titel=...&w=1024&h=600&format=png
// Het volledige scherm als één beeld, voor een ESP32-scherm in een lijst (of om te bekijken via /frame).
//
// Parameters
//   lat, lon, straal (km), plaats, titel   zoals op de website
//   w, h                                    beeldgrootte in pixels (standaard 1024 × 600; staand: w=600&h=1024)
//   weergave = schilderij | illustratie     standaard schilderij (valt terug op illustratie zolang er geen is)
//   nacht    = auto | aan | uit             auto volgt zonsondergang en -opgang op de plek
//   decor    = straat | effen               straat (standaard): hemel van nu met zon, wolken, sterren en maan, en een straat onderaan
//   format   = png | jpg | rgb565 | rgb565be | svg
//              Voor het scherm: jpg (± 75 KB). rgb565 is 1,2 MB per beeld en past niet in het gratis dataverkeer.
//
// Antwoordheaders voor het scherm
//   X-Night: 1 of 0          zodat het scherm 's nachts de verlichting kan dimmen of doven
//   X-Refresh: seconden      hoe lang het scherm best wacht voor het volgende beeld
//   X-Aircraft: aantal       toestellen op het beeld
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import opentype from "opentype.js";
import { get, put } from "@vercel/blob";
import { waitUntil } from "@vercel/functions";
import { Illustrate, T, spec } from "../lib/art.js";
import { getAircraft, distKm } from "../lib/adsb.js";
import { loadBook, recordSightings, WISH } from "../lib/book.js";
import { notesBetween } from "../lib/changelog.js";
import { getWeather, condition, phase, skyColors } from "../lib/sky.js";
import { scenery, defs as sceneryDefs, bandHeight } from "../lib/scenery.js";
import { PREFIX, ensurePainting, paintingConfigured } from "../lib/painting.js";

/* ---------- Lettertypes: dezelfde Geist als op de website ---------- */
const FONT_FILES = {
  // Op het echte scherm (IPS, 1024 x 600) worden dunne letters bleek en vaag: alles één gewicht zwaarder
  sans300: "Geist-Regular.ttf", sans400: "Geist-Medium.ttf", sans500: "Geist-SemiBold.ttf", sans600: "Geist-SemiBold.ttf",
  mono400: "GeistMono-Medium.ttf", mono500: "GeistMono-Medium.ttf",
};
const fontPath = (f) => fileURLToPath(new URL(`../fonts/${f}`, import.meta.url));
const FONT_PATHS = Object.values(FONT_FILES).map(fontPath);
const OT = {};
for (const [k, f] of Object.entries(FONT_FILES)) {
  const b = readFileSync(fontPath(f));
  OT[k] = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
const textW = (s, font, size) => OT[font].getAdvanceWidth(String(s), size);
const FAMILY = { sans: "Geist", mono: "Geist Mono" };
const fontAttrs = (font) => `font-family="${font.startsWith("mono") ? FAMILY.mono : FAMILY.sans}" font-weight="${font.slice(-3)}"`;

/* ---------- Kleine hulpjes ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const n = (v) => (Math.round(v * 100) / 100).toString();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const nf = new Intl.NumberFormat("nl-BE");

// Warm papiergrijs voor het scherm in de lijst, en een menging van twee hexkleuren
const PAPER = "#cdc5b6";
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
// Het IPS-scherm toont middentonen veel lichter dan een computerscherm: met deze curve worden grijze
// letters donkerder, terwijl wit en zwart blijven wat ze zijn
const GAMMA = 1.45;
// en het felste wit wordt gebroken wit (232), zodat zon, wolken en witte toestellen niet fel oplichten
const CEIL = 232;
const LUT = Uint8Array.from({ length: 256 }, (_, i) => Math.round(CEIL * Math.pow(i / 255, GAMMA)));

const THEMES = {
  // Donkerder dan op de website: het scherm toont grijstinten veel lichter dan een computerscherm
  day: { ink: "#0b0d10", muted: "#3a4048", faint: "#5f666e", line: "#d9dde2", climb: "#0d6b37", descend: "#9c4f00", cruise: "#1d4bb0", ground: "#3a4048", shadow: ["#111316", 0.13] },
  night: { ink: "#f1f3f5", muted: "#b4bbc3", faint: "#7d858e", line: "#2c323a", climb: "#6fe09c", descend: "#ffb45c", cruise: "#9dbbff", ground: "#b4bbc3", shadow: ["#000000", 0.45] },
};

/* ---------- Bijzondere toestellen (zelfde lijst als de website) ---------- */
const RARE = new Set(["A388","B741","B742","B743","B744","B748","B74S","A124","A225","AN12","AN22","IL76","IL62","C17","C5M","B52","E3TF","E3CF","A3ST","A337","DC10","MD11","A342","A343","A345","A346","CONC","DC3","DC6","JU52","SPIT","B17","B29","P51","L188","A306","B703","K35R","KC2","A400","C130","C30J","B762","B764","A310","T204","SU95","U2","F22","B2"]);
function badge(a, sp) {
  if (a.type && RARE.has(a.type)) return { label: "zeldzaam", color: "#8a3ffc", star: true };
  if (Illustrate.livery(a, sp).mil) return { label: "militair", color: "#56606a", star: false };
  return null;
}

/* ---------- Bijschrift-teksten ---------- */
function motion(a) {
  if (a.onGround) return ["ground", "aan de grond"];
  if (a.rate != null && a.rate > 300) return ["climb", "stijgt"];
  if (a.rate != null && a.rate < -300) return ["descend", "daalt"];
  return ["cruise", "cruise"];
}
const WIND = ["N", "NNO", "NO", "ONO", "O", "OZO", "ZO", "ZZO", "Z", "ZZW", "ZW", "WZW", "W", "WNW", "NW", "NNW"];
const windName = (b) => WIND[Math.round(((b % 360) + 360) % 360 / 22.5) % 16];
function approach(a) {
  if (a.track == null || a.gs == null || a.gs < 30 || a.onGround) return null;
  const toHome = (a.bearing + 180) % 360;
  const r = ((((a.track - toHome + 540) % 360) - 180) * Math.PI) / 180;
  const closing = a.dist * Math.cos(r);
  return { coming: closing > 0.3, minDist: a.dist * Math.abs(Math.sin(r)), minutes: closing > 0 ? (closing / (a.gs * 1.852)) * 60 : 0 };
}
const km = (d) => (d < 10 ? d.toFixed(1).replace(".", ",") : String(Math.round(d)));
function routeText(a, maxW, size) {
  if (a.route) {
    const city = `${a.route.from.city || a.route.from.iata} → ${a.route.to.city || a.route.to.iata}`;
    if (textW(city, "sans400", size) <= maxW) return city;
    return `${a.route.from.iata || a.route.from.city} → ${a.route.to.iata || a.route.to.city}`;
  }
  if (!a.onGround && a.alt != null && a.alt < 4000 && a.rate != null && a.rate < -300) return "in nadering";
  return "trekt voorbij";
}

/* ---------- Schilderijen: uitknippen (achtergrond doorzichtig, lege rand weg) en bewaren ---------- */
const CUT_PREFIX = "paintings/cut-v2/"; // bewust buiten PREFIX, zodat de daglimiet niet meetelt
const cutMem = new Map(); // sleutel -> { at, value }

async function readBlob(path) {
  try {
    const r = await get(path, { access: "private" });
    if (!r || r.statusCode !== 200) return null;
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  } catch (e) {
    return null;
  }
}

async function makeCutout(buf) {
  const { data: d, info } = await sharp(buf).resize({ width: 640, withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const bg = (p) => { const r = d[p * 4], g = d[p * 4 + 1], b = d[p * 4 + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mn >= 214 && mx - mn <= 26; };
  const seen = new Uint8Array(N), st = new Int32Array(N); let sp = 0;
  const push = (p) => { if (!seen[p] && bg(p)) { seen[p] = 1; st[sp++] = p; } };
  for (let i = 0; i < W; i++) { push(i); push((H - 1) * W + i); }
  for (let j = 0; j < H; j++) { push(j * W); push(j * W + W - 1); }
  while (sp) { const p = st[--sp], x = p % W; if (x > 0) push(p - 1); if (x < W - 1) push(p + 1); if (p >= W) push(p - W); if (p < N - W) push(p + W); }
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let p = 0; p < N; p++) {
    if (seen[p]) { d[p * 4 + 3] = 0; continue; }
    const x = p % W, y = (p / W) | 0;
    if ((x > 0 && seen[p - 1]) || (x < W - 1 && seen[p + 1]) || (p >= W && seen[p - W]) || (p < N - W && seen[p + W])) {
      if ((d[p * 4] + d[p * 4 + 1] + d[p * 4 + 2]) / 3 > 190) d[p * 4 + 3] = 140;
    }
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const img = sharp(d, { raw: { width: W, height: H, channels: 4 } });
  if (x1 < 0) return img.png().toBuffer();
  const pad = 2, left = Math.max(0, x0 - pad), top = Math.max(0, y0 - pad);
  return img.extract({ left, top, width: Math.min(W - left, x1 - x0 + 1 + pad * 2), height: Math.min(H - top, y1 - y0 + 1 + pad * 2) }).png().toBuffer();
}

async function cutout(key) {
  const hit = cutMem.get(key);
  // Ontbrekende schilderijen pas na een uur opnieuw nakijken (of zodra ensurePainting er een maakte)
  if (hit && (hit.value || Date.now() - hit.at < 60 * 60e3)) return hit.value;
  let buf = await readBlob(`${CUT_PREFIX}${key}.png`);
  if (!buf) {
    const orig = await readBlob(`${PREFIX}${key}.png`);
    if (orig) {
      buf = await makeCutout(orig);
      waitUntil(put(`${CUT_PREFIX}${key}.png`, buf, { access: "private", contentType: "image/png", addRandomSuffix: false, allowOverwrite: true }).catch(() => {}));
    }
  }
  let value = null;
  if (buf) {
    const m = await sharp(buf).metadata();
    value = { uri: `data:image/png;base64,${buf.toString("base64")}`, w: m.width, h: m.height };
  }
  cutMem.set(key, { at: Date.now(), value });
  return value;
}

function paintKey(a) {
  if (!a.type || !T[a.type]) return null;
  const m = /^([A-Z]{3})\d/.exec(a.callsign || "");
  return `${a.type}-${m ? m[1] : "GEN"}`;
}

/* ---------- Eén toestel opmeten en tekenen ---------- */
function illustration(a, sp, kk) {
  const svg = Illustrate.draw(a, sp, kk);
  const m = /^<svg class="illu" width="([\d.]+)" height="([\d.]+)" viewBox="([^"]+)"[^>]*>/.exec(svg);
  const inner = svg.slice(m[0].length, -"</svg>".length)
    // resvg kent vector-effect niet: lijndikte omrekenen van pixels naar meters
    .replace(/stroke-width="([\d.]+)" vector-effect="non-scaling-stroke"/g, (_, w) => `stroke-width="${n(Number(w) / kk)}"`);
  return { w: Number(m[1]), h: Number(m[2]), viewBox: m[3], inner };
}

function measure(a, k, u, maxCap, theme) {
  const sp = a.sp;
  const minW = 46 * u;
  const imgW = Math.max(minW, sp.len * k);
  let img;
  if (a.cut) img = { kind: "paint", w: imgW, h: (imgW * a.cut.h) / a.cut.w };
  else {
    const kk = Math.max(k, minW / sp.len);
    const il = illustration(a, sp, kk);
    img = { kind: "illu", ...il };
  }
  const s = clamp(img.w / (260 * u), 1, 1.25) * u; // kleine toestellen: niet kleiner dan de gewone tekst
  const fs = 14 * s;
  const capMax = Math.max(img.w, maxCap);
  const lines = [];
  const b = badge(a, sp);
  if (b) lines.push({ kind: "badge", b, h: fs * 1.45, w: textW(b.label, "sans600", fs * 0.82) + fs * (b.star ? 1.9 : 1.1) });
  const name = a.callsign || a.reg || String(a.hex).toUpperCase();
  lines.push({ kind: "text", text: name, font: "mono500", size: fs * 1.08, color: theme.ink, letter: 0.06 * fs * 1.08 });
  lines.push({ kind: "text", text: sp.model, font: "sans500", size: fs, color: theme.ink });
  lines.push({ kind: "text", text: routeText(a, capMax, fs), font: "sans400", size: fs, color: theme.muted });
  // Waar moet ik kijken
  if (a.bearing != null && a.dist != null) {
    const over = a.dist < 2.5, ap = approach(a);
    let st = "";
    if (over) st = "recht boven";
    else if (ap && ap.coming) {
      const long = ap.minutes >= 0.5 && ap.minutes < 30 ? (ap.minDist < 1 ? `over ${Math.round(ap.minutes)} min recht boven` : `dichtst over ${Math.round(ap.minutes)} min op ${km(ap.minDist)} km`) : "";
      st = long && textW(`${km(a.dist)} km ${windName(a.bearing)} · ${long}`, "sans400", fs * 0.9) + fs * 2 <= capMax ? long : "nadert";
    } else if (ap) st = "trekt weg";
    const main = over ? "" : `${km(a.dist)} km ${windName(a.bearing)}`;
    const stText = st ? `${main ? " · " : ""}${st}` : "";
    const roseW = fs * 1.55;
    const w = roseW + fs * 0.35 + textW(main, "mono400", fs * 0.9) + textW(stText, "sans400", fs * 0.88);
    lines.push({ kind: "dir", h: fs * 1.6, w, bearing: a.bearing, main, stText, near: !!(ap && ap.coming), over, roseW, fs });
  }
  // Hoogte en stijgen/dalen/cruise
  const [tk, tl] = motion(a);
  const alt = a.onGround || a.alt == null ? "" : `${nf.format(Math.round(a.alt / 25) * 25)} ft`;
  const pillW = textW(tl, "sans500", fs * 0.88) + fs * 1.55;
  const altW = alt ? textW(alt, "mono400", fs * 0.92) + fs * 0.45 : 0;
  lines.push({ kind: "meta", h: fs * 1.45, w: altW + pillW, alt, altW, tk, tl, pillW, fs });
  const lh = (l) => (l.kind === "text" ? l.size * 1.3 : l.h + fs * 0.15);
  const capH = lines.reduce((t, l) => t + lh(l), 0);
  const capW = Math.max(...lines.map((l) => (l.kind === "text" ? textW(l.text, l.font, l.size) + (l.letter || 0) * l.text.length : l.w)));
  return { img, lines, lh, capH, capW, fs, w: Math.max(img.w, capW), gap: 5 * u };
}

const TICON = {
  climb: "M2.5 9.5 9.5 2.5M4.5 2.5h5v5",
  descend: "M2.5 2.5 9.5 9.5M9.5 4.5v5h-5",
  cruise: "M1.5 6h9M7 2.5 10.5 6 7 9.5",
  ground: "",
};
const STAR = "M6 .8 7.6 4l3.6.5-2.6 2.5.6 3.6L6 8.9 2.8 10.6l.6-3.6L.8 4.5 4.4 4z";

function drawItem(it, x, imgTop, rowImgH, theme) {
  const out = [];
  const cx = x + it.w / 2;
  const iy = imgTop + rowImgH - it.img.h, ix = cx - it.img.w / 2;
  if (it.img.kind === "paint") out.push(`<image x="${n(ix)}" y="${n(iy)}" width="${n(it.img.w)}" height="${n(it.img.h)}" href="${it.uri}" filter="url(#sh)" preserveAspectRatio="xMidYMid meet"/>`);
  else out.push(`<g filter="url(#sh)"><svg x="${n(ix)}" y="${n(iy)}" width="${n(it.img.w)}" height="${n(it.img.h)}" viewBox="${it.img.viewBox}" overflow="visible">${it.img.inner}</svg></g>`);
  let y = imgTop + rowImgH + it.gap;
  for (const l of it.lines) {
    const h = it.lh(l);
    if (l.kind === "text") {
      out.push(`<text x="${n(cx)}" y="${n(y + l.size)}" text-anchor="middle" ${fontAttrs(l.font)} font-size="${n(l.size)}" fill="${l.color}"${l.letter ? ` letter-spacing="${n(l.letter)}"` : ""}>${esc(l.text)}</text>`);
    } else if (l.kind === "badge") {
      const fs = it.fs, bx = cx - l.w / 2, by = y + fs * 0.05;
      out.push(`<rect x="${n(bx)}" y="${n(by)}" width="${n(l.w)}" height="${n(l.h - fs * 0.1)}" rx="${n((l.h - fs * 0.1) / 2)}" fill="${l.b.color}"/>`);
      let tx = bx + fs * 0.55;
      if (l.b.star) { out.push(`<path d="${STAR}" fill="#fff" transform="translate(${n(tx)} ${n(by + fs * 0.27)}) scale(${n((fs * 0.82) / 12)})"/>`); tx += fs * 0.82 + fs * 0.25; }
      out.push(`<text x="${n(tx)}" y="${n(by + fs * 0.98)}" ${fontAttrs("sans600")} font-size="${n(fs * 0.82)}" fill="#fff">${esc(l.b.label)}</text>`);
    } else if (l.kind === "dir") {
      const fs = l.fs, x0 = cx - l.w / 2, mid = y + l.h / 2, R = l.roseW / 2;
      const color = l.over ? theme.descend : theme.ink;
      out.push(`<g transform="translate(${n(x0 + R)} ${n(mid)})"><circle r="${n(R * 0.86)}" fill="${theme.ink}" fill-opacity="0.05" stroke="${theme.ink}" stroke-opacity="0.22" stroke-width="${n(Math.max(0.8, fs * 0.07))}"/>` +
        `<g transform="rotate(${Math.round(l.bearing)}) scale(${n(R / 12)})"><path d="M0 -7.6 4 4.6 0 2.4 -4 4.6Z" fill="${color}"/></g></g>`);
      let tx = x0 + l.roseW + fs * 0.35;
      if (l.main) { out.push(`<text x="${n(tx)}" y="${n(mid + fs * 0.32)}" ${fontAttrs("mono400")} font-size="${n(fs * 0.9)}" fill="${color}">${esc(l.main)}</text>`); tx += textW(l.main, "mono400", fs * 0.9); }
      if (l.stText) out.push(`<text x="${n(tx)}" y="${n(mid + fs * 0.32)}" ${fontAttrs("sans400")} font-size="${n(fs * 0.88)}" fill="${l.near ? theme.climb : l.over ? theme.descend : theme.muted}">${esc(l.stText)}</text>`);
    } else if (l.kind === "meta") {
      const fs = l.fs, x0 = cx - l.w / 2, mid = y + l.h / 2;
      if (l.alt) out.push(`<text x="${n(x0)}" y="${n(mid + fs * 0.32)}" ${fontAttrs("mono400")} font-size="${n(fs * 0.92)}" fill="${theme.muted}">${esc(l.alt)}</text>`);
      const px = x0 + l.altW, ph = fs * 1.3, c = theme[l.tk];
      out.push(`<rect x="${n(px)}" y="${n(mid - ph / 2)}" width="${n(l.pillW)}" height="${n(ph)}" rx="${n(ph / 2)}" fill="${c}" fill-opacity="0.12"/>`);
      let tx = px + fs * 0.42;
      if (TICON[l.tk]) { out.push(`<path d="${TICON[l.tk]}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" transform="translate(${n(tx)} ${n(mid - fs * 0.45)}) scale(${n((fs * 0.9) / 12)})"/>`); tx += fs * 0.95; }
      out.push(`<text x="${n(tx)}" y="${n(mid + fs * 0.31)}" ${fontAttrs("sans500")} font-size="${n(fs * 0.88)}" fill="${c}">${esc(l.tl)}</text>`);
    }
    y += h;
  }
  return out.join("");
}

/* ---------- Opmaak: grootste schaal zoeken waarbij alles op het scherm past ---------- */
function layout(list, k, area, u, theme) {
  const items = list.map((a) => ({ a, ...measure(a, k, u, 120 * u, theme) }));
  const gx = 22 * u, gy = 14 * u;
  const rows = [];
  let row = [], rw = 0;
  for (const it of items) {
    if (it.w > area.w) return null;
    if (row.length && rw + gx + it.w > area.w) { rows.push(row); row = []; rw = 0; }
    rw += (row.length ? gx : 0) + it.w; row.push(it);
  }
  if (row.length) rows.push(row);
  let total = 0;
  for (const r of rows) {
    r.imgH = Math.max(...r.map((i) => i.img.h));
    r.capH = Math.max(...r.map((i) => i.capH + i.gap));
    r.w = r.reduce((t, i) => t + i.w, 0) + gx * (r.length - 1);
    total += r.imgH + r.capH;
  }
  total += gy * (rows.length - 1);
  if (total > area.h) return null;
  return { rows, total, gx, gy };
}

/* ---------- Gedeelde basis voor alle pagina's ---------- */
async function context(q, { paintFor } = {}) {
  const W = clamp(Math.round(Number(q.w) || 1024), 200, 2400);
  const H = clamp(Math.round(Number(q.h) || 600), 200, 2400);
  const lat = Number(q.lat ?? 51.2387), lon = Number(q.lon ?? 5.1159);
  const radius = clamp(Number(q.straal ?? q.radius) || 40, 5, 250);
  const place = String(q.plaats ?? (q.lat ? "" : "Dessel")).slice(0, 40);
  const title = String(q.titel || "Nu in de lucht").slice(0, 60);
  const view = q.weergave === "illustratie" ? "illustratie" : "schilderij";
  const decor = q.decor === "effen" ? "effen" : "straat";
  const u = Math.min(W, H) / 600;

  const [data, wx] = await Promise.all([getAircraft(lat, lon, radius).catch((e) => ({ error: e })), getWeather(lat, lon)]);
  const ph = phase(Date.now(), lat, lon);
  const night = q.nacht === "aan" || (q.nacht !== "uit" && ph === "nacht");
  const theme = night ? THEMES.night : THEMES.day;
  const cond = condition(wx?.code);
  let sky = night ? ["#0a1430", "#141d36"] : q.nacht === "uit" ? ["#ffffff", "#ffffff"] : skyColors(ph, cond);
  // Op het scherm zelf: overdag een zachtere, warmere ondergrond (minder fel wit, oogt minder als een scherm)
  if (q._fw && !night) sky = sky.map((c) => mix(c, PAPER, 0.85));
  const tz = wx?.timezone || "Europe/Brussels";
  const list = (data.aircraft || []).map((a) => ({ ...a, sp: spec(a) }));

  // Schilderijen ophalen; ontbrekende op de achtergrond laten maken voor een volgend beeld
  if (view === "schilderij" && paintingConfigured()) {
    let started = 0;
    await Promise.all(list.filter((a) => !paintFor || paintFor(a)).map(async (a) => {
      const key = paintKey(a);
      if (!key) return;
      a.cut = await cutout(key);
      if (a.cut) a.uri = a.cut.uri;
      else if (started++ < 2) {
        const [type, op] = key.split("-");
        waitUntil(ensurePainting({ type, op: op === "GEN" ? "" : op, model: a.sp.model, airline: a.airline || a.operator || "", mil: !!Illustrate.livery(a, a.sp).mil })
          .then((r) => { if (r && r.url) cutMem.delete(key); }).catch(() => {}));
      }
    }));
  }
  const pad = Math.round(26 * u);
  return { q, W, H, u, lat, lon, radius, place, title, view, decor, data, wx, ph, night, theme, cond, sky, tz, list, pad, hs: [] };
}

function openSvg(c, { street = false } = {}) {
  const { W, H, u, theme, sky } = c;
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>` +
    `<filter id="sh" x="-15%" y="-20%" width="130%" height="160%"><feDropShadow dx="0" dy="${n(5 * u)}" stdDeviation="${n(4.5 * u)}" flood-color="${theme.shadow[0]}" flood-opacity="${theme.shadow[1]}"/></filter></defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);
  if (street && c.decor === "straat") {
    const now = new Date();
    const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: c.tz }).format(now));
    parts.push(`<defs>${sceneryDefs(u)}</defs>`);
    parts.push(scenery({ W, H, u, lat: c.lat, lon: c.lon, now, night: c.night, phase: c.ph, cond: c.cond, cloud: c.wx?.cloud ?? 40, hour }));
  }
  return parts;
}

// Kop: bovenregel (klein) en titel links, klok en datum rechts
function header(c, parts, { eyebrow, title, eyebrowExtra = "" }) {
  const { W, u, pad, theme, tz } = c;
  const now = new Date();
  const time = new Intl.DateTimeFormat("nl-BE", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(now);
  const date = new Intl.DateTimeFormat("nl-BE", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(now).replace(/\./g, "").toUpperCase();
  const eFs = 14 * u, tFs = 34 * u, cFs = 52 * u;
  parts.push(`<circle cx="${n(pad + 4 * u)}" cy="${n(pad + eFs * 0.62)}" r="${n(6.5 * u)}" fill="${theme.climb}" fill-opacity="0.18"/><circle cx="${n(pad + 4 * u)}" cy="${n(pad + eFs * 0.62)}" r="${n(3.5 * u)}" fill="${theme.climb}"/>`);
  parts.push(`<text x="${n(pad + 16 * u)}" y="${n(pad + eFs)}" ${fontAttrs("mono400")} font-size="${n(eFs)}" letter-spacing="${n(eFs * 0.12)}" fill="${theme.muted}">${esc(eyebrow)}<tspan letter-spacing="${n(eFs * 0.02)}">${esc(eyebrowExtra)}</tspan></text>`);
  parts.push(`<text x="${pad}" y="${n(pad + eFs + 10 * u + tFs * 0.85)}" ${fontAttrs("sans600")} font-size="${n(tFs)}" letter-spacing="${n(-tFs * 0.025)}" fill="${theme.ink}">${esc(title)}</text>`);
  parts.push(`<text x="${W - pad}" y="${n(pad + cFs * 0.82)}" text-anchor="end" ${fontAttrs("sans300")} font-size="${n(cFs)}" letter-spacing="${n(-cFs * 0.04)}" fill="${theme.ink}">${time}</text>`);
  parts.push(`<text x="${W - pad}" y="${n(pad + cFs * 0.82 + 8 * u + eFs)}" text-anchor="end" ${fontAttrs("mono400")} font-size="${n(eFs)}" letter-spacing="${n(eFs * 0.08)}" fill="${theme.muted}">${esc(date)}</text>`);
  return { titleW: textW(title, "sans600", tFs), headerH: 78 * u };
}

function closeSvg(c, parts) {
  const { W, H, u, theme, q } = c;
  // Versie van de firmware, klein rechtsonder: zo zie je of een update gelukt is
  if (q._fw) parts.push(`<text x="${n(W - 8 * u)}" y="${n(H - 6 * u)}" text-anchor="end" ${fontAttrs("mono400")} font-size="${n(10 * u)}" fill="${theme.ink}" fill-opacity="0.55">v${esc(q._fw)}</text>`);
  parts.push(`</svg>`);
  return parts.join("");
}

// Een zin onderaan die zegt hoe je teruggaat
function backHint(c, parts, text = "Tik om terug te gaan") {
  const { W, H, u, theme } = c;
  parts.push(`<text x="${n(W / 2)}" y="${n(H - 14 * u)}" text-anchor="middle" ${fontAttrs("sans400")} font-size="${n(13 * u)}" fill="${theme.muted}">${esc(text)}</text>`);
}

const motionColor = (c, a) => c.theme[motion(a)[0]];

/* ---------- Pagina: overzicht (het gewone beeld) ---------- */
async function pageOverview(c) {
  const { W, H, u, pad, list, theme, radius, place, wx, night, cond } = c;
  // Verzamelboek bijwerken (schrijft alleen als er een nieuw type bij is)
  if (!c.data.error && list.length) await recordSightings(c.lat, c.lon, list, c.tz).catch(() => {});

  list.sort((a, b) => b.sp.len - a.sp.len);
  const order = [];
  list.forEach((a, i) => (i % 2 ? order.push(a) : order.unshift(a)));
  if (list.length) { order.splice(order.indexOf(list[0]), 1); order.unshift(list[0]); }

  const headerH = 78 * u;
  const band = c.decor === "straat" ? bandHeight(u) : 0; // ruimte voor de straat onderaan
  const area = { x: pad, y: pad + headerH, w: W - pad * 2, h: H - pad * 2 - headerH - Math.max(0, band - pad * 0.6) };

  let best = null;
  if (order.length) {
    let lo = 0.2, hi = (area.w * 0.55) / list[0].sp.len;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      const l = layout(order, mid, area, u, theme);
      if (l) { best = l; lo = mid; } else hi = mid;
    }
    if (!best) best = layout(order, lo, area, u, theme);
  }

  // Bijzonder toestel in beeld? Dan een gekleurde rand en een melding in de kop
  const special = list.map((a) => ({ a, b: badge(a, a.sp) })).find((x) => x.b);
  const parts = openSvg(c, { street: true });
  if (special) {
    const col = special.b.color, bw = 9 * u;
    parts.push(`<rect x="${n(bw / 2)}" y="${n(bw / 2)}" width="${n(W - bw)}" height="${n(H - bw)}" rx="${n(10 * u)}" fill="none" stroke="${col}" stroke-width="${n(bw)}"/>`);
  }
  const eyebrow = `${place ? place.toUpperCase() + " · " : ""}${radius} KM`;
  const wxText = wx ? ` · ${Math.round(wx.temp)}° ${night && cond === "helder" ? "heldere nacht" : cond}` : "";
  const hd = header(c, parts, { eyebrow, title: c.title, eyebrowExtra: wxText });
  if (special) {
    const fs = 15 * u, txt = `${special.b.label === "militair" ? "Militair toestel" : "Zeldzaam toestel"} in de buurt: ${special.a.sp.model}`;
    const tw = textW(txt, "sans600", fs) + fs * 2.2, th = fs * 2, tx = (W - tw) / 2, ty = pad + 4 * u;
    parts.push(`<rect x="${n(tx)}" y="${n(ty)}" width="${n(tw)}" height="${n(th)}" rx="${n(th / 2)}" fill="${special.b.color}"/>`);
    parts.push(`<path d="${STAR}" fill="#fff" transform="translate(${n(tx + fs * 0.75)} ${n(ty + th / 2 - fs * 0.5)}) scale(${n(fs / 12)})"/>`);
    parts.push(`<text x="${n(tx + fs * 1.85)}" y="${n(ty + th / 2 + fs * 0.36)}" ${fontAttrs("sans600")} font-size="${n(fs)}" fill="#fff">${esc(txt)}</text>`);
  }
  // Aanraakzones in de kop: titel = verzamelboek, klok = radarkaart
  c.hs.push({ id: "@boek", x: 0, y: 0, w: pad + hd.titleW + 40 * u, h: pad + headerH });
  c.hs.push({ id: "@radar", x: W - pad - 190 * u, y: 0, w: pad + 190 * u, h: pad + headerH });

  if (c.data.error) {
    parts.push(`<text x="${n(W / 2)}" y="${n(area.y + area.h / 2)}" text-anchor="middle" ${fontAttrs("sans600")} font-size="${n(22 * u)}" fill="${theme.ink}">Geen verbinding met de bronnen</text>`);
    parts.push(`<text x="${n(W / 2)}" y="${n(area.y + area.h / 2 + 28 * u)}" text-anchor="middle" ${fontAttrs("sans400")} font-size="${n(15 * u)}" fill="${theme.muted}">We proberen het zo opnieuw.</text>`);
  } else if (!best) {
    parts.push(`<text x="${n(W / 2)}" y="${n(area.y + area.h / 2)}" text-anchor="middle" ${fontAttrs("sans600")} font-size="${n(22 * u)}" fill="${theme.ink}">Een lege hemel</text>`);
    parts.push(`<text x="${n(W / 2)}" y="${n(area.y + area.h / 2 + 28 * u)}" text-anchor="middle" ${fontAttrs("sans400")} font-size="${n(15 * u)}" fill="${theme.muted}">Niets binnen ${radius} km. Over een minuut kijken we opnieuw.</text>`);
  } else {
    let y = area.y + (area.h - best.total) / 2;
    for (const r of best.rows) {
      let x = area.x + (area.w - r.w) / 2;
      for (const it of r) {
        if (it.img.kind === "paint") it.uri = it.a.uri;
        parts.push(drawItem(it, x, y, r.imgH, theme));
        c.hs.push({ id: it.a.hex, x, y, w: it.w, h: r.imgH + r.capH });
        x += it.w + best.gx;
      }
      y += r.imgH + r.capH + best.gy;
    }
  }
  return { svg: closeSvg(c, parts), alert: !!special, refresh: 60 };
}

/* ---------- Pagina: detail van één toestel ---------- */
// Jaar van de eerste vlucht van het type (alleen gangbare types)
const FIRST = {
  A318: 2002, A319: 1995, A320: 1987, A20N: 2014, A321: 1993, A21N: 2016, A332: 1997, A333: 1992, A339: 2017, A359: 2013, A35K: 2016, A388: 2005,
  B737: 1997, B738: 1997, B739: 2000, B38M: 2016, B39M: 2017, B744: 1988, B748: 2010, B752: 1982, B763: 1986, B772: 1994, B77W: 2003, B77L: 2005,
  B788: 2009, B789: 2013, B78X: 2017, E170: 2002, E190: 2004, E195: 2004, BCS1: 2013, BCS3: 2015, AT72: 1988, DH8D: 1998, CRJ9: 2001,
  C172: 1955, C182: 1956, PC12: 1991, A3ST: 1994, A400: 2009, C130: 1954, C30J: 1996, C17: 1991, MD11: 1990, A124: 1982,
};

function bigImage(c, a, box) {
  // Het toestel zo groot mogelijk in het vak, met behoud van verhoudingen
  if (a.cut) {
    const s = Math.min(box.w / a.cut.w, box.h / a.cut.h);
    const w = a.cut.w * s, h = a.cut.h * s;
    return `<image x="${n(box.x + (box.w - w) / 2)}" y="${n(box.y + (box.h - h) / 2)}" width="${n(w)}" height="${n(h)}" href="${a.uri}" filter="url(#sh)" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const k0 = 10, il0 = illustration(a, a.sp, k0);
  const k = k0 * Math.min(box.w / il0.w, box.h / il0.h);
  const il = illustration(a, a.sp, k);
  return `<g filter="url(#sh)"><svg x="${n(box.x + (box.w - il.w) / 2)}" y="${n(box.y + (box.h - il.h) / 2)}" width="${n(il.w)}" height="${n(il.h)}" viewBox="${il.viewBox}" overflow="visible">${il.inner}</svg></g>`;
}

// Kaartje: vertrek, bestemming en de plek van het toestel, in een rechthoek
function routeMap(c, a, box) {
  const { u, theme } = c;
  const from = a.route?.from, to = a.route?.to;
  const pts = [{ lat: c.lat, lon: c.lon }, { lat: a.lat, lon: a.lon }];
  if (from?.lat != null) pts.push(from);
  if (to?.lat != null) pts.push(to);
  const midLat = pts.reduce((t, p) => t + p.lat, 0) / pts.length;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = pts.map((p) => p.lon * kx), ys = pts.map((p) => -p.lat);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0, 0.6);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const inner = { x: box.x + 18 * u, y: box.y + 16 * u, w: box.w - 36 * u, h: box.h - 32 * u };
  const s = Math.min(inner.w, inner.h) / span;
  const P = (p) => [inner.x + inner.w / 2 + (p.lon * kx - cx) * s, inner.y + inner.h / 2 + (-p.lat - cy) * s];
  const out = [`<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" rx="${n(12 * u)}" fill="${theme.ink}" fill-opacity="0.05" stroke="${theme.ink}" stroke-opacity="0.12"/>`];
  const lbl = (p, text, anchor, dy) => `<text x="${n(p[0])}" y="${n(p[1] + dy)}" text-anchor="${anchor}" ${fontAttrs("mono500")} font-size="${n(12 * u)}" fill="${theme.ink}">${esc(text)}</text>`;
  if (from?.lat != null && to?.lat != null) {
    const f = P(from), t = P(to), p = P(a);
    out.push(`<path d="M${n(f[0])} ${n(f[1])} L${n(p[0])} ${n(p[1])}" stroke="${theme.ink}" stroke-width="${n(2 * u)}" stroke-linecap="round"/>`);
    out.push(`<path d="M${n(p[0])} ${n(p[1])} L${n(t[0])} ${n(t[1])}" stroke="${theme.ink}" stroke-opacity="0.45" stroke-width="${n(2 * u)}" stroke-dasharray="${n(5 * u)} ${n(5 * u)}" stroke-linecap="round"/>`);
    for (const [q, ap] of [[f, from], [t, to]]) {
      out.push(`<circle cx="${n(q[0])}" cy="${n(q[1])}" r="${n(4.5 * u)}" fill="${theme.ink}"/>`);
      out.push(lbl(q, ap.iata || "", q[0] < box.x + box.w / 2 ? "start" : "end", q[1] < box.y + box.h / 2 ? 18 * u : -9 * u));
    }
  }
  // Thuis
  const h = P({ lat: c.lat, lon: c.lon });
  out.push(`<circle cx="${n(h[0])}" cy="${n(h[1])}" r="${n(5 * u)}" fill="none" stroke="${theme.climb}" stroke-width="${n(2.2 * u)}"/><circle cx="${n(h[0])}" cy="${n(h[1])}" r="${n(1.8 * u)}" fill="${theme.climb}"/>`);
  // Toestel als pijl in de vliegrichting
  const p = P(a);
  out.push(`<g transform="translate(${n(p[0])} ${n(p[1])}) rotate(${Math.round(a.track ?? 0)}) scale(${n(1.15 * u)})"><path d="M0 -9 6 7 0 3.5 -6 7Z" fill="${motionColor(c, a)}" stroke="#fff" stroke-width="1.2"/></g>`);
  return out.join("");
}

async function pageDetail(c, hex) {
  const { W, H, u, pad, theme } = c;
  const a = c.list.find((x) => x.hex === hex);
  const parts = openSvg(c);
  c.hs.push({ id: "@terug", x: 0, y: 0, w: W, h: H });
  if (!a) {
    parts.push(`<text x="${n(W / 2)}" y="${n(H / 2 - 8 * u)}" text-anchor="middle" ${fontAttrs("sans600")} font-size="${n(26 * u)}" fill="${theme.ink}">Dit toestel is uit beeld</text>`);
    parts.push(`<text x="${n(W / 2)}" y="${n(H / 2 + 24 * u)}" text-anchor="middle" ${fontAttrs("sans400")} font-size="${n(16 * u)}" fill="${theme.muted}">Het vloog intussen buiten de straal.</text>`);
    backHint(c, parts);
    return { svg: closeSvg(c, parts), refresh: 20 };
  }
  const colX = W * 0.56, right = W - pad;
  // Links: het toestel groot, met de naam erboven
  const name = a.callsign || a.reg || String(a.hex).toUpperCase();
  parts.push(`<text x="${pad}" y="${n(pad + 34 * u)}" ${fontAttrs("mono500")} font-size="${n(34 * u)}" letter-spacing="${n(1.5 * u)}" fill="${theme.ink}">${esc(name)}</text>`);
  parts.push(`<text x="${pad}" y="${n(pad + 66 * u)}" ${fontAttrs("sans500")} font-size="${n(22 * u)}" fill="${theme.ink}">${esc(a.sp.model)}</text>`);
  const who = [a.airline || a.operator, a.reg && a.reg !== name ? a.reg : null].filter(Boolean).join(" · ");
  if (who) parts.push(`<text x="${pad}" y="${n(pad + 92 * u)}" ${fontAttrs("sans400")} font-size="${n(16 * u)}" fill="${theme.muted}">${esc(who)}</text>`);
  const b = badge(a, a.sp);
  if (b) {
    const fs = 13 * u, tw = textW(b.label, "sans600", fs) + fs * 1.6, bx = pad + textW(name, "mono500", 34 * u) + name.length * 1.5 * u + 14 * u, by = pad + 10 * u;
    parts.push(`<rect x="${n(bx)}" y="${n(by)}" width="${n(tw)}" height="${n(fs * 1.8)}" rx="${n(fs * 0.9)}" fill="${b.color}"/><text x="${n(bx + fs * 0.8)}" y="${n(by + fs * 1.25)}" ${fontAttrs("sans600")} font-size="${n(fs)}" fill="#fff">${esc(b.label)}</text>`);
  }
  parts.push(bigImage(c, a, { x: pad, y: pad + 110 * u, w: colX - pad - 30 * u, h: H - pad * 2 - 150 * u }));

  // Rechts: route, kaartje en feiten
  let y = pad + 8 * u;
  const lab = (t, yy) => parts.push(`<text x="${n(colX)}" y="${n(yy)}" ${fontAttrs("mono400")} font-size="${n(11.5 * u)}" letter-spacing="${n(1.2 * u)}" fill="${theme.muted}">${esc(t.toUpperCase())}</text>`);
  lab("Route", y + 12 * u);
  const rt = a.route ? `${a.route.from.city || a.route.from.iata} → ${a.route.to.city || a.route.to.iata}` : routeText(a, 999, 16);
  let rfs = 20 * u;
  while (textW(rt, "sans500", rfs) > right - colX && rfs > 12 * u) rfs -= u;
  parts.push(`<text x="${n(colX)}" y="${n(y + 38 * u)}" ${fontAttrs("sans500")} font-size="${n(rfs)}" fill="${theme.ink}">${esc(rt)}</text>`);
  y += 52 * u;
  const mapH = 170 * u;
  parts.push(routeMap(c, a, { x: colX, y, w: right - colX, h: mapH }));
  y += mapH + 22 * u;

  // Feiten in twee kolommen
  const [tk, tl] = motion(a);
  const elev = a.alt != null && a.dist > 0 ? Math.round((Math.atan2(a.alt * 0.3048, a.dist * 1000) * 180) / Math.PI) : null;
  const facts = [
    ["Hoogte", a.onGround ? "aan de grond" : a.alt != null ? `${nf.format(Math.round(a.alt / 25) * 25)} ft · ${nf.format(Math.round((a.alt * 0.3048) / 50) * 50)} m` : "onbekend"],
    ["Snelheid", a.gs != null ? `${nf.format(Math.round(a.gs * 1.852))} km/u` : "onbekend"],
    ["Kijk naar", a.dist < 2.5 ? "recht boven je" : `${windName(a.bearing)}${elev != null ? `, ${elev}° boven de horizon` : ""}`],
    ["Afstand", `${km(a.dist)} km · ${tl}`],
    ["Spanwijdte", `${String(a.sp.span).replace(".", ",")} m`],
    ["Lengte", `${String(a.sp.len).replace(".", ",")} m`],
  ];
  if (FIRST[a.type]) facts.push(["Eerste vlucht", String(FIRST[a.type])]);
  const colW = (right - colX) / 2, rowH = 46 * u;
  facts.slice(0, 8).forEach(([k, v], i) => {
    const fx = colX + (i % 2) * colW, fy = y + Math.floor(i / 2) * rowH;
    parts.push(`<text x="${n(fx)}" y="${n(fy + 11 * u)}" ${fontAttrs("mono400")} font-size="${n(11.5 * u)}" letter-spacing="${n(1.2 * u)}" fill="${theme.muted}">${esc(k.toUpperCase())}</text>`);
    let vfs = 16 * u;
    while (textW(v, "sans500", vfs) > colW - 10 * u && vfs > 11 * u) vfs -= 0.5 * u;
    const col = k === "Afstand" ? theme.ink : k === "Hoogte" && !a.onGround ? theme.ink : theme.ink;
    parts.push(`<text x="${n(fx)}" y="${n(fy + 32 * u)}" ${fontAttrs("sans500")} font-size="${n(vfs)}" fill="${col}">${esc(v)}</text>`);
  });
  backHint(c, parts);
  return { svg: closeSvg(c, parts), refresh: 15 };
}

/* ---------- Pagina: radarkaart ---------- */
// Vliegvelden in de buurt (een selectie voor België, Nederland en het Rijnland)
const FIELDS = [
  ["EBAW", "Antwerpen", 51.1894, 4.4603], ["EBBR", "Zaventem", 50.9014, 4.4844], ["EBCI", "Charleroi", 50.4592, 4.4538], ["EBLG", "Luik", 50.6374, 5.4432],
  ["EHEH", "Eindhoven", 51.4501, 5.3745], ["EHBK", "Maastricht", 50.9117, 5.7701], ["EHRD", "Rotterdam", 51.9569, 4.4372], ["EHAM", "Schiphol", 52.3086, 4.7639],
  ["EDDL", "Düsseldorf", 51.2895, 6.7668], ["EDDK", "Keulen", 50.8659, 7.1427], ["EBBL", "Kleine-Brogel", 51.1683, 5.4700], ["ETNG", "Geilenkirchen", 50.9608, 6.0424],
  ["EBDT", "Schaffen", 51.0039, 5.0656], ["EHBD", "Kempen Airport", 51.2553, 5.6014], ["EBZH", "Kiewit", 50.9700, 5.3750], ["EHVK", "Volkel", 51.6564, 5.7086],
  ["EHGR", "Gilze-Rijen", 51.5674, 4.9318], ["EHWO", "Woensdrecht", 51.4491, 4.3420], ["EBBE", "Beauvechain", 50.7586, 4.7683], ["EBZW", "Genk", 51.0154, 5.5267],
  ["EBOS", "Oostende", 51.1989, 2.8622], ["EBKT", "Kortrijk", 50.8172, 3.2047], ["EBFS", "Florennes", 50.2433, 4.6458], ["EDLN", "Mönchengladbach", 51.2303, 6.5044],
];

async function pageRadar(c) {
  const { W, H, u, pad, theme, radius, list } = c;
  const parts = openSvg(c);
  c.hs.push({ id: "@terug", x: 0, y: 0, w: W, h: H });
  const R = (H - pad * 2 - 20 * u) / 2, cx = pad + R + 10 * u, cy = H / 2;
  const scale = R / radius; // pixels per km
  const kx = Math.cos((c.lat * Math.PI) / 180);
  const P = (lat, lon) => [cx + (lon - c.lon) * kx * 111.32 * scale, cy - (lat - c.lat) * 110.57 * scale];
  // Ringen en windrichtingen
  parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R)}" fill="${theme.ink}" fill-opacity="0.045" stroke="${theme.ink}" stroke-opacity="0.25" stroke-width="${n(1.2 * u)}"/>`);
  const step = radius > 60 ? 25 : radius > 30 ? 10 : 5;
  for (let r = step; r < radius; r += step) {
    parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * scale)}" fill="none" stroke="${theme.ink}" stroke-opacity="0.12" stroke-width="${n(u)}"/>`);
    parts.push(`<text x="${n(cx + 4 * u)}" y="${n(cy - r * scale - 4 * u)}" ${fontAttrs("mono400")} font-size="${n(10.5 * u)}" fill="${theme.muted}">${r} km</text>`);
  }
  parts.push(`<path d="M${n(cx - R)} ${n(cy)}H${n(cx + R)}M${n(cx)} ${n(cy - R)}V${n(cy + R)}" stroke="${theme.ink}" stroke-opacity="0.08" stroke-width="${n(u)}"/>`);
  for (const [t, ang] of [["N", 0], ["O", 90], ["Z", 180], ["W", 270]]) {
    const r2 = R + 13 * u, x = cx + Math.sin((ang * Math.PI) / 180) * r2, y = cy - Math.cos((ang * Math.PI) / 180) * r2;
    parts.push(`<text x="${n(x)}" y="${n(y + 5 * u)}" text-anchor="middle" ${fontAttrs("mono500")} font-size="${n(13 * u)}" fill="${theme.muted}">${t}</text>`);
  }
  // Vliegvelden
  for (const [, name, la, lo] of FIELDS) {
    const d = distKm(c.lat, c.lon, la, lo);
    if (d > radius * 0.97) continue;
    const [x, y] = P(la, lo);
    parts.push(`<rect x="${n(x - 3.5 * u)}" y="${n(y - 3.5 * u)}" width="${n(7 * u)}" height="${n(7 * u)}" transform="rotate(45 ${n(x)} ${n(y)})" fill="${theme.faint}"/>`);
    parts.push(`<text x="${n(x + 8 * u)}" y="${n(y + 4 * u)}" ${fontAttrs("sans400")} font-size="${n(11 * u)}" fill="${theme.faint}">${esc(name)}</text>`);
  }
  // Thuis
  parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(7 * u)}" fill="none" stroke="${theme.climb}" stroke-width="${n(2.4 * u)}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(2.6 * u)}" fill="${theme.climb}"/>`);
  if (c.place) parts.push(`<text x="${n(cx + 11 * u)}" y="${n(cy + 18 * u)}" ${fontAttrs("sans600")} font-size="${n(12 * u)}" fill="${theme.climb}">${esc(c.place)}</text>`);
  // Toestellen: pijl in de vliegrichting, stippellijn naar waar het over 3 minuten is (binnen de cirkel)
  const sorted = [...list].sort((a, b) => a.dist - b.dist);
  parts.push(`<clipPath id="rc"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R)}"/></clipPath>`);
  for (const a of sorted) {
    const [x, y] = P(a.lat, a.lon);
    const col = motionColor(c, a);
    if (a.track != null && a.gs) {
      const dkm = a.gs * 1.852 * (3 / 60), t = (a.track * Math.PI) / 180;
      parts.push(`<path clip-path="url(#rc)" d="M${n(x)} ${n(y)} L${n(x + Math.sin(t) * dkm * scale)} ${n(y - Math.cos(t) * dkm * scale)}" stroke="${col}" stroke-opacity="0.55" stroke-width="${n(1.6 * u)}" stroke-dasharray="${n(3 * u)} ${n(4 * u)}"/>`);
    }
    const sz = clamp(0.7 + a.sp.len / 50, 0.75, 1.6) * u;
    parts.push(`<g transform="translate(${n(x)} ${n(y)}) rotate(${Math.round(a.track ?? 0)}) scale(${n(sz)})"><path d="M0 -9 6 7 0 3.5 -6 7Z" fill="${col}" stroke="${c.night ? "#0a1430" : "#fff"}" stroke-width="1.3"/></g>`);
    const name = a.callsign || a.reg || a.hex.toUpperCase();
    parts.push(`<text x="${n(x + 10 * u)}" y="${n(y - 6 * u)}" ${fontAttrs("mono500")} font-size="${n(11 * u)}" fill="${theme.ink}">${esc(name)}</text>`);
    if (a.alt != null && !a.onGround) parts.push(`<text x="${n(x + 10 * u)}" y="${n(y + 7 * u)}" ${fontAttrs("mono400")} font-size="${n(10 * u)}" fill="${theme.muted}">${nf.format(Math.round(a.alt / 100) * 100)} ft</text>`);
    c.hs.unshift({ id: a.hex, x: x - 22 * u, y: y - 22 * u, w: 90 * u, h: 44 * u });
  }
  // Rechts: titel en de lijst, dichtstbij eerst
  const lx = cx + R + 48 * u, lr = W - pad;
  parts.push(`<text x="${n(lx)}" y="${n(pad + 14 * u)}" ${fontAttrs("mono400")} font-size="${n(13 * u)}" letter-spacing="${n(1.6 * u)}" fill="${theme.muted}">RADAR · ${radius} KM</text>`);
  parts.push(`<text x="${n(lx)}" y="${n(pad + 50 * u)}" ${fontAttrs("sans600")} font-size="${n(30 * u)}" fill="${theme.ink}">${list.length} in de lucht</text>`);
  let y = pad + 84 * u;
  const rowH = 38 * u, maxRows = Math.floor((H - y - pad - 24 * u) / rowH);
  for (const a of sorted.slice(0, maxRows)) {
    const name = a.callsign || a.reg || a.hex.toUpperCase();
    parts.push(`<circle cx="${n(lx + 5 * u)}" cy="${n(y + 12 * u)}" r="${n(4.5 * u)}" fill="${motionColor(c, a)}"/>`);
    parts.push(`<text x="${n(lx + 18 * u)}" y="${n(y + 11 * u)}" ${fontAttrs("mono500")} font-size="${n(14 * u)}" fill="${theme.ink}">${esc(name)}</text>`);
    parts.push(`<text x="${n(lr)}" y="${n(y + 11 * u)}" text-anchor="end" ${fontAttrs("mono400")} font-size="${n(13 * u)}" fill="${theme.ink}">${km(a.dist)} km ${windName(a.bearing)}</text>`);
    let m = a.sp.model;
    while (textW(m, "sans400", 12.5 * u) > lr - lx - 18 * u - 80 * u && m.length > 4) m = m.slice(0, -2) + "…";
    parts.push(`<text x="${n(lx + 18 * u)}" y="${n(y + 28 * u)}" ${fontAttrs("sans400")} font-size="${n(12.5 * u)}" fill="${theme.muted}">${esc(m)}</text>`);
    if (a.alt != null && !a.onGround) parts.push(`<text x="${n(lr)}" y="${n(y + 28 * u)}" text-anchor="end" ${fontAttrs("mono400")} font-size="${n(12 * u)}" fill="${theme.muted}">${nf.format(Math.round(a.alt / 100) * 100)} ft</text>`);
    c.hs.unshift({ id: a.hex, x: lx - 6 * u, y: y - 6 * u, w: lr - lx + 12 * u, h: rowH });
    y += rowH;
  }
  if (sorted.length > maxRows) parts.push(`<text x="${n(lx)}" y="${n(y + 10 * u)}" ${fontAttrs("sans400")} font-size="${n(12.5 * u)}" fill="${theme.muted}">en nog ${sorted.length - maxRows} verder</text>`);
  backHint(c, parts, "Tik op een toestel voor meer · elders om terug te gaan");
  return { svg: closeSvg(c, parts), refresh: 15 };
}

/* ---------- Pagina: verzamelboek ---------- */
async function pageBook(c) {
  const { W, H, u, pad, theme, tz } = c;
  const year = new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone: tz }).format(new Date());
  const entry = await loadBook(c.lat, c.lon);
  const seen = { ...(entry.data.years[year] || {}) };
  // Wat nu in de lucht is, telt al mee (ook als het nog niet bewaard is)
  for (const a of c.list) if (a.type && a.sp.known && !seen[a.type]) seen[a.type] = { first: "", model: a.sp.model, callsign: a.callsign, airline: a.airline };
  const parts = openSvg(c);
  c.hs.push({ id: "@terug", x: 0, y: 0, w: W, h: H });
  const types = Object.entries(seen).map(([t, r]) => ({ t, ...r, rare: RARE.has(t), len: T[t] ? T[t][2] : 30 }));
  // Zeldzame eerst, dan de grootste
  types.sort((a, b) => (b.rare - a.rare) || (b.len - a.len));
  const eFs = 13 * u;
  parts.push(`<text x="${pad}" y="${n(pad + eFs)}" ${fontAttrs("mono400")} font-size="${n(eFs)}" letter-spacing="${n(eFs * 0.12)}" fill="${theme.muted}">VERZAMELBOEK ${year}${c.place ? " · " + esc(c.place.toUpperCase()) : ""}</text>`);
  parts.push(`<text x="${pad}" y="${n(pad + eFs + 40 * u)}" ${fontAttrs("sans600")} font-size="${n(34 * u)}" fill="${theme.ink}">${types.length} ${types.length === 1 ? "type" : "types"} gespot</text>`);
  const rareN = types.filter((x) => x.rare).length;
  if (rareN) parts.push(`<text x="${n(W - pad)}" y="${n(pad + eFs + 40 * u)}" text-anchor="end" ${fontAttrs("sans500")} font-size="${n(18 * u)}" fill="#8a3ffc">waarvan ${rareN} zeldzaam</text>`);

  // Raster met kaartjes: silhouet, model, datum van de eerste waarneming
  const top = pad + 80 * u, wishH = 92 * u, bottom = H - pad - wishH - 10 * u;
  const cols = 6, gap = 10 * u, cw = (W - pad * 2 - gap * (cols - 1)) / cols, ch = 92 * u;
  const rows = Math.max(1, Math.floor((bottom - top + gap) / (ch + gap)));
  const shown = types.slice(0, cols * rows - (types.length > cols * rows ? 1 : 0));
  const fmtDay = (d) => (d ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short" }).format(new Date(d + "T12:00:00")).replace(".", "") : "vandaag");
  shown.forEach((x, i) => {
    const bx = pad + (i % cols) * (cw + gap), by = top + Math.floor(i / cols) * (ch + gap);
    parts.push(`<rect x="${n(bx)}" y="${n(by)}" width="${n(cw)}" height="${n(ch)}" rx="${n(10 * u)}" fill="${theme.ink}" fill-opacity="0.05"${x.rare ? ` stroke="#8a3ffc" stroke-width="${n(2 * u)}"` : ""}/>`);
    const fake = { type: x.t, callsign: x.callsign || "", hex: "000000" };
    const sp = spec(fake);
    const box = { x: bx + 10 * u, y: by + 8 * u, w: cw - 20 * u, h: 42 * u };
    const k0 = 4, il0 = illustration(fake, sp, k0), k = k0 * Math.min(box.w / il0.w, box.h / il0.h), il = illustration(fake, sp, k);
    parts.push(`<svg x="${n(box.x + (box.w - il.w) / 2)}" y="${n(box.y + (box.h - il.h))}" width="${n(il.w)}" height="${n(il.h)}" viewBox="${il.viewBox}" overflow="visible">${il.inner}</svg>`);
    let m = x.model || sp.model;
    while (textW(m, "sans500", 12.5 * u) > cw - 14 * u && m.length > 4) m = m.slice(0, -2) + "…";
    parts.push(`<text x="${n(bx + cw / 2)}" y="${n(by + 68 * u)}" text-anchor="middle" ${fontAttrs("sans500")} font-size="${n(12.5 * u)}" fill="${theme.ink}">${esc(m)}</text>`);
    parts.push(`<text x="${n(bx + cw / 2)}" y="${n(by + 84 * u)}" text-anchor="middle" ${fontAttrs("mono400")} font-size="${n(10.5 * u)}" fill="${x.rare ? "#8a3ffc" : theme.muted}">${esc(fmtDay(x.first))}</text>`);
  });
  if (types.length > shown.length) {
    const i = shown.length, bx = pad + (i % cols) * (cw + gap), by = top + Math.floor(i / cols) * (ch + gap);
    parts.push(`<text x="${n(bx + cw / 2)}" y="${n(by + ch / 2 + 6 * u)}" text-anchor="middle" ${fontAttrs("sans600")} font-size="${n(18 * u)}" fill="${theme.muted}">+${types.length - shown.length}</text>`);
  }
  if (!types.length) parts.push(`<text x="${n(W / 2)}" y="${n((top + bottom) / 2)}" text-anchor="middle" ${fontAttrs("sans400")} font-size="${n(18 * u)}" fill="${theme.muted}">Nog niets gespot dit jaar. Elk nieuw type komt hier vanzelf bij.</text>`);

  // Onderaan: nog te spotten
  const wy = H - pad - wishH + 6 * u;
  parts.push(`<text x="${pad}" y="${n(wy + 12 * u)}" ${fontAttrs("mono400")} font-size="${n(12 * u)}" letter-spacing="${n(1.4 * u)}" fill="${theme.muted}">NOG TE SPOTTEN</text>`);
  let cx2 = pad, cy2 = wy + 24 * u;
  const cfs = 13 * u, chH = 26 * u;
  for (const [t, name] of WISH) {
    if (seen[t]) continue;
    const w = textW(name, "sans500", cfs) + 22 * u;
    if (cx2 + w > W - pad) { cx2 = pad; cy2 += chH + 7 * u; if (cy2 + chH > H - pad + 4 * u) break; }
    parts.push(`<rect x="${n(cx2)}" y="${n(cy2)}" width="${n(w)}" height="${n(chH)}" rx="${n(chH / 2)}" fill="none" stroke="${theme.ink}" stroke-opacity="0.35" stroke-dasharray="${n(4 * u)} ${n(3 * u)}"/>`);
    parts.push(`<text x="${n(cx2 + 11 * u)}" y="${n(cy2 + chH / 2 + cfs * 0.36)}" ${fontAttrs("sans500")} font-size="${n(cfs)}" fill="${theme.muted}">${esc(name)}</text>`);
    cx2 += w + 8 * u;
  }
  return { svg: closeSvg(c, parts), refresh: 60 };
}

/* ---------- Pagina: nieuwe software (vraag, bezig, mislukt) ---------- */
// De voortgangsbalk tijdens het installeren tekent het scherm zelf, op deze plek (zie firmware display_progress)
const PROGRESS = { x: 262, y: 392, w: 500, h: 14 };

async function pageUpdate(c) {
  const { W, H, u, theme, q } = c;
  const from = String(q._fw || "?"), to = String(q.naar || "").replace(/[^\w.\-]/g, "").slice(0, 20);
  const step = ["bezig", "mislukt"].includes(q.stap) ? q.stap : "vraag";
  const parts = openSvg(c);
  const cw = 620 * u, ch = 380 * u, cx = (W - cw) / 2, cy = (H - ch) / 2;
  parts.push(`<rect x="${n(cx)}" y="${n(cy)}" width="${n(cw)}" height="${n(ch)}" rx="${n(22 * u)}" fill="${c.night ? "#1b2232" : "#f4f1ea"}" filter="url(#sh)"/>`);
  const L = cx + 44 * u;
  const text = (t, y, font, size, fill, anchor = "start", x = L) => parts.push(`<text x="${n(x)}" y="${n(y)}" text-anchor="${anchor}" ${fontAttrs(font)} font-size="${n(size)}" fill="${fill}">${esc(t)}</text>`);
  text("NIEUWE SOFTWARE VOOR HET SCHERM", cy + 54 * u, "mono400", 13 * u, theme.muted);
  if (step === "vraag") {
    text(`Versie ${to} is klaar`, cy + 96 * u, "sans600", 32 * u, theme.ink);
    text(`Nu geïnstalleerd: ${from}`, cy + 124 * u, "sans400", 15 * u, theme.muted);
    const notes = notesBetween(from, to).slice(0, 4);
    notes.forEach((t, i) => {
      const y = cy + 168 * u + i * 30 * u;
      parts.push(`<circle cx="${n(L + 5 * u)}" cy="${n(y - 5 * u)}" r="${n(3.5 * u)}" fill="${theme.climb}"/>`);
      text(t, y, "sans400", 17 * u, theme.ink, "start", L + 20 * u);
    });
    // Knoppen
    const by = cy + ch - 92 * u, bh = 54 * u, gap = 16 * u, bw = (cw - 88 * u - gap) / 2;
    parts.push(`<rect x="${n(L)}" y="${n(by)}" width="${n(bw)}" height="${n(bh)}" rx="${n(bh / 2)}" fill="none" stroke="${theme.ink}" stroke-opacity="0.35" stroke-width="${n(1.5 * u)}"/>`);
    text("Later", by + bh / 2 + 7 * u, "sans500", 19 * u, theme.ink, "middle", L + bw / 2);
    parts.push(`<rect x="${n(L + bw + gap)}" y="${n(by)}" width="${n(bw)}" height="${n(bh)}" rx="${n(bh / 2)}" fill="${theme.ink}"/>`);
    text("Installeren", by + bh / 2 + 7 * u, "sans600", 19 * u, c.night ? "#0a1430" : "#f4f1ea", "middle", L + bw + gap + bw / 2);
    c.hs.push({ id: "@later", x: L - 10 * u, y: by - 10 * u, w: bw + 20 * u, h: bh + 20 * u });
    c.hs.push({ id: "@installeren", x: L + bw + gap - 10 * u, y: by - 10 * u, w: bw + 20 * u, h: bh + 20 * u });
    text("Installeren duurt ongeveer een minuut. Daarna start het scherm opnieuw.", cy + ch + 34 * u, "sans400", 14 * u, theme.muted, "middle", W / 2);
  } else if (step === "bezig") {
    text(`Versie ${to} installeren…`, cy + 96 * u, "sans600", 32 * u, theme.ink);
    text("Trek de stroom niet uit. Het scherm herstart vanzelf.", cy + 130 * u, "sans400", 17 * u, theme.muted);
    // Lege balk; het scherm vult ze
    parts.push(`<rect x="${n(PROGRESS.x * u)}" y="${n(PROGRESS.y * u)}" width="${n(PROGRESS.w * u)}" height="${n(PROGRESS.h * u)}" rx="${n((PROGRESS.h * u) / 2)}" fill="${theme.ink}" fill-opacity="0.12"/>`);
  } else {
    text("Installeren lukte niet", cy + 96 * u, "sans600", 32 * u, theme.ink);
    text(`Het scherm werkt gewoon verder met versie ${from}.`, cy + 130 * u, "sans400", 17 * u, theme.muted);
    text("Het probeert het later opnieuw.", cy + 156 * u, "sans400", 17 * u, theme.muted);
    c.hs.push({ id: "@terug", x: 0, y: 0, w: W, h: H });
    backHint(c, parts);
  }
  return { svg: closeSvg(c, parts), refresh: step === "vraag" ? 600 : 60 };
}

async function render(q) {
  const page = ["detail", "radar", "boek", "update"].includes(q.pagina) ? q.pagina : "overzicht";
  const hex = String(q.hex || "").toLowerCase().replace(/[^0-9a-f~]/g, "").slice(0, 8);
  const c = await context(q, { paintFor: page === "detail" ? (a) => a.hex === hex : page === "overzicht" ? null : () => false });
  const out = page === "update" ? await pageUpdate(c) : page === "detail" ? await pageDetail(c, hex) : page === "radar" ? await pageRadar(c) : page === "boek" ? await pageBook(c) : await pageOverview(c);
  // Aanraakzones voor het scherm: "id:x,y,w,h;..." (gehele pixels)
  const hs = c.hs.map((h) => `${h.id}:${Math.round(h.x)},${Math.round(h.y)},${Math.round(h.w)},${Math.round(h.h)}`).join(";");
  return { ...out, W: c.W, H: c.H, night: c.night, count: c.data.error ? 0 : c.list.length, error: !!c.data.error, hs, page };
}

export default async function handler(req, res) {
  try {
    const ua = String(req.headers?.["user-agent"] || "");
    const fw = /overhead-scherm\/([\w.\-]{1,20})/.exec(ua)?.[1];
    const q = { ...(req.query || {}), _fw: fw };
    const out = await render(q);
    const fmt = String(q.format || "png").toLowerCase();
    res.setHeader("X-Night", out.night ? "1" : "0");
    // 's Nachts staat het scherm gedimd: om het kwartier volstaat, dat spaart rekentijd en dataverkeer
    res.setHeader("X-Refresh", out.error ? "30" : out.page !== "overzicht" ? String(out.refresh) : out.night ? "900" : "60");
    res.setHeader("X-Page", out.page);
    if (out.hs) res.setHeader("X-Hotspots", out.hs);
    res.setHeader("X-Aircraft", String(out.count));
    // Helderheid van de verlichting (0-100); de firmware volgt die vanaf 1.0.3
    // Bij een bijzonder toestel overdag wat feller, zodat het opvalt
    res.setHeader("X-Brightness", out.night ? (out.alert ? "8" : "3") : out.alert ? "60" : "45");
    res.setHeader("Access-Control-Expose-Headers", "X-Night, X-Refresh, X-Aircraft, X-Brightness, X-Hotspots, X-Page");
    res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=40");
    res.setHeader("Vary", "User-Agent"); // het versienummer hangt af van wie het beeld vraagt
    if (fmt === "svg") {
      res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
      res.status(200).send(out.svg);
      return;
    }
    const rendered = new Resvg(out.svg, {
      font: { fontFiles: FONT_PATHS, loadSystemFonts: false, defaultFontFamily: "Geist" },
      fitTo: { mode: "original" },
    }).render();
    if (fmt === "rgb565" || fmt === "rgb565be") {
      // Ruwe pixels voor het scherm: 2 bytes per pixel, rij per rij
      const px = rendered.pixels, N = out.W * out.H, buf = Buffer.alloc(N * 2), be = fmt === "rgb565be";
      for (let i = 0; i < N; i++) {
        const v = ((px[i * 4] & 0xf8) << 8) | ((px[i * 4 + 1] & 0xfc) << 3) | (px[i * 4 + 2] >> 3);
        if (be) buf.writeUInt16BE(v, i * 2); else buf.writeUInt16LE(v, i * 2);
      }
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("X-Width", String(out.W));
      res.setHeader("X-Height", String(out.H));
      res.status(200).send(buf);
      return;
    }
    const png = rendered.asPng();
    if (fmt === "jpg" || fmt === "jpeg") {
      res.setHeader("Content-Type", "image/jpeg");
      let img = sharp(png);
      if (q._fw && !out.night) {
        // Kleurcurve voor het scherm (zie GAMMA): op de ruwe pixels
        const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let i = 0; i < data.length; i++) data[i] = LUT[data[i]];
        img = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
      }
      res.status(200).send(await img.jpeg({ quality: 88 }).toBuffer());
      return;
    }
    res.setHeader("Content-Type", "image/png");
    res.status(200).send(png);
  } catch (e) {
    console.error("frame", String(e && e.stack || e));
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ error: "Het beeld kon niet gemaakt worden." });
  }
}
