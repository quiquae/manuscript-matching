/**
 * Searching 2,201 manuscripts in the browser.
 *
 * No index and no server: the play index is already 110 KB and holds every
 * field worth searching, so the whole corpus is in memory and a query is a
 * filter over an array. At this size that is faster than anything cleverer
 * would be, and it means a search works offline once the page has loaded.
 *
 * Kept apart from search.js for the same reason deck.js is kept apart from
 * app.js: the matching rules are the part that can be wrong, so they are the
 * part under test.
 */

import { seededRandom } from "./deck.js";

/**
 * Text reduced to what a comparison should care about.
 *
 * Accents are stripped because shelfmarks and place names carry them
 * inconsistently, and a reader typing "Thérouanne" and one typing "Therouanne"
 * are asking the same question. Punctuation goes too, so "MS. Douce 1" is
 * found by "ms douce 1" and by "douce1".
 */
export function fold(text) {
  return String(text ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Everything about a row that a typed query may match. */
export function haystack(row, vocab = {}) {
  const languages = vocab.languages ?? {};
  const materials = vocab.materials ?? {};
  return fold([
    row.shelfmark,
    row.date_display,
    row.not_before, row.not_after,
    row.region,
    materials[row.material] ?? row.material,
    languages[row.language] ?? row.language,
  ].filter((v) => v !== undefined && v !== null && v !== "").join(" "));
}

/** Query terms, in the folded form `haystack` produces. */
export const terms = (query) => fold(query).split(" ").filter(Boolean);

/**
 * Every term must appear somewhere. Two words narrow rather than widen, so
 * "douce psalter" and "greek 1400" mean what a reader expects them to mean.
 */
export function matches(row, queryTerms, vocab) {
  if (!queryTerms.length) return true;
  const hay = haystack(row, vocab);
  return queryTerms.every((t) => hay.includes(t));
}

/** The century a manuscript is filed under: the one its earliest date falls in. */
export const centuryOf = (row) => Math.floor(row.not_before / 100) * 100;

/** 1400 -> "15th century". 0 -> "1st century". -100 -> "1st century BC". */
export function centuryLabel(start) {
  if (start < 0) return `${Math.floor(-start / 100)}${ordinal(Math.floor(-start / 100))} century BC`;
  const n = start / 100 + 1;
  return `${n}${ordinal(n)} century`;
}

function ordinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/**
 * The rows a query and a set of facets leave, in date order.
 *
 * An absent facet means "any", never "none" -- a filter that silently empties
 * the list is indistinguishable from a corpus that has nothing in it.
 */
export function find(rows, { query = "", century = null, region = null,
                             material = null, language = null } = {}, vocab = {}) {
  const queryTerms = terms(query);
  return rows
    .filter((row) =>
      (century === null || centuryOf(row) === century)
      && (region === null || row.region === region)
      && (material === null || row.material === material)
      && (language === null || row.language === language)
      && matches(row, queryTerms, vocab))
    .sort((a, b) => a.not_before - b.not_before
                    || String(a.shelfmark).localeCompare(String(b.shelfmark)));
}

/** The facet values actually present, each with a count. Never a fixed list. */
export function facets(rows, key, { label = (v) => v } = {}) {
  const counts = new Map();
  for (const row of rows) {
    const value = key === "century" ? centuryOf(row) : row[key];
    if (value === undefined || value === null || value === "") continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, n]) => ({ value, n, label: label(value) }))
    .sort((a, b) => (key === "century" ? a.value - b.value : b.n - a.n));
}

/**
 * The corpus in a stable daily order, for the view with nothing asked of it.
 *
 * Oldest-first is the right order for a search -- dates are what the question
 * is usually about -- but it is the wrong order for an empty search box. The
 * oldest things here are Egyptian papyri, and Bodleian photographs a papyrus
 * as fragments on a tray with a ruler beside it, so a reader arriving at the
 * page met six conservation shots and no manuscripts.
 *
 * Seeded by the date rather than by chance, so the grid is the same for
 * everybody who opens it today and different tomorrow. Reuses the game's
 * generator: one implementation of "deterministically random" in this codebase.
 */
export function shuffled(rows, seed) {
  const rng = seededRandom(seed);
  const out = [...rows];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
