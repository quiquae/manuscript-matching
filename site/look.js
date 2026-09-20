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
import { focusPoint } from "./crop.js";
import { loadImage } from "./pageimage.js";
import { DETAIL_FROM_SCALE, detailKey, detailUrl, visiblePageRegion } from "./detail.js";
import { isReadable, parchmentFraction } from "./readable.js";
import { renderReveal } from "./reveal.js";
import { MAX_SCALE, MIN_SCALE, clampView, fitScale, screenToPage, zoomAt } from "./viewport.js";
import { createShelf } from "./shelf.js";

const DATA = "data/";
const REGIONS = ["England", "France", "Italy", "Germany", "Egypt", "Byzantium", "Elsewhere"];
// Near-black. A trace of the page is left so you can tell a roll from a codex
// and know which way is up, but nothing on it is legible.
const VEIL = 0.012;
const OPENING_ZOOM = 9;        // how far in the first look starts

/** Readers who ask for less motion get each patch at its final size at once. */
const stillness = window.matchMedia("(prefers-reduced-motion: reduce)");

const $ = (id) => document.getElementById(id);
const shelf = createShelf(window.localStorage);

const state = {
  puzzles: [], byId: new Map(), context: {}, lookalikes: {},
  card: null, image: null, patches: [],
  score: 0, read: 0, frame: null,
  view: null,            // { scale, x, y } in canvas pixels
  hovered: -1,           // index of the patch under the pointer
  detail: null,          // { key, image } — a sharp crop of the zoomed region
  detailKey: null,       // the key currently being fetched
  detailTimer: null,
  choice: { region: null, material: null, language: null },
};

/* --------------------------------------------------------------- drawing */

/** The view that shows the whole page, centred. */
function fittedView(canvas, img) {
  const scale = fitScale(canvas, img);
  return {
    scale,
    x: (canvas.width - img.width * scale) / 2,
    y: (canvas.height - img.height * scale) / 2,
  };
}

/** Where the page currently sits on the canvas, in canvas pixels. */
function placement(view, img) {
  return { x: view.x, y: view.y, w: img.width * view.scale, h: img.height * view.scale };
}

function setView(next, options) {
  const canvas = $("view");
  state.view = clampView(next, canvas, {
    width: state.image.width * next.scale,
    height: state.image.height * next.scale,
  });
  scheduleDetail(options);
  updateZoom();
  draw();
}

function draw() {
  const canvas = $("view");
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1c1712";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!state.image) return;

  const fit = placement(state.view, state.image);

  /** Draw the page, using the sharp crop wherever we have one. */
  const paintPage = () => {
    ctx.drawImage(state.image, fit.x, fit.y, fit.w, fit.h);
    const d = state.detail;
    if (d && d.key === detailKey(visiblePageRegion(canvas, state.view, state.image), state.image)) {
      ctx.drawImage(d.image,
        fit.x + d.region.x * state.view.scale,
        fit.y + d.region.y * state.view.scale,
        d.region.w * state.view.scale,
        d.region.h * state.view.scale);
    }
  };

  // The whole leaf, barely there: enough to tell a roll from a codex and to
  // know which way is up, not enough to read anything.
  ctx.globalAlpha = VEIL;
  paintPage();
  ctx.globalAlpha = 1;

  // Where the leaf ends, so panning in the dark has a horizon.
  ctx.strokeStyle = "rgba(244,239,228,.14)";
  ctx.lineWidth = 1;
  ctx.strokeRect(fit.x + 0.5, fit.y + 0.5, fit.w - 1, fit.h - 1);

  const still = stillness.matches;
  let growing = false;
  const now = performance.now();
  state.patches.forEach((patch, index) => {
    const age = still ? Infinity : now - patch.openedAt;
    const hovered = index === state.hovered;
    const size = patchSizeAt(age) * (hovered ? 1.12 : 1);
    if (!still && patchSizeAt(age) < patchSizeAt(Infinity)) growing = true;
    const p = patchAt(patch.cx, patch.cy, state.image.width, state.image.height, size);
    const x = fit.x + p.x * state.view.scale;
    const y = fit.y + p.y * state.view.scale;
    const w = p.w * state.view.scale;
    const h = p.h * state.view.scale;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    paintPage();
    ctx.restore();

    ctx.strokeStyle = hovered ? "rgba(158,43,37,.95)" : "rgba(244,239,228,.55)";
    ctx.lineWidth = hovered ? 2 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  });

  cancelAnimationFrame(state.frame);
  if (growing) state.frame = requestAnimationFrame(draw);
}

/* ---------------------------------------------------------- sharp detail */

/**
 * Ask IIIF for a crop of whatever is on screen, once the reader has zoomed
 * past the point where the downloaded page still has pixels to spare.
 * Debounced, keyed coarsely, and entirely optional: if it never arrives the
 * upscaled page stays on screen and the game carries on.
 */
