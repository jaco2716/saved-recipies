// Visningslag: bygger HTML ud fra opskrift-data.
//
// Al DOM-opbygning sker her. Vi bruger små hjælpefunktioner i stedet for
// innerHTML med rå strenge, så indhold fra data automatisk bliver escapet
// (ingen risiko for at en apostrof eller < i en opskrift ødelægger siden).

import { buildShoppingList } from "./shopping.js";
import { resolveIngredient, formatIngredientDisplay } from "./ingredients.js";

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

/**
 * Formatér et tidsstempel (ms) som en kort dansk relativ dato: "i dag",
 * "i går", "for N dage siden", ellers "27. jul.". Bruges af kø og historik.
 */
function formatWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (days <= 0) return "i dag";
  if (days === 1) return "i går";
  if (days < 7) return `for ${days} dage siden`;
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
}

/** Lille firkantet miniature (eller emoji-reserve) til kø-/historik-rækker. */
function queueThumb(recipe) {
  return recipe.image
    ? el("img", { class: "queue-item__thumb", src: recipe.image, alt: "", loading: "lazy" })
    : el("span", {
        class: "queue-item__thumb queue-item__thumb--emoji",
        "aria-hidden": "true",
        text: recipe.emoji || "🍽️",
      });
}

/** Lille pris/tid-linje til kort. `withTime` er falsk for snacks (ingen tid). */
function statsLine(item, withTime) {
  const stats = [];
  if (withTime && item.time) {
    stats.push(el("span", { class: "recipe-card__stat", text: `⏱️ ${item.time}` }));
  }
  if (item.pricePerServing != null) {
    const suffix = withTime ? " pr. pers." : "";
    stats.push(el("span", { class: "recipe-card__stat", text: `💰 ca. ${item.pricePerServing} kr.${suffix}` }));
  }
  return stats.length ? el("span", { class: "recipe-card__stats" }, stats) : null;
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
      statsLine(recipe, true),
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
      statsLine(snack, false), // snacks har pris men ingen tid
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
 * Forsidens oversigt med primære faner (Mad/Snacks), søgefelt og — kun for
 * mad — kategori-underfaner.
 *
 * Faner og søgefelt oprettes én gang og genbruges, så søgefeltet ikke mister
 * fokus mens man skriver. Kun resultat-listen tegnes om. `onFilter` skal
 * returnere en Promise med et resultat { kind, items }.
 *
 * @param {object} opts
 * @param {{kind: string, items: Array<object>}} opts.result - startresultat
 * @param {string} opts.section - aktiv sektion ("mad" | "snacks")
 * @param {boolean} opts.hasSnacks - om der overhovedet findes snacks
 * @param {string} opts.query - startsøgetekst
 * @param {string} opts.category - aktiv kategori-fane (tom = Alle)
 * @param {string} opts.sort - sortering ("" | "pris" | "tid")
 * @param {Array<{key: string, label: string}>} opts.facets
 * @param {(f: {section: string, query: string, category: string, sort: string}) => Promise<{kind: string, items: Array<object>}>} opts.onFilter
 */
export function renderList({ result, section, hasSnacks, query, category, sort, facets, onFilter }) {
  const state = {
    section: section === "snacks" ? "snacks" : "mad",
    query: query || "",
    category: category || "",
    sort: sort || "",
  };

  const search = el("input", {
    class: "search",
    type: "search",
    value: state.query,
    "aria-label": "Søg",
  });
  function syncSearchPlaceholder() {
    search.placeholder =
      state.section === "snacks"
        ? "Søg efter snack…"
        : "Søg efter opskrift, ingrediens eller kategori…";
  }

  // Sortering: standard, pris eller tid. Tid gælder kun mad (snacks har ingen).
  const sortSelect = el("select", { class: "sort", "aria-label": "Sortér" });
  sortSelect.append(el("option", { value: "", text: "Sortér: Standard" }));
  sortSelect.append(el("option", { value: "pris", text: "Pris (lav → høj)" }));
  const tidOption = el("option", { value: "tid", text: "Tid (kort → lang)" });
  sortSelect.append(tidOption);
  sortSelect.value = state.sort;
  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    run();
  });
  function syncSortUi() {
    tidOption.hidden = state.section === "snacks";
    if (state.section === "snacks" && state.sort === "tid") state.sort = "";
    sortSelect.value = state.sort;
  }

  // Primære faner: Mad / Snacks. Vises kun hvis der findes snacks.
  const primaryButtons = new Map();
  function makePrimary(key, label) {
    const btn = el("button", { class: "tab", type: "button", text: label });
    btn.addEventListener("click", () => {
      if (state.section === key) return;
      state.section = key;
      state.category = ""; // nulstil kategori når man skifter sektion
      state.query = "";
      search.value = "";
      syncPrimary();
      syncTabs();
      syncSectionUi();
      run();
    });
    primaryButtons.set(key, btn);
    return btn;
  }
  const primaryTabs = hasSnacks
    ? el("div", { class: "tabs tabs--primary", role: "tablist", "aria-label": "Mad eller snacks" }, [
        makePrimary("mad", "🍽️ Mad"),
        makePrimary("snacks", "🍿 Snacks"),
      ])
    : null;
  function syncPrimary() {
    for (const [key, btn] of primaryButtons) {
      const active = key === state.section;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    }
  }

  // Kategori-underfaner (kun for mad): "Alle" + én pr. facet.
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
  for (const f of facets) tabChildren.push(makeTab(f.key, f.label));
  const tabs = el("div", { class: "tabs", role: "tablist", "aria-label": "Kategorier" }, tabChildren);

  function syncTabs() {
    for (const [key, btn] of tabButtons) {
      const active = key === state.category;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    }
  }

  // Skjul kategori-underfaner i snacks-sektionen og opdatér søge-placeholder.
  // (Inline display, ikke `hidden`-attributten: `.tabs { display: flex }` ville
  // ellers overtrumfe browserens [hidden]-regel og vise fanerne alligevel.)
  function syncSectionUi() {
    tabs.style.display = state.section === "snacks" ? "none" : "";
    syncSearchPlaceholder();
    syncSortUi();
  }

  syncPrimary();
  syncTabs();
  syncSectionUi();

  // Rul den aktive kategori ind i billedet (fx ved dybt link til en fane til højre).
  if (state.section === "mad" && state.category) {
    requestAnimationFrame(() =>
      tabButtons.get(state.category)?.scrollIntoView({ inline: "center", block: "nearest" })
    );
  }

  const container = el("section", {}, [
    primaryTabs,
    el("div", { class: "toolbar" }, [search, sortSelect]),
    tabs,
    resultsFor(result),
  ]);

  let seq = 0;
  async function run() {
    const mine = ++seq;
    const next = await onFilter({ section: state.section, query: state.query, category: state.category, sort: state.sort });
    if (mine !== seq) return; // forældet svar — brugeren nåede at ændre noget
    container.replaceChild(resultsFor(next), container.lastChild);
  }

  search.addEventListener("input", (e) => {
    state.query = e.target.value;
    run();
  });

  return container;
}

