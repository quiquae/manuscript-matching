import { test } from "node:test";
import assert from "node:assert/strict";
import {
  centuryLabel, centuryOf, facets, find, fold, haystack, matches, shuffled, terms,
} from "../find.js";

const vocab = {
  languages: { la: "Latin", grc: "Greek", xno: "Anglo-Norman" },
  materials: { perg: "parchment", chart: "paper" },
};

const ms = (over = {}) => ({
  id: "m1", slug: "ms-douce-1", shelfmark: "MS. Douce 1", date_display: "c. 1300",
  not_before: 1300, not_after: 1325, region: "England", material: "perg",
  language: "la", iiif: "https://iiif/1", ...over,
});

const corpus = [
  ms(),
  ms({ id: "m2", shelfmark: "MS. Canon. Ital. 1", date_display: "15th century",
       not_before: 1400, not_after: 1450, region: "Italy", material: "chart", language: "it" }),
  ms({ id: "m3", shelfmark: "MS. Barocci 12", date_display: "11th century",
       not_before: 1000, not_after: 1099, region: "Byzantium", material: "perg",
       language: "grc" }),
];

/* ----------------------------------------------------------------- folding */

test("case, punctuation and accents are all ignored", () => {
  assert.equal(fold("MS. Douce 1"), "ms douce 1");
  assert.equal(fold("Thérouanne"), "therouanne");
  assert.equal(fold("  Ruled   Space  "), "ruled space");
  assert.equal(fold(null), "");
});

test("a query is split into terms", () => {
  assert.deepEqual(terms("  Douce   Psalter "), ["douce", "psalter"]);
  assert.deepEqual(terms(""), []);
  assert.deepEqual(terms("!!!"), []);
});

test("the haystack includes the words a code stands for", () => {
  const hay = haystack(ms(), vocab);
  assert.match(hay, /latin/, "the language label must be searchable");
  assert.match(hay, /parchment/, "the support label must be searchable");
  assert.match(hay, /england/);
  assert.match(hay, /1300/);
});

test("a code with no label is still searchable as itself", () => {
  assert.match(haystack(ms({ language: "zzz" }), vocab), /zzz/);
});

/* ---------------------------------------------------------------- matching */

test("an empty query matches everything", () => {
  assert.equal(matches(ms(), terms(""), vocab), true);
});

test("every term must appear, so two words narrow", () => {
  assert.equal(matches(ms(), terms("douce latin"), vocab), true);
  assert.equal(matches(ms(), terms("douce greek"), vocab), false);
});

test("a shelfmark is found the way people type it", () => {
  for (const q of ["douce", "MS. Douce 1", "ms douce", "douce 1"]) {
    assert.equal(matches(ms(), terms(q), vocab), true, q);
  }
});

/* ---------------------------------------------------------------- centuries */

test("a manuscript is filed under the century its earliest date falls in", () => {
  assert.equal(centuryOf(ms()), 1300);
  assert.equal(centuryOf(ms({ not_before: 1400 })), 1400);
  assert.equal(centuryOf(ms({ not_before: 55 })), 0);
});

test("century labels count from one, and say BC when they must", () => {
  assert.equal(centuryLabel(1400), "15th century");
  assert.equal(centuryLabel(1000), "11th century");
  assert.equal(centuryLabel(1100), "12th century");
  assert.equal(centuryLabel(0), "1st century");
  assert.equal(centuryLabel(200), "3rd century");
  assert.equal(centuryLabel(-100), "1st century BC");
  assert.equal(centuryLabel(-300), "3rd century BC");
});

/* ------------------------------------------------------------------ finding */

test("no query and no facet returns the whole corpus", () => {
  assert.equal(find(corpus, {}, vocab).length, 3);
});

test("results come back oldest first", () => {
  assert.deepEqual(find(corpus, {}, vocab).map((r) => r.not_before), [1000, 1300, 1400]);
});

test("a facet narrows, and an absent facet means any", () => {
  assert.equal(find(corpus, { region: "Italy" }, vocab).length, 1);
  assert.equal(find(corpus, { region: null }, vocab).length, 3);
  assert.equal(find(corpus, { century: 1000 }, vocab).length, 1);
  assert.equal(find(corpus, { material: "perg" }, vocab).length, 2);
});

test("facets and a query combine", () => {
  assert.equal(find(corpus, { query: "parchment", region: "England" }, vocab).length, 1);
  assert.equal(find(corpus, { query: "parchment", region: "Italy" }, vocab).length, 0);
});

test("a query that matches nothing returns nothing, not everything", () => {
  assert.deepEqual(find(corpus, { query: "zzzznope" }, vocab), []);
});

/* ------------------------------------------------------------------- facets */

test("facets count only the values the corpus actually holds", () => {
  const regions = facets(corpus, "region");
  assert.deepEqual(regions.map((f) => f.value).sort(), ["Byzantium", "England", "Italy"]);
  assert.equal(regions.every((f) => f.n === 1), true);
});

test("facets are ordered by count, and centuries by date", () => {
  const many = [...corpus, ms({ id: "m4", region: "Italy" }), ms({ id: "m5", region: "Italy" })];
  assert.equal(facets(many, "region")[0].value, "Italy");
  assert.deepEqual(facets(corpus, "century").map((f) => f.value), [1000, 1300, 1400]);
});

test("a facet label falls back to the raw value", () => {
  assert.equal(facets(corpus, "material", { label: (v) => vocab.materials[v] ?? v })
    .find((f) => f.value === "chart").label, "paper");
});

test("an empty or missing value is not a facet", () => {
  const rows = [ms({ region: "" }), ms({ id: "x", region: undefined }), ms({ id: "y" })];
  assert.deepEqual(facets(rows, "region").map((f) => f.value), ["England"]);
});

/* ----------------------------------------------------------------- shuffling */

test("the same day gives the same order to everyone", () => {
  const a = shuffled(corpus, "2026-09-15").map((r) => r.id);
  const b = shuffled(corpus, "2026-09-15").map((r) => r.id);
  assert.deepEqual(a, b);
});

test("a different day gives a different order", () => {
  const many = Array.from({ length: 40 }, (_, i) => ms({ id: `m${i}` }));
  assert.notDeepEqual(shuffled(many, "2026-09-15").map((r) => r.id),
                      shuffled(many, "2026-09-16").map((r) => r.id));
});

/**
 * A shuffle that dropped rows would look exactly like a shuffle that worked,
 * which is how a silent truncation gets shipped. It must be a permutation.
 */
test("shuffling loses nothing and duplicates nothing", () => {
  const out = shuffled(corpus, "2026-09-15");
  assert.equal(out.length, corpus.length);
  assert.deepEqual(out.map((r) => r.id).sort(), corpus.map((r) => r.id).sort());
});

test("shuffling does not disturb the input", () => {
  const before = corpus.map((r) => r.id);
  shuffled(corpus, "2026-09-15");
  assert.deepEqual(corpus.map((r) => r.id), before);
});

test("an empty corpus shuffles to an empty corpus", () => {
  assert.deepEqual(shuffled([], "2026-09-15"), []);
});
