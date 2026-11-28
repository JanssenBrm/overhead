// Wat er nieuw is per versie van de software op het scherm. Het scherm toont dit bij de vraag om te updaten.
// Nieuwste bovenaan. Hou het kort: twee à drie regels per versie.
export const CHANGELOG = [
  { v: "1.2.2", notes: ["Het scherm komt na het insteken van de stroom betrouwbaarder op"] },
  { v: "1.2.1", notes: ["Tikken op toestellen, titel en klok werkt", "Het scherm dimt 's nachts zoals bedoeld"] },
  { v: "1.2.0", notes: ["Nieuwe versies worden eerst gevraagd op het scherm", "Voortgangsbalk tijdens het installeren"] },
  { v: "1.1.0", notes: ["Tik op een vliegtuig voor de detailkaart", "Tik op de titel voor het verzamelboek, op de klok voor de radar"] },
  { v: "1.0.4", notes: ["Helderheid bijregelen door op het scherm te tikken"] },
  { v: "1.0.3", notes: ["De helderheid volgt de server"] },
  { v: "1.0.2", notes: ["De wifi komt na een herstart altijd terug"] },
];

const cmp = (a, b) => {
  const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};

// Alle notities tussen de huidige versie (exclusief) en de nieuwe (inclusief)
export function notesBetween(from, to) {
  return CHANGELOG.filter((e) => cmp(e.v, from) > 0 && cmp(e.v, to) <= 0).flatMap((e) => e.notes);
}
