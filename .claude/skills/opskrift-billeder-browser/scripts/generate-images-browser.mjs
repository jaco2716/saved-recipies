#!/usr/bin/env node
// Genererer madfotos til opskrifter/snacks der mangler `image` — via GRATIS
// Gemini web-UI (gemini.google.com) styret med en rigtig browser, i stedet for
// billed-API'et (som kræver billing). Modstykke til søster-skillet
// `opskrift-billeder`, der bruger API'et.
//
// Login: browseren kører med en DEDIKERET, vedvarende Chrome-profil. Første
// gang logger DU ind på Google i vinduet; sessionen gemmes på disk og genbruges
// automatisk herefter — ingen login ved senere kørsler.
//
// Flow pr. post (poster UDEN `image`, idempotent):
//   1. Byg en billed-prompt ud fra titel + beskrivelse (+ ingredienser).
//   2. Start en ny Gemini-chat, indsæt prompten, send, vent på det genererede
//      billede og hent dets bytes.
//   3. Komprimér til ~1200 px progressiv JPG → assets/images/<slug>.jpg.
//   4. Sæt `image`-feltet (efter `emoji`) og skriv JSON tilbage.
//   5. Fejler en post: log den, spring over, fortsæt. Kør bare igen senere —
//      kun poster der stadig mangler billede tages med.
//
// Krav: Google Chrome installeret. `playwright-core` hentes automatisk hvis den
// mangler (npm install --no-save — havner IKKE i package.json). Python3+Pillow
// bruges til komprimering (Pillow installeres automatisk hvis den mangler).
//
// Brug:
//   node .claude/skills/opskrift-billeder-browser/scripts/generate-images-browser.mjs
//   node .../generate-images-browser.mjs --dry-run       # vis kun hvad der sker
//   node .../generate-images-browser.mjs --only <slug>   # kun én post
//   node .../generate-images-browser.mjs --limit 10      # højst N billeder
//
// Miljøvariabler (selektorer kan overstyres hvis Gemini ændrer sit UI):
//   GEMINI_PROFILE_DIR   Sti til den vedvarende Chrome-profil
//                        (default ~/.cache/saved-recipies/gemini-chrome-profile)
//   GEMINI_URL           Startside (default https://gemini.google.com/app)
//   GEMINI_EDITOR_SEL    Selektor for prompt-inputfeltet
//   GEMINI_SEND_SEL      Selektor for send-knappen
//   GEMINI_NEWCHAT_SEL   Selektor for "ny chat"-knappen
//   LOGIN_TIMEOUT_MS     Hvor længe der ventes på login (default 300000)
//   IMAGE_TIMEOUT_MS     Hvor længe der ventes på et genereret billede (120000)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

// Projektroden ligger fire niveauer over dette script.
const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(scriptDir, "../../../..");
const IMAGES_DIR = resolve(ROOT, "assets/images");

// Husstil — matcher de eksisterende billeder (samme som API-skillet).
const STYLE =
  "Photorealistic food photography, appetizing and natural. Bright soft natural " +
  "window light, rustic weathered wood table, speckled ceramic bowl or plate, " +
  "fresh garnish, a linen napkin and a fork, gentle shallow depth of field, " +
  "3:2 landscape composition, no text, no watermark, no hands.";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx !== -1 ? args[onlyIdx + 1] : null;
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx !== -1 ? Number(args[limitIdx + 1]) : Infinity;

const PROFILE_DIR =
  process.env.GEMINI_PROFILE_DIR ||
  resolve(os.homedir(), ".cache/saved-recipies/gemini-chrome-profile");
const GEMINI_URL = process.env.GEMINI_URL || "https://gemini.google.com/app";
const LOGIN_TIMEOUT_MS = Number(process.env.LOGIN_TIMEOUT_MS || 300000);
const IMAGE_TIMEOUT_MS = Number(process.env.IMAGE_TIMEOUT_MS || 120000);

