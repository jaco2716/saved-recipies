---
name: opskrift-billeder-browser
description: >-
  Generér madfotos til opskrifter/snacks der mangler billede — GRATIS via Gemini
  web-UI (gemini.google.com) styret med en rigtig browser, i stedet for
  billed-API'et (der kræver billing). Brug denne når du vil "generere billeder
  gratis via Gemini i browseren", eller når API-skillet fejler med kvote/billing.
  Bruger din egen Chrome, logger ind én gang via en vedvarende profil,
  komprimerer til web-JPG i assets/images/ og sætter `image`-feltet. Idempotent —
  rører kun poster uden billede.
---

# Opskrift-billeder (browser)

Modstykke til skillet `opskrift-billeder`. Samme resultat — fotorealistiske
madfotos i sitets husstil, gemt som `assets/images/<slug>.jpg` med `image`-feltet
sat i JSON — men billederne genereres via **Geminis gratis web-UI** i en rigtig
browser i stedet for billed-API'et. Brug denne når API-nøglen ikke har
billed-kvote (429 `limit: 0`), eller når du bare vil bruge de gratis daglige
billeder på gemini.google.com.

## Forudsætninger

- **Google Chrome** installeret (skillet styrer din egen Chrome, `channel:'chrome'`
  — ingen Chromium-download).
- **En Google-konto** med adgang til Gemini. Du logger ind **én gang** (se nedenfor).
- **Node ≥ 18**. `playwright-core` hentes automatisk ved første kørsel med
  `npm install --no-save` — den havner derfor **ikke** i `package.json`, så
  mobil-udvikling af selve siten er upåvirket.
- **python3 + Pillow** til komprimering (Pillow installeres automatisk hvis den
  mangler).

Kør kun dette skill **fra computeren** — det kræver en grafisk browser og virker
ikke fra Claude-appen på mobil.

## Første kørsel: login (kun én gang)

Skillet åbner Chrome med en **dedikeret, vedvarende profil**
(`~/.cache/saved-recipies/gemini-chrome-profile`). Første gang er du ikke logget
ind — log ind på Google i vinduet, og sessionen gemmes på disk. Ved alle senere
kørsler er du automatisk logget ind. Terminalen venter i op til 5 minutter på, at
du bliver færdig.

## Sådan bruges den

```bash
# Generér billeder for alle poster uden `image` (opskrifter + snacks):
node .claude/skills/opskrift-billeder-browser/scripts/generate-images-browser.mjs

# Se hvad der ville ske uden at åbne browseren eller ændre filer:
node .../generate-images-browser.mjs --dry-run

# Kun én bestemt post (efter slug):
node .../generate-images-browser.mjs --only tunsalat

# Højst N billeder i denne kørsel (fx for at holde dig under gratis-kvoten):
node .../generate-images-browser.mjs --limit 10
```

Kør bagefter altid:

```bash
npm run validate   # fejler hvis en refereret billedfil mangler
```

## Hvad scriptet gør

1. **Læser** `data/recipes.json` og `data/snacks.json` og finder poster **uden**
   `image` (idempotent — eksisterende billeder røres ikke).
2. **Bygger en prompt** pr. post ud fra titel + beskrivelse (+ ingredienser) i
   husstilen — samme stil som API-skillet, plus "Generate a single image".
3. **Åbner Chrome** (vedvarende profil) på gemini.google.com. Første gang venter
   den på, at du logger ind.
4. **Pr. post**: starter en ny chat, indsætter prompten, sender, venter på det
   genererede billede (op til 120 s) og henter billed-bytes i sidens kontekst.
5. **Komprimerer** med Pillow til ~1200 px progressiv JPG →
   `assets/images/<slug>.jpg`.
6. **Sætter `image`-feltet** (efter `emoji`) og skriver JSON tilbage **løbende**
   efter hvert billede — et nedbrud midtvejs taber ikke de færdige.
7. **Springer fejlende poster over** og logger dem til sidst; exit-kode bliver
   ikke-nul hvis noget fejlede. Kør bare igen — kun de manglende tages med.

## Miljøvariabler (til fejlfinding / UI-ændringer)

Gemini ændrer sit web-UI jævnligt. Går scriptet i stå ved input eller send, kan
selektorerne overstyres uden at redigere koden:

| Variabel | Betydning | Default |
|---|---|---|
| `GEMINI_PROFILE_DIR` | Sti til den vedvarende Chrome-profil | `~/.cache/saved-recipies/gemini-chrome-profile` |
| `GEMINI_URL` | Startside | `https://gemini.google.com/app` |
| `GEMINI_EDITOR_SEL` | Selektor(er) for prompt-inputfeltet (adskil med `\|\|`) | `div.ql-editor[role='textbox']` m.fl. |
| `GEMINI_NEWCHAT_SEL` | Selektor(er) for "ny chat"-knappen | `button[aria-label*='Ny chat']` m.fl. |
| `LOGIN_TIMEOUT_MS` | Ventetid på login | `300000` |
| `IMAGE_TIMEOUT_MS` | Ventetid pr. billede | `120000` |

## Fejlfinding

- **"Fandt ikke prompt-inputfeltet"** / **"Intet billede efter Xs"**: Gemini har
  formentlig ændret sit UI. Kør med vinduet synligt (det er det som standard),
  find den rigtige selektor i DevTools og sæt `GEMINI_EDITOR_SEL`. Forhøj evt.
  `IMAGE_TIMEOUT_MS`. Billeder hentes fra netværket (billed-svar > 50 KB, ekskl.
  gstatic-UI-assets) — ændrer Gemini hosten, kan filteret i `attachImageCapture`
  skulle justeres.
- **Login bliver ved med at komme igen**: profilen kan ikke skrives. Tjek at
  `GEMINI_PROFILE_DIR` er skrivbar, og at der ikke kører en anden Chrome på samme
  profil-mappe samtidig.
- **"Kunne ikke starte Chrome"**: Google Chrome er ikke installeret på standard-
  stien. Installér Chrome, eller peg Playwright på en anden kanal.
- **Ramt gratis-kvote**: Gemini begrænser antal gratis billed-genereringer pr.
  dag. Brug `--limit N` og kør resten en anden dag — skillet fortsætter bare med
  de poster der stadig mangler `image`.

## Forskel fra `opskrift-billeder`

Samme prompt-stil, komprimering og JSON-håndtering. Forskellen er **kilden**:
dette skill bruger det gratis web-UI via browser (ingen API-nøgle, men skrøbeligt
over for UI-ændringer og kræver login), mens `opskrift-billeder` bruger
billed-API'et (stabilt, men kræver billing/kvote). Vælg efter hvad du har adgang
til.
