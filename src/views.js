// Visningslag: bygger HTML ud fra opskrift-data.
//
// Al DOM-opbygning sker her. Vi bruger små hjælpefunktioner i stedet for
// innerHTML med rå strenge, så indhold fra data automatisk bliver escapet
// (ingen risiko for at en apostrof eller < i en opskrift ødelægger siden).

import { buildShoppingList } from "./shopping.js";

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

/** Kort til en snack (ingen fremgangsmåde — kun info). */
function snackCard(snack) {
  const thumb = snack.image
    ? el("img", {
        class: "recipe-card__thumb",
        src: snack.image,
        alt: "",
        loading: "lazy",
      })
    : el("span", { class: "recipe-card__emoji", "aria-hidden": "true", text: snack.emoji || "🍿" });

  return el("div", { class: "recipe-card snack-card" }, [
    thumb,
    el("span", { class: "recipe-card__body" }, [
      el("span", { class: "recipe-card__title", text: snack.title }),
      snack.description
        ? el("span", { class: "recipe-card__desc", text: snack.description })
        : null,
      snack.tags && snack.tags.length
        ? el("div", { class: "tags" }, snack.tags.map((t) => el("span", { class: "tag", text: t })))
        : null,
    ]),
  ]);
}

/**
 * Byg resultat-gitteret. `result` er { kind, items }, hvor kind afgør, om der
 * vises opskrifts- eller snack-kort.
 */
function resultsFor(result) {
  const { kind, items } = result;
  if (items.length === 0) {
    return el("p", { class: "empty", text: "Ingen matcher dit valg." });
  }
  const render = kind === "snacks" ? snackCard : recipeCard;
  return el("div", { class: "recipe-grid" }, items.map(render));
}

/**
 * Forsidens oversigt med søgefelt og kategori-faner.
 *
 * Søgefelt og faner oprettes én gang og genbruges, så søgefeltet ikke mister
 * fokus mens man skriver. Kun resultat-listen tegnes om. `onFilter` skal
 * returnere en Promise med et resultat { kind, items }.
 *
 * @param {object} opts
 * @param {{kind: string, items: Array<object>}} opts.result - startresultat
 * @param {string} opts.query - startsøgetekst
 * @param {string} opts.category - aktiv fane (tom = Alle)
 * @param {Array<{key: string, label: string, divider?: boolean}>} opts.facets
 * @param {(f: {query: string, category: string}) => Promise<{kind: string, items: Array<object>}>} opts.onFilter
 */