// Selektorer — Gemini ændrer sit UI jævnligt; hver er en liste af fallbacks.
// (Verificeret mod det faktiske UI: input er en ql-editor med role=textbox;
// undgå .ql-clipboard der også er contenteditable. Der er ingen synlig
// send-knap — Gemini sender på Enter.)
const EDITOR_SELECTORS = (process.env.GEMINI_EDITOR_SEL || [
  "div.ql-editor[role='textbox']",
  "[aria-label='Angiv en prompt til Gemini']",
  "rich-textarea .ql-editor[contenteditable='true']",
].join("||")).split("||");
const NEWCHAT_SELECTORS = (process.env.GEMINI_NEWCHAT_SEL || [
  "button[aria-label*='Ny chat']",
  "button[aria-label*='New chat']",
  "a[aria-label*='Ny chat']",
  "a[aria-label*='New chat']",
].join("||")).split("||");

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Kør en kommando og returnér {code, stdout, stderr}. */
function run(cmd, argv, input) {
  return new Promise((res) => {
    const p = spawn(cmd, argv, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => res({ code, stdout: out, stderr: err }));
    p.on("error", (e) => res({ code: -1, stdout: "", stderr: String(e) }));
    if (input != null) p.stdin.end(input);
    else p.stdin.end();
  });
}

/** Importér playwright-core; installér den on-demand (uden at røre package.json). */
async function loadPlaywright() {
  try {
    return await import("playwright-core");
  } catch {
    log("• playwright-core mangler — installerer (npm install --no-save)…");
    const inst = await run("npm", ["install", "--no-save", "playwright-core"], null);
    if (inst.code !== 0) {
      throw new Error("Kunne ikke installere playwright-core: " + inst.stderr.trim());
    }
    return await import("playwright-core");
  }
}

/** Sørg for at Python + Pillow er til rådighed. */
async function ensurePillow() {
  const check = await run("python3", ["-c", "import PIL"]);
  if (check.code === 0) return;
  log("• Pillow mangler — installerer (pip install Pillow)…");
  const install = await run("python3", ["-m", "pip", "install", "--quiet", "Pillow"]);
  if (install.code !== 0) {
    throw new Error("Kunne ikke installere Pillow: " + install.stderr.trim());
  }
}

/** Byg billed-prompten for en post. */
function buildPrompt(item, kind) {
  const parts = [];
  parts.push(
    kind === "snack"
      ? `A healthy snack: "${item.title}".`
      : `A finished dish: "${item.title}".`
  );
  if (item.description) parts.push(item.description);
  if (kind === "recipe" && Array.isArray(item.ingredients) && item.ingredients.length) {
    const names = item.ingredients
      .slice(0, 8)
      .map((ing) =>
        typeof ing === "string" ? ing : INGREDIENT_NAMES.get(ing.ref) || ing.ref
      )
      .filter(Boolean);
    if (names.length) parts.push("Key ingredients: " + names.join(", ") + ".");
  }
  parts.push(STYLE);
  // Bed eksplicit om ét billede, så web-UI'et genererer frem for at snakke.
  parts.push("Generate a single image.");
  return parts.join(" ");
}

/** Komprimér rå billed-bytes til ~1200 px progressiv JPG via Pillow. */
async function compressToJpg(rawBuffer, destPath) {
  const tmp = resolve(os.tmpdir(), `opskrift-img-${randomUUID()}`);
  await writeFile(tmp, rawBuffer);
  const py = `
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
w, h = im.size
target = 1200
if w > target:
    im = im.resize((target, round(h * target / w)), Image.LANCZOS)
im.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
print(im.size[0], im.size[1])
`;
  const out = await run("python3", ["-c", py, tmp, destPath]);
  if (out.code !== 0) {
    throw new Error("Pillow-komprimering fejlede: " + out.stderr.trim());
  }
}

/** Sæt `image` lige efter `emoji` (matcher eksisterende rækkefølge). */
function withImage(obj, imagePath) {
  const out = {};
  let inserted = false;
  const anchor = ["emoji", "description", "title"].find((k) => k in obj);
  for (const [k, v] of Object.entries(obj)) {
    if (k === "image") continue;
    out[k] = v;
    if (!inserted && k === anchor) {
      out.image = imagePath;
      inserted = true;
    }
  }
  if (!inserted) out.image = imagePath;
  return out;
}

async function loadJson(relPath) {
  const abs = resolve(ROOT, relPath);
  const raw = await readFile(abs, "utf8");
  return { abs, data: JSON.parse(raw) };
}

