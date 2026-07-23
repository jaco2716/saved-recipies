// App-indgang: binder data, router og visning sammen.

import {
  getAllRecipes,
  getRecipeBySlug,
  filterRecipes,
  getFacets,
  getSnacks,
  searchSnacks,
  getIngredientIndex,
  DataError,
} from "./data.js";
import { route, setNotFound, startRouter } from "./router.js";
import {
  renderList,
  renderRecipe,
  renderMessage,
  renderShoppingPage,
  setPageChrome,
} from "./views.js";

const app = document.getElementById("app");
const BASE_TITLE = "Mine opskrifter";
const SHOPPING_KEY = "indkobsliste-valg";

// Kategori-faner: foretrukken rækkefølge af kategorier + gennemgående tags.
// Faner, der ikke matcher nogen opskrift, skjules automatisk (se getFacets).
const CATEGORY_ORDER = ["Morgenmad", "Frokost", "Aftensmad", "Brød & bagning", "Dessert"];
const HIGHLIGHT_TAGS = ["vægttab", "vegetarisk", "meal-prep"];

// Forsiden har to primære sektioner: mad-opskrifter og snacks. De vises som
// store faner øverst; mad har desuden kategori-underfaner, snacks har ingen.
const SNACKS_SECTION = "snacks";
const FOOD_SECTION = "mad";

/** Normalisér sektion-parameteren fra URL'en til "mad" eller "snacks". */
function normalizeSection(value) {
  return value === SNACKS_SECTION ? SNACKS_SECTION : FOOD_SECTION;
}

/** Sortér resultatet efter pris eller tid (tid kun for opskrifter). */
function sortItems(items, sort, kind) {
  if (sort === "pris") {
    return [...items].sort(
      (a, b) => (a.pricePerServing ?? Infinity) - (b.pricePerServing ?? Infinity)
    );
  }
  if (sort === "tid" && kind === "recipes") {
    return [...items].sort(
      (a, b) => (a.timeMinutes ?? Infinity) - (b.timeMinutes ?? Infinity)
    );
  }
  return items; // standard: datarækkefølgen
}

/** Hent resultatet for et givet filter — enten opskrifter eller snacks. */
async function fetchResult({ section, query, category, sort }) {
  if (section === SNACKS_SECTION) {
    return { kind: "snacks", items: sortItems(await searchSnacks(query), sort, "snacks") };
  }
  return {
    kind: "recipes",
    items: sortItems(await filterRecipes({ query, category }), sort, "recipes"),
  };
}

/** Udskift hele appens indhold og rul til toppen. */
function mount(node) {
  app.replaceChildren(node);
  window.scrollTo(0, 0);
}

/** Markér det aktive punkt i topmenuen. */
function setActiveNav(name) {
  for (const link of document.querySelectorAll("[data-nav]")) {
    link.classList.toggle("is-active", link.dataset.nav === name);
  }
}

/** Læs/gem indkøbslistens valg i browseren, så det overlever genindlæsning. */
function loadShoppingState() {
  try {
    return JSON.parse(localStorage.getItem(SHOPPING_KEY)) || {};
  } catch {
    return {};
  }
}

function saveShoppingState(state) {
  try {
    localStorage.setItem(SHOPPING_KEY, JSON.stringify(state));
  } catch {
    /* privat browsing e.l. — så husker vi bare ikke valget */
  }
}

/**
 * Forside med søgning og kategori-faner. Både søgetekst og valgt kategori
 * ligger i URL'en (#/?q=...&kat=...), så en filtreret visning kan deles.
 */
async function showList(params) {
  const qs = new URLSearchParams(params[0] || "");
  const query = (qs.get("q") || "").trim();
  const category = (qs.get("kat") || "").trim();
  const section = normalizeSection((qs.get("sektion") || "").trim());
  const sort = (qs.get("sort") || "").trim();
  try {
    setPageChrome({ title: BASE_TITLE, emoji: "🍳" });
    setActiveNav("list");
    const [result, facets, snacks] = await Promise.all([
      fetchResult({ section, query, category, sort }),
      getFacets(CATEGORY_ORDER, HIGHLIGHT_TAGS),
      getSnacks().catch(() => []),
    ]);
    mount(
      renderList({
        result,
        section,
        hasSnacks: snacks.length > 0,
        query,
        category,
        sort,
        facets,
        // Kaldes når sektion, søgetekst, fane eller sortering ændres. Opdaterer
        // den delbare URL og returnerer det matchende resultat.
        onFilter: async (f) => {
          const next = new URLSearchParams();
          if (f.section === SNACKS_SECTION) next.set("sektion", SNACKS_SECTION);
          if (f.query.trim()) next.set("q", f.query.trim());
          if (f.section !== SNACKS_SECTION && f.category) next.set("kat", f.category);
          if (f.sort) next.set("sort", f.sort);
          const suffix = next.toString();
          history.replaceState(null, "", suffix ? `#/?${suffix}` : "#/");
          return fetchResult(f);
        },
      })
    );
  } catch (err) {
    showError(err);
  }
}

async function showRecipe(params) {
  const slug = params[0];
  try {
    const [recipe, catalog] = await Promise.all([
      getRecipeBySlug(slug),
      getIngredientIndex(),
    ]);
    if (!recipe) {
      setPageChrome({ title: `Ikke fundet · ${BASE_TITLE}`, emoji: "🤔" });
      mount(
        renderMessage(
          "Opskriften findes ikke",
          "Vi kunne ikke finde den opskrift, du leder efter. Måske er den flyttet eller slettet."
        )
      );
      return;
    }
    setPageChrome({ title: `${recipe.title} · ${BASE_TITLE}`, emoji: recipe.emoji || "🍳" });
    setActiveNav("list");
    mount(renderRecipe(recipe, catalog));
  } catch (err) {
    showError(err);
  }
}

async function showShopping() {
  try {
    setPageChrome({ title: `Indkøbsliste · ${BASE_TITLE}`, emoji: "🛒" });
    setActiveNav("shopping");
    const [recipes, snacks, catalog] = await Promise.all([
      getAllRecipes(),
      getSnacks().catch(() => []),
      getIngredientIndex(),
    ]);
    const state = loadShoppingState();
    mount(
      renderShoppingPage({
        recipes,
        snacks,
        state,
        onChange: saveShoppingState,
        catalog,
      })
    );
  } catch (err) {
    showError(err);
  }
}

function showError(err) {
  const message =
    err instanceof DataError
      ? err.message
      : "Der opstod en uventet fejl. Prøv at genindlæse siden.";
  setPageChrome({ title: `Fejl · ${BASE_TITLE}`, emoji: "⚠️" });
  mount(renderMessage("Ups!", message));
  console.error(err);
}

// Ruter.
route(/^\/opskrift\/([^/]+)$/, showRecipe);
route(/^\/indkobsliste$/, showShopping);
route(/^\/(?:\?(.*))?$/, showList); // forside, evt. med ?q=...&kat=...
setNotFound(() =>
  mount(renderMessage("Siden findes ikke", "Denne adresse fører ikke til noget."))
);

// Forvarm cachen, så første klik føles hurtigt, og start routeren.
getAllRecipes().catch(() => {});
startRouter();
