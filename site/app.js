/**
 * Ante Quem — place the manuscript in time.
 *
 * The rules that decide whether an answer is defensible live in Python and
 * arrive pre-computed in decks.json. This file renders and keeps score.
 */
import { cropBox, EXPANSION_STEPS, focusPoint } from "./crop.js";
import { MULTIPLIERS, scoreRound, shareGrid } from "./scoring.js";
import { renderReveal } from "./reveal.js";

const DATA = "data/";
const IIIF_WIDTH = 682;        // a pre-rendered size; 341 and 420 both time out
const PREFETCH_AHEAD = 3;
const LIVES = 3;

const $ = (id) => document.getElementById(id);

const state = {
  puzzles: new Map(),
  decks: {},
  context: {},
  lookalikes: {},
  mode: "daily",
  deck: [],
  index: 0,
  board: [],
  expansions: 0,
  score: 0,
  lives: LIVES,
  rounds: [],
  image: null,
  focus: { cx: 0.5, cy: 0.5 },
};

/* ---------------------------------------------------------------- images */

const imageCache = new Map();

/** One request per manuscript, ever. Everything after this is local canvas work. */
function loadImage(puzzle) {
  if (!puzzle?.iiif) return Promise.reject(new Error("no image service"));
  if (imageCache.has(puzzle.id)) return imageCache.get(puzzle.id);

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${puzzle.id}`));
    img.src = `${puzzle.iiif}/full/${IIIF_WIDTH},/0/default.jpg`;
  });
  imageCache.set(puzzle.id, promise);
  return promise;
}

/** Warm the next few rounds so a slow response never blocks the player. */
function prefetch() {
  for (let i = state.index + 1; i <= state.index + PREFETCH_AHEAD; i++) {
    const puzzle = state.puzzles.get(state.deck[i]);
    if (puzzle) loadImage(puzzle).catch(() => {});
  }
}

function detectFocus(img) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = Math.max(1, Math.round((img.height / img.width) * 64));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return focusPoint(ctx.getImageData(0, 0, canvas.width, canvas.height), 8);
}

function draw() {
  const canvas = $("view");
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#efe9df";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!state.image) return;

  const zoom = EXPANSION_STEPS[Math.min(state.expansions, EXPANSION_STEPS.length - 1)];
  const box = cropBox(state.image.width, state.image.height, state.focus.cx, state.focus.cy, zoom);
  const scale = Math.min(canvas.width / box.w, canvas.height / box.h);
  const dw = box.w * scale;
  const dh = box.h * scale;
  ctx.drawImage(state.image, box.x, box.y, box.w, box.h,
                (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
}

/* ----------------------------------------------------------------- board */

const yearsOf = (card) => card.date_display || `${card.not_before}–${card.not_after}`;

function renderBoard() {
  const board = $("board");
  board.innerHTML = "";

  if (!state.board.length) {
    board.innerHTML = '<p class="empty-board">Place the first manuscript to begin.</p>';
  }

  const slot = (position, label) => {
    const button = document.createElement("button");
    button.className = "slot";
    button.textContent = "+";
    button.setAttribute("aria-label", label);
    button.onclick = () => commit(position);
    return button;
  };

  board.append(slot(0, state.board.length ? "Place before everything" : "Place here"));
  state.board.forEach((card, i) => {
    const el = document.createElement("div");
    el.className = "placed";
    el.innerHTML = "<strong></strong><span></span>";
    el.querySelector("strong").textContent = yearsOf(card);
    el.querySelector("span").textContent = card.shelfmark || card.id;
    board.append(el, slot(i + 1, `Place after ${yearsOf(card)}`));
  });
}

/* ------------------------------------------------------------------ loop */

const currentPuzzle = () => state.puzzles.get(state.deck[state.index]);

function updateStats() {
  $("score").textContent = state.score;
  $("round").textContent = state.deck.length
    ? `${Math.min(state.index + 1, state.deck.length)}/${state.deck.length}` : "—";
  $("lives").textContent = "•".repeat(Math.max(state.lives, 0)) || "—";
}

function commit(slotIndex) {
  const card = currentPuzzle();
  if (!card) return;

  const trueIndex = state.board.filter((c) => c.not_before < card.not_before).length;
  const correct = slotIndex === trueIndex;
  const gained = scoreRound(state.expansions, correct);

  state.score += gained;
  state.rounds.push({ correct, expansions: state.expansions });
  if (correct) {
    state.board.push(card);
    state.board.sort((a, b) => a.not_before - b.not_before);
  } else {
    state.lives -= 1;
  }

  updateStats();
  renderBoard();
  $("board").querySelectorAll("button").forEach((b) => { b.disabled = true; });

  renderReveal($("reveal"), card, {
    correct,
    gained,
    guessedYear: correct ? "" : `in position ${slotIndex + 1} of ${state.board.length + 1}`,
    context: state.context,
    lookalikes: (state.lookalikes[card.id] || [])
      .map((id) => state.puzzles.get(id))
      .filter(Boolean),
    onNext: nextRound,
  });
}

async function nextRound() {
  $("reveal").hidden = true;
  state.index += 1;
  state.expansions = 0;

  if (state.lives <= 0 || state.index >= state.deck.length) {
    if (state.mode === "endless" && state.lives > 0) extendEndlessDeck();
    else return finish();
  }
  await showCard();
}

async function showCard() {
  const puzzle = currentPuzzle();
  if (!puzzle) return finish();

  $("credit").textContent = puzzle.attribution || "";
  $("expand").disabled = false;
  $("expand-note").textContent = "";
  state.image = null;
  draw();
  updateStats();

  try {
    state.image = await loadImage(puzzle);
    state.focus = detectFocus(state.image);
  } catch {
    return nextRound();          // a dead image must never stall the run
  }
  draw();
  renderBoard();
  prefetch();
}

function finish() {
  $("stage").hidden = true;
  $("reveal").hidden = true;
  const placed = state.board.length;
  const summary = $("summary");
  summary.hidden = false;
  summary.innerHTML = `
    <h2>${placed} placed &middot; ${state.score} points</h2>
    <p class="grid">${shareGrid(state.rounds)}</p>
    <button id="copy-grid">Copy result</button>
    <button id="play-again">Play again</button>`;
  summary.querySelector("#copy-grid").onclick = async (e) => {
    const label = state.mode === "daily" ? `Ante Quem ${todayKey()}` : "Ante Quem — endless";
    await navigator.clipboard.writeText(
      `${label}\n${placed} placed, ${state.score} points\n${shareGrid(state.rounds)}`);
    e.target.textContent = "Copied";
  };
  summary.querySelector("#play-again").onclick = () => start(state.mode);
}

/* ------------------------------------------------------------- endless */

/** Endless deals client-side, applying the same disjointness rule as the build. */
function extendEndlessDeck() {
  const pool = [...state.puzzles.values()];
  const placed = new Set(state.deck);
  for (let attempt = 0; attempt < 400; attempt++) {
    const card = pool[Math.floor(Math.random() * pool.length)];
    if (placed.has(card.id)) continue;
    const clears = state.board.every((c) =>
      card.not_before > c.not_after || card.not_after < c.not_before);
    if (clears) {
      state.deck.push(card.id);
      return;
    }
  }
  state.deck.push(pool[Math.floor(Math.random() * pool.length)].id);
}

/* ---------------------------------------------------------------- boot */

const todayKey = () => new Date().toISOString().slice(0, 10);

function start(mode) {
  state.mode = mode;
  state.index = 0;
  state.board = [];
  state.expansions = 0;
  state.score = 0;
  state.lives = LIVES;
  state.rounds = [];

  if (mode === "daily") {
    state.deck = state.decks[todayKey()] || Object.values(state.decks)[0] || [];
  } else {
    state.deck = [];
    extendEndlessDeck();
  }

  $("summary").hidden = true;
  $("reveal").hidden = true;
  $("stage").hidden = false;
  for (const id of ["mode-daily", "mode-endless"]) {
    const on = id === `mode-${mode}`;
    $(id).classList.toggle("is-active", on);
    $(id).setAttribute("aria-pressed", String(on));
  }
  showCard();
}

$("expand").onclick = () => {
  if (state.expansions >= EXPANSION_STEPS.length - 1) return;
  state.expansions += 1;
  const worth = Math.round((MULTIPLIERS[state.expansions] ?? 0) * 100);
  $("expand-note").textContent =
    `Showing ${Math.round(EXPANSION_STEPS[state.expansions] * 100)}% of the page. This round is now worth ${worth}%.`;
  if (state.expansions >= EXPANSION_STEPS.length - 1) $("expand").disabled = true;
  draw();
};

$("mode-daily").onclick = () => start("daily");
$("mode-endless").onclick = () => start("endless");

async function boot() {
  try {
    const [puzzles, decks, context, lookalikes] = await Promise.all(
      ["puzzles", "decks", "context", "lookalikes"].map((name) =>
        fetch(`${DATA}${name}.json`).then((r) => {
          if (!r.ok) throw new Error(`${name}.json: ${r.status}`);
          return r.json();
        })));
    puzzles.forEach((p) => state.puzzles.set(p.id, p));
    Object.assign(state, { decks, context, lookalikes });
    start("daily");
  } catch (err) {
    $("prompt").textContent =
      "The manuscript data has not been built yet. Run `python -m build` and reload.";
    console.error(err);
  }
}

boot();
