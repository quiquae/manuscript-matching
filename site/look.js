/**
 * Look Closer — one page, five looks, then a reading.
 *
 * Where you spend the looks is the skill being tested, so the page starts all
 * but invisible and each patch you open widens as you sit with it. Lingering
 * shows you more; the budget stops it ever becoming the whole page.
 */
import {
  LANGUAGES, MATERIALS, REVEAL_BUDGET, gradeHand, patchAt, patchSizeAt,
  scoreReading, unrevealedPenalty,
} from "./lookcloser.js";
import { isReadable, parchmentFraction } from "./readable.js";
import { renderReveal } from "./reveal.js";
import { createShelf } from "./shelf.js";

const DATA = "data/";
const IIIF_WIDTH = 682;
const REGIONS = ["England", "France", "Italy", "Germany", "Egypt", "Byzantium", "Elsewhere"];
const VEIL = 0.045;            // just enough to read the shape of the object

/** Readers who ask for less motion get each patch at its final size at once. */
const stillness = window.matchMedia("(prefers-reduced-motion: reduce)");

const $ = (id) => document.getElementById(id);
const shelf = createShelf(window.localStorage);

const state = {
  puzzles: [], byId: new Map(), context: {}, lookalikes: {},
  card: null, image: null, patches: [],
  score: 0, read: 0, frame: null,
  choice: { region: null, material: null, language: null, decorated: null },
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
  ctx.fillStyle = "#1c1712";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!state.image) return;

  const fit = fitBox(canvas, state.image);

  // The whole leaf, barely there: enough to tell a roll from a codex and to
  // see where the text block sits, not enough to read a letter.
  ctx.globalAlpha = VEIL;
  ctx.drawImage(state.image, fit.x, fit.y, fit.w, fit.h);
  ctx.globalAlpha = 1;

  const still = stillness.matches;
  let growing = false;
  const now = performance.now();
  for (const patch of state.patches) {
    const age = still ? Infinity : now - patch.openedAt;
    const size = patchSizeAt(age);
    if (!still && size < patchSizeAt(Infinity)) growing = true;
    const p = patchAt(patch.cx, patch.cy, state.image.width, state.image.height, size);
    const x = fit.x + p.x * fit.scale;
    const y = fit.y + p.y * fit.scale;
    const w = p.w * fit.scale;
    const h = p.h * fit.scale;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(state.image, fit.x, fit.y, fit.w, fit.h);
    ctx.restore();

    ctx.strokeStyle = "rgba(244,239,228,.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  cancelAnimationFrame(state.frame);
  if (growing) state.frame = requestAnimationFrame(draw);
}

/* ------------------------------------------------------------------ state */

function updateLooks() {
  const left = REVEAL_BUDGET - state.patches.length;
  const dots = "●".repeat(left) + "○".repeat(state.patches.length);
  $("looks").innerHTML =
    `<span class="dots">${dots}</span> ${left} look${left === 1 ? "" : "s"} left`
    + ` &middot; worth ${Math.round(unrevealedPenalty(state.patches.length) * 100)}%`;
  $("hint").hidden = state.patches.length > 0;
}

function chipRow(el, items, onPick) {
  el.innerHTML = "";
  for (const item of items) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = item.label;
    chip.onclick = () => {
      [...el.children].forEach((c) => c.classList.remove("is-chosen"));
      chip.classList.add("is-chosen");
      onPick(item.id);
    };
    el.append(chip);
  }
}

/* ------------------------------------------------------------------ rounds */

