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
  for (const field of ["ingredients", "steps"]) {
    if (!Array.isArray(r[field]) || r[field].length === 0) {
      fail(`${where}: "${field}" skal være en liste med mindst ét element`);
    } else if (!r[field].every((x) => typeof x === "string")) {
      fail(`${where}: alle elementer i "${field}" skal være tekst`);
    }
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

if (errors.length) {
  console.error(`✖ ${errors.length} fejl i data/recipes.json:\n`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

console.log(`✔ data/recipes.json er gyldig (${recipes.length} opskrifter).`);
