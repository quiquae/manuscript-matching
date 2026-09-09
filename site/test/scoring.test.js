import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE, MULTIPLIERS, scoreRound, shareGrid } from "../scoring.js";

test("a correct answer with no expansion scores full marks", () => {
  assert.equal(scoreRound(0, true), BASE);
});

test("each expansion costs score", () => {
  const scores = [0, 1, 2, 3].map((n) => scoreRound(n, true));
  assert.deepEqual(scores, MULTIPLIERS.map((m) => Math.round(BASE * m)));
  for (let i = 1; i < scores.length; i++) assert.ok(scores[i] < scores[i - 1]);
});

test("a wrong answer scores nothing however little you looked", () => {
  assert.equal(scoreRound(0, false), 0);
  assert.equal(scoreRound(3, false), 0);
});

test("expansions beyond the last step clamp rather than going negative", () => {
  assert.equal(scoreRound(99, true), scoreRound(MULTIPLIERS.length - 1, true));
  assert.ok(scoreRound(99, true) > 0);
});

test("share grid encodes each round without leaking the answer", () => {
  const grid = shareGrid([
    { correct: true, expansions: 0 },
    { correct: true, expansions: 2 },
    { correct: false, expansions: 3 },
  ]);
  assert.equal([...grid].length, 3);
  assert.ok(!/\d/.test(grid), "the grid must not contain digits");
});
