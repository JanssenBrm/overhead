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
- **Logboek van vandaag** achter de knop *Vandaag*: aantal toestellen, types en maatschappijen, de grootste, hoogste en dichtstbijzijnde, en een lijst met het moment van dichtste nadering. Het wordt in de browser bijgehouden zolang de pagina openstaat.
- **Nachtstand**: tussen zonsondergang en zonsopgang op de ingestelde plek wordt de pagina donker en gedimd. Instelbaar op automatisch, altijd of nooit.

## Hoe het werkt

- `index.html`: de volledige pagina inclusief de tekencode voor de illustraties, zonder build-stap.
- `api/aircraft.js`: Vercel-functie die posities ophaalt bij [adsb.lol](https://adsb.lol) (met [adsb.fi](https://adsb.fi) als reserve) en routes aanvult via [adsbdb](https://www.adsbdb.com).
- `api/geocode.js`: plaatsnamen zoeken via [Open-Meteo](https://open-meteo.com).

Silhouetten worden getekend uit een tabel met ICAO-typecodes (spanwijdte, lengte, vorm). Onbekende types vallen terug op de ADS-B-categorie.

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
