/** The Shelf page: coverage of the corpus, and every record you have met. */
import { coverage, createShelf } from "./shelf.js";

const $ = (id) => document.getElementById(id);
const shelf = createShelf(window.localStorage);

const centuryLabel = (year) => {
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

async function boot() {
  const puzzles = await fetch("data/puzzles.json").then((r) => r.json());
  const seen = shelf.seen();
  const cov = coverage(puzzles, seen);

  $("headline").textContent =
    `You have met ${cov.seen} of ${cov.total} manuscripts.`;
  $("gaps").textContent = cov.emptyRegions.length
    ? `Nothing yet from ${cov.emptyRegions.join(", ")}.`
    : "You have seen something from every region.";

  renderBars($("by-century"), cov.byCentury, centuryLabel);
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
      p.date_display || `${p.not_before}–${p.not_after}`;
    met.append(a);
  }
}

boot();
