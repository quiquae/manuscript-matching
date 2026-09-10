/**
 * Scoring an arrangement.
 *
 * Measured by pairs in the right relative order, not by exact positions: one
 * card dropped in the wrong slot should cost one card's worth of credit, not
 * shunt every later card and wipe the round.
 */
import { MULTIPLIERS, BASE } from "./scoring.js";

/** How many of the n(n-1)/2 pairs the player has the right way round. */
export function concordantPairs(arranged) {
  let right = 0;
  let total = 0;
  for (let i = 0; i < arranged.length; i++) {
    for (let j = i + 1; j < arranged.length; j++) {
      total += 1;
      if (arranged[i].not_before < arranged[j].not_before) right += 1;
    }
  }
  return { right, total };
}

/** Cards sitting somewhere other than their place in the true order. */
function misplacedIds(arranged) {
  const truth = [...arranged].sort((a, b) => a.not_before - b.not_before);
  return arranged.filter((c, i) => truth[i].id !== c.id).map((c) => c.id);
}

export function orderScore(arranged, zoomsUsed = 0) {
  const { right, total } = concordantPairs(arranged);
  if (!total) return 0;
  const i = Math.min(Math.max(zoomsUsed | 0, 0), MULTIPLIERS.length - 1);
  return Math.max(0, Math.round(BASE * (right / total) * MULTIPLIERS[i]));
}

export function orderResult(arranged, zoomsUsed = 0) {
  const { right, total } = concordantPairs(arranged);
  const misplaced = misplacedIds(arranged);
  return {
    right,
    total,
    perfect: misplaced.length === 0,
    misplaced,
    score: orderScore(arranged, zoomsUsed),
  };
}
