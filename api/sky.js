// GET /api/sky?lat=51.24&lon=5.12 -> het weer van nu op die plek (Open-Meteo, geen sleutel nodig)
export default async function handler(req, res) {
  const lat = Number(req.query?.lat), lon = Number(req.query?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: "Geef een geldige lat en lon op." });
    return;
  }
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code,cloud_cover,is_day&timezone=auto`
    );
    const j = await r.json();
    if (!r.ok || !j.current) throw new Error("geen weer");
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json({
      temp: j.current.temperature_2m,
      code: j.current.weather_code,
      cloud: j.current.cloud_cover,
      isDay: j.current.is_day === 1,
    });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Het weer is nu niet beschikbaar." });
  }
}
