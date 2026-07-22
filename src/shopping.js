// Logik til indkøbslisten: læs mængder ud af ingrediens-tekster, skalér dem
// efter antal portioner, og læg ens ingredienser sammen på tværs af opskrifter.
//
// Ingredienser er fri tekst (fx "250 g hvedemel", "½ agurk", "Salt og peber").
// Vi tolker et tal i starten af teksten og ganger det. Ingredienser uden et
// tal (fx "Salt og peber") tages med, som de er, uden at blive skaleret.
//
// Rene funktioner uden DOM — nemme at teste.

const FRACTIONS = {
  "½": 0.5,
  "¼": 0.25,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
};

// Ord der optræder lige efter tallet og fungerer som enhed/beholder.
const UNITS = [
  "g", "kg", "dl", "l", "ml", "spsk", "tsk", "stk",
  "dåse", "dåser", "fed", "knivspids", "håndfuld", "bundt", "skive", "skiver",
];

function parseQtyToken(token) {
  if (token in FRACTIONS) return FRACTIONS[token];
  return parseFloat(token.replace(",", "."));
}

/**
 * Del en ingrediens-tekst op i mængde, enhed og navn.
 * @param {string} raw
 * @returns {{qty: number|null, unit: string, name: string, approx: boolean, raw: string}}
 */
export function parseIngredient(raw) {
  const text = raw.trim();
  // (ca.) <tal|brøk>(-<tal|brøk>) resten
  const m = text.match(
    /^(ca\.\s*)?([0-9]+(?:[.,][0-9]+)?|[½¼¾⅓⅔⅛])(?:\s*-\s*([0-9]+(?:[.,][0-9]+)?|[½¼¾⅓⅔⅛]))?\s+(.*)$/
  );
  if (!m) return { qty: null, unit: "", name: text, approx: false, raw };

  const approx = Boolean(m[1]);
  // Ved et interval (3-4) bruger vi den øvre grænse, så man køber nok ind.
  const qty = parseQtyToken(m[3] ?? m[2]);
  let rest = m[4];

  let unit = "";
  const unitRe = new RegExp(`^(${UNITS.join("|")})\\.?\\s+(.*)$`, "i");
  const um = rest.match(unitRe);
  if (um) {
    unit = um[1].toLowerCase();
    rest = um[2];
  }

  return { qty, unit, name: rest.trim(), approx, raw };
}

/** Formatér et tal pænt med brøker og dansk komma. */
export function formatQty(n) {
  if (n == null) return "";
  n = Math.round(n * 100) / 100;
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  for (const [ch, val] of Object.entries(FRACTIONS)) {
    if (Math.abs(frac - val) < 0.03) return (whole > 0 ? whole : "") + ch;
  }
  if (Math.abs(frac) < 0.02) return String(whole);
  return String(n).replace(".", ",");
}

/** Byg den viste tekst for en (evt. skaleret) ingrediens. */
function buildDisplay({ qty, unit, name, approx }) {
  if (qty == null) return name;
  const parts = [];
  if (approx) parts.push("ca.");
  parts.push(formatQty(qty));
  if (unit) parts.push(unit);
  parts.push(name);
  return parts.join(" ");
}

function normalizeKey({ qty, unit, name, raw }) {
  const base = qty == null ? raw : `${unit}|${name}`;
  return base.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Byg en samlet indkøbsliste ud fra valgte opskrifter.
 *
 * @param {Array<{recipe: object, servings: number}>} selections
 * @returns {{items: Array<{display: string, sources: string[]}>, count: number}}
 */
export function buildShoppingList(selections) {
  const merged = new Map();

  for (const { recipe, servings } of selections) {
    const base = recipe.baseServings || 1;
    const factor = servings / base;

    for (const rawIngredient of recipe.ingredients || []) {
      const parsed = parseIngredient(rawIngredient);
      const scaled = {
        ...parsed,
        qty: parsed.qty == null ? null : parsed.qty * factor,
      };
      const key = normalizeKey(parsed);

      if (merged.has(key)) {
        const existing = merged.get(key);
        if (existing.qty != null && scaled.qty != null) {
          existing.qty += scaled.qty;
        }
        existing.sources.add(recipe.title);
      } else {
        merged.set(key, {
          qty: scaled.qty,
          unit: scaled.unit,
          name: scaled.name,
          approx: scaled.approx,
          raw: scaled.raw,
          sources: new Set([recipe.title]),
        });
      }
    }
  }

  const items = [...merged.values()]
    .map((it) => ({
      display: buildDisplay(it),
      sortKey: (it.name || it.raw).toLowerCase(),
      sources: [...it.sources],
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, "da"));

  return { items, count: items.length };
}
