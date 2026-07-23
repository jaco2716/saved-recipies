---
name: opskrift-billeder
description: >-
  Generér madfotos til opskrifter og snacks, der mangler et billede. Brug denne
  når du skal "generere billeder til opskrifter/snacks der mangler billede",
  "tilføje billeder til nye opskrifter", eller lave/forny fotos til poster i
  data/recipes.json eller data/snacks.json. Kalder Geminis billed-API (Nano
  Banana), komprimerer til web-JPG i assets/images/ og sætter `image`-feltet.
  Idempotent — rører kun poster uden billede.
---

# Opskrift-billeder

Genererer fotorealistiske madfotos i sitets husstil for hver opskrift/snack der
**mangler** feltet `image`, og skriver stien tilbage i JSON. Kør den hver gang
der er tilføjet nye poster uden billede.

## Forudsætninger

- `GEMINI_API_KEY` skal være sat i miljøet (nøglen skal have adgang til
  billed-generering — Nano Banana / image-modeller kræver billing på Googles
  side; en ren gratis nøgle afvises med HTTP 429 `limit: 0`).
- `python3` med Pillow. Scriptet installerer Pillow automatisk hvis den mangler
  (`pip install Pillow`).
- Node ≥ 18 (bruger indbygget `fetch`).

## Sådan bruges den

```bash
# Generér billeder for alle poster uden `image` (opskrifter + snacks):
node .claude/skills/opskrift-billeder/scripts/generate-images.mjs

# Se hvad der ville ske uden at kalde API'et eller ændre filer:
node .claude/skills/opskrift-billeder/scripts/generate-images.mjs --dry-run

# Kun én bestemt post (efter slug):
node .claude/skills/opskrift-billeder/scripts/generate-images.mjs --only tunsalat

# Overstyr modelvalget (ellers vælges den automatisk fra /models):
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image node .../generate-images.mjs
```

Kør bagefter altid:

```bash
npm run validate   # fejler hvis en refereret billedfil mangler
```

## Hvad scriptet gør

1. **Læser** `data/recipes.json` og `data/snacks.json` og finder alle poster
   **uden** `image` (idempotent — eksisterende billeder røres ikke).
2. **Bygger en prompt** pr. post ud fra titel + beskrivelse (+ de vigtigste
   ingredienser for opskrifter) i husstilen: fotorealistisk madfoto, lyst
   naturligt vinduelys, rustikt forvitret træbord, spættet keramik-skål, frisk
   garnering, linnedserviet, gaffel, blød dybdeskarphed, 3:2 liggende.
3. **Vælger billed-model dynamisk** via
   `GET /v1beta/models` (den gamle `gemini-2.5-flash-image-preview` er lukket).
   Foretrækker nyeste stabile flash-image-model; kan overstyres med
   `GEMINI_IMAGE_MODEL`.
4. **Kalder** `:generateContent` med `generationConfig.responseModalities:
   ["IMAGE"]`. Billedet kommer som base64 i svarets `inlineData`.
5. **Komprimerer** med Pillow til ~1200 px bred, progressiv JPG (kvalitet 82) →
   `assets/images/<slug>.jpg`.
6. **Sætter `image`-feltet** (lige efter `emoji`) og skriver JSON tilbage med
   2-space indent og bevaret rækkefølge — kun hvis mindst ét billede lykkedes.
7. **Springer fejlende poster over** og logger dem til sidst; exit-kode bliver
   ikke-nul hvis noget fejlede.

## Bemærk om snacks

Snacks kan nu have et `image`-felt (`data/snacks.schema.json`). Snack-kortene i
`src/views.js` viser billedet når det findes og falder ellers tilbage til
emoji — præcis som opskriftskortene.

## Fejlfinding

- **HTTP 429 `limit: 0`** på alle image-modeller: nøglen har ikke adgang til
  billed-generering. Aktivér billing på Google-projektet eller brug en nøgle med
  image-kvote. Tekst-modeller kan sagtens virke selvom image-modeller ikke gør.
- **HTTP 404 "no longer available to new users"** (fx Imagen-modeller): den model
  er ikke tilgængelig for nøglen; scriptet vælger automatisk en anden.
- **"Svaret indeholdt intet billede"**: modellen returnerede kun tekst — prøv
  igen eller juster prompten.
