#!/usr/bin/env node
// Små tests af indkøbsliste-logikken. Ingen afhængigheder.
// Kør med:  node scripts/test-shopping.mjs   (eller: npm test)

import assert from "node:assert/strict";
import { parseIngredient, formatQty, buildShoppingList } from "../src/shopping.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("  ✓ " + name);
}

console.log("parseIngredient:");
test("læser tal og enhed", () => {
  const r = parseIngredient("250 g hvedemel");
  assert.equal(r.qty, 250);
  assert.equal(r.unit, "g");
  assert.equal(r.name, "hvedemel");
});
test("læser brøk", () => {
  assert.equal(parseIngredient("½ agurk").qty, 0.5);
});
test("håndterer 'ca.'-præfiks", () => {
  const r = parseIngredient("ca. 800 g hvedemel");
  assert.equal(r.qty, 800);
  assert.equal(r.approx, true);
});
test("ingrediens uden tal skaleres ikke", () => {
  assert.equal(parseIngredient("Salt og peber").qty, null);
});
test("kun tallet i starten tælles", () => {
  const r = parseIngredient("125 g magert hakket oksekød (3-5 %)");
  assert.equal(r.qty, 125);
});

console.log("formatQty:");
test("heltal", () => assert.equal(formatQty(4), "4"));
test("halv", () => assert.equal(formatQty(0.5), "½"));
test("blandet brøk", () => assert.equal(formatQty(2.5), "2½"));

console.log("buildShoppingList:");
test("skalerer og lægger sammen på tværs af opskrifter", () => {
  const a = { title: "A", baseServings: 1, ingredients: ["½ agurk", "2 tomater", "Salt og peber"] };
  const b = { title: "B", baseServings: 1, ingredients: ["½ agurk", "Salt og peber"] };
  const { items } = buildShoppingList([
    { recipe: a, servings: 4 },
    { recipe: b, servings: 2 },
  ]);
  const byName = Object.fromEntries(items.map((i) => [i.display.replace(/^[\d½¼¾⅓⅔ ]+/, ""), i.display]));
  assert.equal(byName["agurk"], "3 agurk"); // 0.5*4 + 0.5*2 = 3
  assert.equal(byName["tomater"], "8 tomater"); // 2*4
  assert.ok(items.some((i) => i.display === "Salt og peber")); // deduplikeret
  assert.equal(items.length, 3);
});
test("respekterer baseServings > 1", () => {
  const r = { title: "R", baseServings: 4, ingredients: ["250 g mel"] };
  const { items } = buildShoppingList([{ recipe: r, servings: 8 }]);
  assert.equal(items[0].display, "500 g mel"); // 250 * (8/4)
});

console.log(`\n✔ Alle ${passed} tests bestået.`);
