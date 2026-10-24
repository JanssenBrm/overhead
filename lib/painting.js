// Gedeelde schilderijlogica: één beeld per type + maatschappij, gemaakt met Cloudflare of Gemini, bewaard in Vercel Blob.
import { list, put } from "@vercel/blob";

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1";
const DAILY_LIMIT = Number(process.env.DAILY_PAINT_LIMIT || 30);
const STYLE =
  process.env.PAINT_STYLE ||
  "a detailed gouache painting in the manner of a 1960s airline travel poster, soft brush texture, gentle shading, a fine dark contour line around the whole aircraft";
export const PREFIX = "paintings/v1/";
// De opslag is privé: beelden gaan via /api/painting-img, die ze uit Blob leest
export const imgUrl = (key) => `/api/painting-img?key=${encodeURIComponent(key.slice(PREFIX.length, -4))}`;
const busy = new Map(); // sleutel -> lopende belofte, zodat één instantie niet twee keer hetzelfde schildert

const clean = (s, max) => String(s || "").replace(/[^\p{L}\p{N} .,&'()\-\/]/gu, "").slice(0, max).trim();

export async function existing(path) {
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

export const useCloudflare = () => !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);

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


export const paintingConfigured = () => !!((useCloudflare() || process.env.GEMINI_API_KEY) && process.env.BLOB_READ_WRITE_TOKEN);

// Maakt het schilderij als het nog niet bestaat. Geeft { url } of { limit: true } terug.
export function ensurePainting({ type, op, model, airline, mil }) {
  const key = `${PREFIX}${type}-${op || "GEN"}.png`;
  if (!busy.has(key)) {
    busy.set(key, (async () => {
      if (await existing(key)) return { url: imgUrl(key) };
      if ((await paintedToday()) >= DAILY_LIMIT) return { limit: true };
      const m = clean(model, 60) || type;
      const al = clean(airline, 60);
      const livery = mil
        ? "in a plain military grey finish"
        : al
        ? `in the colour scheme of ${al}, with its typical tail and fuselage colours`
        : "in a clean white livery with a neutral grey tail";
      const prompt =
        `A side-view illustration of a ${m} aircraft ${livery}, in flight, seen exactly from the side with the nose pointing to the right, ` +
        `the whole aircraft in frame with generous margin, landing gear retracted. Painted as ${STYLE}. ` +
        `Isolated on a completely plain pure white background: no sky, no clouds, no ground, no shadow, no frame, no border, ` +
        `no text, no lettering, no registration, no logos.`;
      const img = useCloudflare() ? await cloudflare(prompt) : await gemini(prompt);
      await put(key, img.buf, { access: "private", contentType: img.mime, addRandomSuffix: false, allowOverwrite: true });
      return { url: imgUrl(key) };
    })().finally(() => setTimeout(() => busy.delete(key), 1000)));
  }
  return busy.get(key);
}
