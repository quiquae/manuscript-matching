/**
 * Ante Quem — put the manuscripts in order, oldest first.
 *
 * The whole skill is relative dating, so the interface is a row of cards you
 * rearrange rather than a form you fill in. Nothing about a card is disclosed
 * before you commit: you have the image, and how much of it you choose to look
 * at costs you score.
 */
import { COLLECTIONS, DIFFICULTIES, buildSet, seededRandom } from "./deck.js";
import { cropBox, EXPANSION_STEPS, focusPoint } from "./crop.js";
import { isReadable, parchmentFraction } from "./readable.js";
import { orderResult } from "./order.js";
import { MULTIPLIERS, shareGrid } from "./scoring.js";
import { renderReveal } from "./reveal.js";
import { createShelf } from "./shelf.js";
import { createRecords, fetchDetails } from "./records.js";
import {
  createDailyLog, DAILY_COLLECTION, DAILY_DIFFICULTY, dailyLabel, dailySeed, todayISO,
} from "./daily.js";

const DATA = "data/";
const IIIF_WIDTH = 682;
// Arrange is a comparison game: if two manuscripts do not fit on screen at once
// there is nothing to compare. Cards shrink on narrow viewports rather than
// forcing a scroll between every pair.
const CARD_SIZES = [
  { upTo: 420, w: 116, h: 152 },
  { upTo: 700, w: 150, h: 196 },
  { upTo: Infinity, w: 190, h: 250 },
];

const cardSize = () =>
  CARD_SIZES.find((s) => window.innerWidth <= s.upTo) ?? CARD_SIZES.at(-1);

const $ = (id) => document.getElementById(id);
const shelf = createShelf(window.localStorage);
const dailyLog = createDailyLog(window.localStorage);
const records = createRecords(fetchDetails);

/** By id, never by position: the order of these lists is presentational. */
const pick = (items, id) => items.find((i) => i.id === id) ?? items[0];

const ROUNDS = [
  { id: "daily", label: "Daily", blurb: "One set a day, the same for everyone." },
  { id: "endless", label: "Endless", blurb: "Deal as many as you like, your way." },
];

const state = {
  puzzles: [],
  byId: new Map(),
  context: {},
  lookalikes: {},
  round: ROUNDS[0],
  day: todayISO(),
  collection: pick(COLLECTIONS, DAILY_COLLECTION),
  difficulty: pick(DIFFICULTIES, DAILY_DIFFICULTY),
  cards: [],          // { puzzle, image, focus, zoom }
  drag: null,
  committed: false,
  score: 0,
  best: Number(window.localStorage.getItem("ante-quem:best") ?? 0),
};

/* ---------------------------------------------------------------- images */

const imageCache = new Map();

/** One request per manuscript, ever; every zoom after that is local. */
function loadImage(puzzle) {
  if (imageCache.has(puzzle.id)) return imageCache.get(puzzle.id);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(puzzle.id));
    img.src = `${puzzle.iiif}/full/${IIIF_WIDTH},/0/default.jpg`;
  });
  imageCache.set(puzzle.id, promise);
  return promise;
}

/** One downscaled read of the image, used for both focus and readability. */
function inspect(img) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = Math.max(1, Math.round((img.height / img.width) * 64));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const pixels = ctx.getImageData(0, 0, c.width, c.height);
  return { focus: focusPoint(pixels, 8), parchment: parchmentFraction(pixels) };
}

