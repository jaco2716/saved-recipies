#!/usr/bin/env node
// Validerer data/recipes.json mod data/recipe.schema.json.
//
// Bevidst uden eksterne pakker (ingen npm install nødvendig). Tjekker de
// vigtigste regler: påkrævede felter, typer, unikke slugs og slug-format.
// Kør med:  node scripts/validate.mjs

import { readFile, access } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dataPath = new URL("data/recipes.json", root);

const fileExists = (relPath) =>
  access(new URL(relPath, root)).then(
    () => true,
    () => false
  );

const errors = [];
const fail = (msg) => errors.push(msg);

const raw = await readFile(dataPath, "utf8").catch(() => {
  console.error("✖ Kunne ikke læse data/recipes.json");
  process.exit(1);
});

let payload;
try {
  payload = JSON.parse(raw);
} catch (e) {
  console.error("✖ Ugyldig JSON i data/recipes.json:", e.message);
  process.exit(1);
}

const recipes = Array.isArray(payload) ? payload : payload.recipes;
if (!Array.isArray(recipes)) {
  console.error("✖ Forventede et 'recipes'-array i data/recipes.json");
  process.exit(1);
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const seenSlugs = new Set();
const imageChecks = [];

// ---- Ingrediens-katalog (indlæses før opskrifterne, så refs kan tjekkes) ----
const catalogIds = new Set();
const catalogRaw = await readFile(new URL("data/ingredients.json", root), "utf8").catch(() => null);
if (!catalogRaw) {
  fail("Kunne ikke læse data/ingredients.json (ingrediens-kataloget).");
} else {
  let catalogPayload;
  try {
    catalogPayload = JSON.parse(catalogRaw);
  } catch (e) {
    fail(`Ugyldig JSON i data/ingredients.json: ${e.message}`);
    catalogPayload = { ingredients: [] };
  }
  const catalog = Array.isArray(catalogPayload)
    ? catalogPayload
    : catalogPayload?.ingredients ?? [];
  catalog.forEach((it, i) => {
    const where = `ingrediens #${i + 1}` + (it?.name ? ` ("${it.name}")` : "");
    if (typeof it?.id !== "string" || !slugPattern.test(it.id)) {
      fail(`${where}: ugyldigt eller manglende id "${it?.id}"`);
    } else if (catalogIds.has(it.id)) {
      fail(`${where}: id "${it.id}" bruges mere end én gang`);
    } else {
      catalogIds.add(it.id);
    }
    if (typeof it?.name !== "string" || it.name.length === 0) {
      fail(`${where}: mangler "name"`);
    }
  });
}

recipes.forEach((r, i) => {
  const where = `opskrift #${i + 1}` + (r?.title ? ` ("${r.title}")` : "");

  if (typeof r !== "object" || r === null) {
    fail(`${where}: ikke et objekt`);
    return;
  }
  for (const field of ["slug", "title"]) {
    if (typeof r[field] !== "string" || r[field].length === 0) {
      fail(`${where}: mangler tekstfeltet "${field}"`);
    }
  }
  if (typeof r.slug === "string") {
    if (!slugPattern.test(r.slug)) {
      fail(`${where}: slug "${r.slug}" må kun indeholde små bogstaver, tal og bindestreg`);
    }
    if (seenSlugs.has(r.slug)) {
      fail(`${where}: slug "${r.slug}" bruges af mere end én opskrift`);
    }
    seenSlugs.add(r.slug);
  }
  if (!Array.isArray(r.steps) || r.steps.length === 0) {
    fail(`${where}: "steps" skal være en liste med mindst ét element`);
  } else if (!r.steps.every((x) => typeof x === "string")) {
    fail(`${where}: alle elementer i "steps" skal være tekst`);
  }
  // Ingredienser er referencer til kataloget: { ref, amount?, unit?, note?, optional? }.
  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) {
    fail(`${where}: "ingredients" skal være en liste med mindst ét element`);
  } else {
    r.ingredients.forEach((ing, j) => {
      if (typeof ing !== "object" || ing === null || typeof ing.ref !== "string") {
        fail(`${where}: ingrediens #${j + 1} mangler "ref"`);
      } else if (catalogIds.size && !catalogIds.has(ing.ref)) {
        fail(`${where}: ingrediens-ref "${ing.ref}" findes ikke i data/ingredients.json`);
      }
    });
  }
  if (r.tags != null && !Array.isArray(r.tags)) {
    fail(`${where}: "tags" skal være en liste`);
  }
  if (r.image != null) {
    if (typeof r.image !== "string") {
      fail(`${where}: "image" skal være en tekststi`);
    } else {
      imageChecks.push(
        fileExists(r.image).then((ok) => {
          if (!ok) fail(`${where}: billedet "${r.image}" findes ikke`);
        })
      );
    }
  }
});

await Promise.all(imageChecks);

// ---- Snacks (separat samling) ----
let snacks = [];
const snacksRaw = await readFile(new URL("data/snacks.json", root), "utf8").catch(() => null);
if (snacksRaw) {
  let snacksPayload;
  try {
    snacksPayload = JSON.parse(snacksRaw);
  } catch (e) {
    fail(`Ugyldig JSON i data/snacks.json: ${e.message}`);
  }
  snacks = Array.isArray(snacksPayload) ? snacksPayload : snacksPayload?.snacks ?? [];
  const snackSlugs = new Set();
  snacks.forEach((s, i) => {
    const where = `snack #${i + 1}` + (s?.title ? ` ("${s.title}")` : "");
    for (const field of ["slug", "title"]) {
      if (typeof s?.[field] !== "string" || s[field].length === 0) {
        fail(`${where}: mangler tekstfeltet "${field}"`);
      }
    }
    if (typeof s?.slug === "string") {
      if (!slugPattern.test(s.slug)) fail(`${where}: ugyldigt slug "${s.slug}"`);
      if (snackSlugs.has(s.slug)) fail(`${where}: slug "${s.slug}" bruges to gange`);
      snackSlugs.add(s.slug);
    }
    if (s?.tags != null && !Array.isArray(s.tags)) fail(`${where}: "tags" skal være en liste`);
    if (s?.image != null) {
      if (typeof s.image !== "string") {
        fail(`${where}: "image" skal være en tekststi`);
      } else {
        imageChecks.push(
          fileExists(s.image).then((ok) => {
            if (!ok) fail(`${where}: billedet "${s.image}" findes ikke`);
          })
        );
      }
    }
  });
}

await Promise.all(imageChecks);

if (errors.length) {
  console.error(`✖ ${errors.length} fejl i data:\n`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

console.log(
  `✔ Data er gyldig (${recipes.length} opskrifter, ${snacks.length} snacks, ${catalogIds.size} ingredienser).`
);
