// Dataadgangslag.
//
// Al hentning af opskrifter går gennem dette modul. Resten af appen ved ikke,
// om data kommer fra en JSON-fil, et API eller en database. Hvis projektet
// senere skal bruge en rigtig backend (fx Next.js med en database), skal kun
// funktionerne herunder ændres — visning og routing rører du ikke.

import { indexCatalog } from "./ingredients.js";

const DATA_URL = new URL("../data/recipes.json", import.meta.url);
const SNACKS_URL = new URL("../data/snacks.json", import.meta.url);
const INGREDIENTS_URL = new URL("../data/ingredients.json", import.meta.url);

let cache = null;
let snacksCache = null;
let ingredientsCache = null;
let ingredientIndexCache = null;

/**
 * Henter alle opskrifter (cachet efter første kald).
 * @returns {Promise<Array<object>>}
 */
export async function getAllRecipes() {
  if (cache) return cache;

  let response;
  try {
    response = await fetch(DATA_URL);
  } catch (err) {
    throw new DataError(
      "Kunne ikke hente opskrifterne. Åbner du siden direkte fra en fil " +
        "(file://)? Brug en lille lokal server i stedet — se README."
    );
  }

  if (!response.ok) {
    throw new DataError(
      `Kunne ikke hente opskrifterne (HTTP ${response.status}).`
    );
  }

  const payload = await response.json();
  const recipes = Array.isArray(payload) ? payload : payload.recipes ?? [];

  // Sortér alfabetisk, så listen er forudsigelig.
  cache = recipes.slice().sort((a, b) => a.title.localeCompare(b.title, "da"));
  return cache;
}

/**
 * Henter én opskrift ud fra dens slug.
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
export async function getRecipeBySlug(slug) {
  const recipes = await getAllRecipes();
  return recipes.find((r) => r.slug === slug) ?? null;
}

/**
 * Henter snack-samlingen (cachet). Snacks er en separat, enklere datatype end
 * opskrifter — kun titel, emoji, beskrivelse og tags, ingen fremgangsmåde.
 * @returns {Promise<Array<object>>}
 */
export async function getSnacks() {
  if (snacksCache) return snacksCache;
  let response;
  try {
    response = await fetch(SNACKS_URL);
  } catch (err) {
    throw new DataError(
      "Kunne ikke hente snacks. Åbner du siden direkte fra en fil (file://)? " +
        "Brug en lille lokal server i stedet — se README."
    );
  }
  if (!response.ok) {
    throw new DataError(`Kunne ikke hente snacks (HTTP ${response.status}).`);
  }
  const payload = await response.json();
  const snacks = Array.isArray(payload) ? payload : payload.snacks ?? [];
  snacksCache = snacks.slice().sort((a, b) => a.title.localeCompare(b.title, "da"));
  return snacksCache;
}

/**
 * Henter ingrediens-kataloget (cachet). Kanonisk liste over alle ingredienser
 * med visningsnavn, kategori og om det er en basisvare.
 * @returns {Promise<Array<object>>}
 */
export async function getIngredients() {
  if (ingredientsCache) return ingredientsCache;
  let response;
  try {
    response = await fetch(INGREDIENTS_URL);
  } catch (err) {
    throw new DataError(
      "Kunne ikke hente ingredienser. Åbner du siden direkte fra en fil " +
        "(file://)? Brug en lille lokal server i stedet — se README."
    );
  }
  if (!response.ok) {
    throw new DataError(`Kunne ikke hente ingredienser (HTTP ${response.status}).`);
  }
  const payload = await response.json();
  ingredientsCache = Array.isArray(payload) ? payload : payload.ingredients ?? [];
  return ingredientsCache;
}

/** Katalog som opslags-Map (id → post), cachet. */
export async function getIngredientIndex() {
  if (ingredientIndexCache) return ingredientIndexCache;
  ingredientIndexCache = indexCatalog(await getIngredients());
  return ingredientIndexCache;
}

/** Fritekstsøgning i snacks (titel, beskrivelse, tags). */
export async function searchSnacks(query) {
  const snacks = await getSnacks();
  const q = (query || "").trim().toLowerCase();
  if (!q) return snacks;
  return snacks.filter((s) =>
    [s.title, s.description, ...(s.tags ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

function haystack(r, catalog) {
  // Ingredienser er refs — slå navn op i kataloget, så søgning på fx "kylling"
  // stadig rammer. Tag også noten med ("i tern", "drænet").
  const ingredientText = (r.ingredients ?? []).map((ing) => {
    const name = catalog?.get(ing.ref)?.name || ing.ref || "";
    return `${name} ${ing.note || ""}`;
  });
  return [r.title, r.description, r.category, ...(r.tags ?? []), ...ingredientText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Matcher en opskrift et facet-nøgleord? Rammer både kategori og tags. */
function matchesFacet(r, key) {
  const k = key.toLowerCase();
  return (
    (r.category || "").toLowerCase() === k ||
    (r.tags ?? []).some((t) => t.toLowerCase() === k)
  );
}

/**
 * Fritekstsøgning på tværs af titel, beskrivelse, kategori og tags.
 * @param {string} query
 * @returns {Promise<Array<object>>}
 */
export async function searchRecipes(query) {
  const q = (query || "").trim().toLowerCase();
  const recipes = await getAllRecipes();
  if (!q) return recipes;
  const catalog = await getIngredientIndex();
  return recipes.filter((r) => haystack(r, catalog).includes(q));
}

/**
 * Filtrér opskrifter på både søgetekst og en valgt kategori/tag.
 * @param {{query?: string, category?: string}} opts
 * @returns {Promise<Array<object>>}
 */
export async function filterRecipes({ query = "", category = "" } = {}) {
  let recipes = await getAllRecipes();
  const cat = category.trim();
  const q = query.trim().toLowerCase();
  if (cat) recipes = recipes.filter((r) => matchesFacet(r, cat));
  if (q) {
    const catalog = await getIngredientIndex();
    recipes = recipes.filter((r) => haystack(r, catalog).includes(q));
  }
  return recipes;
}

/**
 * Find de tilgængelige kategori-faner ud fra data.
 * Kategorier kommer først (i foretrukken rækkefølge), derefter udvalgte
 * gennemgående tags. Faner uden opskrifter udelades automatisk.
 * @param {string[]} categoryOrder - foretrukken rækkefølge af kategorier
 * @param {string[]} highlightTags - gennemgående tags der vises som faner
 * @returns {Promise<Array<{key: string, label: string}>>}
 */
export async function getFacets(categoryOrder = [], highlightTags = []) {
  const recipes = await getAllRecipes();

  const categories = new Map(); // nøgle (små bogstaver) -> visningsnavn
  for (const r of recipes) {
    if (r.category) categories.set(r.category.toLowerCase(), r.category);
  }

  const facets = [];
  for (const name of categoryOrder) {
    const key = name.toLowerCase();
    if (categories.has(key)) {
      facets.push({ key, label: categories.get(key) });
      categories.delete(key);
    }
  }
  // Eventuelle kategorier der ikke er nævnt i rækkefølgen — tag dem med til sidst.
  for (const [key, label] of categories) facets.push({ key, label });

  const tags = new Set();
  for (const r of recipes) for (const t of r.tags ?? []) tags.add(t.toLowerCase());
  for (const t of highlightTags) {
    if (tags.has(t.toLowerCase())) {
      facets.push({ key: t.toLowerCase(), label: prettyTag(t) });
    }
  }

  return facets;
}

function prettyTag(t) {
  const label = t.replace(/-/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export class DataError extends Error {
  constructor(message) {
    super(message);
    this.name = "DataError";
  }
}
