# Overhead

Wat vliegt er nu boven je huis? Deze site toont alle vliegtuigen binnen een gekozen straal op een wit vel: zijaanzichten (AI-schilderijen, zelf getekende vectorillustraties in de kleuren van de maatschappij, of de foto van het toestel), op schaal van hun lengte, met een bijschrift met model, hoogte, stijgen/dalen/kruisen en route. De pagina schaalt zodat alles op één scherm past, ideaal voor een tablet in een lijst.

Geïnspireerd door [tesserae-widget-overhead](https://github.com/dmellok/tesserae-widget-overhead); dit is een eigen, vereenvoudigde implementatie.

## Instellen

Via het tandwiel rechtsboven: titel, plaats (zoeken op naam of de locatie van het toestel) en straal. De instellingen worden in de browser bewaard.

Je kunt een kant-en-klare link maken met URL-parameters:

```
https://<jouw-site>/?lat=51.2387&lon=5.1159&plaats=Dessel&straal=40&titel=Boven%20het%20huis%20van%20Jos
```

Op een tablet houdt de pagina het scherm wakker (waar de browser dat toelaat) en ververst ze elke 30 seconden.

Extra's:

- **Bijzondere toestellen** krijgen een label: *zeldzaam* (A380, 747, Beluga, transportvliegtuigen en meer), *nieuw type* (het eerste uur nadat een type voor het eerst boven je plek vloog, zodra het logboek een dag loopt) en *militair*.
- **Waar moet ik kijken?** Onder elk toestel een kompaspijl met afstand en windrichting (bv. *12 km NO*), en of het nadert, wegtrekt of recht boven je hangt. Op brede schermen ook wanneer en op welke afstand het het dichtst komt.
- **Logboek van vandaag** achter de knop *Vandaag*: aantal toestellen, types en maatschappijen, de grootste, hoogste en dichtstbijzijnde, en een lijst met het moment van dichtste nadering. Het wordt in de browser bijgehouden zolang de pagina openstaat.
- **Hemel van nu**: de achtergrond kleurt mee met het uur (ochtendgloren, dag, schemering) en het weer (`api/sky.js`, Open-Meteo); 's nachts wordt de pagina donker en gedimd. Het weer staat ook in de kop. Instelbaar op hemel van nu, altijd wit of altijd donker.

## Hoe het werkt

- `index.html`: de volledige pagina inclusief de tekencode voor de illustraties, zonder build-stap.
- `api/aircraft.js`: Vercel-functie die posities ophaalt bij [adsb.lol](https://adsb.lol) (met [adsb.fi](https://adsb.fi) als reserve) en routes aanvult via [adsbdb](https://www.adsbdb.com).
- `api/geocode.js`: plaatsnamen zoeken via [Open-Meteo](https://open-meteo.com).

Silhouetten worden getekend uit een tabel met ICAO-typecodes (spanwijdte, lengte, vorm). Onbekende types vallen terug op de ADS-B-categorie.

## Scherm in een lijst (`/frame`)

`api/frame.js` tekent het volledige scherm op de server als één beeld, voor een ESP32-scherm in een fotolijst (bv. een 10,1"-scherm van 1024 × 600). Dezelfde illustraties, schilderijen, kompas, labels en hemelkleur als de website, maar zonder browser: SVG met [resvg](https://github.com/yisibl/resvg-js), lettertype Geist (OFL, in `fonts/`).

```
/api/frame?lat=51.2387&lon=5.1159&straal=40&plaats=Dessel&titel=Nu%20in%20de%20lucht&w=1024&h=600&format=jpg
```

- `w`, `h`: beeldgrootte (standaard 1024 × 600, staand `w=600&h=1024`)
- `weergave`: `schilderij` (standaard) of `illustratie`
- `nacht`: `auto` (volgt de zon op de plek), `aan` of `uit`
- `decor`: `straat` (standaard) of `effen`. Met `straat` krijgt het beeld de hemel van nu (zon op haar echte plek, wolken volgens de bewolking, regen of sneeuw, 's nachts sterren en de maan in de juiste fase) en onderaan een willekeurige Kempense straat met dennen, huizen en een kerktoren, vast per locatie, met ramen die 's avonds aangaan (`lib/scenery.js`).
- `format`: `png`, `jpg` (aanbevolen voor het scherm, ± 75 KB), `rgb565` (ruwe pixels, 1,2 MB per beeld: te groot voor het gratis dataverkeer), `rgb565be` of `svg`

Headers: `X-Night` (1 's nachts, om de verlichting te dimmen), `X-Refresh` (aanbevolen wachttijd in seconden: 60 overdag, 900 's nachts), `X-Aircraft`.

### Binnen het gratis plan van Vercel blijven

Gemeten: ± 0,17 s rekentijd en ± 75 KB per beeld (jpg). Met één scherm (overdag elke minuut, 's nachts om het kwartier) is dat ruwweg 1,5 CPU-uur en 2 GB dataverkeer per maand, binnen de 4 CPU-uur en 10 GB Fast Origin Transfer van het Hobby-plan. De schilderijlogica vermijdt `list()` (gratis: 2.000 handelingen per maand) en onthoudt ontbrekende schilderijen een uur.

De pagina `/frame` toont het beeld in een lijst, met de instellingen van de live pagina, en geeft het adres voor het scherm.

De tekencode in `lib/art.js` is een kopie van die in `index.html`: pas beide aan.

## Lokaal draaien

```
npx vercel dev
```

## Schilderijen (optioneel)

In de weergave "Schilderijen" maakt `api/painting.js` per combinatie van vliegtuigtype en maatschappij één schilderij en bewaart het in Vercel Blob. Daarna wordt het nooit opnieuw gemaakt.

Nodig in Vercel (Settings › Environment Variables):

- `BLOB_READ_WRITE_TOKEN`: komt er vanzelf bij als je een Blob-opslag aan het project koppelt (Storage › Create › Blob)
- en één beeldbron:
  - **gratis:** `CLOUDFLARE_ACCOUNT_ID` en `CLOUDFLARE_API_TOKEN` (Workers AI, FLUX.1 [schnell]; 10.000 neurons per dag gratis). Heeft voorrang als beide bronnen ingesteld zijn.
  - **betalend:** `GEMINI_API_KEY` van Google AI Studio (beeldgeneratie heeft geen gratis tier)

Optioneel: `DAILY_PAINT_LIMIT` (standaard 30 per dag), `GEMINI_IMAGE_MODEL` (standaard `gemini-nano-banana-2.1`), `PAINT_STYLE`.

Zonder deze instellingen toont de site de getekende illustraties.
