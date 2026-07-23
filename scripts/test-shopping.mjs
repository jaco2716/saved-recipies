#!/usr/bin/env node
// Tests af ingrediens- og indkøbsliste-logikken. Ingen afhængigheder.
// Kør med:  node scripts/test-shopping.mjs   (eller: npm test)

import assert from "node:assert/strict";
import { buildShoppingList } from "../src/shopping.js";
import {
  formatQty,
  indexCatalog,
  resolveIngredient,
  formatIngredientDisplay,
} from "../src/ingredients.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("  ✓ " + name);
}

// Lille testkatalog.
const catalog = indexCatalog([
  { id: "kyllingebryst", name: "Kyllingebryst", category: "Kød & fjerkræ" },
  { id: "loeg", name: "Løg", category: "Grønt" },
  { id: "maelk", name: "Mælk", category: "Mejeri & æg" },
  { id: "salt-peber", name: "Salt og peber", category: "Basis", pantry: true },
  { id: "olie", name: "Olie", category: "Basis", pantry: true },
]);

console.log("formatQty:");
test("heltal", () => assert.equal(formatQty(4), "4"));
test("halv", () => assert.equal(formatQty(0.5), "½"));
test("blandet brøk", () => assert.equal(formatQty(2.5), "2½"));

console.log("formatIngredientDisplay:");
test("mængde + enhed + lille begyndelsesbogstav", () => {
  const r = resolveIngredient({ ref: "kyllingebryst", amount: 150, unit: "g", note: "i tern" }, catalog);
  assert.equal(formatIngredientDisplay(r), "150 g kyllingebryst (i tern)");
});
test("uden mængde beholdes stort begyndelsesbogstav", () => {
  const r = resolveIngredient({ ref: "salt-peber" }, catalog);
  assert.equal(formatIngredientDisplay(r), "Salt og peber");
});
test("brøk uden enhed", () => {
  const r = resolveIngredient({ ref: "loeg", amount: 0.5 }, catalog);
  assert.equal(formatIngredientDisplay(r), "½ løg");
});
test("optional aflæses", () => {
  const r = resolveIngredient({ ref: "olie", optional: true }, catalog);
  assert.equal(r.optional, true);
});

console.log("buildShoppingList:");
test("lægger samme ingrediens sammen på tværs af opskrifter", () => {
  const a = { title: "A", baseServings: 1, ingredients: [
    { ref: "kyllingebryst", amount: 150, unit: "g" }, { ref: "loeg", amount: 1 }, { ref: "salt-peber" },
  ] };
  const b = { title: "B", baseServings: 1, ingredients: [
    { ref: "kyllingebryst", amount: 120, unit: "g" }, { ref: "loeg", amount: 0.5 }, { ref: "salt-peber" },
  ] };
  const { items, pantry } = buildShoppingList(
    [{ recipe: a, servings: 1 }, { recipe: b, servings: 1 }], [], catalog
  );
  const byName = Object.fromEntries(items.map((i) => [i.name, i.display]));
  assert.equal(byName["Kyllingebryst"], "270 g kyllingebryst"); // 150 + 120
  assert.equal(byName["Løg"], "1½ løg"); // 1 + 0.5
  assert.equal(items.length, 2); // salt-peber er basisvare, ikke på listen
  assert.deepEqual(pantry, ["Salt og peber"]); // nævnt som basisvare
});
test("skalerer efter portioner (baseServings)", () => {
  const r = { title: "R", baseServings: 2, ingredients: [{ ref: "maelk", amount: 4, unit: "dl" }] };
  const { items } = buildShoppingList([{ recipe: r, servings: 4 }], [], catalog); // faktor 2
  assert.equal(items[0].display, "8 dl mælk");
});
test("samme ingrediens med forskellig enhed samles på én linje", () => {
  const r = { title: "R", baseServings: 1, ingredients: [
    { ref: "maelk", amount: 4, unit: "dl" }, { ref: "maelk", amount: 1, unit: "spsk" },
  ] };
  const { items } = buildShoppingList([{ recipe: r, servings: 1 }], [], catalog);
  assert.equal(items.length, 1);
  assert.equal(items[0].display, "4 dl + 1 spsk mælk");
});
test("mængde-linje og note-uden-mængde for samme ingrediens bliver én linje", () => {
  const a = { title: "A", baseServings: 1, ingredients: [{ ref: "loeg", amount: 2 }] };
  const b = { title: "B", baseServings: 1, ingredients: [{ ref: "loeg", note: "lidt", optional: true }] };
  const { items } = buildShoppingList([{ recipe: a, servings: 1 }, { recipe: b, servings: 1 }], [], catalog);
  assert.equal(items.length, 1);
  assert.equal(items[0].display, "2 løg"); // note-uden-mængde bidrager ikke til en ekstra linje
  assert.equal(items[0].optional, false); // ikke valgfri, da A kræver den
});
test("kun basisvarer → tom liste men nævnt", () => {
  const r = { title: "R", baseServings: 1, ingredients: [{ ref: "salt-peber" }, { ref: "olie", amount: 1, unit: "tsk" }] };
  const { items, pantry } = buildShoppingList([{ recipe: r, servings: 1 }], [], catalog);
  assert.equal(items.length, 0);
  assert.deepEqual(pantry, ["Olie", "Salt og peber"]);
});
test("snacks lægges på som enkeltlinjer nederst", () => {
  const r = { title: "R", baseServings: 1, ingredients: [{ ref: "loeg", amount: 1 }] };
  const { items, count } = buildShoppingList(
    [{ recipe: r, servings: 1 }], [{ title: "Popcorn" }, { title: "Edamamebønner" }], catalog
  );
  assert.equal(count, 3);
  assert.equal(items[0].display, "1 løg");
  assert.deepEqual(items.slice(1).map((i) => i.display), ["Edamamebønner", "Popcorn"]);
  assert.deepEqual(items[1].sources, ["Snack"]);
});

console.log(`\n✔ Alle ${passed} tests bestået.`);