/** Kanonisk ingrediens-katalog (id → visningsnavn), så prompten kan nævne
 *  rigtige ingredienser i stedet for "[object Object]". Fejler blødt. */
const INGREDIENT_NAMES = new Map();
try {
  const { data } = await loadJson("data/ingredients.json");
  for (const ing of data.ingredients || []) INGREDIENT_NAMES.set(ing.id, ing.name);
} catch {
  /* kataloget mangler — prompten falder tilbage til ref-id'er */
}

/** Find første synlige element blandt en liste af selektorer. */
async function firstVisible(page, selectors, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      try {
        if (await loc.isVisible()) return loc;
      } catch {
        /* selektor ikke gyldig endnu — prøv næste */
      }
    }
    await sleep(400);
  }
  return null;
}

// Genererede billeder hentes via NETVÆRKET (page.on('response')), ikke via
// fetch() i siden — Geminis billed-URL'er er CORS-beskyttede. Vi fanger alle
// billed-svar (undtagen Geminis egne UI-assets på gstatic/SVG) i en buffer.
const capturedImages = [];
function attachImageCapture(page) {
  page.on("response", async (res) => {
    try {
      const url = res.url();
      const ct = res.headers()["content-type"] || "";
      if (!ct.startsWith("image/")) return;
      if (/gstatic\.com/.test(url) || ct === "image/svg+xml") return; // UI-logoer
      const buf = await res.body().catch(() => null);
      if (buf && buf.length > 50000) capturedImages.push(buf); // >50 KB = rigtigt foto
    } catch {
      /* svar kunne ikke læses — ignorér */
    }
  });
}

/** Start en ny, tom chat (knap hvis muligt, ellers ny navigation). */
async function newChat(page) {
  const btn = await firstVisible(page, NEWCHAT_SELECTORS, 2500);
  if (btn) {
    await btn.click().catch(() => {});
    await sleep(1000);
  } else {
    await page.goto(GEMINI_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  }
  return firstVisible(page, EDITOR_SELECTORS, 20000);
}

/** Generér ét billede for en prompt. Returnér Buffer eller kast. */
async function generateViaBrowser(page, prompt, isFirst) {
  // Første prompt bruger den allerede åbne chat; senere starter vi en ny.
  const editor = isFirst
    ? await firstVisible(page, EDITOR_SELECTORS, 20000)
    : await newChat(page);
  if (!editor) throw new Error("Fandt ikke prompt-inputfeltet (UI ændret?)");

  const before = capturedImages.length;

  await editor.click();
  await editor.fill(prompt).catch(async () => {
    // Fallback for contenteditable hvor fill ikke slår igennem.
    await editor.type(prompt);
  });
  await sleep(400);
  await page.keyboard.press("Enter"); // Gemini sender på Enter

  // Vent på at et nyt billed-svar dukker op på netværket.
  const deadline = Date.now() + IMAGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (capturedImages.length > before) {
      await sleep(1500); // lad et evt. større/endeligt billede nå frem
      // Tag det største nye billede (Gemini kan sende thumbnail + fuld str.).
      const fresh = capturedImages.slice(before);
      return fresh.sort((a, b) => b.length - a.length)[0];
    }
    await sleep(1000);
  }
  throw new Error(`Intet billede efter ${IMAGE_TIMEOUT_MS / 1000}s`);
}

