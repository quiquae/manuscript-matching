import { test } from "node:test";
import assert from "node:assert/strict";
import { coverage, createShelf } from "../shelf.js";

/** A stand-in for localStorage, so the shelf is testable outside a browser. */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

test("a new shelf is empty", () => {
  assert.deepEqual(createShelf(fakeStorage()).seen(), []);
});

test("recording adds a manuscript once, however often it is seen", () => {
  const shelf = createShelf(fakeStorage());
  shelf.record("manuscript_1");
  shelf.record("manuscript_1");
  shelf.record("manuscript_2");
  assert.deepEqual(shelf.seen().sort(), ["manuscript_1", "manuscript_2"]);
});

test("the shelf survives being rebuilt from the same storage", () => {
  const storage = fakeStorage();
  createShelf(storage).record("manuscript_7");
  assert.deepEqual(createShelf(storage).seen(), ["manuscript_7"]);
});

test("corrupt stored data is discarded rather than throwing", () => {
  const shelf = createShelf(fakeStorage({ "ante-quem:shelf": "{not json" }));
  assert.deepEqual(shelf.seen(), []);
  shelf.record("manuscript_1");
  assert.deepEqual(shelf.seen(), ["manuscript_1"]);
});

test("coverage counts what you have met against what exists", () => {
  const puzzles = [
    { id: "a", region: "France", not_before: 1300 },
    { id: "b", region: "France", not_before: 1310 },
    { id: "c", region: "Italy", not_before: 1450 },
  ];
  const cov = coverage(puzzles, ["a"]);
  assert.equal(cov.total, 3);
  assert.equal(cov.seen, 1);
  assert.deepEqual(cov.byRegion.find((r) => r.key === "France"), {
    key: "France", seen: 1, total: 2,
  });
  assert.deepEqual(cov.byRegion.find((r) => r.key === "Italy"), {
    key: "Italy", seen: 0, total: 1,
  });
});

test("coverage groups centuries and orders them chronologically", () => {
  const puzzles = [
    { id: "a", region: "Egypt", not_before: -200 },
    { id: "b", region: "France", not_before: 1450 },
    { id: "c", region: "France", not_before: 1100 },
  ];
  const keys = coverage(puzzles, []).byCentury.map((c) => c.key);
  assert.deepEqual(keys, [-200, 1100, 1400]);
});

test("coverage names the gaps you have nothing from", () => {
  const puzzles = [
    { id: "a", region: "France", not_before: 1300 },
    { id: "b", region: "Ireland", not_before: 1300 },
  ];
  assert.deepEqual(coverage(puzzles, ["a"]).emptyRegions, ["Ireland"]);
});
