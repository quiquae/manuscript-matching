/** Round scoring and the spoiler-free share grid. */

export const BASE = 1000;

/**
 * Score multiplier by expansions spent. Looking wider is allowed but costs:
 * this is what makes a two-second judgement a decision under uncertainty.
 */
export const MULTIPLIERS = [1, 0.7, 0.45, 0.25];

/** A wrong placement scores nothing; a right one is discounted by what you looked at. */
export function scoreRound(expansionsUsed, correct) {
  if (!correct) return 0;
  const i = Math.min(Math.max(expansionsUsed | 0, 0), MULTIPLIERS.length - 1);
  return Math.round(BASE * MULTIPLIERS[i]);
}

const SQUARES = ["\u{1F7E9}", "\u{1F7E8}", "\u{1F7E7}", "\u{2B1C}"];   // green, yellow, orange, white
const MISS = "\u{1F7E5}";                                              // red

/**
 * One square per round: green when placed correctly from the tightest crop,
 * paler as more of the page was needed, red when placed wrongly. Carries no
 * dates, shelfmarks or digits, so it cannot spoil the day's run.
 */
export function shareGrid(rounds) {
  return rounds
    .map(({ correct, expansions }) =>
      correct ? SQUARES[Math.min(Math.max(expansions | 0, 0), SQUARES.length - 1)] : MISS)
    .join("");
}