function paint(card) {
  const canvas = card.canvas;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#efe9df";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!card.image) return;

  const zoom = EXPANSION_STEPS[Math.min(card.zoom, EXPANSION_STEPS.length - 1)];
  const box = cropBox(card.image.width, card.image.height, card.focus.cx, card.focus.cy, zoom);
  const whole = card.zoom >= EXPANSION_STEPS.length - 1;
  const scale = whole
    ? Math.min(canvas.width / box.w, canvas.height / box.h)
    : Math.max(canvas.width / box.w, canvas.height / box.h);
  const dw = box.w * scale;
  const dh = box.h * scale;
  ctx.drawImage(card.image, box.x, box.y, box.w, box.h,
                (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
}

/* ------------------------------------------------------------------ table */

const zoomsUsed = () => state.cards.reduce((n, c) => n + c.zoom, 0);

function moveCard(from, to) {
  if (to < 0 || to >= state.cards.length) return;
  const [card] = state.cards.splice(from, 1);
  state.cards.splice(to, 0, card);
  renderTable();
}

/**
 * Dragging, on document-level listeners rather than pointer capture.
 *
 * The row re-renders as cards reorder under the pointer, which destroys the
 * element being dragged; listening on the document survives that, and the drag
 * is tracked by card object rather than by node.
 */
/** One more expansion step on a single card. Costs score, like every look. */
function zoomCard(card) {
  if (state.committed || card.zoom >= EXPANSION_STEPS.length - 1) return;
  card.zoom += 1;
  paint(card);
  updateStats();
}

function startDrag(card, event) {
  if (state.committed) return;
  const originX = event.clientX;
  const originY = event.clientY;
  let moved = false;
  state.drag = card;
  renderTable();

  const over = (clientX) => {
    const seats = [...document.querySelectorAll(".card")];
    for (let i = 0; i < seats.length; i++) {
      const box = seats[i].getBoundingClientRect();
      if (clientX < box.left + box.width / 2) return i;
    }
    return seats.length - 1;
  };

  const move = (e) => {
    if (Math.hypot(e.clientX - originX, e.clientY - originY) > 6) moved = true;
    const from = state.cards.indexOf(card);
    const to = over(e.clientX);
    if (to !== -1 && to !== from) {
      state.cards.splice(from, 1);
      state.cards.splice(to, 0, card);
      renderTable();
    }
  };

  const end = () => {
    state.drag = null;
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", end);
    // A press that never travelled is a tap, and a tap means "show me more".
    if (!moved) zoomCard(card);
    renderTable();
  };

  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  event.preventDefault();
}

function renderTable() {
  const table = $("table");
  table.innerHTML = "";

  state.cards.forEach((card, i) => {
    const el = document.createElement("div");
    el.className = "card";
    if (state.drag === card) el.classList.add("is-dragging");
    if (state.committed) {
      el.classList.add(card.wrong ? "is-wrong" : "is-right");
    }

    const seat = document.createElement("div");
    seat.className = "card-seat";
    seat.setAttribute("role", "img");
    seat.setAttribute("aria-label",
      `Manuscript in position ${i + 1} of ${state.cards.length}. Drag to reorder, or use the arrows below.`);
    seat.append(card.canvas);
    seat.onpointerdown = (e) => startDrag(card, e);
    el.append(seat);

    const bar = document.createElement("div");
    bar.className = "card-bar";

    const zoom = document.createElement("button");
    zoom.type = "button";
    zoom.className = "icon";
    zoom.textContent = card.zoom >= EXPANSION_STEPS.length - 1 ? "◱" : "⌕";
    zoom.title = "Look wider at this one. Costs score.";
    zoom.setAttribute("aria-label", `Look wider at the manuscript in position ${i + 1}`);
    zoom.disabled = state.committed || card.zoom >= EXPANSION_STEPS.length - 1;
    zoom.onpointerdown = (e) => e.stopPropagation();
    zoom.onclick = (e) => {
      e.stopPropagation();
      zoomCard(card);
      renderTable();
    };
    bar.append(zoom);

    if (!state.committed) {
      for (const [dir, glyph, label] of [[-1, "‹", "earlier"], [1, "›", "later"]]) {
        const nudge = document.createElement("button");
        nudge.type = "button";
        nudge.className = "icon";
        nudge.textContent = glyph;
        nudge.setAttribute("aria-label", `Move this manuscript one place ${label}`);
        nudge.disabled = dir < 0 ? i === 0 : i === state.cards.length - 1;
        nudge.onpointerdown = (e) => e.stopPropagation();
        nudge.onclick = (e) => { e.stopPropagation(); moveCard(i, i + dir); };
        bar.append(nudge);
      }
    }
    el.append(bar);

    // Nothing is disclosed until the order is committed.
    if (state.committed) {
      const facts = document.createElement("a");
      facts.className = "card-facts";
      facts.href = card.puzzle.catalogue;
      facts.target = "_blank";
      facts.rel = "noopener";
      facts.innerHTML = "<strong></strong><span></span><em>Bodleian record ↗</em>";
      facts.querySelector("strong").textContent =
        card.puzzle.date_display || `${card.puzzle.not_before}–${card.puzzle.not_after}`;
      facts.querySelector("span").textContent = card.puzzle.shelfmark || card.puzzle.id;
      el.append(facts);
    }

    table.append(el);
  });
}

function updateStats() {
  $("score").textContent = state.score;
  $("count").textContent = state.cards.length;
  $("best").textContent = state.best;
}

/* ------------------------------------------------------------------- daily */

const isDaily = () => state.round.id === "daily";

/**
 * The day's result, and a grid you can paste somewhere.
 *
 * One square per manuscript and no dates, shelfmarks or digits, so posting it
 * cannot spoil the day for anyone who has not played. The first attempt is the
 * one kept: re-dealing the same set is allowed, inflating the record is not.
 */
function recordDaily(result) {
  const grid = shareGrid(state.cards.map((c) => ({
    correct: !c.wrong,
    expansions: c.zoom,
  })));
  const earlier = dailyLog.read(state.day);
  const row = dailyLog.write(state.day, {
    score: result.score, grid, right: result.right, total: result.total,
  });

  $("grid").textContent = row.grid;
  $("grid").hidden = false;
  $("share").hidden = false;
  if (earlier) {
    $("prompt").textContent += ` Your first go today stands: ${earlier.score} points.`;
  }
}

/** Clipboard where it is allowed, a selectable block where it is not. */
async function copyResult() {
  const row = dailyLog.read(state.day);
  if (!row) return;
  const text = [
    `Manuscript Matching — ${dailyLabel(state.day)}`,
    row.grid,
    `${row.right}/${row.total} pairs · ${row.score} points`,
    window.location.href.split(/[?#]/)[0],
  ].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    $("share").textContent = "Copied";
  } catch {
    // Insecure context, or permission refused. Put it on the page and select
    // it, so the player can still copy by hand rather than being told no.
    $("grid").textContent = text;
    $("share").textContent = "Copy it from above";
    const range = document.createRange();
    range.selectNodeContents($("grid"));
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }
}

/* ------------------------------------------------------------------ rounds */

async function addCards(count) {
  const pool = state.puzzles.filter(state.collection.test);
  const kept = state.cards.map((c) => c.puzzle);
  const wanted = kept.length + count;
  // The daily seed is the date and nothing else, so every player is dealt the
  // same manuscripts from the same fixed slice. Endless re-seeds per deal.
  const seed = isDaily()
    ? dailySeed(state.day)
    : `${state.collection.id}-${state.difficulty.id}-${Date.now()}`;
  const chosen = buildSet(pool, {
    size: wanted,
    seed,
    startGap: state.difficulty.startGap,
    floor: state.difficulty.floor,
    keep: kept,
  });

  let fresh = chosen.slice(kept.length);
  if (!fresh.length) {
    $("prompt").textContent = "No more manuscripts fit this collection at this difficulty.";
    return;
  }

  $("prompt").textContent = "Fetching pages…";

  const take = async (puzzle) => {
    try {
      const image = await loadImage(puzzle);
      const { focus, parchment } = inspect(image);
      // Conservation trays, carbonised rolls and rulers are catalogued as
      // folios, so the only way to spot them is to look at the photograph.
      if (!isReadable(parchment, puzzle.material)) return null;
      return { puzzle, image, focus, zoom: 0, canvas: null };
    } catch {
      return null;                    // a dead image must never stall a round
    }
  };

  let loaded = await Promise.all(fresh.map(take));
  const rejected = new Set(
    fresh.filter((p, i) => !loaded[i]).map((p) => p.id));

  // Draw replacements for anything unusable, once.
  if (rejected.size) {
    const spare = buildSet(pool.filter((p) => !rejected.has(p.id)), {
      size: wanted,
      seed: `retry-${seed}`,
      startGap: state.difficulty.startGap,
      floor: state.difficulty.floor,
      keep: [...kept, ...loaded.filter(Boolean).map((c) => c.puzzle)],
    });
    const extra = spare.slice(kept.length + loaded.filter(Boolean).length);
    loaded = [...loaded.filter(Boolean), ...(await Promise.all(extra.map(take)))];
  }

  for (const card of loaded.filter(Boolean)) {
    card.canvas = document.createElement("canvas");
    const size = cardSize();
    card.canvas.width = size.w;
    card.canvas.height = size.h;
    paint(card);
    state.cards.push(card);
  }

  // Shuffle only the newly dealt cards into the row, so anything the player
  // has already arranged keeps its place. The daily seeds this too: the
  // starting arrangement is part of the puzzle, so two players must be handed
  // the same row and not merely the same five manuscripts.
  const shuffle = isDaily() ? seededRandom(`${seed}-row`) : Math.random;
  for (let i = state.cards.length - 1; i > kept.length; i--) {
    const j = kept.length + Math.floor(shuffle() * (i - kept.length + 1));
    [state.cards[i], state.cards[j]] = [state.cards[j], state.cards[i]];
  }

  // The catalogue prose for the reveal, fetched while the player arranges.
  records.prefetch();

  state.committed = false;
  state.drag = null;
  const standing = isDaily() ? dailyLog.read(state.day) : null;
  $("prompt").textContent =
    "Drag them into order, oldest on the left. Or nudge one with ‹ ›."
    + (standing ? ` You scored ${standing.score} earlier today.` : "");
  $("check").hidden = false;
  $("more").hidden = true;
  $("again").hidden = true;
  $("reveal").hidden = true;
  renderTable();
  updateStats();
}

function check() {
  const arranged = state.cards.map((c) => c.puzzle);
  const result = orderResult(arranged, zoomsUsed());
  const wrong = new Set(result.misplaced);
  state.cards.forEach((c) => { c.wrong = wrong.has(c.puzzle.id); });
  state.committed = true;
  state.drag = null;
  state.score += result.score;
  if (state.score > state.best) {
    state.best = state.score;
    window.localStorage.setItem("ante-quem:best", String(state.best));
  }
  state.cards.forEach((c) => shelf.record(c.puzzle.id));

  renderTable();
  updateStats();
  saveNote(result);

  $("check").hidden = true;
  $("more").hidden = !result.perfect;
  $("again").hidden = false;
  $("prompt").textContent = result.perfect
    ? `Every pair right. ${result.score} points.`
    : `${result.right} of ${result.total} pairs in the right order. ${result.score} points.`;
  if (isDaily()) recordDaily(result);

  // Show the full record for one card: the wrongest if any, else the oldest.
  const focusCard = state.cards.find((c) => c.wrong) ?? state.cards[0];
  records.merge(focusCard.puzzle).then((puzzle) => renderReveal($("reveal"), puzzle, {
    correct: !focusCard.wrong,
    gained: result.score,
    guessedYear: $("notes").dataset.saved
      ? `You wrote: “${$("notes").dataset.saved}”`
      : "",
    context: state.context,
    lookalikes: (state.lookalikes[focusCard.puzzle.id] || [])
      .map((id) => state.byId.get(id)).filter(Boolean),
    onNext: () => { $("reveal").hidden = true; },
  }));
}

async function newSet() {
  state.cards = [];
  state.score = 0;
  $("notes").value = "";
  delete $("notes").dataset.saved;
  imageCache.clear();
  $("grid").hidden = true;
  $("share").hidden = true;
  $("share").textContent = "Copy result";
  await addCards(state.difficulty.size);
}

/**
 * Observations are kept on the device and shown back beside the cataloguer's
 * own description, so a player can see how their reading compares with the
 * Bodleian's rather than only whether they scored.
 */
const NOTES_KEY = "ante-quem:notes";

function saveNote(result) {
  const text = $("notes").value.trim();
  if (!text) return;
  let log = [];
  try {
    log = JSON.parse(window.localStorage.getItem(NOTES_KEY) ?? "[]");
    if (!Array.isArray(log)) log = [];
  } catch {
    log = [];
  }
  log.unshift({
    at: new Date().toISOString(),
    note: text,
    shelfmarks: state.cards.map((c) => c.puzzle.shelfmark || c.puzzle.id),
    right: result.right,
    total: result.total,
  });
  try {
    window.localStorage.setItem(NOTES_KEY, JSON.stringify(log.slice(0, 200)));
  } catch {
    /* quota or private mode: the note is a nicety, never a blocker */
  }
  $("notes").dataset.saved = text;
}

/* -------------------------------------------------------------------- setup */

function chips(el, items, current, onPick) {
  el.innerHTML = "";
  for (const item of items) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = item.label;
    chip.title = item.blurb ?? "";
    if (item.id === current.id) chip.classList.add("is-chosen");
    chip.onclick = () => {
      [...el.children].forEach((c) => c.classList.remove("is-chosen"));
      chip.classList.add("is-chosen");
      onPick(item);
    };
    el.append(chip);
  }
}

/** Re-cut the canvases when the viewport crosses a size band. */
let lastBand = cardSize().w;
window.addEventListener("resize", () => {
  const size = cardSize();
  if (size.w === lastBand) return;
  lastBand = size.w;
  for (const card of state.cards) {
    card.canvas.width = size.w;
    card.canvas.height = size.h;
    paint(card);
  }
});

$("check").onclick = check;
$("more").onclick = () => addCards(state.difficulty.grow);
$("again").onclick = newSet;
$("share").onclick = copyResult;

/**
 * The collection and difficulty chips.
 *
 * On a daily they are drawn disabled rather than hidden: a player needs to see
 * what they are playing with, and that they did not pick it.
 */
function renderSetup() {
  chips($("collections"), COLLECTIONS, state.collection, (c) => {
    state.collection = c;
    newSet();
  });
  chips($("difficulties"), DIFFICULTIES, state.difficulty, (d) => {
    state.difficulty = d;
    newSet();
  });
  const locked = isDaily();
  for (const el of [$("collections"), $("difficulties")]) {
    for (const chip of el.children) chip.disabled = locked;
  }
  $("round-label").textContent = locked
    ? `Daily · ${dailyLabel(state.day)}`
    : "Endless · your own slice";
}

async function boot() {
  try {
    // Three files, not four: `details.json` is the catalogue prose the reveal
    // shows, and it is fetched once a round is dealt. See site/records.js.
    const [puzzles, context, lookalikes] = await Promise.all(
      ["puzzles", "context", "lookalikes"].map((n) =>
        fetch(`${DATA}${n}.json`).then((r) => {
          if (!r.ok) throw new Error(`${n}.json: ${r.status}`);
          return r.json();
        })));
    state.puzzles = puzzles;
    puzzles.forEach((p) => state.byId.set(p.id, p));
    Object.assign(state, { context, lookalikes });

    chips($("modes"), ROUNDS, state.round, (r) => {
      state.round = r;
      if (isDaily()) {
        state.collection = pick(COLLECTIONS, DAILY_COLLECTION);
        state.difficulty = pick(DIFFICULTIES, DAILY_DIFFICULTY);
      }
      renderSetup();
      newSet();
    });
    renderSetup();
    await newSet();
  } catch (err) {
    $("prompt").textContent =
      "The manuscript data has not been built yet. Run `python -m build` and reload.";
    console.error(err);
  }
}

boot();
