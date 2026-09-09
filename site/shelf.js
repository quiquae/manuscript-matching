/**
 * The Shelf — what you have met, and what you have not.
 *
 * This is the connective tissue between the two games and the reason the
 * project exists: every manuscript you encounter accumulates here, each one
 * linking back to its Bodleian record. The gaps are the interesting part.
 */

const KEY = "ante-quem:shelf";
const CENTURY = 100;

/**
 * @param storage anything with getItem/setItem. Injected so the shelf can be
 *   tested outside a browser, and so a private-mode failure degrades quietly.
 */
export function createShelf(storage) {
  let ids;
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? "[]");
    ids = new Set(Array.isArray(raw) ? raw : []);
  } catch {
    ids = new Set();          // corrupt data is not worth a crash
  }

  const persist = () => {
    try {
      storage.setItem(KEY, JSON.stringify([...ids]));
    } catch {
      /* private mode, quota: the shelf is a nicety, never a blocker */
    }
  };

  return {
    seen: () => [...ids],
    has: (id) => ids.has(id),
    record(id) {
      if (!id || ids.has(id)) return;
      ids.add(id);
      persist();
    },
  };
}

function tally(puzzles, seenSet, keyOf) {
  const totals = new Map();
  for (const p of puzzles) {
    const key = keyOf(p);
    const row = totals.get(key) ?? { key, seen: 0, total: 0 };
    row.total += 1;
    if (seenSet.has(p.id)) row.seen += 1;
    totals.set(key, row);
  }
  return [...totals.values()];
}

/** What you have met, grouped the two ways that make the gaps legible. */
export function coverage(puzzles, seenIds) {
  const seenSet = new Set(seenIds);
  const byRegion = tally(puzzles, seenSet, (p) => p.region)
    .sort((a, b) => b.total - a.total);
  const byCentury = tally(puzzles, seenSet, (p) => Math.floor(p.not_before / CENTURY) * CENTURY)
    .sort((a, b) => a.key - b.key);

  return {
    total: puzzles.length,
    seen: puzzles.filter((p) => seenSet.has(p.id)).length,
    byRegion,
    byCentury,
    emptyRegions: byRegion.filter((r) => r.seen === 0).map((r) => r.key),
  };
}
