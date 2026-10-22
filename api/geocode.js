// GET /api/geocode?q=Mol  -> plaatsen met coördinaten (Open-Meteo geocoding)
export default async function handler(req, res) {
  const q = String(req.query?.q || "").trim();
  if (q.length < 2) {
    res.status(400).json({ error: "Typ minstens twee letters." });
    return;
  }
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=nl&format=json`
    );
    const j = await r.json();
    const results = (j.results || []).map((p) => ({
      name: p.name,
      region: [p.admin2, p.admin1, p.country].filter(Boolean).join(", "),
      lat: p.latitude,
      lon: p.longitude,
    }));
    res.setHeader("Cache-Control", "public, s-maxage=86400");
    res.status(200).json({ results });
  } catch (e) {
    res.status(502).json({ error: "Zoeken lukt nu niet. Vul de coördinaten zelf in." });
  }
}
