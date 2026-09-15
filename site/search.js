/**
 * The search page. Matching rules live in find.js; this is the DOM.
 *
 * The corpus is filtered on every keystroke because 2,201 rows is small enough
 * that debouncing would only add latency to feel busy. What is capped is the
 * DOM: rendering two thousand thumbnails would open two thousand requests
 * against an image server that fails one in five, so a page is 60 results and
 * the rest is a button. The count above the grid is always the true total, so
 * the cap bounds what is drawn and never what was found.
 */
import { centuryLabel, facets, find, shuffled } from "./find.js";
import { todayISO } from "./daily.js";

const PAGE = 60;
const THUMB = 200;

const $ = (id) => document.getElementById(id);
const state = { rows: [], vocab: {}, shown: PAGE,
                facet: { century: null, region: null, material: null, language: null } };

/* ----------------------------------------------------------------- facets */

/** One chip row. "Any" first, then whatever the corpus actually contains. */
function chipRow(el, key, options) {
  el.innerHTML = "";
  const all = [{ value: null, label: "Any", n: state.rows.length }, ...options];
  for (const option of all) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = option.label;
    if (option.value !== null) {
      const count = document.createElement("span");
      count.className = "chip-count";
      count.textContent = option.n;
      chip.append(" ", count);
    }
    if (state.facet[key] === option.value) chip.classList.add("is-chosen");
    chip.onclick = () => {
      state.facet[key] = option.value;
      state.shown = PAGE;
      render();
    };
    el.append(chip);
  }
}

/* ---------------------------------------------------------------- results */

function card(row) {
  const a = document.createElement("a");
  a.className = "find-card";
  a.href = `ms/${row.slug}.html`;

  const img = document.createElement("img");
  img.src = `${row.iiif}/full/${THUMB},/0/default.jpg`;
  img.loading = "lazy";
  img.decoding = "async";
  img.alt = "";                       // the shelfmark below it is the label
  // Bodleian's image server fails often enough that a broken-image icon is a
  // normal state, not an exception. A missing page falls back to the ruled
  // placeholder the game uses.
  img.onerror = () => a.classList.add("is-pageless");

  const shelf = document.createElement("span");
  shelf.className = "find-shelf";
  shelf.textContent = row.shelfmark || row.id;

  const when = document.createElement("span");
  when.className = "find-when";
  const language = state.vocab.languages?.[row.language] ?? row.language;
  const support = state.vocab.materials?.[row.material] ?? row.material;
  when.textContent = [row.date_display || `${row.not_before}–${row.not_after}`,
                      row.region, support, language]
    .filter((p) => p && p !== "unknown" && p !== "Elsewhere").join(" · ");

  a.append(img, shelf, when);
  return a;
}

function render() {
  const asked = Boolean($("q").value.trim())
                || Object.values(state.facet).some((v) => v !== null);
  const found = find(state.rows, { query: $("q").value, ...state.facet }, state.vocab);
  // Oldest-first once something has been asked, because then the date is the
  // question. Shuffled when nothing has, because the oldest end of this corpus
  // is papyrus fragments on trays and that is not what the corpus looks like.
  const ordered = asked ? found : shuffled(found, todayISO());

  const n = found.length.toLocaleString("en-GB");
  const all = state.rows.length.toLocaleString("en-GB");
  $("count").textContent = asked
    ? `${n} of ${all}, oldest first`
    : `All ${all} manuscripts, shuffled for today`;

  const grid = $("results");
  grid.innerHTML = "";
  if (!found.length) {
    grid.innerHTML = '<p class="empty-board">Nothing matches that. '
      + 'Try a shelfmark, a century, or a language.</p>';
  }
  for (const row of ordered.slice(0, state.shown)) grid.append(card(row));

  $("more").hidden = found.length <= state.shown;
  $("more").textContent = `Show ${Math.min(PAGE, found.length - state.shown)} more`;

  // A search worth sharing should survive being pasted, so it lives in the URL.
  const q = $("q").value.trim();
  const url = q ? `?q=${encodeURIComponent(q)}` : window.location.pathname;
  window.history.replaceState(null, "", url);

  $("surprise").onclick = (event) => {
    event.preventDefault();
    const pool = found.length ? found : state.rows;
    // Not seeded: this one is meant to be a different manuscript every time.
    window.location.href = `ms/${pool[Math.floor(Math.random() * pool.length)].slug}.html`;
  };
}

/* ------------------------------------------------------------------- boot */

async function boot() {
  try {
    const [rows, vocab] = await Promise.all(
      ["puzzles", "vocab"].map((n) => fetch(`data/${n}.json`).then((r) => {
        if (!r.ok) throw new Error(`${n}.json: ${r.status}`);
        return r.json();
      })));
    state.rows = rows;
    state.vocab = vocab;

    const label = (map) => (v) => map?.[v] ?? v;
    chipRow($("f-century"), "century", facets(rows, "century", { label: centuryLabel }));
    chipRow($("f-region"), "region", facets(rows, "region"));
    chipRow($("f-material"), "material",
            facets(rows, "material", { label: label(vocab.materials) }));
    chipRow($("f-language"), "language",
            facets(rows, "language", { label: label(vocab.languages) }).slice(0, 12));

    $("q").value = new URLSearchParams(window.location.search).get("q") ?? "";
    $("q").oninput = () => { state.shown = PAGE; render(); };
    $("more").onclick = () => { state.shown += PAGE; render(); };
    render();
    $("q").focus();
  } catch (err) {
    $("count").textContent =
      "The manuscript data has not been built yet. Run `python -m build` and reload.";
    console.error(err);
  }
}

boot();
