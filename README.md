# Overhead

Wat vliegt er nu boven je huis? Deze site toont alle vliegtuigen binnen een gekozen straal als één prent op grijs papier: zijaanzichten (zelf getekende vectorillustraties in de kleuren van de maatschappij, of de foto van het toestel), breedte volgens spanwijdte, met een bijschrift met model, hoogte, stijgen/dalen/kruisen en route. De pagina schaalt zodat alles op één scherm past, ideaal voor een tablet in een lijst.

Geïnspireerd door [tesserae-widget-overhead](https://github.com/dmellok/tesserae-widget-overhead); dit is een eigen, vereenvoudigde implementatie.

## Instellen

Via het tandwiel rechtsboven: titel, plaats (zoeken op naam of de locatie van het toestel) en straal. De instellingen worden in de browser bewaard.

Je kunt een kant-en-klare link maken met URL-parameters:

```
https://<jouw-site>/?lat=51.2387&lon=5.1159&plaats=Dessel&straal=40&titel=Boven%20het%20huis%20van%20Jos
```

Op een tablet houdt de pagina het scherm wakker (waar de browser dat toelaat) en ververst ze elke 30 seconden.

## Hoe het werkt

- `index.html`: de volledige pagina inclusief de tekencode voor de illustraties, zonder build-stap.
- `api/aircraft.js`: Vercel-functie die posities ophaalt bij [adsb.lol](https://adsb.lol) (met [adsb.fi](https://adsb.fi) als reserve) en routes aanvult via [adsbdb](https://www.adsbdb.com).
- `api/geocode.js`: plaatsnamen zoeken via [Open-Meteo](https://open-meteo.com).

Silhouetten worden getekend uit een tabel met ICAO-typecodes (spanwijdte, lengte, vorm). Onbekende types vallen terug op de ADS-B-categorie.

## Lokaal draaien

```
npx vercel dev
```
