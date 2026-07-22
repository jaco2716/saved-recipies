# 🍳 Mine opskrifter

En lille, data-drevet opskriftssamling. Alle opskrifter ligger i **én JSON-fil**
(`data/recipes.json`), og siden bygger selv oversigt og opskriftssider ud fra
dataen. Ingen build, ingen framework — bare statiske filer, der virker på både
mobil og computer og kan hostes gratis på GitHub Pages.

Tidligere var der én HTML-fil pr. opskrift. Nu er data adskilt fra visning, så
du kun retter ét sted, når du tilføjer eller ændrer en opskrift.

## Hurtig start

Fordi siden henter `data/recipes.json` med `fetch`, skal den køre via en lille
webserver (det virker ikke at dobbeltklikke `index.html` direkte — browseren
blokerer filadgang for `file://`). Vælg én af delene:

```bash
# Med Python (findes på de fleste maskiner)
python3 -m http.server 8000
#  → åbn http://localhost:8000

# …eller med npm-scriptet, der gør det samme
npm run dev
```

På **GitHub Pages** virker det uden videre — se afsnittet nederst.

## Sådan tilføjer du en ny opskrift

Du skal kun røre **én fil**: `data/recipes.json`. Tilføj et nyt objekt i
`recipes`-listen:

```json
{
  "slug": "lasagne",
  "title": "Lasagne",
  "description": "Klassisk lasagne med kødsovs",
  "emoji": "🍝",
  "image": "assets/images/lasagne.jpg",
  "category": "Aftensmad",
  "tags": ["pasta", "familiefavorit"],
  "servings": "4 personer",
  "baseServings": 4,
  "time": "1 time",
  "calories": "ca. 600 kcal",
  "protein": "ca. 35 g",
  "ingredients": ["500 g hakket oksekød", "..."],
  "steps": ["Brun kødet.", "..."],
  "notes": "Smager endnu bedre dagen efter."
}
```

- **`slug`** er unikt og bruges i adressen (`#/opskrift/lasagne`). Kun små
  bogstaver, tal og bindestreg.
- **`title`**, **`ingredients`** og **`steps`** er påkrævede. Resten er valgfrit
  (fx `image`, `calories` og `protein`).
- **`baseServings`** er antallet af portioner, ingrediensmængderne er beregnet
  til. Det bruges af indkøbslisten til at skalere mængderne op og ned. Sæt det,
  hvis opskriften skal kunne ganges op korrekt (standard er 1).
- Editoren foreslår automatisk felterne, fordi filen peger på skemaet
  `data/recipe.schema.json`.

### Tilføj et billede til en opskrift

1. Læg billedet i mappen `assets/images/`, gerne navngivet efter opskriften,
   fx `assets/images/lasagne.jpg`.
2. Sæt `image`-feltet i opskriften til stien: `"assets/images/lasagne.jpg"`.
3. Billedet vises stort øverst på opskriftssiden og som lille miniature på
   forsiden. Opskrifter uden billede falder pænt tilbage til deres emoji.

Hold billederne små (fx maks. ~1200 px brede og komprimeret til JPG), så siden
loader hurtigt — også på mobil.

Tjek at filen er gyldig, før du committer:

```bash
npm run validate    # eller: node scripts/validate.mjs
```

Gem, commit og push — så er opskriften på siden.

## Kategori-faner

Øverst på forsiden er der faner (**Alle**, **Morgenmad**, **Aftensmad**,
**Vægttab** osv.), så du hurtigt kan filtrere opskrifterne. En fane matcher
både på opskriftens `category` og dens `tags`, så fx **Vægttab** (et tag) og
**Morgenmad** (en kategori) begge virker. Filteret kan kombineres med
søgefeltet, og det valgte ligger i URL'en (`#/?kat=vægttab`), så visningen kan
deles og huskes.

Fanerne dannes automatisk ud fra data — faner uden opskrifter skjules. Vil du
ændre rækkefølgen eller hvilke gennemgående tags der vises som faner, så rediger
`CATEGORY_ORDER` og `HIGHLIGHT_TAGS` øverst i `src/app.js`.

