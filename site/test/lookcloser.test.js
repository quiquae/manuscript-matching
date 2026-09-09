import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REVEAL_BUDGET, dateCredit, patchAt, scoreReading, unrevealedPenalty,
} from "../lookcloser.js";

test("a year inside the catalogued range gets full credit", () => {
  assert.equal(dateCredit(1310, { not_before: 1300, not_after: 1325 }), 1);
  assert.equal(dateCredit(1300, { not_before: 1300, not_after: 1325 }), 1);
  assert.equal(dateCredit(1325, { not_before: 1300, not_after: 1325 }), 1);
});

test("credit decays with distance outside the range, never below zero", () => {
  const range = { not_before: 1300, not_after: 1325 };
  const near = dateCredit(1290, range);
  const far = dateCredit(1100, range);
  assert.ok(near > far);
  assert.ok(near < 1);
  assert.equal(far, 0);
  assert.ok(dateCredit(-5000, range) >= 0);
});

test("credit is symmetric either side of the range", () => {
  const range = { not_before: 1300, not_after: 1400 };
  assert.equal(dateCredit(1250, range), dateCredit(1450, range));
});

test("a reading scores all three axes and rewards restraint", () => {
  const truth = { not_before: 1300, not_after: 1325, region: "France", subjects: ["bible"] };
  const perfect = scoreReading({ year: 1310, region: "France", subject: "bible" }, truth, 0);
  const spent = scoreReading({ year: 1310, region: "France", subject: "bible" }, truth,
                             REVEAL_BUDGET);
  assert.ok(perfect > spent, "spending every reveal must cost you");
  assert.ok(spent > 0, "a correct reading still scores after spending the budget");
});

test("subject matches any of the catalogued subjects, not just the first", () => {
  const truth = { not_before: 1300, not_after: 1325, region: "France",
                  subjects: ["liturgy", "bible"] };
  const a = scoreReading({ year: 1310, region: "France", subject: "bible" }, truth, 0);
  const b = scoreReading({ year: 1310, region: "France", subject: "liturgy" }, truth, 0);
  assert.equal(a, b);
});

test("a wholly wrong reading scores zero, not a negative number", () => {
  const truth = { not_before: 1300, not_after: 1325, region: "France", subjects: ["bible"] };
  const score = scoreReading({ year: 200, region: "Italy", subject: "law" }, truth, REVEAL_BUDGET);
  assert.equal(score, 0);
});

test("penalty is one at zero reveals and falls as the budget is spent", () => {
  assert.equal(unrevealedPenalty(0), 1);
  const spent = [0, 1, 2, 3, 4, 5].map(unrevealedPenalty);
  for (let i = 1; i < spent.length; i++) assert.ok(spent[i] <= spent[i - 1]);
  assert.ok(unrevealedPenalty(REVEAL_BUDGET * 10) > 0);
});

test("a patch is a square window clamped inside the page", () => {
  const p = patchAt(0.5, 0.5, 1000, 1000, 0.2);
  assert.deepEqual(p, { x: 400, y: 400, w: 200, h: 200 });
  assert.deepEqual(patchAt(0, 0, 1000, 1000, 0.2), { x: 0, y: 0, w: 200, h: 200 });
  assert.deepEqual(patchAt(1, 1, 1000, 1000, 0.2), { x: 800, y: 800, w: 200, h: 200 });
});
