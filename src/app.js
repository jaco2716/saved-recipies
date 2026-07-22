// App-indgang: binder data, router og visning sammen.

import {
  getAllRecipes,
  getRecipeBySlug,
  filterRecipes,
  getFacets,
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
    const [recipes, facets] = await Promise.all([
      filterRecipes({ query, category }),
      getFacets(CATEGORY_ORDER, HIGHLIGHT_TAGS),
    ]);
    mount(
      renderList({
        recipes,
        query,
        category,
        facets,
        // Kaldes når søgetekst eller fane ændres. Opdaterer den delbare URL
        // og returnerer de matchende opskrifter til visningslaget.
        onFilter: async (f) => {
          const next = new URLSearchParams();
          if (f.query.trim()) next.set("q", f.query.trim());
          if (f.category) next.set("kat", f.category);
          const suffix = next.toString();
          history.replaceState(null, "", suffix ? `#/?${suffix}` : "#/");
          return filterRecipes(f);
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
