/**
 * The daily set — one arrangement a day, the same for everyone.
 *
 * There is no pre-built deck behind this and no build step. `buildSet` is
 * deterministic from its seed, so seeding it with the date is all it takes for
 * two players to be dealt the same manuscripts. An earlier design generated 400
 * days of decks in Python and shipped them as a data file; once the player could
 * choose a collection and a difficulty that stopped being possible, because no
 * build can pre-compute every combination.
 *
 * The slice is therefore fixed for the day. A daily that honoured the chips
 * would not be shared at all — it would be an endless round with a date in the
 * seed.
 */

/** Today on the player's own clock, not in UTC: their day is the one they see. */
export function todayISO(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The fixed slice. Everything, at Standard — the shape a newcomer meets first. */
export const DAILY_COLLECTION = "all";
export const DAILY_DIFFICULTY = "standard";

export const dailySeed = (day) => `daily-${day}`;

/** The day the daily began. That day is puzzle #1. */
export const EPOCH = "2026-09-14";

const asUTC = (day) => {
  const [y, m, d] = String(day).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const DAY_MS = 86400000;

/**
 * Which puzzle a date is, counting from the epoch.
 *
 * Computed from UTC midnights rather than local ones: a local-time subtraction
 * is off by an hour across a daylight-saving boundary, and an hour is enough to
 * make a floor() land on the wrong day. The dates themselves stay local — this
 * arithmetic is on two calendar labels, not on two instants.
 */
export function puzzleNumber(day, epoch = EPOCH) {
  const n = Math.round((asUTC(day) - asUTC(epoch)) / DAY_MS) + 1;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Consecutive days played, counting back from today.
 *
 * Counts from yesterday when today has not been played yet, so opening the
 * page does not appear to have reset a streak the player has not yet had the
 * chance to keep.
 */
export function streak(days, today) {
  const played = new Set(days);
  let from = asUTC(today);
  if (!played.has(today)) from -= DAY_MS;
  let n = 0;
  while (played.has(new Date(from).toISOString().slice(0, 10))) {
    n += 1;
    from -= DAY_MS;
  }
  return n;
}

/**
 * The text a player pastes somewhere.
 *
 * Shaped like the game it is borrowing from: a number people can compare, a
 * score out of a total, the spoiler-free grid, and a link. No dates,
 * shelfmarks or digits inside the grid, so posting it cannot spoil the day.
 */
export function shareText(day, row, url, runOf = 0) {
  const head = `Manuscript Matching #${puzzleNumber(day)} · ${row.right}/${row.total}`;
  return [
    runOf >= 2 ? `${head} · ${runOf} day streak` : head,
    row.grid,
    url,
  ].join("\n");
}

/** 14 September 2026 -> "14 September 2026", for the heading. */
export function dailyLabel(day) {
  const [y, m, d] = String(day).split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July",
                  "August", "September", "October", "November", "December"];
  if (!y || !m || !d || !months[m - 1]) return String(day);
  return `${d} ${months[m - 1]} ${y}`;
}

const KEY = "ante-quem:daily";

/**
 * What the player scored on a given day.
 *
 * Kept so a return visit shows the result rather than pretending the day is
 * unplayed. It does not lock the set: re-dealing the same five manuscripts is
 * harmless, and locking a player out of the only shared round of the day to
 * protect a number nobody verifies would be the wrong trade.
 *
 * @param storage anything with getItem/setItem, injected so this is testable
 *   outside a browser and so a private-mode failure degrades quietly.
 */
export function createDailyLog(storage) {
  const load = () => {
    try {
      const raw = JSON.parse(storage.getItem(KEY) ?? "{}");
      return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch {
      return {};                  // corrupt data is not worth a crash
    }
  };

  return {
    /** Every day with a result, for the streak. */
    days: () => Object.keys(load()),

    read(day) {
      const row = load()[day];
      return row && typeof row === "object" ? row : null;
    },
    /** First result of the day wins, so a reroll cannot inflate it. */
    write(day, { score, grid, right, total }) {
      const all = load();
      if (all[day]) return all[day];
      all[day] = { score, grid, right, total };
      try {
        storage.setItem(KEY, JSON.stringify(all));
      } catch {
        /* private mode, quota: the record is a nicety, never a blocker */
      }
      return all[day];
    },
  };
}
