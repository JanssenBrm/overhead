// GET /api/frame?lat=51.2387&lon=5.1159&straal=40&plaats=Dessel&titel=...&w=1024&h=600&format=png
// Het volledige scherm als één beeld, voor een ESP32-scherm in een lijst (of om te bekijken via /frame).
//
// Parameters
//   lat, lon, straal (km), plaats, titel   zoals op de website
//   w, h                                    beeldgrootte in pixels (standaard 1024 × 600; staand: w=600&h=1024)
//   weergave = schilderij | illustratie     standaard schilderij (valt terug op illustratie zolang er geen is)
//   nacht    = auto | aan | uit             auto volgt zonsondergang en -opgang op de plek
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
import { getAircraft } from "../lib/adsb.js";
import { getWeather, condition, phase, skyColors } from "../lib/sky.js";
import { PREFIX, ensurePainting, paintingConfigured } from "../lib/painting.js";

/* ---------- Lettertypes: dezelfde Geist als op de website ---------- */
const FONT_FILES = {
  sans300: "Geist-Light.ttf", sans400: "Geist-Regular.ttf", sans500: "Geist-Medium.ttf", sans600: "Geist-SemiBold.ttf",
  mono400: "GeistMono-Regular.ttf", mono500: "GeistMono-Medium.ttf",
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

const THEMES = {
  day: { ink: "#111316", muted: "#6a717a", faint: "#9aa1a9", line: "#e7e9ec", climb: "#16884a", descend: "#c26a06", cruise: "#2f62c9", ground: "#6a717a", shadow: ["#111316", 0.13] },
  night: { ink: "#e3e6ea", muted: "#8a929b", faint: "#5b636c", line: "#23282e", climb: "#5fd08e", descend: "#f0a54a", cruise: "#7fa6ff", ground: "#8a929b", shadow: ["#000000", 0.45] },
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
const CUT_PREFIX = "paintings/cut-v1/"; // bewust buiten PREFIX, zodat de daglimiet niet meetelt
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
  const s = clamp(img.w / (260 * u), 0.85, 1.25) * u;
  const fs = 12.5 * s;
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

async function render(q) {
  const W = clamp(Math.round(Number(q.w) || 1024), 200, 2400);
  const H = clamp(Math.round(Number(q.h) || 600), 200, 2400);
  const lat = Number(q.lat ?? 51.2387), lon = Number(q.lon ?? 5.1159);
  const radius = clamp(Number(q.straal ?? q.radius) || 40, 5, 250);
  const place = String(q.plaats ?? (q.lat ? "" : "Dessel")).slice(0, 40);
  const title = String(q.titel || "Nu in de lucht").slice(0, 60);
  const view = q.weergave === "illustratie" ? "illustratie" : "schilderij";
  const u = Math.min(W, H) / 600;

  const [data, wx] = await Promise.all([getAircraft(lat, lon, radius).catch((e) => ({ error: e })), getWeather(lat, lon)]);
  const ph = phase(Date.now(), lat, lon);
  const night = q.nacht === "aan" || (q.nacht !== "uit" && ph === "nacht");
  const theme = night ? THEMES.night : THEMES.day;
  const cond = condition(wx?.code);
  const sky = night ? ["#0a1430", "#141d36"] : q.nacht === "uit" ? ["#ffffff", "#ffffff"] : skyColors(ph, cond);
  const tz = wx?.timezone || "Europe/Brussels";

  const list = (data.aircraft || []).map((a) => ({ ...a, sp: spec(a) }));

  // Schilderijen ophalen; ontbrekende op de achtergrond laten maken voor een volgend beeld
  if (view === "schilderij" && paintingConfigured()) {
    let started = 0;
    await Promise.all(list.map(async (a) => {
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

  // Volgorde: langste eerst, de rest afwisselend ervoor en erna zodat het geen lijst wordt
  list.sort((a, b) => b.sp.len - a.sp.len);
  const order = [];
  list.forEach((a, i) => (i % 2 ? order.push(a) : order.unshift(a)));
  if (list.length) { order.splice(order.indexOf(list[0]), 1); order.unshift(list[0]); }

  const pad = Math.round(26 * u);
  const headerH = 78 * u;
  const area = { x: pad, y: pad + headerH, w: W - pad * 2, h: H - pad * 2 - headerH };

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

  // Kop: plaats, straal en weer links; titel eronder; klok en datum rechts
  const now = new Date();
  const time = new Intl.DateTimeFormat("nl-BE", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(now);
  const date = new Intl.DateTimeFormat("nl-BE", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(now).replace(/\./g, "").toUpperCase();
  const eyebrow = `${place ? place.toUpperCase() + " · " : ""}${radius} KM`;
  const wxText = wx ? ` · ${Math.round(wx.temp)}° ${night && cond === "helder" ? "heldere nacht" : cond}` : "";
  const eFs = 12 * u, tFs = 34 * u, cFs = 52 * u;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>` +
    `<filter id="sh" x="-15%" y="-20%" width="130%" height="160%"><feDropShadow dx="0" dy="${n(5 * u)}" stdDeviation="${n(4.5 * u)}" flood-color="${theme.shadow[0]}" flood-opacity="${theme.shadow[1]}"/></filter></defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);
  parts.push(`<circle cx="${n(pad + 4 * u)}" cy="${n(pad + eFs * 0.62)}" r="${n(6.5 * u)}" fill="${theme.climb}" fill-opacity="0.18"/><circle cx="${n(pad + 4 * u)}" cy="${n(pad + eFs * 0.62)}" r="${n(3.5 * u)}" fill="${theme.climb}"/>`);
  parts.push(`<text x="${n(pad + 16 * u)}" y="${n(pad + eFs)}" ${fontAttrs("mono400")} font-size="${n(eFs)}" letter-spacing="${n(eFs * 0.12)}" fill="${theme.muted}">${esc(eyebrow)}<tspan letter-spacing="${n(eFs * 0.02)}">${esc(wxText)}</tspan></text>`);
  parts.push(`<text x="${pad}" y="${n(pad + eFs + 10 * u + tFs * 0.85)}" ${fontAttrs("sans600")} font-size="${n(tFs)}" letter-spacing="${n(-tFs * 0.025)}" fill="${theme.ink}">${esc(title)}</text>`);
  parts.push(`<text x="${W - pad}" y="${n(pad + cFs * 0.82)}" text-anchor="end" ${fontAttrs("sans300")} font-size="${n(cFs)}" letter-spacing="${n(-cFs * 0.04)}" fill="${theme.ink}">${time}</text>`);
  parts.push(`<text x="${W - pad}" y="${n(pad + cFs * 0.82 + 8 * u + eFs)}" text-anchor="end" ${fontAttrs("mono400")} font-size="${n(eFs)}" letter-spacing="${n(eFs * 0.08)}" fill="${theme.muted}">${esc(date)}</text>`);

  if (data.error) {
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
        x += it.w + best.gx;
      }
      y += r.imgH + r.capH + best.gy;
    }
  }
  parts.push(`</svg>`);
  return { svg: parts.join(""), W, H, night, count: data.error ? 0 : list.length, error: !!data.error };
}

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    const out = await render(q);
    const fmt = String(q.format || "png").toLowerCase();
    res.setHeader("X-Night", out.night ? "1" : "0");
    // 's Nachts staat het scherm gedimd: om het kwartier volstaat, dat spaart rekentijd en dataverkeer
    res.setHeader("X-Refresh", out.error ? "30" : out.night ? "900" : "60");
    res.setHeader("X-Aircraft", String(out.count));
    res.setHeader("Access-Control-Expose-Headers", "X-Night, X-Refresh, X-Aircraft");
    res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=40");
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
      res.status(200).send(await sharp(png).jpeg({ quality: 88 }).toBuffer());
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
