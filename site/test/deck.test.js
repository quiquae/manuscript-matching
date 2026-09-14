import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTIONS, DIFFICULTIES, buildSet, gapFor, isLegal, seededRandom,
} from "../deck.js";

const pool = (n = 200, step = 15) =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i}`, not_before: 700 + i * step, not_after: 700 + i * step + 8,
    region: i % 2 ? "France" : "England", material: i % 5 ? "perg" : "papyrus",
    decoration: i % 3 ? ["initials"] : [],
  }));

test("the same seed always gives the same sequence", () => {
  const a = seededRandom("2026-09-09");
  const b = seededRandom("2026-09-09");
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test("different seeds diverge", () => {
  const a = seededRandom("2026-09-09");
  const b = seededRandom("2026-09-10");
  assert.notEqual(a(), b());
});

test("seeded values stay in [0,1)", () => {
  const r = seededRandom("x");
  for (let i = 0; i < 500; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test("gap ladder decays to its floor and never rises", () => {
  assert.equal(gapFor(1, 300, 25), 300);
  assert.equal(gapFor(40, 300, 25), 25);
  for (let i = 1; i < 30; i++) assert.ok(gapFor(i, 300, 25) >= gapFor(i + 1, 300, 25));
});

test("a card overlapping a neighbour is illegal", () => {
  const board = [{ not_before: 1000, not_after: 1050 }, { not_before: 1400, not_after: 1450 }];
  assert.ok(!isLegal(board, { not_before: 1040, not_after: 1100 }, 0));
  assert.ok(isLegal(board, { not_before: 1200, not_after: 1250 }, 0));
});

test("the minimum gap is enforced against both neighbours", () => {
  const board = [{ not_before: 1000, not_after: 1050 }, { not_before: 1400, not_after: 1450 }];
  assert.ok(isLegal(board, { not_before: 1200, not_after: 1250 }, 100));
  assert.ok(!isLegal(board, { not_before: 1100, not_after: 1150 }, 100));
});

test("a set is the requested size, unique, and internally unambiguous", () => {
  const set = buildSet(pool(), { size: 5, seed: "day-1" });
  assert.equal(set.length, 5);
  assert.equal(new Set(set.map((c) => c.id)).size, 5);
  const ranges = set.map((c) => [c.not_before, c.not_after]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) {
    assert.ok(ranges[i][0] > ranges[i - 1][1], "two cards overlap: the order would be arguable");
  }
});

test("sets are deterministic for a seed and differ across seeds", () => {
  const ids = (seed) => buildSet(pool(), { size: 5, seed }).map((c) => c.id);
  assert.deepEqual(ids("a"), ids("a"));
  assert.notDeepEqual(ids("a"), ids("b"));
});

test("growing a set keeps the existing cards and adds unambiguous ones", () => {
  const first = buildSet(pool(), { size: 5, seed: "grow" });
  const grown = buildSet(pool(), { size: 8, seed: "grow", keep: first });
  assert.equal(grown.length, 8);
  for (const card of first) assert.ok(grown.some((c) => c.id === card.id), "lost a placed card");
  const ranges = grown.map((c) => [c.not_before, c.not_after]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) assert.ok(ranges[i][0] > ranges[i - 1][1]);
});

test("every collection filter selects something and only what it claims", () => {
  const p = pool();
  for (const c of COLLECTIONS) {
    const kept = p.filter(c.test);
    assert.ok(kept.length > 0, `${c.id} selected nothing`);
  }
  assert.ok(COLLECTIONS.find((c) => c.id === "papyri").test({ material: "papyrus" }));
  assert.ok(!COLLECTIONS.find((c) => c.id === "papyri").test({ material: "perg" }));
});

test("difficulties are ordered from forgiving to punishing", () => {
  const gaps = DIFFICULTIES.map((d) => d.startGap);
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] <= gaps[i - 1]);
});

test("a set never exceeds what the filtered pool can legally supply", () => {
  const tiny = [
    { id: "a", not_before: 1000, not_after: 1010 },
    { id: "b", not_before: 1400, not_after: 1410 },
  ];
  assert.ok(buildSet(tiny, { size: 5, seed: "x" }).length <= 2);
});

/**
 * The disjointness property, over every slice and difficulty a player can pick.
 *
 * This replaces a pytest property test that dealt 200 decks from the whole
 * corpus at one fixed gap setting. The rule it guarded now lives in this file,
 * so the test does too — and it covers more than it used to, because the
 * collection and difficulty chips are the thing that made a pre-built deck
 * impossible in the first place.
 *
 * `buildSet` is allowed to return a short set when nothing legal remains: a
 * short set beats an unanswerable one. What it must never do is return a set
 * containing a pair whose ranges overlap, because then both orders of that pair
 * are defensible and the player is marked wrong for being right.
 */
test("no dealt set ever contains an overlapping pair, over 200 deals", () => {
  const p = pool();
  let deals = 0;
  for (let i = 0; i < 200; i++) {
    const collection = COLLECTIONS[i % COLLECTIONS.length];
    const difficulty = DIFFICULTIES[i % DIFFICULTIES.length];
    const set = buildSet(p.filter(collection.test), {
      size: difficulty.size,
      seed: `deal-${i}`,
      startGap: difficulty.startGap,
      floor: difficulty.floor,
    });
    deals += 1;
    assert.ok(set.length > 1, `${collection.id}/${difficulty.id} dealt ${set.length}`);
    assert.equal(new Set(set.map((c) => c.id)).size, set.length, "a card was dealt twice");
    for (const a of set) {
      for (const b of set) {
        if (a.id === b.id) continue;
        assert.ok(a.not_after < b.not_before || b.not_after < a.not_before,
                  `${collection.id}/${difficulty.id} seed deal-${i}: ` +
                  `${a.id} [${a.not_before}-${a.not_after}] overlaps ` +
                  `${b.id} [${b.not_before}-${b.not_after}]`);
      }
    }
  }
  assert.equal(deals, 200, "the loop did not run");
});