function scheduleDetail({ immediate = false } = {}) {
  clearTimeout(state.detailTimer);
  if (!state.image || !state.card || state.view.scale < DETAIL_FROM_SCALE) return;

  const fetchNow = () => {
    const canvas = $("view");
    const region = visiblePageRegion(canvas, state.view, state.image);
    const key = detailKey(region, state.image);
    if (key === state.detailKey || (state.detail && state.detail.key === key)) return;
    state.detailKey = key;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (state.detailKey !== key) return;      // the reader moved on
      state.detail = { key, region, image: img };
      draw();
    };
    img.onerror = () => { if (state.detailKey === key) state.detailKey = null; };
    img.src = detailUrl(state.card.iiif, region, state.image,
                        Math.round(canvas.width * window.devicePixelRatio));
  };

  if (immediate) fetchNow();
  else state.detailTimer = setTimeout(fetchNow, 350);
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

/** The zoom readout tracks the view, so it must be refreshed by setView. */
function updateZoom() {
  const fit = state.image ? fitScale($("view"), state.image) : 1;
  const z = state.view ? state.view.scale / fit : 1;
  $("zoom-level").textContent = `${z.toFixed(1)}×`;
  $("zoom-out").disabled = !state.view || state.view.scale <= fit + 1e-6;
  $("zoom-in").disabled = !state.view || state.view.scale >= MAX_SCALE - 1e-6;
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

// How many manuscripts one turn will try before telling the player why not.
const DRAWS_PER_CARD = 6;

async function nextCard() {
  $("reveal").hidden = true;
  $("reading").hidden = false;
  state.patches = [];
  state.detail = null;
  state.detailKey = null;
  state.choice = { region: null, material: null, language: null };
  document.querySelectorAll(".chip.is-chosen").forEach((c) => c.classList.remove("is-chosen"));
  $("hand").value = "";

  state.card = pickCard();
  state.image = null;
  draw();
  updateLooks();
  $("credit").textContent = state.card.attribution || "";
  $("hand-field").hidden = !gradeHand("", state.card.hand).gradable;

  try {
    state.image = await loadImage(state.card);
  } catch {
    // A dead page must not stall the game, and must not spin it either. This
    // was a bare `return nextCard()`: no deadline, so a hung connection stopped
    // Look Closer for good, and no cap, so a server that was down turned the
    // game into an unbounded request loop. Same counter as the unreadable-page
    // path below, so the two failure modes share one budget.
    if ((state.retries ?? 0) >= DRAWS_PER_CARD) {
      state.retries = 0;
      $("hint").textContent =
        "Bodleian's image server is not answering. Try again in a moment.";
      return undefined;
    }
    state.retries = (state.retries ?? 0) + 1;
    return nextCard();
  }

  // Some photographs are of a conservation tray rather than a readable leaf,
  // and the manifest still labels them as folios. Draw again.
  const probe = document.createElement("canvas");
  probe.width = 64;
  probe.height = Math.max(1, Math.round((state.image.height / state.image.width) * 64));
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  pctx.drawImage(state.image, 0, 0, probe.width, probe.height);
  const pixels = pctx.getImageData(0, 0, probe.width, probe.height);
  const parchment = parchmentFraction(pixels);
  if (!isReadable(parchment, state.card.material) && (state.retries ?? 0) < DRAWS_PER_CARD) {
    state.retries = (state.retries ?? 0) + 1;
    return nextCard();
  }
  state.retries = 0;

  // Open close in, on the busiest part of the page, with the first look
  // already spent there. The game is called Look Closer: starting on the whole
  // leaf shows you a shape, and starting on the script shows you the evidence.
  const focus = focusPoint(pixels, 8);
  const canvas = $("view");
  const fitted = fittedView(canvas, state.image);
  state.patches = [{ cx: focus.cx, cy: focus.cy, openedAt: performance.now() }];
  state.view = fitted;
  setView(zoomAt(fitted,
    { x: canvas.width / 2, y: canvas.height / 2 },
    fitted.scale * OPENING_ZOOM));
  // Centre the opening zoom on the detail rather than the middle of the page.
  const target = { x: focus.cx * state.image.width, y: focus.cy * state.image.height };
  setView({
    scale: state.view.scale,
    x: canvas.width / 2 - target.x * state.view.scale,
    y: canvas.height / 2 - target.y * state.view.scale,
  }, { immediate: true });
  updateLooks();
}

/* -------------------------------------------------------- pan, zoom, tap */

/** Pointer position in canvas pixels, whatever the element is scaled to. */
function canvasPoint(event) {
  const canvas = $("view");
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function openPatch(point) {
  if (state.patches.length >= REVEAL_BUDGET) return;
  const page = screenToPage(point, state.view);
  const cx = page.x / state.image.width;
  const cy = page.y / state.image.height;
  if (cx < 0 || cx > 1 || cy < 0 || cy > 1) return;
  state.patches.push({ cx, cy, openedAt: performance.now() });
  updateLooks();
  draw();
}

/** Wheel and pinch both arrive here. */
$("view").addEventListener("wheel", (event) => {
  if (!state.image) return;
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * 0.0015);
  setView(zoomAt(state.view, canvasPoint(event), state.view.scale * factor));
}, { passive: false });

/** Drag to pan; a press that never travels is a tap, and a tap opens a look. */
$("view").addEventListener("pointerdown", (event) => {
  if (!state.image) return;
  const canvas = $("view");
  const start = canvasPoint(event);
  const from = { ...state.view };
  let moved = false;
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add("is-panning");

  const move = (e) => {
    const now = canvasPoint(e);
    if (Math.hypot(now.x - start.x, now.y - start.y) > 5) moved = true;
    if (!moved) return;
    setView({ scale: from.scale, x: from.x + (now.x - start.x), y: from.y + (now.y - start.y) });
  };
  const end = (e) => {
    canvas.releasePointerCapture(e.pointerId);
    canvas.classList.remove("is-panning");
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", end);
    canvas.removeEventListener("pointercancel", end);
    if (!moved) openPatch(start);
  };
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
});

$("view").addEventListener("pointermove", (event) => {
  if (!state.image || !state.view) return;
  const page = screenToPage(canvasPoint(event), state.view);
  const cx = page.x / state.image.width;
  const cy = page.y / state.image.height;
  const was = state.hovered;
  state.hovered = state.patches.findIndex((patch) => {
    const size = patchSizeAt(performance.now() - patch.openedAt);
    return Math.abs(patch.cx - cx) < size / 2 && Math.abs(patch.cy - cy) < size / 2;
  });
  if (state.hovered !== was) draw();
});

$("view").addEventListener("pointerleave", () => {
  if (state.hovered !== -1) { state.hovered = -1; draw(); }
});

$("view").addEventListener("dblclick", (event) => {
  if (!state.image) return;
  event.preventDefault();
  setView(zoomAt(state.view, canvasPoint(event), state.view.scale * 1.8));
});

const centre = () => ({ x: $("view").width / 2, y: $("view").height / 2 });
$("zoom-in").onclick = () => setView(zoomAt(state.view, centre(), state.view.scale * 1.6));
$("zoom-out").onclick = () => setView(zoomAt(state.view, centre(), state.view.scale / 1.6));
$("zoom-fit").onclick = () => setView(fittedView($("view"), state.image));

$("view").addEventListener("keydown", (event) => {
  const step = { "+": 1.6, "=": 1.6, "-": 1 / 1.6, _: 1 / 1.6 }[event.key];
  if (step) { event.preventDefault(); return setView(zoomAt(state.view, centre(), state.view.scale * step)); }
  const pan = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }[event.key];
  if (pan) {
    event.preventDefault();
    setView({ scale: state.view.scale, x: state.view.x + pan[0], y: state.view.y + pan[1] });
  }
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openPatch(centre()); }
});