async function processCollection(page, { relPath, key, kind }, budget) {
  let file;
  try {
    file = await loadJson(relPath);
  } catch (e) {
    warn(`• Springer ${relPath} over (kunne ikke læses: ${e.message}).`);
    return { generated: [], failed: [] };
  }
  const items = file.data[key] || [];
  let missing = items.filter((it) => !it.image);
  if (ONLY) missing = missing.filter((it) => it.slug === ONLY);

  if (missing.length === 0) {
    log(`• ${relPath}: ingen poster mangler billede.`);
    return { generated: [], failed: [] };
  }

  log(`• ${relPath}: ${missing.length} post(er) uden billede.`);
  const generated = [];
  const failed = [];

  for (const item of missing) {
    if (budget.remaining <= 0) break;
    const dest = resolve(IMAGES_DIR, `${item.slug}.jpg`);
    const relImage = `assets/images/${item.slug}.jpg`;
    const prompt = buildPrompt(item, kind);

    if (DRY_RUN) {
      log(`  [dry-run] ${item.slug} → ${relImage}`);
      log(`            prompt: ${prompt.slice(0, 140)}…`);
      continue;
    }

    // Tæl mod --limit pr. FORSØG (så fejl ikke omgår grænsen).
    budget.remaining -= 1;
    const isFirst = budget.firstDone !== true;
    budget.firstDone = true;
    try {
      process.stdout.write(`  → ${item.slug} … `);
      const raw = await generateViaBrowser(page, prompt, isFirst);
      await compressToJpg(raw, dest);
      items[items.indexOf(item)] = withImage(item, relImage);
      generated.push(item.slug);
      log("ok");
      // Skriv løbende tilbage, så et nedbrud ikke taber færdige billeder.
      await writeFile(file.abs, JSON.stringify(file.data, null, 2) + "\n", "utf8");
    } catch (e) {
      log("FEJL");
      failed.push({ slug: item.slug, error: e.message });
    }
  }

  if (!DRY_RUN && generated.length) {
    log(`  ✎ Opdaterede ${relPath} (${generated.length} nye billeder).`);
  }
  return { generated, failed };
}

// ---- Kør ----
let chromium;
try {
  ({ chromium } = await loadPlaywright());
  if (!DRY_RUN) await ensurePillow();
} catch (e) {
  console.error("✖ " + e.message);
  process.exit(1);
}

await mkdir(IMAGES_DIR, { recursive: true }).catch(() => {});

if (DRY_RUN) {
  // Ingen browser nødvendig for en tørkørsel.
  const budget = { remaining: LIMIT };
  await processCollection(null, { relPath: "data/recipes.json", key: "recipes", kind: "recipe" }, budget);
  await processCollection(null, { relPath: "data/snacks.json", key: "snacks", kind: "snack" }, budget);
  process.exit(0);
}

await mkdir(PROFILE_DIR, { recursive: true }).catch(() => {});
log(`• Chrome-profil: ${PROFILE_DIR}`);

let context;
try {
  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
} catch (e) {
  console.error(
    "✖ Kunne ikke starte Chrome via Playwright: " + e.message +
    "\n  Er Google Chrome installeret? (channel:'chrome')"
  );
  process.exit(1);
}

const page = context.pages()[0] || (await context.newPage());
attachImageCapture(page); // fang genererede billeder fra netværket
await page.goto(GEMINI_URL, { waitUntil: "domcontentloaded" }).catch(() => {});

// Login-tjek: vent på inputfeltet. Er det der ikke, bed brugeren logge ind.
let editor = await firstVisible(page, EDITOR_SELECTORS, 15000);
if (!editor) {
  log("");
  log("──────────────────────────────────────────────────────────────");
  log(" Log ind på Google i browservinduet der lige åbnede.");
  log(" Sessionen gemmes, så du kun skal gøre det denne ene gang.");
  log(` Venter i op til ${Math.round(LOGIN_TIMEOUT_MS / 1000)}s på at Gemini er klar…`);
  log("──────────────────────────────────────────────────────────────");
  editor = await firstVisible(page, EDITOR_SELECTORS, LOGIN_TIMEOUT_MS);
}
if (!editor) {
  console.error("✖ Gemini blev ikke klar (login gennemført? UI ændret?).");
  await context.close().catch(() => {});
  process.exit(1);
}
log("• Gemini er klar — genererer billeder.\n");

const budget = { remaining: LIMIT };
const results = [];
results.push(await processCollection(page, { relPath: "data/recipes.json", key: "recipes", kind: "recipe" }, budget));
results.push(await processCollection(page, { relPath: "data/snacks.json", key: "snacks", kind: "snack" }, budget));

await context.close().catch(() => {});

const generated = results.flatMap((r) => r.generated);
const failed = results.flatMap((r) => r.failed);

log("");
log(`Færdig: ${generated.length} billede(r) genereret.`);
if (failed.length) {
  warn(`⚠ ${failed.length} post(er) fejlede og blev sprunget over:`);
  for (const f of failed) warn(`   - ${f.slug}: ${f.error}`);
  process.exitCode = 1;
}
