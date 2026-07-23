// App-indgang: binder data, router og visning sammen.

import {
  getAllRecipes,
  getRecipeBySlug,
  filterRecipes,
  getFacets,
  getSnacks,
  searchSnacks,
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

// Snacks er en separat samling (ikke mad-opskrifter). Den får sin egen fane,
// adskilt fra kategorierne med en skillelinje.
const SNACKS_KEY = "snacks";

/** Byg listen af faner: opskrifts-kategorier + en adskilt Snacks-fane. */
async function buildFacets() {
  const recipeFacets = await getFacets(CATEGORY_ORDER, HIGHLIGHT_TAGS);
  const snacks = await getSnacks().catch(() => []);
  if (snacks.length > 0) {
    recipeFacets.push({ key: SNACKS_KEY, label: "🍿 Snacks", divider: true });
  }
  return recipeFacets;
}

/** Hent resultatet for et givet filter — enten opskrifter eller snacks. */
async function fetchResult({ query, category }) {
  if (category === SNACKS_KEY) {
    return { kind: "snacks", items: await searchSnacks(query) };
  }
  return { kind: "recipes", items: await filterRecipes({ query, category }) };
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
  try {
    setPageChrome({ title: BASE_TITLE, emoji: "🍳" });
    setActiveNav("list");
    const [result, facets] = await Promise.all([
      fetchResult({ query, category }),
      buildFacets(),
    ]);
    mount(
      renderList({
        result,
        query,
        category,
        facets,
        // Kaldes når søgetekst eller fane ændres. Opdaterer den delbare URL
        // og returnerer det matchende resultat (opskrifter eller snacks).
        onFilter: async (f) => {
          const next = new URLSearchParams();
          if (f.query.trim()) next.set("q", f.query.trim());
          if (f.category) next.set("kat", f.category);
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
    const recipe = await getRecipeBySlug(slug);
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
    mount(renderRecipe(recipe));
  } catch (err) {
    showError(err);
  }
}

async function showShopping() {
  try {
    setPageChrome({ title: `Indkøbsliste · ${BASE_TITLE}`, emoji: "🛒" });
    setActiveNav("shopping");
    const recipes = await getAllRecipes();
    const state = loadShoppingState();
    mount(
      renderShoppingPage({
        recipes,
        state,
        onChange: saveShoppingState,
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
