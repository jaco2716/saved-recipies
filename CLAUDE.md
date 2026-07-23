# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Hvad det er

En data-drevet opskriftssamling som en **statisk side uden build-trin**. Alt
indhold ligger i JSON-filer, og vanilla JS (ES-moduler) bygger siden i browseren.
Hostes gratis på GitHub Pages. Al tekst i UI og data er på dansk.

## Kommandoer

```bash
npm run dev        # lokal server (python3 -m http.server 8000) → http://localhost:8000
npm run validate   # validér data/recipes.json + data/snacks.json mod skemaerne
npm test           # kør enhedstests for indkøbsliste-logikken (scripts/test-shopping.mjs)
```

Der er **ingen build, bundler eller transpilering**. Kør ét af ovenstående, eller
åbn siden via GitHub Pages.

Kør en enkelt test: der er ikke en test-runner med filtrering — `scripts/test-shopping.mjs`
er en enkelt zero-dependency fil, der køres i sin helhed med `node`.

## Vigtig begrænsning: skal serveres over http

Siden henter JSON med `fetch`, så den **virker ikke** ved at dobbeltklikke
`index.html` (browseren blokerer `file://`). Brug altid `npm run dev` eller
GitHub Pages. Dataadgangslaget viser en hjælpsom fejl, hvis det sker.

## Arkitektur

Lagdelt, så data er adskilt fra visning. Data flyder: **JSON → `data.js` → `app.js` (router) → `views.js` (DOM)**.

- **`data/recipes.json`** — den ene kilde til alle opskrifter. Objekt med
  `recipes`-array. `data/recipe.schema.json` giver validering + autofuldførelse
  (filen peger på skemaet via `$schema`).
- **`data/snacks.json`** — en **separat, enklere samling** (kun `slug`, `title`,
  `emoji`, `description`, `tags` — ingen ingredienser/steps). Eget skema
  `data/snacks.schema.json`.
- **`data/ingredients.json`** — **kanonisk ingrediens-katalog** (`id`, `name`,
  `category`, valgfri `pantry`). Opskrifter refererer hertil via `ref` i stedet
  for fri tekst, så ens ingredienser kan lægges sammen på indkøbslisten og
  genbruges på tværs. Eget skema `data/ingredients.schema.json`.
- **`src/data.js`** — dataadgangslaget. **Alt** JSON-hentning går herigennem og
  caches. Skal projektet skifte til et rigtigt API/database, ændres kun dette
  modul. Nøglefunktioner: `getAllRecipes`, `getRecipeBySlug`, `filterRecipes`
  ({query, category}), `getFacets`, `getSnacks`, `searchSnacks`, `getIngredients`,
  `getIngredientIndex` (katalog som Map). `filterRecipes` matcher en fane både på
  `category` og `tags`; fritekstsøgning resolver ingrediens-`ref`→navn via
  kataloget (`haystack`), så søgning på fx "kylling" stadig rammer.
- **`src/router.js`** — minimal hash-router (`#/`, `#/opskrift/<slug>`,
  `#/indkobsliste`). Hash-baseret, så det virker på GitHub Pages uden
  server-config. Forsidens filter/søgning ligger i query-strengen
  (`#/?sektion=snacks&q=...&kat=...&sort=...`) og opdateres via
  `history.replaceState` (ingen ny hash-navigation pr. tastetryk). `sektion` er
  `mad` (default, kan udelades) eller `snacks`; `kat` bruges kun i
  mad-sektionen; `sort` er tom (standard), `pris` eller `tid` (tid kun for mad).
- **`src/views.js`** — bygger DOM via en `el()`-hjælper (aldrig `innerHTML` med
  rå data, så indhold escapes automatisk). `renderList` ejer forsidens
  søgefelt + faner og gen-tegner kun resultat-gitteret (bevarer fokus).
- **`src/ingredients.js`** — ren, delt logik til ingredienser: `resolveIngredient`
  (slår `ref` op i kataloget), `formatIngredientDisplay` (→ "150 g kyllingebryst
  (i tern)"), `formatQty` og `indexCatalog`. Genbruges af visning, indkøbsliste
  og dataadgang.
- **`src/shopping.js`** — ren logik til indkøbslisten:
  `buildShoppingList(selections, snacks, catalog)` slår hver `ref` op, skalerer
  efter portioner og lægger ens ingredienser sammen (nøgles på `id`; mængder
  samles pr. enhed, så forskellige enheder vises "4 dl + 1 spsk mælk").
  Basisvarer (`pantry`) holdes af listen og returneres separat som `pantry`.
  Snacks lægges på som enkeltlinjer nederst. Testet i `scripts/test-shopping.mjs`.
- **`src/app.js`** — binder det hele sammen: ruter, forsidens filter-state,
  fane-konfiguration og localStorage-persistering af indkøbslistens valg.

## Konventioner ved dataændringer

- **Ingredienser er referencer** til kataloget: `{ ref, amount?, unit?, note?,
  optional? }`, hvor `ref` er et `id` fra `data/ingredients.json`. Tilføjer du en
  ingrediens der ikke findes i kataloget, så **opret den først** i
  `ingredients.json` (giv den `category`, og `pantry: true` hvis det er en
  basisvare som salt/olie). `npm run validate` fejler hvis en `ref` ikke findes.
  Brug `note` til uddybning ("i tern", "drænet"), og `optional: true` for
  "efter smag"/valgfrit.
- **Skalering af indkøbsliste** afhænger af `baseServings` (antal portioner
  `amount`-værdierne er beregnet til). Sæt det på nye opskrifter, ellers antages
  1. Ingredienser uden `amount` (fx "en håndfuld") tages med uden mængde.
- **Faner** er todelt: to primære faner (Mad / Snacks) øverst, og — kun i
  mad-sektionen — kategori-underfaner styret af `CATEGORY_ORDER` og
  `HIGHLIGHT_TAGS` øverst i `src/app.js`. Underfaner uden matchende opskrifter
  skjules automatisk. Snacks-fanen vises kun hvis `data/snacks.json` har poster;
  snacks har ingen kategori-underfaner.
- **Pris og tid til sortering**: hver opskrift har `pricePerServing` (kr. pr.
  person) og `timeMinutes` (aktiv tilberedningstid); snacks har kun
  `pricePerServing`. De numeriske felter driver forsidens sortering (`app.js`
  `sortItems`) og den lille pris/tid-tekst på kort/opskrift. `time` (fri tekst)
  vises stadig; `timeMinutes` er kun til sortering. Sæt begge på nye opskrifter.
- **Billeder**: læg dem i `assets/images/`, referér med `image`-feltet (sti
  relativ til roden). Hold dem små (~1200 px, JPG). `npm run validate` fejler,
  hvis et refereret billede mangler. Opskrifter uden billede falder tilbage til
  deres emoji.
- Kør altid `npm run validate` (og `npm test` ved ændringer i shopping-logikken)
  før commit.

## Git-workflow

- `main` er default og live-branch (GitHub Pages deployer herfra).
- **Nye branches oprettes med navnet `feature/YYYYMMDD-kort-beskrivelse`**, fx
  `feature/20260723-add-snacks`. Datoformatet (YYYYMMDD) gør, at branches
  sorterer kronologisk efter navn. Brug små bogstaver og bindestreger i
  beskrivelsen.
