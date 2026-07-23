// Logik til indkøbslisten.
//
// Ingredienser er strukturerede referencer ({ ref, amount, unit, ... }) til
// ingrediens-kataloget (data/ingredients.json). Vi slår hver ref op, skalerer
// mængden efter portioner og lægger ens ingredienser sammen på tværs af
// opskrifter (samme ref + samme enhed). Basisvarer (pantry) holdes af listen og
// vises i stedet som en diskret note.
//
// Rene funktioner uden DOM — nemme at teste.

import { resolveIngredient, formatQty } from "./ingredients.js";

/** Byg vist tekst for en samlet indkøbspost (mængder pr. enhed + navn). */
function displayFor(it) {
  const parts = [...it.units.entries()].map(
    ([unit, amt]) => formatQty(amt) + (unit ? " " + unit : "")
  );
  if (parts.length === 0) return it.name; // fx "Salat" uden mængde
  const name = it.name.charAt(0).toLowerCase() + it.name.slice(1);
  return parts.join(" + ") + " " + name;
}

// Rækkefølge på indkøbslisten: gruppér efter varetype.
const CATEGORY_ORDER = [
  "Kød & fjerkræ",
  "Fisk & skaldyr",
  "Grønt",
  "Frugt & bær",
  "Mejeri & æg",
  "Kolonial",
  "Snacks",
];
const categoryRank = (c) => {
  const idx = CATEGORY_ORDER.indexOf(c);
  return idx === -1 ? CATEGORY_ORDER.length : idx;
};

/**
 * Byg en samlet indkøbsliste ud fra valgte opskrifter og snacks.
 *
 * @param {Array<{recipe: object, servings: number}>} selections
 * @param {Array<object>} [snacks] - valgte snacks ({title, ...})
 * @param {Map<string, object>} [catalog] - ingrediens-katalog (id → post)
 * @returns {{items: Array<object>, count: number, pantry: string[]}}
 */
export function buildShoppingList(selections, snacks = [], catalog = new Map()) {
  // Nøgle på ingrediens-id (ikke id+enhed), så en mængdeangivelse i én opskrift
  // og en "efter smag"-omtale i en anden ikke bliver to linjer. Mængder samles
  // pr. enhed inde i posten; forskellige enheder for samme ingrediens vises så
  // side om side ("4 dl + 1 spsk mælk").
  const merged = new Map(); // id -> { id, name, category, units: Map<unit, sum>, optional, sources }
  const pantry = new Map(); // id -> navn (basisvarer der indgår)

  for (const { recipe, servings } of selections) {
    const base = recipe.baseServings || 1;
    const factor = servings / base;

    for (const raw of recipe.ingredients || []) {
      const r = resolveIngredient(raw, catalog);

      if (r.pantry) {
        pantry.set(r.id, r.name);
        continue; // basisvarer kommer ikke på listen
      }

      let entry = merged.get(r.id);
      if (!entry) {
        entry = { id: r.id, name: r.name, category: r.category, units: new Map(), optional: r.optional, sources: new Set() };
        merged.set(r.id, entry);
      } else {
        entry.optional = entry.optional && r.optional; // kun valgfri hvis alle er det
      }
      entry.sources.add(recipe.title);
      if (r.amount != null) {
        entry.units.set(r.unit, (entry.units.get(r.unit) ?? 0) + r.amount * factor);
      }
    }
  }

  const items = [...merged.values()]
    .map((it) => ({
      display: displayFor(it),
      name: it.name,
      category: it.category,
      optional: it.optional,
      sources: [...it.sources],
    }))
    .sort(
      (a, b) =>
        categoryRank(a.category) - categoryRank(b.category) ||
        a.name.localeCompare(b.name, "da")
    );

  // Snacks som enkeltlinjer nederst (ingen mængde), sorteret for sig.
  const snackItems = snacks
    .map((s) => ({
      display: s.title,
      name: s.title,
      category: "Snacks",
      optional: false,
      sources: ["Snack"],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "da"));

  const all = [...items, ...snackItems];
  const pantryNames = [...pantry.values()].sort((a, b) => a.localeCompare(b, "da"));
  return { items: all, count: all.length, pantry: pantryNames };
}
