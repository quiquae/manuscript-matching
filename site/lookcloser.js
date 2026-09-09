/**
 * Look Closer — the solitary game.
 *
 * One page, mostly masked. You spend reveals to uncover patches, then commit to
 * a reading: when, where, and what kind of book. Where you choose to look is
 * the skill being tested, so restraint is what the scoring rewards.
 */

/** Patches you may uncover before committing. */
export const REVEAL_BUDGET = 5;

/** Fraction of each dimension one patch uncovers. */
export const PATCH_SIZE = 0.16;

const MAX_SCORE = 1000;
const WEIGHTS = { date: 0.5, region: 0.25, subject: 0.25 };

/** Years outside the catalogued range before credit reaches zero. */
const TOLERANCE = 150;

/**
 * Full credit anywhere inside the cataloguer's own range, decaying linearly
 * outside it. The range is the honest answer: these manuscripts are dated to
 * a quarter-century, not to a year, so demanding a single year would be
 * punishing the player for the catalogue's precision.
 */
export function dateCredit(year, { not_before, not_after }) {
  if (year >= not_before && year <= not_after) return 1;
  const miss = year < not_before ? not_before - year : year - not_after;
  return Math.max(0, 1 - miss / TOLERANCE);
}

/** Multiplier for how much of the page you needed. Never reaches zero. */
export function unrevealedPenalty(revealsUsed) {
  const spent = Math.min(Math.max(revealsUsed | 0, 0), REVEAL_BUDGET);
  return 1 - (spent / REVEAL_BUDGET) * 0.5;
}

/** Score one committed reading across all three axes. */
export function scoreReading(guess, truth, revealsUsed) {
  const date = dateCredit(guess.year, truth);
  const region = guess.region === truth.region ? 1 : 0;
  const subject = (truth.subjects ?? []).includes(guess.subject) ? 1 : 0;
  const accuracy = date * WEIGHTS.date + region * WEIGHTS.region + subject * WEIGHTS.subject;
  return Math.round(MAX_SCORE * accuracy * unrevealedPenalty(revealsUsed));
}

/** A square window centred on (cx, cy) in fractional coordinates, clamped to the page. */
export function patchAt(cx, cy, imgW, imgH, size = PATCH_SIZE) {
  const w = Math.round(imgW * size);
  const h = Math.round(imgH * size);
  return {
    x: Math.round(Math.min(Math.max(cx * imgW - w / 2, 0), imgW - w)),
    y: Math.round(Math.min(Math.max(cy * imgH - h / 2, 0), imgH - h)),
    w,
    h,
  };
}
