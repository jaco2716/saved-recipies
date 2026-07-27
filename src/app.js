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
  renderQueuePage,
  renderHistoryPage,
  setPageChrome,
} from "./views.js";
import { addToQueue, removeFromQueue, isQueued, markMade } from "./queue.js";

const app = document.getElementById("app");
const BASE_TITLE = "Mine opskrifter";
const SHOPPING_KEY = "indkobsliste-valg";
const QUEUE_KEY = "opskrift-koe";
const HISTORY_KEY = "opskrift-historik";

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
 * Læs en liste af {slug, ...}-poster fra localStorage (kø og historik).
 * Beskadigede/ukendte data ignoreres, så en enkelt dårlig post ikke vælter
 * siden.
 */
function loadList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value.filter((x) => x && typeof x.slug === "string") : [];
  } catch {
    return [];
  }
}

function saveList(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* privat browsing e.l. — så husker vi bare ikke listen */
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
    mount(
      renderRecipe(recipe, catalog, {
        queued: isQueued(loadList(QUEUE_KEY), recipe.slug),
        // Læs friskt fra storage i callbacket, så valget ikke bliver forældet
        // hvis køen er ændret på en anden fane imellemtiden.
        onToggleQueue: (nowQueued) => {
          const queue = loadList(QUEUE_KEY);
          saveList(
            QUEUE_KEY,
            nowQueued ? addToQueue(queue, recipe.slug) : removeFromQueue(queue, recipe.slug)
          );
        },
      })
    );
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
        onQueueSelected: (slugs) => {
          let queue = loadList(QUEUE_KEY);
          for (const slug of slugs) queue = addToQueue(queue, slug);
          saveList(QUEUE_KEY, queue);
        },
      })
    );
  } catch (err) {
    showError(err);
  }
}

/** Køen: opskrifter man har handlet ind til og vil lave. */
async function showQueue() {
  try {
    setPageChrome({ title: `Min kø · ${BASE_TITLE}`, emoji: "🧺" });
    setActiveNav("queue");
    const recipes = await getAllRecipes();
    const bySlug = new Map(recipes.map((r) => [r.slug, r]));
    const items = loadList(QUEUE_KEY)
      .filter((q) => bySlug.has(q.slug)) // slettede opskrifter falder fra
      .map((q) => ({ recipe: bySlug.get(q.slug), addedAt: q.addedAt }));
    mount(
      renderQueuePage({
        items,
        onRemove: (slug) => saveList(QUEUE_KEY, removeFromQueue(loadList(QUEUE_KEY), slug)),
        onMade: (slug) => {
          const { queue, history } = markMade(loadList(QUEUE_KEY), loadList(HISTORY_KEY), slug);
          saveList(QUEUE_KEY, queue);
          saveList(HISTORY_KEY, history);
        },
      })
    );
  } catch (err) {
    showError(err);
  }
}

/** Historik: opskrifter man for nylig har lavet. */
async function showHistory() {
  try {
    setPageChrome({ title: `Historik · ${BASE_TITLE}`, emoji: "🕘" });
    setActiveNav("history");
    const recipes = await getAllRecipes();
    const bySlug = new Map(recipes.map((r) => [r.slug, r]));
    const items = loadList(HISTORY_KEY)
      .filter((h) => bySlug.has(h.slug))
      .map((h) => ({ recipe: bySlug.get(h.slug), madeAt: h.madeAt }));
    mount(
      renderHistoryPage({
        items,
        onRequeue: (slug) => saveList(QUEUE_KEY, addToQueue(loadList(QUEUE_KEY), slug)),
        onClear: () => saveList(HISTORY_KEY, []),
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
route(/^\/koe$/, showQueue);
route(/^\/historik$/, showHistory);
route(/^\/(?:\?(.*))?$/, showList); // forside, evt. med ?q=...&kat=...
setNotFound(() =>
  mount(renderMessage("Siden findes ikke", "Denne adresse fører ikke til noget."))
);

// Forvarm cachen, så første klik føles hurtigt, og start routeren.
getAllRecipes().catch(() => {});
startRouter();
