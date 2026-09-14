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
