// Fælles ingrediens-logik: opslag i kataloget + formatering til tekst.
//
// Opskrifter refererer til ingredienser via { ref, amount?, unit?, note?,
// optional? }. Kataloget (data/ingredients.json) giver visningsnavn, kategori
// og om ingrediensen er en basisvare (pantry). Rene funktioner uden DOM —
// nemme at teste og genbruge i både visning og indkøbsliste.

const FRACTIONS = {
  "½": 0.5,
  "¼": 0.25,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
};

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

/** Byg et opslags-Map (id → katalogpost) fra kataloglisten. */
export function indexCatalog(list) {
  return new Map((list || []).map((it) => [it.id, it]));
}

/**
 * Slå en opskrift-ingrediens ({ref, amount, unit, note, optional}) op i
 * kataloget og returnér en beriget, fladt struktur.
 * @param {{ref: string, amount?: number, unit?: string, note?: string, optional?: boolean}} ing
 * @param {Map<string, object>} catalog
 */
export function resolveIngredient(ing, catalog) {
  const cat = catalog.get(ing.ref) || { id: ing.ref, name: ing.ref, category: "", pantry: false };
  return {
    id: ing.ref,
    name: cat.name,
    category: cat.category || "",
    pantry: Boolean(cat.pantry),
    amount: ing.amount ?? null,
    unit: ing.unit || "",
    note: ing.note || "",
    optional: Boolean(ing.optional),
  };
}

/**
 * Byg den viste tekst for en (resolvet) ingrediens.
 * Med mængde skrives navnet med lille begyndelsesbogstav ("250 g hvedemel");
 * uden mængde beholdes katalogets store bogstav ("Salt og peber"). `note`
 * tilføjes i parentes. `withNote=false` udelader noten (til indkøbslisten,
 * hvor noter fra flere opskrifter ikke giver mening).
 */
export function formatIngredientDisplay(r, withNote = true) {
  const qty = [];
  if (r.amount != null) qty.push(formatQty(r.amount));
  if (r.unit) qty.push(r.unit);
  const hasQty = qty.length > 0;
  const name = hasQty ? r.name.charAt(0).toLowerCase() + r.name.slice(1) : r.name;
  let text = (hasQty ? qty.join(" ") + " " : "") + name;
  if (withNote && r.note) text += ` (${r.note})`;
  return text;
}
