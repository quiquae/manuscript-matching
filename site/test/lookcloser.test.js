import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AXIS_WEIGHTS, MATERIALS, LANGUAGES, REVEAL_BUDGET, dateCredit, gradeHand, patchAt,
  patchSizeAt, scoreReading, unrevealedPenalty,
} from "../lookcloser.js";

test("a year inside the catalogued range gets full credit", () => {
  assert.equal(dateCredit(1310, { not_before: 1300, not_after: 1325 }), 1);
  assert.equal(dateCredit(1300, { not_before: 1300, not_after: 1325 }), 1);
});

test("credit decays outside the range and never goes below zero", () => {
  const range = { not_before: 1300, not_after: 1325 };
  assert.ok(dateCredit(1290, range) > dateCredit(1100, range));
  assert.equal(dateCredit(1100, range), 0);
  assert.ok(dateCredit(-5000, range) >= 0);
});

test("a patch grows the longer it has been open", () => {
  const small = patchSizeAt(0);
  const bigger = patchSizeAt(4000);
  const capped = patchSizeAt(600000);
  assert.ok(bigger > small, "patches must expand over time");
  assert.ok(capped <= 0.45, "growth must stop before the whole page is given away");
});

test("patch geometry is clamped inside the page", () => {
  assert.deepEqual(patchAt(0.5, 0.5, 1000, 1000, 0.2), { x: 400, y: 400, w: 200, h: 200 });
  assert.deepEqual(patchAt(0, 0, 1000, 1000, 0.2), { x: 0, y: 0, w: 200, h: 200 });
  assert.deepEqual(patchAt(1, 1, 1000, 1000, 0.2), { x: 800, y: 800, w: 200, h: 200 });
});

test("restraint is rewarded and the budget never zeroes the score", () => {
  assert.equal(unrevealedPenalty(0), 1);
  assert.ok(unrevealedPenalty(REVEAL_BUDGET) > 0);
  assert.ok(unrevealedPenalty(REVEAL_BUDGET) < unrevealedPenalty(1));
});

const TRUTH = {
  not_before: 1300, not_after: 1325, region: "France", material: "perg", language: "fro",
};

test("a reading is graded on what you can actually see", () => {
  const perfect = scoreReading(
    { year: 1310, region: "France", material: "perg", language: "fro" }, TRUTH, 0);
  const wrong = scoreReading(
    { year: 900, region: "Italy", material: "chart", language: "la" }, TRUTH, 0);
  assert.ok(perfect > wrong);
  assert.equal(wrong, 0);
});

/**
 * The score is MAX_SCORE x accuracy, so weights summing to less than one cap a
 * perfect reading below the full thousand and nothing says so. This fired
 * nowhere when decoration was removed and its 0.14 had to be redistributed,
 * which is exactly the edit that needed a guard.
 */
test("the axis weights sum to one, so a perfect reading scores full marks", () => {
  const total = Object.values(AXIS_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights sum to ${total}`);
  assert.equal(
    scoreReading({ year: 1310, region: "France", material: "perg", language: "fro" },
                 TRUTH, 0),
    1000);
});

/**
 * Decoration is not asked about. 1,940 of 2,201 manuscripts carry some, so
 * "Decorated or plain?" was right nine times in ten before you looked at
 * anything, and narrowing it to painted would have made it answerable without
 * making it worth asking.
 */
test("decoration is not one of the axes", () => {
  assert.equal("decorated" in AXIS_WEIGHTS, false);
  assert.equal("painted" in AXIS_WEIGHTS, false);
  // And a guess carrying one is ignored rather than credited.
  const plain = scoreReading({ year: 1310, region: "France", material: "perg",
                               language: "fro" }, TRUTH, 0);
  const withIt = scoreReading({ year: 1310, region: "France", material: "perg",
                                language: "fro", decorated: true }, TRUTH, 0);
  assert.equal(plain, withIt);
});

test("the offered materials and languages are the ones a page can show", () => {
  assert.ok(MATERIALS.some((m) => m.id === "perg"));
  assert.ok(MATERIALS.some((m) => m.id === "papyrus"));
  assert.ok(LANGUAGES.some((l) => l.id === "la"));
  assert.ok(LANGUAGES.some((l) => l.id === "grc"));
});

/* ---- the typed palaeography answer ------------------------------------- */

test("a script name is graded against the cataloguer's own description", () => {
  const hand = "Fols. 1-16 in anglicana with secretary a; mixed anglicana and secretary.";
  assert.equal(gradeHand("anglicana", hand).hit, true);
  assert.equal(gradeHand("Anglicana", hand).hit, true);
  assert.equal(gradeHand("  ANGLICANA  ", hand).hit, true);
});

test("a wrong script name is not credited", () => {
  const hand = "A large protogothic bookhand.";
  assert.equal(gradeHand("humanistic", hand).hit, false);
  assert.equal(gradeHand("", hand).hit, false);
});

test("common spelling variants of a script are accepted", () => {
  assert.ok(gradeHand("carolingian", "A caroline minuscule.").hit);
  assert.ok(gradeHand("gothic", "Written in a good textualis.").hit);
  assert.ok(gradeHand("proto-gothic", "A large protogothic bookhand.").hit);
});

test("grading names the terms the cataloguer used, for teaching after the guess", () => {
  const { terms } = gradeHand("secretary", "Mixed anglicana and secretary, textualis elsewhere.");
  assert.ok(terms.includes("anglicana"));
  assert.ok(terms.includes("secretary"));
  assert.ok(terms.includes("textualis"));
});

test("a manuscript with no hand description cannot be graded on it", () => {
  assert.equal(gradeHand("anglicana", "").gradable, false);
  assert.equal(gradeHand("anglicana", null).gradable, false);
});