function pickCard() {
  const unseen = state.puzzles.filter((p) => !shelf.has(p.id));
  const pool = unseen.length > 20 ? unseen : state.puzzles;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function nextCard() {
  $("reveal").hidden = true;
  $("reading").hidden = false;
  state.patches = [];
  state.choice = { region: null, material: null, language: null, decorated: null };
  document.querySelectorAll(".chip.is-chosen").forEach((c) => c.classList.remove("is-chosen"));
  $("hand").value = "";

  state.card = pickCard();
  state.image = null;
  draw();
  updateLooks();
  $("credit").textContent = state.card.attribution || "";
  $("hand-field").hidden = !gradeHand("", state.card.hand).gradable;

  try {
    state.image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `${state.card.iiif}/full/${IIIF_WIDTH},/0/default.jpg`;
    });
  } catch {
    return nextCard();                 // a dead image must never stall the game
  }

  // Some photographs are of a conservation tray rather than a readable leaf,
  // and the manifest still labels them as folios. Draw again.
  const probe = document.createElement("canvas");
  probe.width = 64;
  probe.height = Math.max(1, Math.round((state.image.height / state.image.width) * 64));
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  pctx.drawImage(state.image, 0, 0, probe.width, probe.height);
  const parchment = parchmentFraction(pctx.getImageData(0, 0, probe.width, probe.height));
  if (!isReadable(parchment, state.card.material) && (state.retries ?? 0) < 6) {
    state.retries = (state.retries ?? 0) + 1;
    return nextCard();
  }
  state.retries = 0;

  draw();
}

$("view").onclick = (event) => {
  if (!state.image || state.patches.length >= REVEAL_BUDGET) return;
  const canvas = $("view");
  const rect = canvas.getBoundingClientRect();
  const fit = fitBox(canvas, state.image);
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  const cx = (x - fit.x) / fit.w;
  const cy = (y - fit.y) / fit.h;
  if (cx < 0 || cx > 1 || cy < 0 || cy > 1) return;

  state.patches.push({ cx, cy, openedAt: performance.now() });
  updateLooks();
  draw();
};

$("year").oninput = (e) => { $("year-out").textContent = e.target.value; };

$("reading").onsubmit = (event) => {
  event.preventDefault();
  if (!state.card) return;

  const guess = {
    year: Number($("year").value),
    region: state.choice.region,
    material: state.choice.material,
    language: state.choice.language,
    decorated: state.choice.decorated,
  };
  let gained = scoreReading(guess, state.card, state.patches.length);

  const hand = gradeHand($("hand").value, state.card.hand);
  if (hand.gradable && hand.hit) gained = Math.round(gained * 1.25);

  state.score += gained;
  state.read += 1;
  shelf.record(state.card.id);
  $("score").textContent = state.score;
  $("count").textContent = state.read;
  $("reading").hidden = true;
  cancelAnimationFrame(state.frame);

  const verdicts = [
    `${state.choice.region === state.card.region ? "✓" : "✗"} ${state.choice.region ?? "no region"}`,
    `${state.choice.material === state.card.material ? "✓" : "✗"} ${state.choice.material ?? "no material"}`,
    `${state.choice.language === state.card.language ? "✓" : "✗"} ${state.choice.language ?? "no language"}`,
  ];
  if (hand.gradable) {
    verdicts.push(`${hand.hit ? "✓" : "✗"} hand: the cataloguer says ${hand.terms.join(", ")}`);
  }

  renderReveal($("reveal"), state.card, {
    correct: gained > 550,
    gained,
    guessedYear: `You said ${guess.year}. ${verdicts.join(" · ")}`,
    context: state.context,
    lookalikes: (state.lookalikes[state.card.id] || [])
      .map((id) => state.byId.get(id)).filter(Boolean),
    onNext: nextCard,
  });
};

/* -------------------------------------------------------------------- boot */

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

    chipRow($("regions"), REGIONS.map((r) => ({ id: r, label: r })),
            (v) => { state.choice.region = v; });
    chipRow($("materials"), MATERIALS, (v) => { state.choice.material = v; });
    chipRow($("languages"), LANGUAGES, (v) => { state.choice.language = v; });
    chipRow($("decorated"),
            [{ id: true, label: "Decorated" }, { id: false, label: "Plain" }],
            (v) => { state.choice.decorated = v; });
    await nextCard();
  } catch (err) {
    $("hint").textContent =
      "The manuscript data has not been built yet. Run `python -m build` and reload.";
    console.error(err);
  }
}

boot();