/**
 * Enkelt opskrift. `catalog` er ingrediens-kataloget (Map id → post).
 * `actions` er valgfri kø-integration: { queued: boolean, onToggleQueue?:
 * (nowQueued: boolean) => void }. Er `onToggleQueue` sat, vises en
 * "Læg i kø"/"Fjern fra kø"-knap, der selv holder styr på sin tilstand.
 */
export function renderRecipe(recipe, catalog = new Map(), actions = {}) {
  const meta = el("div", { class: "meta" }, [
    recipe.servings
      ? el("span", {}, [el("strong", { text: "Antal: " }), document.createTextNode(recipe.servings)])
      : null,
    recipe.time
      ? el("span", {}, [el("strong", { text: "Tid: " }), document.createTextNode(recipe.time)])
      : null,
    recipe.pricePerServing != null
      ? el("span", {}, [el("strong", { text: "Pris: " }), document.createTextNode(`ca. ${recipe.pricePerServing} kr. pr. person`)])
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
    (recipe.ingredients || []).map((ing) => {
      const r = resolveIngredient(ing, catalog);
      const li = el("li", { text: formatIngredientDisplay(r) });
      if (r.optional) li.append(el("span", { class: "ingredient__opt", text: " · valgfri" }));
      return li;
    })
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

  // Kø-knap: skifter selv label/udseende og melder ny tilstand tilbage.
  let queueRow = null;
  if (actions.onToggleQueue) {
    let queued = Boolean(actions.queued);
    const btn = el("button", { class: "btn", type: "button" });
    const sync = () => {
      btn.textContent = queued ? "✓ I køen · fjern igen" : "🧺 Læg i kø";
      btn.classList.toggle("btn--ghost", queued);
    };
    btn.addEventListener("click", () => {
      queued = !queued;
      actions.onToggleQueue(queued);
      sync();
    });
    sync();
    queueRow = el("div", { class: "recipe__actions" }, [btn]);
  }

  return el("article", { class: "recipe" }, [
    el("a", { class: "back", href: "#/" }, "← Alle opskrifter"),
    el("h1", { class: "recipe__title", text: `${recipe.emoji ? recipe.emoji + " " : ""}${recipe.title}` }),
    hero,
    meta,
    tags,
    queueRow,
    el("h2", { class: "section", text: "Ingredienser" }),
    ingredients,
    el("h2", { class: "section", text: "Fremgangsmåde" }),
    steps,
    notes,
  ]);
}

/**
 * Kø-siden: opskrifter man har handlet ind til og vil lave.
 *
 * @param {object} opts
 * @param {Array<{recipe: object, addedAt: number}>} opts.items - ældst først
 * @param {(slug: string) => void} opts.onRemove - fjern uden at gemme i historik
 * @param {(slug: string) => void} opts.onMade - markér som lavet → historik
 */
export function renderQueuePage({ items, onRemove, onMade }) {
  const data = [...items];
  const body = el("div", { class: "queue-body" });

  function rowFor({ recipe, addedAt }) {
    const made = el("button", { class: "btn", type: "button", text: "✅ Lavet" });
    made.addEventListener("click", () => {
      onMade(recipe.slug);
      drop(recipe.slug);
    });
    const rm = el("button", { class: "btn btn--ghost", type: "button", text: "Fjern" });
    rm.addEventListener("click", () => {
      onRemove(recipe.slug);
      drop(recipe.slug);
    });
    return el("li", { class: "queue-item" }, [
      el("a", { class: "queue-item__main", href: `#/opskrift/${recipe.slug}` }, [
        queueThumb(recipe),
        el("span", { class: "queue-item__body" }, [
          el("span", { class: "queue-item__title", text: `${recipe.emoji ? recipe.emoji + " " : ""}${recipe.title}` }),
          el("span", { class: "queue-item__meta", text: `Lagt i kø ${formatWhen(addedAt)}` }),
        ]),
      ]),
      el("div", { class: "queue-item__actions" }, [made, rm]),
    ]);
  }

  function draw() {
    if (!data.length) {
      body.replaceChildren(
        el("p", { class: "empty", text: "Køen er tom. Åbn en opskrift og tryk “🧺 Læg i kø”." })
      );
      return;
    }
    body.replaceChildren(el("ul", { class: "queue-list" }, data.map(rowFor)));
  }

  function drop(slug) {
    const i = data.findIndex((d) => d.recipe.slug === slug);
    if (i >= 0) data.splice(i, 1);
    draw();
  }

  draw();
  return el("section", { class: "queue" }, [
    el("h1", { class: "recipe__title", text: "🧺 Min kø" }),
    el("p", { class: "shopping__intro" }, [
      document.createTextNode("Opskrifter du har handlet ind til og vil lave. Tryk “✅ Lavet”, når du er færdig — så ryger den i "),
      el("a", { href: "#/historik", text: "historikken" }),
      document.createTextNode("."),
    ]),
    body,
  ]);
}

/**
 * Historik-siden: opskrifter man for nylig har lavet (senest øverst).
 *
 * @param {object} opts
 * @param {Array<{recipe: object, madeAt: number}>} opts.items
 * @param {(slug: string) => void} opts.onRequeue - læg i kø igen
 * @param {() => void} opts.onClear - ryd hele historikken
 */
export function renderHistoryPage({ items, onRequeue, onClear }) {
  const data = [...items];
  const body = el("div", { class: "queue-body" });

  function rowFor({ recipe, madeAt }) {
    const again = el("button", { class: "btn btn--ghost", type: "button", text: "🧺 Læg i kø igen" });
    again.addEventListener("click", () => {
      onRequeue(recipe.slug);
      again.textContent = "✓ Lagt i kø igen";
      again.disabled = true;
    });
    return el("li", { class: "queue-item" }, [
      el("a", { class: "queue-item__main", href: `#/opskrift/${recipe.slug}` }, [
        queueThumb(recipe),
        el("span", { class: "queue-item__body" }, [
          el("span", { class: "queue-item__title", text: `${recipe.emoji ? recipe.emoji + " " : ""}${recipe.title}` }),
          el("span", { class: "queue-item__meta", text: `Lavet ${formatWhen(madeAt)}` }),
        ]),
      ]),
      el("div", { class: "queue-item__actions" }, [again]),
    ]);
  }

  function draw() {
    if (!data.length) {
      body.replaceChildren(
        el("p", { class: "empty", text: "Ingen opskrifter i historikken endnu. Når du markerer noget som lavet, dukker det op her." })
      );
      return;
    }
    body.replaceChildren(el("ul", { class: "queue-list" }, data.map(rowFor)));
  }

  const clearBtn = el("button", { class: "btn btn--ghost", type: "button", text: "Ryd historik" });
  clearBtn.addEventListener("click", () => {
    onClear();
    data.length = 0;
    clearBtn.remove();
    draw();
  });

  draw();
  return el("section", { class: "queue" }, [
    el("div", { class: "shopping-output__head" }, [
      el("h1", { class: "recipe__title", text: "🕘 Historik" }),
      data.length ? el("div", { class: "shopping-output__actions" }, [clearBtn]) : null,
    ]),
    el("p", { class: "shopping__intro", text: "Opskrifter du for nylig har lavet — senest øverst." }),
    body,
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
 * @param {Array<object>} [opts.snacks] - snacks der kan lægges på listen
 * @param {Object<string, {selected: boolean, servings: number}>} opts.state
 * @param {(state: object) => void} opts.onChange - kaldes når valget ændres
 * @param {Map<string, object>} [opts.catalog] - ingrediens-katalog
 * @param {(slugs: string[]) => void} [opts.onQueueSelected] - læg de valgte
 *   opskrifter i køen (snacks tælles ikke med)
 */
export function renderShoppingPage({ recipes, snacks = [], state, onChange, catalog = new Map(), onQueueSelected }) {
  // Snacks gemmes i samme state-objekt, men med "snack:"-præfiks så de ikke
  // kolliderer med opskrifter (der nøgles på slug).
  const snackKey = (slug) => `snack:${slug}`;

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

  // Snacks: kun en afkrydsning (ingen ingredienser/portioner).
  if (snacks.length) {
    controls.append(el("h2", { class: "section", text: "Snacks" }));
    for (const snack of snacks) {
      const key = snackKey(snack.slug);
      const checkbox = el("input", {
        type: "checkbox",
        class: "picker__check",
        id: `pick-${key}`,
      });
      checkbox.checked = Boolean(state[key]?.selected);

      const row = el("div", { class: "picker__row" }, [
        el("label", { class: "picker__label", for: `pick-${key}` }, [
          checkbox,
          el("span", { text: `${snack.emoji ? snack.emoji + " " : ""}${snack.title}` }),
        ]),
      ]);

      checkbox.addEventListener("change", () => {
        state[key] = { selected: checkbox.checked };
        onChange(state);
        update();
      });

      controls.append(row);
    }
  }

  const output = el("div", { class: "shopping-output" });

  const section = el("section", { class: "shopping" }, [
    el("p", { class: "shopping__intro", text: "Vælg de opskrifter og snacks du vil handle ind til, og hvor mange portioner af hver opskrift. Så lægger vi ingredienserne sammen til én liste. Tjek mængderne — de skaleres automatisk ud fra opskrifternes normale størrelse. Snacks lægges på som enkeltvarer." }),
    controls,
    output,
  ]);

  function selections() {
    return recipes
      .filter((r) => state[r.slug]?.selected)
      .map((r) => ({ recipe: r, servings: state[r.slug].servings || r.baseServings || 1 }));
  }

  function snackSelections() {
    return snacks.filter((s) => state[snackKey(s.slug)]?.selected);
  }

  function update() {
    const chosen = selections();
    const chosenSnacks = snackSelections();
    if (chosen.length === 0 && chosenSnacks.length === 0) {
      output.replaceChildren(
        el("p", { class: "empty", text: "Vælg mindst én opskrift eller snack for at få en indkøbsliste." })
      );
      return;
    }

    const { items, count, pantry } = buildShoppingList(chosen, chosenSnacks, catalog);

    const list = el(
      "ul",
      { class: "shopping-list" },
      items.map((item, idx) => {
        const cb = el("input", { type: "checkbox", id: `buy-${idx}`, class: "shopping-list__check" });
        const label = el("label", { class: "shopping-list__label", for: `buy-${idx}` }, [
          el("span", { class: "shopping-list__text" }, [
            document.createTextNode(item.display),
            item.optional ? el("span", { class: "shopping-list__opt", text: " · valgfri" }) : null,
          ]),
          el("span", { class: "shopping-list__from", text: item.sources.join(", ") }),
        ]);
        cb.addEventListener("change", () => label.classList.toggle("is-done", cb.checked));
        return el("li", { class: "shopping-list__item" }, [cb, label]);
      })
    );

    // Basisvarer holdes af listen, men nævnes så man kan tjekke skabet.
    const pantryNote =
      pantry && pantry.length
        ? el("p", { class: "shopping-pantry" }, [
            el("strong", { text: "Basisvarer du nok har: " }),
            document.createTextNode(pantry.join(", ") + "."),
          ])
        : null;

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

    // Bro til køen: læg de valgte opskrifter (ikke snacks) i køen, så man
    // efter indkøb kan huske hvad man skal lave. Vises kun når mindst én
    // opskrift er valgt.
    let queueBtn = null;
    if (onQueueSelected && chosen.length) {
      queueBtn = el("button", { class: "btn btn--ghost", type: "button", text: "🧺 Læg opskrifter i kø" });
      queueBtn.addEventListener("click", () => {
        onQueueSelected(chosen.map((c) => c.recipe.slug));
        queueBtn.textContent = "✓ Lagt i kø";
        setTimeout(() => (queueBtn.textContent = "🧺 Læg opskrifter i kø"), 1500);
      });
    }

    output.replaceChildren(
      el("div", { class: "shopping-output__head" }, [
        el("h2", { class: "section", text: `Din indkøbsliste (${count} varer)` }),
        el("div", { class: "shopping-output__actions" }, [copyBtn, printBtn, queueBtn]),
      ]),
      list,
      pantryNote
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
