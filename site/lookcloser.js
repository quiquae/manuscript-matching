/**
 * Look Closer — one page, a handful of looks, then a reading.
 *
 * The axes are the ones the Bodleian's own catalogue facets on *and* that a
 * page can actually show you: century, origin, material, language, and the hand
 * itself. Subject was dropped: what a book is about is the one thing looking at
 * it will not tell you.
 *
 * Decoration was dropped too, later and for a different reason. 1,940 of the
 * 2,201 manuscripts carry some decoration, so "Decorated or plain?" was right
 * nine times in ten before you looked at anything. Narrowing it to painted or
 * gilded would have made it 43/57 and answerable, but a question you win by
 * saying yes is not improved by making it harder to guess — it is still asking
 * about the least informative thing on the page.
 */

/** Patches you may uncover before committing. */
export const REVEAL_BUDGET = 5;

const PATCH_MIN = 0.10;
const PATCH_MAX = 0.22;
const PATCH_GROWTH_MS = 9000;

const MAX_SCORE = 1000;
const TOLERANCE = 150;          // years outside the range before credit is nil

// Must sum to 1: the score is MAX_SCORE x accuracy, so a set that sums to less
// than 1 silently caps a perfect reading below the full thousand and nothing
// reports it. Asserted in lookcloser.test.js.
//
// Redistributed when decoration was dropped, keeping the shape the old set had
// -- date dominant, origin second, material and language level. The removed
// 0.14 went mostly to the date, which is the axis the game is named for.
const WEIGHTS = {
  date: 0.4, region: 0.24, material: 0.18, language: 0.18,
};

/** What a page can be made of. */
export const MATERIALS = [
  { id: "perg", label: "Parchment" },
  { id: "chart", label: "Paper" },
  { id: "papyrus", label: "Papyrus" },
];

/** The languages you have a real chance of recognising by eye. */
export const LANGUAGES = [
  { id: "la", label: "Latin" },
  { id: "grc", label: "Greek" },
  { id: "enm", label: "Middle English" },
  { id: "fro", label: "Old French" },
  { id: "it", label: "Italian" },
  { id: "ang", label: "Old English" },
];

/**
 * Full credit anywhere inside the cataloguer's own range. These books are dated
 * to a quarter-century, so demanding a single year would punish the player for
 * the catalogue's precision rather than test their eye.
 */
export function dateCredit(year, { not_before, not_after }) {
  if (year >= not_before && year <= not_after) return 1;
  const miss = year < not_before ? not_before - year : year - not_after;
  return Math.max(0, 1 - miss / TOLERANCE);
}

/**
 * How big a patch is, given how long it has been open.
 *
 * Patches widen as you sit with them, so lingering shows you more — but the
 * budget is fixed, so it never becomes a way to see the whole page.
 */
export function patchSizeAt(openMs) {
  const t = Math.min(1, Math.max(0, openMs) / PATCH_GROWTH_MS);
  return PATCH_MIN + (PATCH_MAX - PATCH_MIN) * t;
}

/** A square window centred on (cx, cy) in fractional coordinates, clamped to the page. */
export function patchAt(cx, cy, imgW, imgH, size = PATCH_MIN) {
  const w = Math.round(imgW * size);
  const h = Math.round(imgH * size);
  return {
    x: Math.round(Math.min(Math.max(cx * imgW - w / 2, 0), imgW - w)),
    y: Math.round(Math.min(Math.max(cy * imgH - h / 2, 0), imgH - h)),
    w,
    h,
  };
}

/** Multiplier for how much of the page you needed. Never reaches zero. */
export function unrevealedPenalty(revealsUsed) {
  const spent = Math.min(Math.max(revealsUsed | 0, 0), REVEAL_BUDGET);
  return 1 - (spent / REVEAL_BUDGET) * 0.5;
}

export function scoreReading(guess, truth, revealsUsed) {
  const accuracy =
    dateCredit(guess.year, truth) * WEIGHTS.date
    + (guess.region === truth.region ? WEIGHTS.region : 0)
    + (guess.material === truth.material ? WEIGHTS.material : 0)
    + (guess.language === truth.language ? WEIGHTS.language : 0);
  return Math.round(MAX_SCORE * accuracy * unrevealedPenalty(revealsUsed));
}

/** The weights, for the test that holds them to summing to one. */
export const AXIS_WEIGHTS = WEIGHTS;

/* ---- the typed palaeography answer ------------------------------------- */

/**
 * Script names as cataloguers write them, with the spellings a player might
 * reasonably type. Order matters only for reporting; matching is by set.
 */
const SCRIPTS = {
  anglicana: ["anglicana"],
  secretary: ["secretary"],
  textualis: ["textualis", "textura", "gothic", "semiquadrata", "quadrata"],
  protogothic: ["protogothic", "proto-gothic", "proto gothic"],
  caroline: ["caroline", "carolingian"],
  humanistic: ["humanistic", "humanist"],
  cursive: ["cursiva", "cursive", "bastarda", "bâtarde", "batarde", "hybrida"],
  insular: ["insular"],
  uncial: ["uncial", "half-uncial", "majuscule"],
  rotunda: ["rotunda"],
  beneventan: ["beneventan"],
  visigothic: ["visigothic"],
};

/** Which canonical scripts a cataloguer's description mentions. */
function scriptsIn(text) {
  const low = String(text ?? "").toLowerCase();
  return Object.entries(SCRIPTS)
    .filter(([, spellings]) => spellings.some((s) => low.includes(s)))
    .map(([name]) => name);
}

/**
 * Grade a typed script name against the cataloguer's own description.
 *
 * Auto-graded because the Bodleian already wrote the answer: 949 records carry
 * a palaeographer's account of the hand, naming the very letterforms that date
 * the page.
 */
export function gradeHand(typed, handNote) {
  const present = scriptsIn(handNote);
  if (!handNote || !present.length) {
    return { gradable: false, hit: false, terms: [] };
  }
  const guessed = scriptsIn(typed);
  return {
    gradable: true,
    hit: guessed.some((g) => present.includes(g)),
    terms: present,
  };
}
