// GET /api/status -> welke onderdelen zijn ingesteld (alleen ja/nee, nooit waarden)
export default function handler(req, res) {
  const e = process.env;
  const cloudflare = !!(e.CLOUDFLARE_ACCOUNT_ID && e.CLOUDFLARE_API_TOKEN);
  const gemini = !!e.GEMINI_API_KEY;
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    opslag: !!e.BLOB_READ_WRITE_TOKEN,
    beeldbron: cloudflare ? "cloudflare" : gemini ? "gemini" : "geen",
    schilderijen: !!e.BLOB_READ_WRITE_TOKEN && (cloudflare || gemini),
  });
}
