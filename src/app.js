// App-indgang: binder data, router og visning sammen.

import { getAllRecipes, getRecipeBySlug, searchRecipes, DataError } from "./data.js";
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

/** Forside med søgning. Søgningen ligger i URL'en (#/?q=...) så den kan deles. */
async function showList(params) {
  const query = decodeURIComponent(params[0] || "").trim();
  try {
    setPageChrome({ title: BASE_TITLE, emoji: "🍳" });
    setActiveNav("list");
    const recipes = await searchRecipes(query);
    mount(
      renderList({
        recipes,
        query,
        // Kaldes ved hvert tastetryk. Opdaterer den delbare URL og
        // returnerer de matchende opskrifter til visningslaget.
        onSearch: async (value) => {
          const trimmed = value.trim();
          const newHash = trimmed ? `#/?q=${encodeURIComponent(trimmed)}` : "#/";
          history.replaceState(null, "", newHash);
          return searchRecipes(trimmed);
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
route(/^\/$/, showList);
route(/^\/\?q=(.*)$/, showList);
route(/^\/opskrift\/([^/]+)$/, showRecipe);
route(/^\/indkobsliste$/, showShopping);
setNotFound(() =>
  mount(renderMessage("Siden findes ikke", "Denne adresse fører ikke til noget."))
);

// Forvarm cachen, så første klik føles hurtigt, og start routeren.
getAllRecipes().catch(() => {});
startRouter();
