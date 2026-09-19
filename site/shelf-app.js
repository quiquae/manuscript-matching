/** The Shelf page: coverage of the corpus, and every record you have met. */
import { coverage, createShelf } from "./shelf.js";

const $ = (id) => document.getElementById(id);
const shelf = createShelf(window.localStorage);

const EARLY = Symbol("early");

const centuryLabel = (year) => {
  if (year === EARLY) return "Before 700";
  if (year < 0) return `${Math.abs(year / 100)}00s BC`;
  return `${year}s`;
};

function renderBars(el, rows, label) {
  el.innerHTML = "";
  const widest = Math.max(...rows.map((r) => r.total), 1);
  for (const row of rows) {
    const pct = (row.seen / row.total) * 100;
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.setAttribute("role", "meter");
    bar.setAttribute("aria-valuenow", String(row.seen));
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", String(row.total));
    bar.setAttribute("aria-label", `${label(row.key)}: ${row.seen} of ${row.total} met`);
    bar.innerHTML = `
      <span class="bar-label"></span>
      <span class="bar-track" style="width:${(row.total / widest) * 100}%">
        <span class="bar-fill" style="width:${pct}%"></span>
      </span>
      <span class="bar-count"></span>`;
    bar.querySelector(".bar-label").textContent = label(row.key);
    bar.querySelector(".bar-count").textContent = `${row.seen}/${row.total}`;
    el.append(bar);
  }
}

/**
 * Fifteen rows reading 0/1 bury the four centuries that hold most of the
 * corpus. Everything earlier than the fold becomes a single row.
 *
 * Folded by date, not by count: keying on count left "200s" sitting below a
 * row labelled "Before 700", which is nonsense to read.
 */
const FOLD_BEFORE = 700;

function foldThinCenturies(rows) {
  const thin = rows.filter((r) => r.key < FOLD_BEFORE);
  const rest = rows.filter((r) => r.key >= FOLD_BEFORE);
  if (thin.length < 2) return rows;
  const merged = {
    key: EARLY,
    seen: thin.reduce((n, r) => n + r.seen, 0),
    total: thin.reduce((n, r) => n + r.total, 0),
  };
  return [merged, ...rest];
}

async function boot() {
  const puzzles = await fetch("data/puzzles.json").then((r) => r.json());
  const seen = shelf.seen();
  const cov = coverage(puzzles, seen);

  $("headline").textContent =
    `You have met ${cov.seen} of ${cov.total} manuscripts.`;
  $("gaps").textContent = cov.emptyRegions.length
    ? `Nothing yet from ${cov.emptyRegions.join(", ")}.`
    : "You have seen something from every region.";

  renderBars($("by-century"), foldThinCenturies(cov.byCentury), centuryLabel);
  renderBars($("by-region"), cov.byRegion, (k) => k);

  const byId = new Map(puzzles.map((p) => [p.id, p]));
  const met = $("met");
  if (!seen.length) {
    met.innerHTML = '<p class="note">Play a round and the manuscripts you meet appear here.</p>';
    return;
  }
  met.innerHTML = "";
  for (const id of seen) {
    const p = byId.get(id);
    if (!p) continue;
    const a = document.createElement("a");
    a.className = "met-item";
    a.href = p.catalogue;
    a.target = "_blank";
    a.rel = "noopener";
    a.innerHTML = `<img loading="lazy" alt=""><span class="met-shelf"></span><span class="met-when"></span>`;
    a.querySelector("img").src = `${p.iiif}/full/200,/0/default.jpg`;
    a.querySelector(".met-shelf").textContent = p.shelfmark || p.id;
    a.querySelector(".met-when").textContent =
      p.date_label || `${p.not_before}–${p.not_after}`;
    met.append(a);
  }
}

boot();