$("year").oninput = (e) => { $("year-out").textContent = e.target.value; };

$("reading").onsubmit = (event) => {
  event.preventDefault();
  if (!state.card) return;

  const guess = {
    year: Number($("year").value),
    region: state.choice.region,
    material: state.choice.material,
    language: state.choice.language,
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
    // Look Closer loads the details up front rather than lazily, because it
    // grades the player's reading of the hand against the cataloguer's own
    // description of it. Arrange, which is the page people arrive on, takes the
    // small index and fetches the rest while they play. See build/payload.py.
    const [puzzles, details, context, lookalikes] = await Promise.all(
      ["puzzles", "details", "context", "lookalikes"].map((n) =>
        fetch(`${DATA}${n}.json`).then((r) => {
          if (!r.ok) throw new Error(`${n}.json: ${r.status}`);
          return r.json();
        })));
    state.puzzles = puzzles.map((p) => ({ ...p, ...(details[p.id] ?? {}) }));
    state.puzzles.forEach((p) => state.byId.set(p.id, p));
    Object.assign(state, { context, lookalikes });

    chipRow($("regions"), REGIONS.map((r) => ({ id: r, label: r })),
            (v) => { state.choice.region = v; });
    chipRow($("materials"), MATERIALS, (v) => { state.choice.material = v; });
    chipRow($("languages"), LANGUAGES, (v) => { state.choice.language = v; });
    await nextCard();
  } catch (err) {
    $("hint").textContent =
      "The manuscript data has not been built yet. Run `python -m build` and reload.";
    console.error(err);
  }
}

boot();
