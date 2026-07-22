// Dataadgangslag.
//
// Al hentning af opskrifter går gennem dette modul. Resten af appen ved ikke,
// om data kommer fra en JSON-fil, et API eller en database. Hvis projektet
// senere skal bruge en rigtig backend (fx Next.js med en database), skal kun
// funktionerne herunder ændres — visning og routing rører du ikke.

const DATA_URL = new URL("../data/recipes.json", import.meta.url);

let cache = null;

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
 * Fritekstsøgning på tværs af titel, beskrivelse, kategori og tags.
 * @param {string} query
 * @returns {Promise<Array<object>>}
 */
export async function searchRecipes(query) {
  const recipes = await getAllRecipes();
  const q = query.trim().toLowerCase();
  if (!q) return recipes;

  return recipes.filter((r) => {
    const haystack = [
      r.title,
      r.description,
      r.category,
      ...(r.tags ?? []),
      ...(r.ingredients ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export class DataError extends Error {
  constructor(message) {
    super(message);
    this.name = "DataError";
  }
}
