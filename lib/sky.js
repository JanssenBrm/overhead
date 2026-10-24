// Gedeelde hemel-logica: weer (Open-Meteo), zonsopgang en -ondergang, dagdeel en achtergrondkleuren.
const cache = new Map(); // "lat,lon" -> { at, value }

export async function getWeather(lat, lon) {
  const k = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit.value;
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code,cloud_cover,is_day&timezone=auto`
    );
    const j = await r.json();
    if (!r.ok || !j.current) throw new Error("geen weer");
    const value = { temp: j.current.temperature_2m, code: j.current.weather_code, cloud: j.current.cloud_cover, timezone: j.timezone || "Europe/Brussels" };
    cache.set(k, { at: Date.now(), value });
    return value;
  } catch (e) {
    return hit?.value || null;
  }
}

// lon = westerlengte, positief naar het westen (dus -lon doorgeven voor oosterlengte)
export function sunTimes(date, lat, lon) {
  const r = Math.PI / 180, J = date.getTime() / 86400000 + 2440587.5;
  const n = Math.round(J - 2451545.0009 - lon / 360), Js = 2451545.0009 + lon / 360 + n;
  const M = (357.5291 + 0.98560028 * (Js - 2451545)) % 360;
  const C = 1.9148 * Math.sin(M * r) + 0.02 * Math.sin(2 * M * r) + 0.0003 * Math.sin(3 * M * r);
  const L = (M + C + 180 + 102.9372) % 360;
  const Jt = Js + 0.0053 * Math.sin(M * r) - 0.0069 * Math.sin(2 * L * r);
  const dec = Math.asin(Math.sin(L * r) * Math.sin(23.44 * r));
  const cosw = (Math.sin(-0.833 * r) - Math.sin(lat * r) * Math.sin(dec)) / (Math.cos(lat * r) * Math.cos(dec));
  if (cosw > 1) return { polar: "night" };
  if (cosw < -1) return { polar: "day" };
  const w = Math.acos(cosw) / r / 360, toDate = (j) => new Date((j - 2440587.5) * 86400000);
  return { rise: toDate(Jt - w), set: toDate(Jt + w) };
}

export function condition(code) {
  if (code == null || code === 0) return "helder";
  if (code <= 2) return "wolkjes";
  if (code === 3) return "bewolkt";
  if (code <= 48) return "mist";
  if (code <= 67 || (code >= 80 && code <= 82)) return "regen";
  if (code <= 77 || code === 85 || code === 86) return "sneeuw";
  return "onweer";
}

export const SKY = {
  ochtendgloren: ["#fbe1cc", "#fdf7f1"], dag: ["#d9eaf9", "#f8fbfe"], schemering: ["#f4cfc4", "#eee4f2"],
  wolkjes: ["#e1ebf4", "#f8fafc"], bewolkt: ["#e4e7ea", "#f7f8f9"], mist: ["#ebebe8", "#f6f6f4"],
  regen: ["#d6dce2", "#eef1f3"], sneeuw: ["#eef2f6", "#ffffff"], onweer: ["#c9cfd7", "#e6e9ec"],
};

// Dagdeel op de plek; "noon" in UTC rond de lokale middag is ruim voldoende nauwkeurig voor de zonsberekening.
export function phase(now, lat, lon) {
  const noon = new Date(now); noon.setUTCHours(12 - Math.round(lon / 15), 0, 0, 0);
  const s = sunTimes(noon, lat, -lon);
  const m = 60e3;
  if (s.polar) return s.polar === "night" ? "nacht" : "dag";
  if (now < s.rise.getTime() - 30 * m || now > s.set.getTime() + 30 * m) return "nacht";
  if (now < s.rise.getTime() + 60 * m) return "ochtendgloren";
  if (now > s.set.getTime() - 60 * m) return "schemering";
  return "dag";
}

export function skyColors(ph, cond) {
  if (ph === "nacht") return null;
  return (ph === "dag" ? SKY[cond === "helder" ? "dag" : cond] : SKY[["regen", "onweer", "bewolkt"].includes(cond) ? cond : ph]) || SKY.dag;
}
