#!/usr/bin/env node
// Tests af kø- og historik-logikken. Ingen afhængigheder.
// Kør med:  node scripts/test-queue.mjs   (eller: npm test)

import assert from "node:assert/strict";
import {
  addToQueue,
  removeFromQueue,
  isQueued,
  markMade,
  HISTORY_LIMIT,
} from "../src/queue.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("  ✓ " + name);
}

console.log("addToQueue:");
test("lægger ny opskrift i køen med tidsstempel", () => {
  assert.deepEqual(addToQueue([], "a", 1000), [{ slug: "a", addedAt: 1000 }]);
});
test("ignorerer dubletter og bevarer oprindelig tid", () => {
  const q1 = addToQueue([], "a", 1000);
  assert.deepEqual(addToQueue(q1, "a", 2000), [{ slug: "a", addedAt: 1000 }]);
});
test("muterer ikke input", () => {
  const q = [];
  addToQueue(q, "a", 1);
  assert.deepEqual(q, []);
});

console.log("isQueued / removeFromQueue:");
test("isQueued", () => {
  const q = addToQueue([], "a", 1);
  assert.equal(isQueued(q, "a"), true);
  assert.equal(isQueued(q, "b"), false);
});
test("removeFromQueue fjerner den rette og bevarer resten", () => {
  const q = addToQueue(addToQueue([], "a", 1), "b", 2);
  assert.deepEqual(removeFromQueue(q, "a"), [{ slug: "b", addedAt: 2 }]);
});

console.log("markMade:");
test("flytter fra kø til historik med madeAt (bevarer addedAt)", () => {
  const { queue, history } = markMade(addToQueue([], "a", 1000), [], "a", 5000);
  assert.deepEqual(queue, []);
  assert.deepEqual(history, [{ slug: "a", addedAt: 1000, madeAt: 5000 }]);
});
test("nyeste ligger øverst i historik", () => {
  let r = markMade(addToQueue([], "a", 1), [], "a", 10);
  r = markMade(addToQueue(r.queue, "b", 2), r.history, "b", 20);
  assert.deepEqual(r.history.map((h) => h.slug), ["b", "a"]);
});
test("samme opskrift optræder kun én gang (nyeste vinder)", () => {
  let r = markMade(addToQueue([], "a", 1), [], "a", 10);
  r = markMade(addToQueue(r.queue, "a", 2), r.history, "a", 30);
  assert.equal(r.history.length, 1);
  assert.equal(r.history[0].madeAt, 30);
});
test("historik beskæres til HISTORY_LIMIT (seneste øverst)", () => {
  let history = [];
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
    history = markMade([], history, "r" + i, i).history;
  }
  assert.equal(history.length, HISTORY_LIMIT);
  assert.equal(history[0].slug, "r" + (HISTORY_LIMIT + 4));
});
test("markMade uden kø-post bruger now som addedAt", () => {
  const { history } = markMade([], [], "x", 777);
  assert.deepEqual(history, [{ slug: "x", addedAt: 777, madeAt: 777 }]);
});

console.log(`\n✔ Alle ${passed} tests bestået.`);
