// GET /api/painting?type=A320&op=BEL&airline=Brussels%20Airlines&model=Airbus%20A320
// Eén schilderij per combinatie van type en maatschappij, één keer gemaakt en daarna bewaard in Vercel Blob.
// Bron: Cloudflare Workers AI (gratis) als CLOUDFLARE_ACCOUNT_ID en CLOUDFLARE_API_TOKEN bestaan, anders Gemini (GEMINI_API_KEY).
// Zonder bron of zonder BLOB_READ_WRITE_TOKEN antwoordt het met url: null.
import { PREFIX, imgUrl, existing, ensurePainting, paintingConfigured } from "../lib/painting.js";

export default async function handler(req, res) {
  const q = req.query || {};
  const type = String(q.type || "").toUpperCase();
  const op = String(q.op || "").toUpperCase();
  if (!/^[A-Z0-9]{2,4}$/.test(type) || (op && !/^[A-Z]{3}$/.test(op))) {
    res.status(400).json({ error: "Ongeldig type of maatschappij." });
    return;
  }
  if (!paintingConfigured()) {
    res.setHeader("Cache-Control", "public, s-maxage=300");
    res.status(200).json({ url: null, reason: "not-configured" });
    return;
  }
  const key = `${PREFIX}${type}-${op || "GEN"}.png`;
  try {
    if (await existing(key)) {
      res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
      res.status(200).json({ url: imgUrl(key) });
      return;
    }
    const out = await ensurePainting({ type, op, model: q.model, airline: q.airline, mil: q.mil === "1" });
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
