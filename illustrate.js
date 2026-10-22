// Overhead: vectorillustraties van vliegtuigen in zijaanzicht (neus naar rechts).
// Alles in meters; de aanroeper kiest de schaal in pixels per meter.
// Liveries gebruiken alleen kleuren van de maatschappij, nooit logo's of namen.
(function () {
  "use strict";

  // Kleuren per ICAO-roepnaamprefix. tail = kielvlak, belly = onderkant, top = bovenkant,
  // stripe = sierlijn, engine = motoren, body = rompkleur (standaard wit)
  const LIVERY = {
    BEL: { tail: "#0b2350", engine: "#0b2350", stripe: "#d71e28" },               // Brussels Airlines
    KLM: { tail: "#00a1de", top: "#00a1de", engine: "#d7dde2" },                  // KLM
    KLC: { tail: "#00a1de", top: "#00a1de" },
    TRA: { tail: "#00d26a", engine: "#00d26a", stripe: "#00d26a" },               // Transavia
    TVF: { tail: "#00d26a", engine: "#00d26a", stripe: "#00d26a" },
    RYR: { tail: "#073590", belly: "#073590", engine: "#073590", stripe: "#f1c933" }, // Ryanair
    RUK: { tail: "#073590", belly: "#073590", engine: "#073590", stripe: "#f1c933" },
    DLH: { tail: "#05164d", engine: "#05164d", stripe: "#f9ba00" },               // Lufthansa
    EWG: { tail: "#a5027d", engine: "#a5027d" },                                  // Eurowings
    EZY: { tail: "#ff6600", engine: "#ff6600" }, EJU: { tail: "#ff6600", engine: "#ff6600" }, EZS: { tail: "#ff6600", engine: "#ff6600" },
    THY: { tail: "#c8102e", engine: "#d9d9d9", stripe: "#c8102e" },               // Turkish
    PGT: { tail: "#fcb316", engine: "#fcb316", stripe: "#e30613" },               // Pegasus
    BAW: { tail: "#1b2a5b", belly: "#1b2a5b", stripe: "#c8102e", engine: "#9aa3ad" }, // British Airways
    AFR: { tail: "#ffffff", tailStripes: ["#002157", "#ed1c24"] },                // Air France
    UAE: { tail: "#d71a21", stripe: "#d71a21", engine: "#d7dde2" },               // Emirates
    QTR: { tail: "#5c0632", body: "#eceef0", engine: "#5c0632" },                 // Qatar
    ETD: { tail: "#bd8b13", body: "#efe8dc" },                                    // Etihad
    SWR: { tail: "#e2001a", engine: "#d7dde2" }, EDW: { tail: "#e2001a" },        // Swiss
    AUA: { tail: "#e2001a", belly: "#e2001a" },                                   // Austrian
    WZZ: { tail: "#c6007e", belly: "#26235c", engine: "#c6007e" }, WMT: { tail: "#c6007e", belly: "#26235c", engine: "#c6007e" },
    TAY: { tail: "#1d4f91", engine: "#1d4f91" },                                  // ASL Belgium
    DHK: { body: "#ffcc00", tail: "#ffcc00", stripe: "#d40511", engine: "#ffcc00" }, // DHL
    BCS: { body: "#ffcc00", tail: "#ffcc00", stripe: "#d40511", engine: "#ffcc00" },
    DHL: { body: "#ffcc00", tail: "#ffcc00", stripe: "#d40511", engine: "#ffcc00" },
    FDX: { tail: "#4d148c", top: "#4d148c", engine: "#9aa3ad", stripe: "#ff6600" }, // FedEx
    UPS: { tail: "#351c15", top: "#351c15", engine: "#351c15", stripe: "#ffb500" },
    SAS: { tail: "#000a5e", engine: "#000a5e" },
    VLG: { tail: "#fecb00", engine: "#585858", belly: "#585858" },                // Vueling
    IBE: { tail: "#d7192d", stripe: "#ffcc00" }, IBS: { tail: "#d7192d", stripe: "#ffcc00" },
    TAP: { tail: "#d8232a", stripe: "#00a14b" },
    LOT: { tail: "#11397e", engine: "#11397e" },
    SIA: { tail: "#002855", stripe: "#f99f1c" },
    JAF: { tail: "#70cbf4", engine: "#70cbf4", stripe: "#d40e14" }, TUI: { tail: "#70cbf4", engine: "#70cbf4", stripe: "#d40e14" }, TOM: { tail: "#70cbf4", engine: "#70cbf4", stripe: "#d40e14" }, TFL: { tail: "#70cbf4", engine: "#70cbf4", stripe: "#d40e14" },
    EIN: { tail: "#007a53", engine: "#007a53", stripe: "#79c3a8" },               // Aer Lingus
    EXS: { tail: "#e4002b", engine: "#e4002b" },                                  // Jet2
    NOZ: { tail: "#d81939", engine: "#d81939" }, NSZ: { tail: "#d81939", engine: "#d81939" },
    AEE: { tail: "#0c2e7a", stripe: "#58a8de" },
    ICE: { tail: "#002e6d", stripe: "#f2b81c" },
    CFG: { tail: "#fcd501", engine: "#fcd501" },
    AEA: { tail: "#0f5aa9", stripe: "#0f5aa9" },
    ELY: { tail: "#0b2c66", stripe: "#0b2c66" },
    CPA: { tail: "#006564", engine: "#d7dde2" },
    DAL: { tail: "#003268", belly: "#003268", stripe: "#c01933" },
    UAL: { tail: "#002244", belly: "#4a6b9c", engine: "#002244" },
    AAL: { tail: "#b1b9c0", stripe: "#0078d2", body: "#e6e9ec" },
    ACA: { tail: "#111111", belly: "#111111" },
    CLX: { tail: "#16325c", engine: "#16325c" },                                  // Cargolux
    GTI: { tail: "#00205b", engine: "#00205b" },
    BTI: { tail: "#3d8f2f", stripe: "#3d8f2f" },                                  // airBaltic
    SXS: { tail: "#d8232a", stripe: "#f6b31c" },
    ABR: { tail: "#4b9cd3" },
  };
  const MIL = /^(BAF|NAF|GAF|RCH|RRR|ASCOT|CTM|FAF|IAM|PLF|HKY|MMF|LAGR|DUKE|GRZLY|OMEGA|NATO|NCHO|CFC|SHF|SPAR)/;
  const GREY = { body: "#a6adb3", tail: "#a6adb3", engine: "#8f979e", mil: true };

  function livery(a, sp) {
    const cs = (a.callsign || "").toUpperCase();
    if (sp.shape === "fighter" || MIL.test(cs) || /^(A400|C130|C30J|C17|K35R|NH90|H47|AS3B|H64)$/.test(a.type || "")) return GREY;
    const key = cs.slice(0, 3);
    if (/^[A-Z]{3}/.test(key) && LIVERY[key]) return LIVERY[key];
    if (sp.shape === "ga") return { tail: "#ffffff", stripe: ["#1f4e8c", "#b5242c", "#2f6b3a"][hash(a.hex) % 3] };
    if (sp.shape === "heli") return { body: ["#c8102e", "#1f4e8c", "#f2f2f2", "#202020"][hash(a.hex) % 4], tail: null };
    return { tail: "#8e9aa5", engine: "#c9d0d6" }; // onbekende maatschappij: neutraal
  }
  function hash(s) { let h = 0; for (const c of String(s || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

  const OUT = "#3d3d3a";        // contourlijn
  const UNDER = "#c9ccd0";      // onderkant vleugel
  const DARK = "#2b3138";       // cockpitramen, banden
  const WIN = "#4b5560";        // passagiersramen

  const n = (v) => (Math.round(v * 100) / 100).toString();
  const poly = (pts, fill, extra = "") => `<path d="M${pts.map((p) => n(p[0]) + " " + n(p[1])).join(" L")}Z" fill="${fill}" ${extra}/>`;
  const line = `stroke="${OUT}" stroke-width="0.9" vector-effect="non-scaling-stroke" stroke-linejoin="round"`;

  let uid = 0;

  function draw(a, sp, k) {
    const L = sp.len, id = "c" + (++uid);
    const lv = livery(a, sp);
    const body = lv.body || "#f7f7f5";
    const gearDown = a.onGround || (a.alt != null && a.alt < 3000);
    let parts = [], minX = 0, maxX = L, minY = 0, maxY = 0;
    const box = (x0, y0, x1, y1) => { minX = Math.min(minX, x0); maxX = Math.max(maxX, x1); minY = Math.min(minY, y0); maxY = Math.max(maxY, y1); };

    if (sp.shape === "heli") return heli(a, sp, k, lv, gearDown);

    const wide = sp.span > 45;
    const isGA = sp.shape === "ga";
    const D = L * (isGA ? 0.16 : sp.shape === "fighter" ? 0.085 : /A388/.test(a.type) ? 0.118 : wide ? 0.095 : 0.105);
    const r = D / 2;
    const tTail = sp.shape === "tail" || sp.shape === "prop" || sp.shape === "prop4" || /^(B712|E1|E2|CRJ|GLF|CL|F9|FA|C25|C56|C68|C700|E5|LJ|PC24|C30J|C130|A400|C17)/.test(a.type || "");
    const highWing = sp.shape === "prop" || sp.shape === "prop4" || (isGA && /^(C1|C2|PC6|C208|PC12)/.test(a.type || ""));
    const tailCol = lv.tail === undefined ? "#8e9aa5" : (lv.tail || body);

    // romp
    const cone = isGA ? 0.3 : 0.2;
    const fus = [
      `M${n(L * cone)} ${n(-r)}`,
      `L${n(L * 0.86)} ${n(-r)}`,
      sp.shape === "fighter"
        ? `L${n(L)} ${n(r * 0.1)} L${n(L * 0.86)} ${n(r)}`
        : `C${n(L * 0.95)} ${n(-r)} ${n(L)} ${n(-r * 0.35)} ${n(L)} ${n(r * 0.1)} C${n(L)} ${n(r * 0.7)} ${n(L * 0.95)} ${n(r)} ${n(L * 0.86)} ${n(r)}`,
      `L${n(L * (cone + 0.12))} ${n(r)}`,
      `C${n(L * cone)} ${n(r)} ${n(L * 0.06)} ${n(r * 0.1)} 0 ${n(-r * 0.45)}`,
      `L0 ${n(-r * 0.8)}`,
      `C${n(L * 0.06)} ${n(-r * 0.95)} ${n(L * 0.12)} ${n(-r)} ${n(L * cone)} ${n(-r)}Z`,
    ].join(" ");
    box(0, -r, L, r);

    // kielvlak
    const fh = D * (isGA ? 1.5 : sp.shape === "fighter" ? 1.9 : tTail ? 2.1 : wide ? 1.7 : 1.9);
    const fin = [[L * 0.22, -r * 0.95], [L * 0.085, -r - fh], [L * 0.025, -r - fh], [L * 0.005, -r * 0.7]];
    box(0, -r - fh, L, 0);

    // vleugel (dichtstbijzijnde, naar de kijker toe)
    const wingRootY = highWing ? -r * 0.95 : r * 0.5;
    let wing;
    if (sp.shape === "fighter") wing = [[L * 0.62, r * 0.2], [L * 0.2, r * 0.35], [L * 0.16, r * 0.6 + D * 0.5], [L * 0.32, r * 0.6 + D * 0.5]];
    else if (highWing) wing = [[L * 0.58, -r], [L * 0.44, -r * 0.95], [L * 0.43, -r * 1.25], [L * 0.585, -r * 1.25]];
    else {
      const drop = D * (wide ? 0.85 : 0.75), sweepBack = L * (isGA ? 0.02 : 0.2);
      wing = [[L * (isGA ? 0.66 : 0.6), wingRootY], [L * (isGA ? 0.5 : 0.42), wingRootY + r * 0.15], [L * (isGA ? 0.5 : 0.42) - sweepBack * 0.55, wingRootY + drop], [L * (isGA ? 0.6 : 0.6) - sweepBack, wingRootY + drop]];
      box(0, 0, L, wingRootY + drop);
    }

    // achtergrond: verre motor, verre vleugeltip

    // landingsgestel achter de romp
    if (gearDown && !isGA) {
      const gx = L * 0.47, gy = r + D * 0.75, w = D * 0.22;
      parts.push(`<rect x="${n(gx - D * 0.04)}" y="${n(r * 0.6)}" width="${n(D * 0.08)}" height="${n(gy - r * 0.6)}" fill="${DARK}"/>`);
      parts.push(`<circle cx="${n(gx)}" cy="${n(gy)}" r="${n(w)}" fill="${DARK}"/><circle cx="${n(gx + w * 2.1)}" cy="${n(gy)}" r="${n(w)}" fill="${DARK}"/>`);
      const nx = L * 0.88;
      parts.push(`<rect x="${n(nx - D * 0.03)}" y="${n(r * 0.6)}" width="${n(D * 0.06)}" height="${n(gy - r * 0.6)}" fill="${DARK}"/><circle cx="${n(nx)}" cy="${n(gy)}" r="${n(w * 0.8)}" fill="${DARK}"/>`);
      box(0, 0, L, gy + w);
    }

    // hoogteroer (laag) achter de romp

    // kielvlak
    parts.push(poly(fin, tailCol, line));
    if (lv.tailStripes) lv.tailStripes.forEach((c, i) => parts.push(poly([[L * (0.12 - i * 0.025), -r - fh * 0.15], [L * (0.07 - i * 0.025), -r - fh * 0.85], [L * (0.055 - i * 0.025), -r - fh * 0.85], [L * (0.105 - i * 0.025), -r - fh * 0.15]], c)));
    if (tTail) {
      parts.push(poly([[L * 0.14, -r - fh * 0.97], [L * 0.03, -r - fh * 1.05], [L * -0.01, -r - fh * 1.02], [L * 0.03, -r - fh * 0.92]], tailCol === body ? UNDER : tailCol, line));
      box(L * -0.01, -r - fh * 1.05, L, 0);
    }

    // romp met livery
    parts.push(`<clipPath id="${id}"><path d="${fus}"/></clipPath>`);
    parts.push(`<path d="${fus}" fill="${body}"/>`);
    parts.push(`<g clip-path="url(#${id})">`);
    if (lv.top) parts.push(`<rect x="0" y="${n(-r)}" width="${n(L)}" height="${n(r * 0.75)}" fill="${lv.top}"/>`);
    if (lv.belly) parts.push(`<rect x="0" y="${n(r * 0.35)}" width="${n(L)}" height="${n(r)}" fill="${lv.belly}"/>`);
    if (lv.stripe) parts.push(`<rect x="0" y="${n(r * 0.12)}" width="${n(L)}" height="${n(r * 0.12)}" fill="${lv.stripe}"/>`);
    // staartkegel in staartkleur, zoals veel liveries
    if (lv.tail && lv.tail !== "#ffffff" && !lv.mil && !isGA) parts.push(`<path d="M0 ${n(-r)} L${n(L * 0.12)} ${n(-r)} L${n(L * 0.05)} ${n(r)} L0 ${n(r)}Z" fill="${lv.tail}"/>`);
    parts.push(`</g>`);
    parts.push(`<path d="${fus}" fill="none" ${line}/>`);
    // hoogteroer op de staartkegel
    if (!tTail) parts.push(poly([[L * 0.17, -r * 0.05], [L * 0.07, -r * 0.05], [L * 0.015, r * 0.3], [L * 0.05, r * 0.32]], UNDER, line));

    // ramen
    if (sp.shape === "fighter") {
      parts.push(`<path d="M${n(L * 0.7)} ${n(-r)} C${n(L * 0.74)} ${n(-r * 2.1)} ${n(L * 0.84)} ${n(-r * 1.9)} ${n(L * 0.87)} ${n(-r)}Z" fill="#3c4a57" ${line}/>`);
    } else if (isGA) {
      parts.push(poly([[L * 0.62, -r * 0.8], [L * 0.76, -r * 0.8], [L * 0.8, -r * 0.1], [L * 0.62, -r * 0.1]], "#5b6875", line));
      parts.push(poly([[L * 0.46, -r * 0.75], [L * 0.6, -r * 0.75], [L * 0.6, -r * 0.1], [L * 0.48, -r * 0.1]], "#5b6875", line));
    } else {
      const wr = Math.max(0.12, D * 0.045), step = Math.max(0.5, D * 0.21);
      let w = "";
      for (let x = L * (cone + 0.04); x < L * 0.84; x += step) {
        const nearDoor = Math.abs(x - L * 0.83) < D * 0.25 || Math.abs(x - L * (cone + 0.04)) < D * 0.2;
        if (!nearDoor) w += `<circle cx="${n(x)}" cy="${n(-r * 0.32)}" r="${n(wr)}"/>`;
      }
      if (/A388|B74/.test(a.type || "")) for (let x = L * 0.35; x < L * 0.78; x += step) w += `<circle cx="${n(x)}" cy="${n(-r * 0.72)}" r="${n(wr)}"/>`;
      parts.push(`<g fill="${WIN}">${w}</g>`);
      // deuren
      [0.83, cone + 0.03].forEach((f) => parts.push(`<rect x="${n(L * f - D * 0.09)}" y="${n(-r * 0.62)}" width="${n(D * 0.18)}" height="${n(r * 1.1)}" rx="${n(D * 0.03)}" fill="none" ${line} opacity=".55"/>`));
      // cockpit
      parts.push(poly([[L * 0.948, -r * 0.5], [L * 0.972, -r * 0.48], [L * 0.986, -r * 0.18], [L * 0.945, -r * 0.2]], DARK));
    }

    // motoren
    const eng = lv.engine || (lv.mil ? GREY.engine : "#d2d7dc");
    if (sp.shape === "jet" || sp.shape === "jet4") {
      const len = D * (wide ? 1.55 : 1.45), er = D * (wide ? 0.36 : 0.3);
      const pos = sp.shape === "jet4" ? [[L * 0.47, D * 0.62], [L * 0.6, D * 0.42]] : [[L * 0.6, D * 0.42]];
      // vleugel eerst, motor ervoor
      parts.push(poly(wing, UNDER, line));
      pos.forEach(([x, y]) => {
        const cy = r + y;
        parts.push(`<rect x="${n(x - len * 0.25)}" y="${n(cy - er)}" width="${n(len)}" height="${n(er * 2)}" rx="${n(er * 0.9)}" fill="${eng}" ${line}/>`);
        parts.push(`<ellipse cx="${n(x + len * 0.72)}" cy="${n(cy)}" rx="${n(er * 0.22)}" ry="${n(er * 0.92)}" fill="${DARK}" opacity=".85"/>`);
        parts.push(`<rect x="${n(x + len * 0.1)}" y="${n(r * 0.6)}" width="${n(len * 0.35)}" height="${n(cy - er - r * 0.6 + 0.05)}" fill="${UNDER}"/>`);
        box(0, 0, x + len, cy + er);
      });
    } else if (sp.shape === "tail") {
      parts.push(poly(wing, UNDER, line));
      const len = D * 1.6, er = D * 0.3, x = L * 0.2, y = -r * 0.25;
      parts.push(`<rect x="${n(x)}" y="${n(y - er)}" width="${n(len)}" height="${n(er * 2)}" rx="${n(er * 0.9)}" fill="${eng}" ${line}/>`);
      parts.push(`<ellipse cx="${n(x + len - er * 0.15)}" cy="${n(y)}" rx="${n(er * 0.2)}" ry="${n(er * 0.85)}" fill="${DARK}" opacity=".85"/>`);
    } else if (sp.shape === "prop" || sp.shape === "prop4") {
      parts.push(poly(wing, tailCol === "#ffffff" ? UNDER : body, line));
      const xs = sp.shape === "prop4" ? [L * 0.5, L * 0.56] : [L * 0.52];
      xs.forEach((x0, i) => {
        const len = D * 1.7, h = D * 0.42, y0 = -r * 1.1 + i * D * 0.12;
        parts.push(`<path d="M${n(x0)} ${n(y0)} L${n(x0 + len)} ${n(y0)} C${n(x0 + len * 1.08)} ${n(y0)} ${n(x0 + len * 1.08)} ${n(y0 + h)} ${n(x0 + len)} ${n(y0 + h)} L${n(x0 + len * 0.1)} ${n(y0 + h * 1.15)}Z" fill="${eng}" ${line}/>`);
        parts.push(`<ellipse cx="${n(x0 + len * 1.06)}" cy="${n(y0 + h / 2)}" rx="${n(D * 0.07)}" ry="${n(D * 1.05)}" fill="${DARK}" opacity=".18"/>`);
        box(0, y0 + h / 2 - D * 1.05, x0 + len * 1.1, y0 + h / 2 + D * 1.05);
      });
    } else if (isGA) {
      parts.push(poly(wing, highWing ? body : UNDER, line));
      if (highWing) parts.push(`<path d="M${n(L * 0.52)} ${n(-r * 1.1)} L${n(L * 0.6)} ${n(r * 0.45)}" ${line}/>`);
      // propeller en spinner
      parts.push(`<ellipse cx="${n(L + D * 0.08)}" cy="${n(r * 0.05)}" rx="${n(D * 0.06)}" ry="${n(D * 1.0)}" fill="${DARK}" opacity=".18"/>`);
      parts.push(`<ellipse cx="${n(L)}" cy="${n(r * 0.05)}" rx="${n(D * 0.14)}" ry="${n(D * 0.16)}" fill="${lv.stripe || DARK}"/>`);
      box(0, -r - D, L + D * 0.2, r + D);
      // vast landingsgestel bij Cessna's, anders alleen laag
      if (/^C1|C2|C208|DR40|DV20|P28A/.test(a.type || "") || gearDown) {
        const gy = r + D * 0.55, w = D * 0.17;
        parts.push(`<path d="M${n(L * 0.5)} ${n(r * 0.7)} L${n(L * 0.44)} ${n(gy)} M${n(L * 0.86)} ${n(r * 0.6)} L${n(L * 0.86)} ${n(gy)}" ${line}/>`);
        parts.push(`<circle cx="${n(L * 0.44)}" cy="${n(gy)}" r="${n(w)}" fill="${DARK}"/><circle cx="${n(L * 0.86)}" cy="${n(gy)}" r="${n(w * 0.85)}" fill="${DARK}"/>`);
        box(0, 0, L, gy + w);
      }
    } else if (sp.shape === "fighter") {
      parts.push(poly(wing, lv.body, line));
      parts.push(`<path d="M${n(L * 0.02)} ${n(-r * 0.2)} L${n(L * -0.03)} ${n(-r * 0.2)} L${n(L * -0.03)} ${n(r * 0.5)} L${n(L * 0.02)} ${n(r * 0.6)}Z" fill="${DARK}"/>`);
      box(L * -0.03, 0, L, 0);
    }
    if (sp.shape === "jet" || sp.shape === "jet4" || sp.shape === "tail") { /* vleugel al getekend */ }

    return wrap(parts.join(""), minX, minY, maxX, maxY, k, a, sp);
  }

  function heli(a, sp, k, lv, gearDown) {
    const L = sp.len, R = sp.span / 2, H = L * 0.2, body = lv.body || "#c8102e";
    const cx = L * 0.7, cy = 0;
    const parts = [];
    parts.push(`<path d="M${n(L * 0.08)} ${n(-H * 0.55)} L${n(L * 0.5)} ${n(-H * 0.3)} L${n(L * 0.5)} ${n(H * 0.05)} L${n(L * 0.08)} ${n(-H * 0.32)}Z" fill="${body}" ${line}/>`);
    parts.push(poly([[L * 0.1, -H * 0.45], [L * 0.03, -H * 1.25], [L * 0.0, -H * 1.25], [L * 0.02, -H * 0.4]], body, line));
    parts.push(`<path d="M${n(L * 0.43)} ${n(-H * 0.6)} C${n(L * 0.5)} ${n(-H * 0.95)} ${n(L * 0.85)} ${n(-H * 0.95)} ${n(L * 0.95)} ${n(-H * 0.3)} C${n(L * 1.0)} ${n(-H * 0.05)} ${n(L * 0.98)} ${n(H * 0.45)} ${n(L * 0.82)} ${n(H * 0.5)} L${n(L * 0.5)} ${n(H * 0.5)} C${n(L * 0.42)} ${n(H * 0.4)} ${n(L * 0.4)} ${n(-H * 0.3)} ${n(L * 0.43)} ${n(-H * 0.6)}Z" fill="${body}" ${line}/>`);
    parts.push(`<path d="M${n(L * 0.84)} ${n(-H * 0.6)} C${n(L * 0.93)} ${n(-H * 0.5)} ${n(L * 0.97)} ${n(-H * 0.2)} ${n(L * 0.97)} ${n(0)} L${n(L * 0.84)} ${n(0)}Z" fill="#3c4a57"/>`);
    parts.push(`<rect x="${n(L * 0.56)}" y="${n(-H * 0.45)}" width="${n(L * 0.08)}" height="${n(H * 0.35)}" rx="${n(H * 0.05)}" fill="#3c4a57"/>`);
    parts.push(`<rect x="${n(cx - 0.15)}" y="${n(-H * 1.2)}" width="0.3" height="${n(H * 0.35)}" fill="${DARK}"/>`);
    parts.push(`<path d="M${n(cx - R)} ${n(-H * 1.2)} L${n(cx + R)} ${n(-H * 1.2)}" stroke="${DARK}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`);
    parts.push(`<path d="M${n(L * 0.5)} ${n(H * 0.5)} L${n(L * 0.48)} ${n(H * 0.85)} M${n(L * 0.85)} ${n(H * 0.5)} L${n(L * 0.87)} ${n(H * 0.85)} M${n(L * 0.4)} ${n(H * 0.85)} L${n(L * 0.95)} ${n(H * 0.85)}" ${line}/>`);
    return wrap(parts.join(""), Math.min(0, cx - R), -H * 1.3, Math.max(L, cx + R), H * 0.9, k, a, sp);
  }

  function wrap(inner, x0, y0, x1, y1, k, a, sp) {
    const pad = 0.4;
    const w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2;
    return `<svg class="illu" width="${n(w * k)}" height="${n(h * k)}" viewBox="${n(x0 - pad)} ${n(y0 - pad)} ${n(w)} ${n(h)}" role="img" aria-label="${(sp.model || "").replace(/"/g, "")}">${inner}</svg>`;
  }

  window.Illustrate = { draw, livery };
})();
