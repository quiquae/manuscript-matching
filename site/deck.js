/**
 * Choosing what you play with.
 *
 * Deck rules live here rather than in the build step because the player picks
 * the slice — papyri, English codices, illuminated books — and no build could
 * pre-compute every combination. Determinism comes from a seeded generator, so
 * a shared daily set is still identical for everyone.
 */

/** A small, fast, well-distributed PRNG (mulberry32) seeded from a string. */
export function seededRandom(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (let i = 0; i < String(seed).length; i++) {
    h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Minimum years between neighbours at step n, decaying to a floor. */
export function gapFor(n, start = 300, floor = 25, decay = 0.75) {
  return Math.max(floor, Math.round(start * decay ** (n - 1)));
}

/**
 * Whether a card's date range clears its neighbours by at least `minGap`.
 *
 * This is what keeps an ordering answerable: if two ranges overlapped, both
 * orders of that pair would be defensible and the player could not be marked
 * wrong for either.
 */
export function isLegal(board, card, minGap) {
  for (const other of board) {
    const clear = card.not_before > other.not_after + minGap - 1
      || other.not_before > card.not_after + minGap - 1;
    if (!clear) return false;
  }
  return true;
}

/**
 * The cards that have to go for the rest to be in one defensible order.
 *
 * `buildSet` guarantees this at deal time, but a card can be substituted after
 * the deal -- a page that will not load is replaced in its seat -- and two
 * substitutions in one round can leave a pair whose ranges overlap. Both orders
 * of that pair would then be defensible and the player would be marked wrong
 * for being right.
 *
 * Keeps the earlier card of a clashing pair and returns the later, so the
 * result is the shortest list whose removal leaves the board answerable. A
 * short set beats an unanswerable one, which is the same trade `buildSet`
 * makes when it runs out of legal cards.
 */
export function ambiguous(cards) {
  const ordered = [...cards].sort((a, b) => a.not_before - b.not_before);
  const drop = [];
  let last = null;
  for (const card of ordered) {
    if (last && card.not_before <= last.not_after) {
      drop.push(card);
      continue;
    }
    last = card;
  }
  return drop;
}

/** The slices a player can choose to play with. */
export const COLLECTIONS = [
  { id: "all", label: "Everything", blurb: "The whole corpus, papyrus to print.",
    test: () => true },
  { id: "codices", label: "Medieval codices", blurb: "Parchment and paper books, 700 onwards.",
    test: (p) => p.material !== "papyrus" && p.not_before >= 700 },
  { id: "papyri", label: "Ancient papyri", blurb: "Greek and Egyptian, mostly Oxyrhynchus.",
    test: (p) => p.material === "papyrus" },
  { id: "illuminated", label: "Illuminated", blurb: "Books with painted decoration.",
    test: (p) => Boolean(p.decorated) },
  { id: "england", label: "Made in England", blurb: "The largest single group.",
    test: (p) => p.region === "England" },
];

/**
 * How hard the ordering is. Size is how many cards you hold; startGap and floor
 * control how far apart in time they are allowed to be.
 */
export const DIFFICULTIES = [
  { id: "gentle", label: "Gentle", size: 4, startGap: 400, floor: 120, grow: 1,
    blurb: "Centuries apart. No knowledge needed to start." },
  { id: "standard", label: "Standard", size: 5, startGap: 250, floor: 40, grow: 2,
    blurb: "Generations apart." },
  { id: "expert", label: "Expert", size: 6, startGap: 90, floor: 10, grow: 2,
    blurb: "Decades apart, and you name the script." },
];

/**
 * A set of cards that can be put in one defensible order.
 *
 * `keep` carries forward cards already on the table so a round can grow without
 * disturbing what the player has arranged.
 */
export function buildSet(pool, { size = 5, seed = "", startGap = 250, floor = 40, keep = [] } = {}) {
  const rng = seededRandom(seed);
  const chosen = [...keep];
  const taken = new Set(chosen.map((c) => c.id));

  // Stratify by century: the playable set is heavily fifteenth-century and an
  // unstratified draw returns five books from the same fifty years.
  const byCentury = new Map();
  for (const card of pool) {
    if (taken.has(card.id)) continue;
    const century = Math.floor(card.not_before / 100);
    if (!byCentury.has(century)) byCentury.set(century, []);
    byCentury.get(century).push(card);
  }
  const centuries = [...byCentury.keys()].sort((a, b) => a - b);
  for (const list of byCentury.values()) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  for (let step = chosen.length + 1; chosen.length < size; step++) {
    const candidates = [];
    for (const century of centuries) candidates.push(...byCentury.get(century).slice(0, 25));
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    let placed = false;
    for (const minGap of [gapFor(step, startGap, floor), floor, 1]) {
      const match = candidates.find((c) => !taken.has(c.id) && isLegal(chosen, c, minGap));
      if (match) {
        chosen.push(match);
        taken.add(match.id);
        placed = true;
        break;
      }
    }
    if (!placed) break;    // a short set beats an unanswerable one
  }
  return chosen;
}
