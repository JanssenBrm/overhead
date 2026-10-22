// GET /api/painting-img?key=A320-BEL -> het bewaarde schilderij uit de privé Blob-opslag
import { get } from "@vercel/blob";
import { Readable } from "node:stream";

export default async function handler(req, res) {
  const key = String(req.query?.key || "");
  if (!/^[A-Z0-9]{2,4}-[A-Z]{3}$/.test(key)) {
    res.status(400).end();
    return;
  }
  try {
    const r = await get(`paintings/v1/${key}.png`, { access: "private" });
    if (!r || r.statusCode !== 200) {
      res.setHeader("Cache-Control", "public, s-maxage=60");
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", r.blob.contentType || "image/png");
    // Een schilderij verandert nooit: browser en CDN mogen het lang bewaren
    res.setHeader("Cache-Control", "public, max-age=604800, s-maxage=31536000, immutable");
    Readable.fromWeb(r.stream).pipe(res);
  } catch (e) {
    console.error("painting-img", key, String(e));
    res.setHeader("Cache-Control", "no-store");
    res.status(502).end();
  }
}
