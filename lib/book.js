// Verzamelboek: welke types zijn dit jaar al boven deze plek gezien?
// Bewaard in Vercel Blob, één JSON per plek. Er wordt alleen geschreven als er een nieuw type bijkomt
// (een paar keer per dag in het begin, daarna zelden), zodat het gratis plan ruim volstaat.
import { get, put } from "@vercel/blob";
import { waitUntil } from "@vercel/functions";

const mem = new Map(); // sleutel -> { at, data, dirty, writing }
const keyFor = (lat, lon) => `boek/v1/${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}.json`;
const blobOn = () => !!process.env.BLOB_READ_WRITE_TOKEN;

async function readJson(path) {
  if (!blobOn()) return null;
  try {
    const r = await get(path, { access: "private" });
    if (!r || r.statusCode !== 200) return null;
    return JSON.parse(await new Response(r.stream).text());
  } catch (e) {
    return null;
  }
}

// Een leeg boek: per jaar een lijst types met de datum en het toestel van de eerste waarneming
const empty = () => ({ v: 1, years: {} });

export async function loadBook(lat, lon) {
  const key = keyFor(lat, lon);
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < 30 * 60e3) return hit;
  const data = (await readJson(key)) || hit?.data || empty();
  // Wat deze instantie al zag maar nog niet bewaard is, niet kwijtspelen
  if (hit?.dirty) merge(data, hit.data);
  const entry = { at: Date.now(), data, dirty: hit?.dirty || false, writing: false };
  mem.set(key, entry);
  return entry;
}

function merge(into, from) {
  for (const [y, types] of Object.entries(from.years || {})) {
    into.years[y] ||= {};
    for (const [t, rec] of Object.entries(types)) if (!into.years[y][t]) into.years[y][t] = rec;
  }
}

// Toestellen van het huidige beeld toevoegen. tz bepaalt de datum.
export async function recordSightings(lat, lon, list, tz) {
  const entry = await loadBook(lat, lon);
  const now = new Date();
  const year = new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone: tz }).format(now);
  const day = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz }).format(now);
  const types = (entry.data.years[year] ||= {});
  let added = 0;
  for (const a of list) {
    if (!a.type || !a.sp?.known || types[a.type]) continue;
    types[a.type] = { first: day, model: a.sp.model, callsign: a.callsign || null, airline: a.airline || a.operator || null };
    added++;
  }
  if (added) {
    entry.dirty = true;
    save(lat, lon, entry);
  }
  return entry.data.years[year];
}

function save(lat, lon, entry) {
  if (!blobOn() || entry.writing) return;
  entry.writing = true;
  const key = keyFor(lat, lon);
  waitUntil((async () => {
    try {
      // Eerst samenvoegen met wat een andere instantie intussen bewaarde
      const remote = await readJson(key);
      if (remote) merge(entry.data, remote);
      await put(key, JSON.stringify(entry.data), { access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
      entry.dirty = false;
    } catch (e) {
      console.error("boek bewaren", String(e));
    } finally {
      entry.writing = false;
    }
  })());
}

// Types die de moeite zijn om op te jagen boven de Kempen (een selectie, niet volledig)
export const WISH = [
  ["A388", "Airbus A380"], ["B748", "Boeing 747-8"], ["B744", "Boeing 747-400"], ["A3ST", "Airbus Beluga"],
  ["A124", "Antonov An-124"], ["C17", "Boeing C-17"], ["A400", "Airbus A400M"], ["C30J", "Lockheed C-130J"],
  ["E3TF", "Boeing E-3 AWACS"], ["B77W", "Boeing 777-300ER"], ["A359", "Airbus A350-900"], ["B789", "Boeing 787-9"],
  ["A339", "Airbus A330neo"], ["MD11", "McDonnell Douglas MD-11"], ["B763", "Boeing 767-300"], ["BCS3", "Airbus A220-300"],
];
