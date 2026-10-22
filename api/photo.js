// GET /api/photo?hex=4bb279  -> foto van dit toestel via planespotters.net
// Reserve voor als de browser planespotters niet rechtstreeks kan bereiken. De CDN bewaart het antwoord een dag.
const UA = "overhead-dashboard (github.com/JanssenBrm/overhead)";

export default async function handler(req, res) {
  const hex = String(req.query?.hex || "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) {
    res.status(400).json({ error: "Ongeldige hexcode." });
    return;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`https://api.planespotters.net/pub/photos/hex/${hex}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (r.status === 403 || r.status === 429) { await new Promise((ok) => setTimeout(ok, 700)); continue; }
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const ph = j?.photos?.[0];
      const big = ph && (ph.thumbnail_large || ph.thumbnail);
      const photo = big?.src ? { src: big.src, by: ph.photographer || null, link: ph.link || null } : null;
      res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
      res.status(200).json({ photo });
      return;
    } catch (e) {
      console.error("planespotters", hex, String(e));
      break;
    }
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(503).json({ photo: null, error: "planespotters antwoordt nu niet" });
}
