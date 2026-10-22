// GET /api/painting?type=A320&op=BEL&airline=Brussels%20Airlines&model=Airbus%20A320
// Eén schilderij per combinatie van type en maatschappij, één keer gemaakt en daarna bewaard in Vercel Blob.
// Bron: Cloudflare Workers AI (gratis) als CLOUDFLARE_ACCOUNT_ID en CLOUDFLARE_API_TOKEN bestaan, anders Gemini (GEMINI_API_KEY).
// Zonder bron of zonder BLOB_READ_WRITE_TOKEN antwoordt het met url: null.
import { list, put } from "@vercel/blob";

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1";
const DAILY_LIMIT = Number(process.env.DAILY_PAINT_LIMIT || 30);
const STYLE =
  process.env.PAINT_STYLE ||
  "a detailed gouache painting in the manner of a 1960s airline travel poster, soft brush texture, gentle shading, a fine dark contour line around the whole aircraft";
const PREFIX = "paintings/v1/";
// De opslag is privé: beelden gaan via /api/painting-img, die ze uit Blob leest
const imgUrl = (key) => `/api/painting-img?key=${encodeURIComponent(key.slice(PREFIX.length, -4))}`;
const busy = new Map(); // sleutel -> lopende belofte, zodat één instantie niet twee keer hetzelfde schildert

const clean = (s, max) => String(s || "").replace(/[^\p{L}\p{N} .,&'()\-\/]/gu, "").slice(0, max).trim();

async function existing(path) {
  const { blobs } = await list({ prefix: path, limit: 1 });
  return blobs.find((b) => b.pathname === path) || null;
}

async function paintedToday() {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  let n = 0, cursor;
  do {
    const r = await list({ prefix: PREFIX, limit: 1000, cursor });
    n += r.blobs.filter((b) => new Date(b.uploadedAt) >= start).length;
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return n;
}

// Gratis alternatief: Cloudflare Workers AI met FLUX.1 [schnell] (10.000 neurons per dag gratis)
async function cloudflare(prompt) {
  const acc = process.env.CLOUDFLARE_ACCOUNT_ID;
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: prompt.slice(0, 2000), steps: 6 }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.result?.image) throw new Error(`Cloudflare ${r.status}: ${j?.errors?.[0]?.message || "geen beeld"}`);
  return { buf: Buffer.from(j.result.image, "base64"), mime: "image/jpeg" };
}

const useCloudflare = () => !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);

async function gemini(prompt) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9", imageSize: "1K" } },
  });
  let last;
  for (const ver of ["v1", "v1beta"]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/${ver}/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" },
      body,
    });
    if (r.status === 404) { last = new Error(`Model ${MODEL} niet gevonden (${ver})`); continue; }
    const j = await r.json();
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${j?.error?.message || "onbekende fout"}`);
    const part = j?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
    const data = part?.inlineData || part?.inline_data;
    if (!data?.data) throw new Error("Gemini gaf geen beeld terug");
    return { buf: Buffer.from(data.data, "base64"), mime: data.mimeType || data.mime_type || "image/png" };
  }
  throw last;
}

export default async function handler(req, res) {
  const q = req.query || {};
  const type = String(q.type || "").toUpperCase();
  const op = String(q.op || "").toUpperCase();
  if (!/^[A-Z0-9]{2,4}$/.test(type) || (op && !/^[A-Z]{3}$/.test(op))) {
    res.status(400).json({ error: "Ongeldig type of maatschappij." });
    return;
  }
  if (!(useCloudflare() || process.env.GEMINI_API_KEY) || !process.env.BLOB_READ_WRITE_TOKEN) {
    res.setHeader("Cache-Control", "public, s-maxage=300");
    res.status(200).json({ url: null, reason: "not-configured" });
    return;
  }
  const key = `${PREFIX}${type}-${op || "GEN"}.png`;
  try {
    const hit = await existing(key);
    if (hit) {
      res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
      res.status(200).json({ url: imgUrl(key) });
      return;
    }
    if (!busy.has(key)) {
      busy.set(key, (async () => {
        if ((await paintedToday()) >= DAILY_LIMIT) return { limit: true };
        const model = clean(q.model, 60) || type;
        const airline = clean(q.airline, 60);
        const military = q.mil === "1";
        const livery = military
          ? "in a plain military grey finish"
          : airline
          ? `in the colour scheme of ${airline}, with its typical tail and fuselage colours`
          : "in a clean white livery with a neutral grey tail";
        const prompt =
          `A side-view illustration of a ${model} aircraft ${livery}, in flight, seen exactly from the side with the nose pointing to the right, ` +
          `the whole aircraft in frame with generous margin, landing gear retracted. Painted as ${STYLE}. ` +
          `Isolated on a completely plain pure white background: no sky, no clouds, no ground, no shadow, no frame, no border, ` +
          `no text, no lettering, no registration, no logos.`;
        const img = useCloudflare() ? await cloudflare(prompt) : await gemini(prompt);
        await put(key, img.buf, { access: "private", contentType: img.mime, addRandomSuffix: false, allowOverwrite: true });
        return { url: imgUrl(key) };
      })().finally(() => setTimeout(() => busy.delete(key), 1000)));
    }
    const out = await busy.get(key);
    if (out.limit) {
      res.setHeader("Cache-Control", "public, s-maxage=600");
      res.status(200).json({ url: null, reason: "limit" });
      return;
    }
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json({ url: out.url });
  } catch (e) {
    console.error("painting", key, String(e));
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ url: null, reason: "error", error: String(e.message || e) });
  }
}
