#!/usr/bin/env node
// Genererer madfotos til opskrifter og snacks, der mangler feltet `image`.
//
// Idempotent: rører kun poster UDEN billede. Kør igen hver gang der er tilføjet
// nye opskrifter/snacks — de eksisterende billeder bliver ikke rørt.
//
// Flow pr. post:
//   1. Byg en billed-prompt ud fra titel + beskrivelse (+ ingredienser) i den
//      faste husstil (se STYLE nedenfor).
//   2. Kald Geminis billed-API (:generateContent, responseModalities:["IMAGE"]).
//      Modellen vælges dynamisk fra /models-listen (den gamle
//      gemini-2.5-flash-image-preview er lukket). Kan overstyres med
//      miljøvariablen GEMINI_IMAGE_MODEL.
//   3. Base64-afkod svarets inlineData og komprimér til ~1200 px bred
//      progressiv JPG (kvalitet ~82) med Pillow → assets/images/<slug>.jpg.
//   4. Sæt `image`-feltet på posten (lige efter `emoji`) og skriv JSON tilbage
//      med 2-space indent og bevaret rækkefølge.
//   5. Fejler en post, springes den over og logges til sidst — resten kører.
//
// Krav: $GEMINI_API_KEY skal være sat. Python3 + Pillow bruges til komprimering
// (installeres automatisk hvis Pillow mangler).
//
// Brug:
//   node .claude/skills/opskrift-billeder/scripts/generate-images.mjs
//   node .../generate-images.mjs --dry-run        # vis kun hvad der ville ske
//   node .../generate-images.mjs --only <slug>    # kun én bestemt post

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

// Projektroden ligger fire niveauer over dette script
// (.claude/skills/opskrift-billeder/scripts/ → roden).
const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(scriptDir, "../../../..");

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const IMAGES_DIR = resolve(ROOT, "assets/images");

// Husstil for alle fotos — matcher de eksisterende billeder.
const STYLE =
  "Photorealistic food photography, appetizing and natural. Bright soft natural " +
  "window light, rustic weathered wood table, speckled ceramic bowl or plate, " +
  "fresh garnish, a linen napkin and a fork, gentle shallow depth of field, " +
  "3:2 landscape composition, no text, no watermark, no hands.";

// Foretrukne billed-modeller i prioriteret rækkefølge (nyeste stabile først).
// Vælges dynamisk hvis de findes i /models; ellers falder vi tilbage til den
// første image-model der understøtter generateContent.
const PREFERRED_MODELS = [
  "gemini-3.1-flash-image",
  "gemini-3-pro-image",
  "gemini-2.5-flash-image",
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx !== -1 ? args[onlyIdx + 1] : null;

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error("✖ GEMINI_API_KEY er ikke sat. Sæt den og prøv igen.");
  process.exit(1);
}

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

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

/** Sørg for at Python + Pillow er til rådighed (installér Pillow hvis nødvendigt). */
async function ensurePillow() {
  const check = await run("python3", ["-c", "import PIL"]);
  if (check.code === 0) return;
  log("• Pillow mangler — installerer (pip install Pillow)…");
  const install = await run("python3", ["-m", "pip", "install", "--quiet", "Pillow"]);
  if (install.code !== 0) {
    throw new Error("Kunne ikke installere Pillow: " + install.stderr.trim());
  }
  const recheck = await run("python3", ["-c", "import PIL"]);
  if (recheck.code !== 0) throw new Error("Pillow er stadig ikke tilgængelig.");
}

/** Find den aktuelle billed-model via /models. */
async function pickImageModel() {
  if (process.env.GEMINI_IMAGE_MODEL) return process.env.GEMINI_IMAGE_MODEL;

  const res = await fetch(`${API_BASE}/models?key=${KEY}`);
  if (!res.ok) {
    throw new Error(`Kunne ikke hente model-listen (HTTP ${res.status}).`);
  }
  const data = await res.json();
  const models = (data.models || [])
    .map((m) => ({
      name: (m.name || "").replace(/^models\//, ""),
      methods: m.supportedGenerationMethods || [],
    }))
    .filter(
      (m) => /image/i.test(m.name) && m.methods.includes("generateContent")
    );

  const names = new Set(models.map((m) => m.name));
  for (const pref of PREFERRED_MODELS) {
    if (names.has(pref)) return pref;
  }
  // Ellers: første stabile (uden "preview"/"lite"), så en hvilken som helst.
  const stable = models.find((m) => !/preview|lite/i.test(m.name));
  if (stable) return stable.name;
  if (models[0]) return models[0].name;
  throw new Error("Fandt ingen billed-model med generateContent i /models.");
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
    parts.push("Key ingredients: " + item.ingredients.slice(0, 8).join(", ") + ".");
  }
  parts.push(STYLE);
  return parts.join(" ");
}

