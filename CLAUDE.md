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
- **`src/data.js`** — dataadgangslaget. **Alt** JSON-hentning går herigennem og
  caches. Skal projektet skifte til et rigtigt API/database, ændres kun dette
  modul. Nøglefunktioner: `getAllRecipes`, `getRecipeBySlug`, `filterRecipes`
  ({query, category}), `getFacets`, `getSnacks`, `searchSnacks`. `filterRecipes`
  matcher en fane både på `category` og `tags` (så et tag som `vægttab` og en
  kategori som `Morgenmad` begge virker som fane).
- **`src/router.js`** — minimal hash-router (`#/`, `#/opskrift/<slug>`,
  `#/indkobsliste`). Hash-baseret, så det virker på GitHub Pages uden
  server-config. Forsidens filter/søgning ligger i query-strengen
  (`#/?q=...&kat=...`) og opdateres via `history.replaceState` (ingen ny
  hash-navigation pr. tastetryk).
- **`src/views.js`** — bygger DOM via en `el()`-hjælper (aldrig `innerHTML` med
  rå data, så indhold escapes automatisk). `renderList` ejer forsidens
  søgefelt + faner og gen-tegner kun resultat-gitteret (bevarer fokus).
- **`src/shopping.js`** — ren logik til indkøbslisten: parser mængder ud af
  ingrediens-tekster, skalerer efter portioner og lægger ens ingredienser
  sammen. Testet i `scripts/test-shopping.mjs`.
- **`src/app.js`** — binder det hele sammen: ruter, forsidens filter-state,
  fane-konfiguration og localStorage-persistering af indkøbslistens valg.

## Konventioner ved dataændringer

- **Skalering af indkøbsliste** afhænger af `baseServings` (antal portioner
  ingrediensmængderne er beregnet til). Sæt det på nye opskrifter, ellers
  antages 1. Ingredienser er fri tekst; skaleringen læser tallet i starten af
  hver linje (fx "250 g mel", "½ agurk") og lader tekst uden tal stå urørt.
- **Faner** styres af `CATEGORY_ORDER` og `HIGHLIGHT_TAGS` øverst i `src/app.js`.
  Faner uden matchende opskrifter skjules automatisk. Snacks er en særskilt fane
  (`SNACKS_KEY`), adskilt fra mad-kategorierne med en skillelinje.
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
