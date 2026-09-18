import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS, DIFFICULTIES, buildSet } from "../deck.js";
import {
  createDailyLog, DAILY_COLLECTION, DAILY_DIFFICULTY, dailyLabel, dailySeed,
  EPOCH, puzzleNumber, shareText, streak, todayISO,
} from "../daily.js";

/** A stand-in for localStorage, so the log is testable outside a browser. */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

const pool = (n = 200, step = 15) =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i}`, not_before: 700 + i * step, not_after: 700 + i * step + 8,
    region: i % 2 ? "France" : "England", material: i % 5 ? "perg" : "papyrus",
    painted: Boolean(i % 3),
  }));

/* ------------------------------------------------------------------ the day */

test("the day is the player's own, not UTC", () => {
  // 23:30 local on the 14th is still the 14th, whatever the offset does to it.
  assert.equal(todayISO(new Date(2026, 8, 14, 23, 30)), "2026-09-14");
  assert.equal(todayISO(new Date(2026, 0, 1, 0, 5)), "2026-01-01");
});

test("month and day are padded", () => {
  assert.equal(todayISO(new Date(2026, 2, 7)), "2026-03-07");
});

test("the seed is the date and nothing else", () => {
  assert.equal(dailySeed("2026-09-14"), "daily-2026-09-14");
});

/* ------------------------------------------------ the same set for everyone */

const dailySet = (day, cards) => {
  const collection = COLLECTIONS.find((c) => c.id === DAILY_COLLECTION);
  const difficulty = DIFFICULTIES.find((d) => d.id === DAILY_DIFFICULTY);
  return buildSet(cards.filter(collection.test), {
    size: difficulty.size,
    seed: dailySeed(day),
    startGap: difficulty.startGap,
    floor: difficulty.floor,
  }).map((c) => c.id);
};

test("the same date deals the same manuscripts", () => {
  assert.deepEqual(dailySet("2026-09-14", pool()), dailySet("2026-09-14", pool()));
});

test("a different date deals a different set", () => {
  assert.notDeepEqual(dailySet("2026-09-14", pool()), dailySet("2026-09-15", pool()));
});

test("the daily set is full length and has no repeats", () => {
  const ids = dailySet("2026-09-14", pool());
  const size = DIFFICULTIES.find((d) => d.id === DAILY_DIFFICULTY).size;
  assert.equal(ids.length, size);
  assert.equal(new Set(ids).size, size);
});

/**
 * `pick()` in app.js falls back to the first entry when an id is not found, so
 * renaming a collection or a difficulty would silently change what the daily
 * plays rather than failing. These two assertions are the alarm.
 */
test("the fixed daily slice names entries that exist", () => {
  assert.ok(COLLECTIONS.some((c) => c.id === DAILY_COLLECTION), DAILY_COLLECTION);
  assert.ok(DIFFICULTIES.some((d) => d.id === DAILY_DIFFICULTY), DAILY_DIFFICULTY);
});

/* ---------------------------------------------------------------- the label */

test("the label reads as a date a person would say", () => {
  assert.equal(dailyLabel("2026-09-14"), "14 September 2026");
  assert.equal(dailyLabel("2026-01-01"), "1 January 2026");
});

test("a label it cannot parse is passed through, not crashed on", () => {
  assert.equal(dailyLabel("not-a-date"), "not-a-date");
  assert.equal(dailyLabel("2026-13-01"), "2026-13-01");
  assert.equal(dailyLabel(""), "");
});

/* ------------------------------------------------------------------ the log */

const row = { score: 640, grid: "🟩🟩🟨🟥🟩", right: 8, total: 10 };

test("an unplayed day reads as nothing", () => {
  assert.equal(createDailyLog(fakeStorage()).read("2026-09-14"), null);
});

test("a result survives a reload", () => {
  const storage = fakeStorage();
  createDailyLog(storage).write("2026-09-14", row);
  assert.deepEqual(createDailyLog(storage).read("2026-09-14"), row);
});

test("the first go stands; a reroll cannot overwrite it", () => {
  const log = createDailyLog(fakeStorage());
  log.write("2026-09-14", row);
  const kept = log.write("2026-09-14", { ...row, score: 1000, right: 10 });
  assert.equal(kept.score, 640);
  assert.equal(log.read("2026-09-14").score, 640);
});

test("days are kept apart", () => {
  const log = createDailyLog(fakeStorage());
  log.write("2026-09-14", row);
  assert.equal(log.read("2026-09-15"), null);
});

test("corrupt storage is not worth a crash", () => {
  for (const junk of ["{oh no", "[]", "null", '"a string"', "7"]) {
    const log = createDailyLog(fakeStorage({ "ante-quem:daily": junk }));
    assert.equal(log.read("2026-09-14"), null);
    assert.equal(log.write("2026-09-14", row).score, 640);
  }
});

test("a storage that refuses to write still returns the result", () => {
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error("quota"); },
  };
  assert.equal(createDailyLog(storage).write("2026-09-14", row).score, 640);
});

/* ------------------------------------------------------- the number to compare */

test("the epoch is puzzle one", () => {
  assert.equal(puzzleNumber(EPOCH), 1);
});

test("the number counts calendar days from the epoch", () => {
  assert.equal(puzzleNumber("2026-09-15", "2026-09-14"), 2);
  assert.equal(puzzleNumber("2026-10-14", "2026-09-14"), 31);
  assert.equal(puzzleNumber("2027-09-14", "2026-09-14"), 366);
});

/**
 * The arithmetic runs on UTC midnights on purpose. Subtracting two local
 * midnights across a daylight-saving boundary is off by an hour, and an hour is
 * enough for a floor() to land on the wrong day -- which would renumber every
 * puzzle after the clocks change.
 */
test("a daylight-saving boundary does not shift the number", () => {
  // The UK moved its clocks on 25 October 2026. These are consecutive days.
  assert.equal(puzzleNumber("2026-10-26", "2026-10-24"), 3);
  assert.equal(puzzleNumber("2026-10-25", "2026-10-24"), 2);
  // And the US boundary, a week later.
  assert.equal(puzzleNumber("2026-11-02", "2026-10-31"), 3);
});

test("a date before the epoch does not crash", () => {
  assert.equal(puzzleNumber("2026-09-13", "2026-09-14"), 0);
  assert.equal(puzzleNumber("nonsense"), 0);
});

/* --------------------------------------------------------------- the streak */

test("no days played is no streak", () => {
  assert.equal(streak([], "2026-09-14"), 0);
});

test("consecutive days count", () => {
  const days = ["2026-09-12", "2026-09-13", "2026-09-14"];
  assert.equal(streak(days, "2026-09-14"), 3);
});

test("a gap ends the streak", () => {
  const days = ["2026-09-10", "2026-09-13", "2026-09-14"];
  assert.equal(streak(days, "2026-09-14"), 2);
});

/**
 * Opening the page must not appear to have reset a run the player has not yet
 * had the chance to keep, so an unplayed today counts back from yesterday.
 */
test("today unplayed counts back from yesterday", () => {
  assert.equal(streak(["2026-09-12", "2026-09-13"], "2026-09-14"), 2);
});

test("today unplayed and yesterday missed is nothing", () => {
  assert.equal(streak(["2026-09-11"], "2026-09-14"), 0);
});

test("a streak survives a month boundary", () => {
  assert.equal(streak(["2026-08-30", "2026-08-31", "2026-09-01"], "2026-09-01"), 3);
});

test("a streak survives the clocks changing", () => {
  const days = ["2026-10-24", "2026-10-25", "2026-10-26"];
  assert.equal(streak(days, "2026-10-26"), 3);
});

test("the log reports the days it holds", () => {
  const log = createDailyLog(fakeStorage());
  log.write("2026-09-13", row);
  log.write("2026-09-14", row);
  assert.deepEqual(log.days().sort(), ["2026-09-13", "2026-09-14"]);
});

/* ----------------------------------------------------------- the share text */

const URL_ = "https://quiquae.github.io/manuscript-matching/";

test("the share text leads with a number and a score", () => {
  const text = shareText("2026-09-14", row, URL_);
  assert.equal(text.split("\n")[0], "Manuscript Matching #1 · 8/10");
});

test("the grid is on its own line, and the link last", () => {
  const lines = shareText("2026-09-14", row, URL_).split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[1], row.grid);
  assert.equal(lines[2], URL_);
});

test("a streak of two or more is worth saying; one is not", () => {
  assert.match(shareText("2026-09-14", row, URL_, 3), /· 3 day streak/);
  assert.doesNotMatch(shareText("2026-09-14", row, URL_, 1), /streak/);
  assert.doesNotMatch(shareText("2026-09-14", row, URL_, 0), /streak/);
});

test("the share text carries no date, shelfmark or score digits beyond the tally", () => {
  const text = shareText("2026-09-14", row, URL_, 3);
  assert.doesNotMatch(text, /September|2026-09|MS\./, "that would spoil the day");
  assert.doesNotMatch(text, /640/, "the points are not in the grid line");
});