/** Kald Gemini og returnér rå billed-bytes (Buffer) eller kast. */
async function generateImage(model, prompt) {
  const url = `${API_BASE}/models/${model}:generateContent?key=${KEY}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"] },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text);
      if (j.error?.message) msg += `: ${j.error.message}`;
    } catch {
      if (text) msg += `: ${text.slice(0, 200)}`;
    }
    throw new Error(msg);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const inline = parts.find((p) => p.inlineData?.data);
  if (!inline) {
    const textPart = parts.find((p) => p.text)?.text;
    throw new Error(
      "Svaret indeholdt intet billede" + (textPart ? ` (model sagde: ${textPart.slice(0, 120)})` : "")
    );
  }
  return Buffer.from(inline.inlineData.data, "base64");
}

/** Komprimér rå billed-bytes til ~1200 px progressiv JPG via Pillow. */
async function compressToJpg(rawBuffer, destPath) {
  const tmp = resolve(os.tmpdir(), `opskrift-img-${randomUUID()}`);
  await writeFile(tmp, rawBuffer);
  const py = `
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src)
im = im.convert("RGB")
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

/**
 * Sæt `image` på et objekt, indsat lige efter `emoji` (ellers efter
 * `description`/`title`) for at matche den eksisterende rækkefølge.
 */
function withImage(obj, imagePath) {
  const out = {};
  let inserted = false;
  const anchors = ["emoji", "description", "title"];
  const anchor = anchors.find((k) => k in obj);
  for (const [k, v] of Object.entries(obj)) {
    if (k === "image") continue; // undgå dublet
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

async function processCollection({ relPath, key, kind }) {
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
    const dest = resolve(IMAGES_DIR, `${item.slug}.jpg`);
    const relImage = `assets/images/${item.slug}.jpg`;
    const prompt = buildPrompt(item, kind);

    if (DRY_RUN) {
      log(`  [dry-run] ${item.slug} → ${relImage}`);
      log(`            prompt: ${prompt.slice(0, 140)}…`);
      continue;
    }

    try {
      process.stdout.write(`  → ${item.slug} … `);
      const raw = await generateImage(MODEL, prompt);
      await compressToJpg(raw, dest);
      // Opdatér posten i selve arrayet.
      const idx = items.indexOf(item);
      items[idx] = withImage(item, relImage);
      generated.push(item.slug);
      log("ok");
    } catch (e) {
      log("FEJL");
      failed.push({ slug: item.slug, error: e.message });
    }
  }

  // Skriv kun tilbage hvis noget faktisk blev genereret.
  if (!DRY_RUN && generated.length) {
    await writeFile(file.abs, JSON.stringify(file.data, null, 2) + "\n", "utf8");
    log(`  ✎ Opdaterede ${relPath} (${generated.length} nye billeder).`);
  }

  return { generated, failed };
}

// ---- Kør ----
let MODEL;
try {
  await ensurePillow();
  MODEL = await pickImageModel();
  log(`• Bruger billed-model: ${MODEL}`);
} catch (e) {
  console.error("✖ " + e.message);
  process.exit(1);
}

await mkdir(IMAGES_DIR, { recursive: true }).catch(() => {});

const results = [];
results.push(await processCollection({ relPath: "data/recipes.json", key: "recipes", kind: "recipe" }));
results.push(await processCollection({ relPath: "data/snacks.json", key: "snacks", kind: "snack" }));

const generated = results.flatMap((r) => r.generated);
const failed = results.flatMap((r) => r.failed);

log("");
log(`Færdig: ${generated.length} billede(r) genereret.`);
if (failed.length) {
  warn(`⚠ ${failed.length} post(er) fejlede og blev sprunget over:`);
  for (const f of failed) warn(`   - ${f.slug}: ${f.error}`);
  process.exitCode = 1; // signalér at ikke alt lykkedes
}
