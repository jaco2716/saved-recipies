// Visningslag: bygger HTML ud fra opskrift-data.
//
// Al DOM-opbygning sker her. Vi bruger små hjælpefunktioner i stedet for
// innerHTML med rå strenge, så indhold fra data automatisk bliver escapet
// (ingen risiko for at en apostrof eller < i en opskrift ødelægger siden).

/** Opret et element med attributter og børn. */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child);
  }
  return node;
}

/** Kort til forsidens oversigt. */
function recipeCard(recipe) {
  const thumb = recipe.image
    ? el("img", {
        class: "recipe-card__thumb",
        src: recipe.image,
        alt: "",
        loading: "lazy",
      })
    : el("span", { class: "recipe-card__emoji", "aria-hidden": "true", text: recipe.emoji || "🍽️" });

  return el("a", { class: "recipe-card", href: `#/opskrift/${recipe.slug}` }, [
    thumb,
    el("span", { class: "recipe-card__body" }, [
      el("span", { class: "recipe-card__title", text: recipe.title }),
      recipe.description
        ? el("span", { class: "recipe-card__desc", text: recipe.description })
        : null,
      recipe.category
        ? el("span", { class: "recipe-card__tag", text: recipe.category })
        : null,
    ]),
  ]);
}

function resultsFor(recipes) {
  return recipes.length > 0
    ? el("div", { class: "recipe-grid" }, recipes.map(recipeCard))
    : el("p", { class: "empty", text: "Ingen opskrifter matcher din søgning." });
}

/**
 * Forsidens oversigt med søgefelt.
 *
 * Søgefeltet oprettes én gang og genbruges, så det ikke mister fokus mens
 * man skriver. Kun resultat-listen tegnes om. `onSearch` skal returnere en
 * Promise med de matchende opskrifter.
 *
 * @param {object} opts
 * @param {Array<object>} opts.recipes - startresultater
 * @param {string} opts.query - startsøgetekst
 * @param {(q: string) => Promise<Array<object>>} opts.onSearch
 */
export function renderList({ recipes, query, onSearch }) {
  const search = el("input", {
    class: "search",
    type: "search",
    placeholder: "Søg efter opskrift, ingrediens eller kategori…",
    value: query,
    "aria-label": "Søg i opskrifter",
  });

  const results = resultsFor(recipes);

  const section = el("section", {}, [
    el("div", { class: "toolbar" }, [search]),
    results,
  ]);

  let seq = 0;
  search.addEventListener("input", async (e) => {
    const mine = ++seq;
    const matches = await onSearch(e.target.value);
    // Ignorér forældede svar, hvis brugeren har skrevet videre imens.
    if (mine !== seq) return;
    section.replaceChild(resultsFor(matches), section.lastChild);
  });

  return section;
}

/** Enkelt opskrift. */
export function renderRecipe(recipe) {
  const meta = el("div", { class: "meta" }, [
    recipe.servings
      ? el("span", {}, [el("strong", { text: "Antal: " }), document.createTextNode(recipe.servings)])
      : null,
    recipe.time
      ? el("span", {}, [el("strong", { text: "Tid: " }), document.createTextNode(recipe.time)])
      : null,
    recipe.category
      ? el("span", {}, [el("strong", { text: "Kategori: " }), document.createTextNode(recipe.category)])
      : null,
    recipe.calories
      ? el("span", {}, [el("strong", { text: "Kalorier: " }), document.createTextNode(recipe.calories)])
      : null,
    recipe.protein
      ? el("span", {}, [el("strong", { text: "Protein: " }), document.createTextNode(recipe.protein)])
      : null,
  ]);

  const tags =
    recipe.tags && recipe.tags.length
      ? el("div", { class: "tags" }, recipe.tags.map((t) => el("span", { class: "tag", text: t })))
      : null;

  const ingredients = el(
    "ul",
    { class: "ingredients" },
    (recipe.ingredients || []).map((i) => el("li", { text: i }))
  );

  const steps = el(
    "ol",
    { class: "steps" },
    (recipe.steps || []).map((s) => el("li", { text: s }))
  );

  const notes = recipe.notes
    ? el("div", { class: "notes" }, [
        el("strong", { text: "💡 Tip: " }),
        document.createTextNode(recipe.notes),
      ])
    : null;

  const hero = recipe.image
    ? el("img", {
        class: "recipe__image",
        src: recipe.image,
        alt: `Foto af ${recipe.title}`,
      })
    : null;

  return el("article", { class: "recipe" }, [
    el("a", { class: "back", href: "#/" }, "← Alle opskrifter"),
    el("h1", { class: "recipe__title", text: `${recipe.emoji ? recipe.emoji + " " : ""}${recipe.title}` }),
    hero,
    meta,
    tags,
    el("h2", { class: "section", text: "Ingredienser" }),
    ingredients,
    el("h2", { class: "section", text: "Fremgangsmåde" }),
    steps,
    notes,
  ]);
}

/** Fejl- eller "ikke fundet"-visning. */
export function renderMessage(title, message) {
  return el("div", { class: "message" }, [
    el("a", { class: "back", href: "#/" }, "← Alle opskrifter"),
    el("h1", { text: title }),
    el("p", { text: message }),
  ]);
}

/** Opdatér fanetitel og favicon efter hvilken side vi er på. */
export function setPageChrome({ title, emoji }) {
  document.title = title;
  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon && emoji) {
    favicon.href =
      "data:image/svg+xml," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${emoji}</text></svg>`
      );
  }
}