export function renderList({ result, query, category, facets, onFilter }) {
  const state = { query: query || "", category: category || "" };

  const search = el("input", {
    class: "search",
    type: "search",
    placeholder: "Søg efter opskrift, ingrediens eller kategori…",
    value: state.query,
    "aria-label": "Søg i opskrifter",
  });

  // Kategori-faner: "Alle" + én pr. facet.
  const tabButtons = new Map();
  function makeTab(key, label) {
    const btn = el("button", { class: "tab", type: "button", text: label });
    btn.addEventListener("click", () => {
      state.category = key;
      syncTabs();
      run();
    });
    tabButtons.set(key, btn);
    return btn;
  }

  const tabChildren = [makeTab("", "Alle")];
  for (const f of facets) {
    // En 'divider' adskiller fx snacks visuelt fra mad-kategorierne.
    if (f.divider) tabChildren.push(el("span", { class: "tabs__divider", "aria-hidden": "true" }));
    tabChildren.push(makeTab(f.key, f.label));
  }
  const tabs = el("div", { class: "tabs", role: "tablist", "aria-label": "Kategorier" }, tabChildren);

  function syncTabs() {
    for (const [key, btn] of tabButtons) {
      const active = key === state.category;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    }
  }
  syncTabs();

  // Rul den aktive fane ind i billedet (fx ved dybt link til en fane til højre).
  if (state.category) {
    requestAnimationFrame(() =>
      tabButtons.get(state.category)?.scrollIntoView({ inline: "center", block: "nearest" })
    );
  }

  const section = el("section", {}, [
    el("div", { class: "toolbar" }, [search]),
    tabs,
    resultsFor(result),
  ]);

  let seq = 0;
  async function run() {
    const mine = ++seq;
    const next = await onFilter({ query: state.query, category: state.category });
    if (mine !== seq) return; // forældet svar — brugeren nåede at ændre noget
    section.replaceChild(resultsFor(next), section.lastChild);
  }

  search.addEventListener("input", (e) => {
    state.query = e.target.value;
    run();
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

/**
 * Indkøbsliste-siden.
 *
 * Til venstre vælger man opskrifter og antal portioner; til højre bygges
 * listen automatisk. Kun resultat-delen tegnes om ved ændringer, så
 * portioner-felterne beholder fokus mens man skriver.
 *
 * @param {object} opts
 * @param {Array<object>} opts.recipes
 * @param {Object<string, {selected: boolean, servings: number}>} opts.state
 * @param {(state: object) => void} opts.onChange - kaldes når valget ændres
 */
export function renderShoppingPage({ recipes, state, onChange }) {
  const controls = el("div", { class: "picker" }, [
    el("h2", { class: "section", text: "Vælg opskrifter" }),
  ]);

  for (const recipe of recipes) {
    const entry = state[recipe.slug] || {
      selected: false,
      servings: recipe.baseServings || 1,
    };

    const checkbox = el("input", {
      type: "checkbox",
      class: "picker__check",
      id: `pick-${recipe.slug}`,
    });
    checkbox.checked = entry.selected;

    const servings = el("input", {
      type: "number",
      class: "picker__servings",
      min: "1",
      value: String(entry.servings),
      "aria-label": `Antal portioner for ${recipe.title}`,
    });
    servings.disabled = !entry.selected;

    const row = el("div", { class: "picker__row" }, [
      el("label", { class: "picker__label", for: `pick-${recipe.slug}` }, [
        checkbox,
        el("span", { text: `${recipe.emoji ? recipe.emoji + " " : ""}${recipe.title}` }),
      ]),
      el("span", { class: "picker__qty" }, [
        servings,
        el("span", { class: "picker__unit", text: "portioner" }),
      ]),
    ]);

    checkbox.addEventListener("change", () => {
      state[recipe.slug] = { selected: checkbox.checked, servings: Number(servings.value) || 1 };
      servings.disabled = !checkbox.checked;
      onChange(state);
      update();
    });
    servings.addEventListener("input", () => {
      const n = Math.max(1, Math.round(Number(servings.value) || 1));
      state[recipe.slug] = { selected: checkbox.checked, servings: n };
      onChange(state);
      update();
    });

    controls.append(row);
  }

  const output = el("div", { class: "shopping-output" });

  const section = el("section", { class: "shopping" }, [
    el("p", { class: "shopping__intro", text: "Vælg de opskrifter du vil handle ind til, og hvor mange portioner af hver. Så lægger vi ingredienserne sammen til én liste. Tjek mængderne — de skaleres automatisk ud fra opskrifternes normale størrelse." }),
    controls,
    output,
  ]);

  function selections() {
    return recipes
      .filter((r) => state[r.slug]?.selected)
      .map((r) => ({ recipe: r, servings: state[r.slug].servings || r.baseServings || 1 }));
  }

  function update() {
    const chosen = selections();
    if (chosen.length === 0) {
      output.replaceChildren(
        el("p", { class: "empty", text: "Vælg mindst én opskrift for at få en indkøbsliste." })
      );
      return;
    }

    const { items, count } = buildShoppingList(chosen);

    const list = el(
      "ul",
      { class: "shopping-list" },
      items.map((item, idx) => {
        const cb = el("input", { type: "checkbox", id: `buy-${idx}`, class: "shopping-list__check" });
        const label = el("label", { class: "shopping-list__label", for: `buy-${idx}` }, [
          el("span", { class: "shopping-list__text", text: item.display }),
          el("span", { class: "shopping-list__from", text: item.sources.join(", ") }),
        ]);
        cb.addEventListener("change", () => label.classList.toggle("is-done", cb.checked));
        return el("li", { class: "shopping-list__item" }, [cb, label]);
      })
    );

    const copyBtn = el("button", { class: "btn", type: "button", text: "📋 Kopiér liste" });
    copyBtn.addEventListener("click", async () => {
      const text = "Indkøbsliste\n\n" + items.map((i) => `- ${i.display}`).join("\n");
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "✓ Kopieret";
        setTimeout(() => (copyBtn.textContent = "📋 Kopiér liste"), 1500);
      } catch {
        copyBtn.textContent = "Kunne ikke kopiere";
      }
    });

    const printBtn = el("button", { class: "btn btn--ghost", type: "button", text: "🖨️ Print" });
    printBtn.addEventListener("click", () => window.print());

    output.replaceChildren(
      el("div", { class: "shopping-output__head" }, [
        el("h2", { class: "section", text: `Din indkøbsliste (${count} varer)` }),
        el("div", { class: "shopping-output__actions" }, [copyBtn, printBtn]),
      ]),
      list
    );
  }

  update();
  return section;
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
