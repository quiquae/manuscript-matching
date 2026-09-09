/**
 * Look Closer — one page, five looks, then a reading.
 *
 * Where you choose to look is the skill being tested. An experienced eye goes
 * to the script and the initials; a novice spends its budget on the picture.
 */
import { REVEAL_BUDGET, patchAt, scoreReading, unrevealedPenalty } from "./lookcloser.js";
import { renderReveal } from "./reveal.js";
import { createShelf } from "./shelf.js";

const DATA = "data/";
const IIIF_WIDTH = 682;
const REGIONS = ["England", "France", "Italy", "Germany", "Egypt", "Byzantium", "Elsewhere"];
const SUBJECT_COUNT = 8;

const $ = (id) => document.getElementById(id);
const shelf = createShelf(window.localStorage);

const state = {
  puzzles: [],
  byId: new Map(),
  context: {},
  lookalikes: {},
  card: null,
  image: null,
  patches: [],
  score: 0,
  read: 0,
  subjects: [],
  choice: { region: null, subject: null },
};

/* --------------------------------------------------------------- drawing */

function fitBox(canvas, img) {
  const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  return { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h, scale };
}

function draw() {
  const canvas = $("view");
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#efe9df";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!state.image) return;

  const fit = fitBox(canvas, state.image);

  // The whole page, heavily veiled: enough to see the shape of the object and
  // where the text block sits, not enough to read anything.
  ctx.globalAlpha = 0.13;
  ctx.drawImage(state.image, fit.x, fit.y, fit.w, fit.h);
  ctx.globalAlpha = 1;

  // Each spent look punches a sharp window through the veil.
  for (const { cx, cy } of state.patches) {
    const p = patchAt(cx, cy, state.image.width, state.image.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(fit.x + p.x * fit.scale, fit.y + p.y * fit.scale,
             p.w * fit.scale, p.h * fit.scale);
    ctx.clip();
    ctx.drawImage(state.image, fit.x, fit.y, fit.w, fit.h);
    ctx.restore();

    ctx.strokeStyle = "rgba(43,36,25,.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(fit.x + p.x * fit.scale, fit.y + p.y * fit.scale,
                   p.w * fit.scale, p.h * fit.scale);
  }
}

function updateBudget() {
  const left = REVEAL_BUDGET - state.patches.length;
  $("budget").textContent = left
    ? `${left} look${left === 1 ? "" : "s"} left · this reading is worth ${
        Math.round(unrevealedPenalty(state.patches.length) * 100)}%`
    : `No looks left · this reading is worth ${
        Math.round(unrevealedPenalty(REVEAL_BUDGET) * 100)}%`;
}

/* ----------------------------------------------------------------- setup */

function chipRow(el, values, onPick, label = (v) => v) {
  el.innerHTML = "";
  for (const value of values) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = label(value);
    chip.onclick = () => {
      [...el.children].forEach((c) => c.classList.remove("is-chosen"));
      chip.classList.add("is-chosen");
      onPick(value);
    };
    el.append(chip);
  }
}

function pickCard() {
  const unseen = state.puzzles.filter((p) => !shelf.has(p.id));
  const pool = unseen.length > 20 ? unseen : state.puzzles;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function nextCard() {
  $("reveal").hidden = true;
  $("reading").hidden = false;
  state.patches = [];
  state.choice = { region: null, subject: null };
  document.querySelectorAll(".chip.is-chosen").forEach((c) => c.classList.remove("is-chosen"));

  state.card = pickCard();
  state.image = null;
  draw();
  updateBudget();
  $("credit").textContent = state.card.attribution || "";

  try {
    state.image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `${state.card.iiif}/full/${IIIF_WIDTH},/0/default.jpg`;
    });
  } catch {
    return nextCard();               // a dead image must never stall the game
  }
  draw();
}

/* ------------------------------------------------------------ interaction */

$("view").onclick = (event) => {
  if (!state.image || state.patches.length >= REVEAL_BUDGET) return;
  const canvas = $("view");
  const rect = canvas.getBoundingClientRect();
  const fit = fitBox(canvas, state.image);

  // Canvas coordinates, then page-fraction coordinates.
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  const cx = (x - fit.x) / fit.w;
  const cy = (y - fit.y) / fit.h;
  if (cx < 0 || cx > 1 || cy < 0 || cy > 1) return;

  state.patches.push({ cx, cy });
  draw();
  updateBudget();
};

$("year").oninput = (e) => { $("year-out").textContent = e.target.value; };

$("reading").onsubmit = (event) => {
  event.preventDefault();
  if (!state.card) return;
  const guess = {
    year: Number($("year").value),
    region: state.choice.region,
    subject: state.choice.subject,
  };
  const gained = scoreReading(guess, state.card, state.patches.length);
  state.score += gained;
  state.read += 1;
  shelf.record(state.card.id);
  $("score").textContent = state.score;
  $("count").textContent = state.read;
  $("reading").hidden = true;

  const rightRegion = guess.region === state.card.region;
  const rightSubject = (state.card.subjects ?? []).includes(guess.subject);
  renderReveal($("reveal"), state.card, {
    correct: gained > 500,
    gained,
    guessedYear: `${guess.year}, ${guess.region ?? "no region"}, ${guess.subject ?? "no subject"}`
      + ` — ${rightRegion ? "region right" : "region wrong"}, `
      + `${rightSubject ? "subject right" : "subject wrong"}`,
    context: state.context,
    lookalikes: (state.lookalikes[state.card.id] || [])
      .map((id) => state.byId.get(id)).filter(Boolean),
    onNext: nextCard,
  });
};

/* ------------------------------------------------------------------ boot */

async function boot() {
  try {
    const [puzzles, context, lookalikes] = await Promise.all(
      ["puzzles", "context", "lookalikes"].map((n) =>
        fetch(`${DATA}${n}.json`).then((r) => {
          if (!r.ok) throw new Error(`${n}.json: ${r.status}`);
          return r.json();
        })));
    state.puzzles = puzzles;
    puzzles.forEach((p) => state.byId.set(p.id, p));
    Object.assign(state, { context, lookalikes });

    state.subjects = Object.entries(context.subjects ?? {})
      .sort((a, b) => b[1] - a[1]).slice(0, SUBJECT_COUNT).map(([k]) => k);

    chipRow($("regions"), REGIONS, (v) => { state.choice.region = v; });
    chipRow($("subjects"), state.subjects, (v) => { state.choice.subject = v; },
            (v) => v.replace(/_/g, " "));
    await nextCard();
  } catch (err) {
    $("prompt").textContent =
      "The manuscript data has not been built yet. Run `python -m build` and reload.";
    console.error(err);
  }
}

boot();
