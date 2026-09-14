/**
 * The half of a record that only the reveal needs.
 *
 * `data/puzzles.json` holds what the game needs to deal, filter, draw and
 * score. The catalogue prose — the description of the hand, the decoration, the
 * contents, who owned it — lives in `data/details.json` and is fetched once,
 * lazily. See build/payload.py for why the line is drawn there.
 *
 * The fetch is started as soon as a round is dealt, not when a reveal is about
 * to render. A player spends seconds arranging cards, which is more than long
 * enough for it to arrive, so the wait is spent on something they were doing
 * anyway.
 *
 * If it never arrives, the reveal still renders. Every field it adds is
 * optional in `reveal.js`, so a failed fetch costs the player the catalogue
 * description and nothing else — the date, the shelfmark, the image and the
 * link out are all in the index.
 */

/**
 * @param load a function returning a promise of the details object, keyed by
 *   manuscript id. Injected so this is testable without a network.
 */
export function createRecords(load) {
  let pending = null;

  /** The first caller starts the fetch; everyone after it waits on the same one. */
  const start = () => (pending ??= Promise.resolve().then(load));

  return {
    prefetch() {
      // A rejection here must not become an unhandled rejection: nothing is
      // waiting on it yet, and `merge` will handle it when something is.
      start().catch(() => {});
    },

    /** One index row plus its details, or the row alone if they never came. */
    async merge(row) {
      if (!row) return row;
      try {
        const details = await start();
        return { ...row, ...(details?.[row.id] ?? {}) };
      } catch {
        return row;
      }
    },
  };
}

/** The real loader, used by the pages. */
export const fetchDetails = () =>
  fetch("data/details.json").then((r) => {
    if (!r.ok) throw new Error(`details.json: ${r.status}`);
    return r.json();
  });
