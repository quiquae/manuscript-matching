import { test } from "node:test";
import assert from "node:assert/strict";
import { concordantPairs, orderResult, orderScore } from "../order.js";

const cards = (...years) => years.map((y, i) => ({ id: `c${i}`, not_before: y, not_after: y + 5 }));

test("a perfect arrangement scores every pair", () => {
  const arranged = cards(1000, 1200, 1400);
  assert.deepEqual(concordantPairs(arranged), { right: 3, total: 3 });
});

test("a fully reversed arrangement scores no pair", () => {
  const arranged = cards(1400, 1200, 1000);
  assert.deepEqual(concordantPairs(arranged), { right: 0, total: 3 });
});

test("one swapped neighbour costs one pair, not the whole arrangement", () => {
  const arranged = cards(1000, 1400, 1200, 1600);
  const { right, total } = concordantPairs(arranged);
  assert.equal(total, 6);
  assert.equal(right, 5);
});

test("a single card is trivially in order", () => {
  assert.deepEqual(concordantPairs(cards(1000)), { right: 0, total: 0 });
});

test("score is full marks for a perfect order with no zooming", () => {
  assert.equal(orderScore(cards(1000, 1200, 1400), 0), 1000);
});

test("zooming costs score but never takes it below zero", () => {
  const perfect = cards(1000, 1200, 1400);
  const scores = [0, 1, 2, 3, 9].map((z) => orderScore(perfect, z));
  for (let i = 1; i < scores.length; i++) assert.ok(scores[i] <= scores[i - 1]);
  assert.ok(scores.at(-1) >= 0);
});

test("a reversed order scores zero however little you looked", () => {
  assert.equal(orderScore(cards(1400, 1200, 1000), 0), 0);
});

test("the result names which cards are out of place", () => {
  const arranged = cards(1000, 1400, 1200);
  const result = orderResult(arranged, 0);
  assert.equal(result.perfect, false);
  assert.deepEqual(result.misplaced.sort(), ["c1", "c2"]);
});

test("a perfect result reports nothing misplaced", () => {
  const result = orderResult(cards(1000, 1200, 1400), 0);
  assert.ok(result.perfect);
  assert.deepEqual(result.misplaced, []);
});