## Indkøbsliste

Under **🛒 Indkøbsliste** i menuen kan du vælge de opskrifter, du vil handle
ind til, og hvor mange portioner af hver. Siden lægger så alle ingredienser
sammen til én liste:

- Mængder skaleres automatisk ud fra opskriftens `baseServings` (fx bliver
  "½ agurk" til "2 agurk", hvis du vælger 4 portioner af en 1-portions opskrift).
- Ens ingredienser fra flere opskrifter lægges sammen (2 opskrifter med agurk
  bliver til én linje).
- Ingredienser uden et tal (fx "Salt og peber") tages med, som de er.
- Du kan krydse varer af mens du handler, **kopiere** listen som tekst eller
  **printe** den.
- Dit valg gemmes i browseren, så det er der stadig, næste gang du åbner siden.

Fordi ingredienser er fri tekst, er skaleringen et bedste-bud — tjek altid
mængderne på sammensatte ingredienser.

## Projektstruktur

```
├── index.html               # App-skal (header + tomt indholdsområde)
├── data/
│   ├── recipes.json         # ← ALLE opskrifter (kilden til alt indhold)
│   └── recipe.schema.json   # JSON-skema: validering + autofuldførelse
├── src/
│   ├── app.js               # Indgang: binder data, router og visning sammen
│   ├── data.js              # Dataadgangslag (skift hertil for et rigtigt API)
│   ├── router.js            # Lille hash-router (#/, #/opskrift/<slug>, #/indkobsliste)
│   ├── shopping.js          # Skalering og sammenlægning til indkøbslisten
│   └── views.js             # Bygger DOM ud fra opskrift-data
├── assets/
│   ├── styles.css           # Al styling (med mørkt tema)
│   └── images/              # Billeder til opskrifter
├── scripts/
│   └── validate.mjs         # Validerer recipes.json (uden afhængigheder)
├── package.json             # dev- og validate-scripts
└── README.md
```

Lagene er bevidst adskilt: **data → adgangslag → visning**. Vil du senere hente
opskrifter fra et rigtigt API eller en database, ændrer du kun `src/data.js` —
`views.js` og `router.js` er uberørte.

## Skal projektet laves om til Next.js?

Kort svar: **ikke nu.** Til en personlig opskriftssamling, der hostes gratis på
GitHub Pages, vil Next.js tilføje en byggeproces, et Node-miljø og en
deploy-pipeline uden at give noget tilsvarende igen. Den nuværende løsning holder
"åbn og brug"-enkelheden, men er nu data-drevet.

Overvej først Next.js (eller et lignende framework), når mindst ét af følgende
bliver aktuelt:

- **Rigtig database / login** — flere brugere, der selv opretter og redigerer
  opskrifter i en app frem for i en JSON-fil.
- **SEO og deling** — server-renderede sider med billeder og metadata, så en
  opskrift ser pæn ud, når den deles på fx Facebook (hash-URL'er og
  klient-rendering er svagere her).
- **Mange opskrifter (hundredvis+)** — behov for paginering, billed-optimering
  og hurtigere første indlæsning.

Migrationen er gjort let med vilje: `data/recipes.json` har allerede den form, et
API ville returnere, og al datahentning er samlet i `src/data.js`. Man kan derfor
flytte over trinvist — starte med at læse den samme JSON i Next.js og først
senere skifte til en database.

## Se hjemmesiden på mobilen med GitHub Pages (gratis)

1. Gå til dit repo på GitHub.
2. Klik på **Settings** → **Pages**.
3. Under **Source** vælg **Deploy from a branch**.
4. Vælg branch og mappen `/ (root)`, og tryk **Save**.
5. Efter et øjeblik får du et link i stil med
   `https://<dit-brugernavn>.github.io/saved-recipies/`.
6. Åbn linket på mobilen, og læg det på hjemmeskærmen for hurtig adgang.
