/**
 * Ante Quem — put the manuscripts in order, oldest first.
 *
 * The whole skill is relative dating, so the interface is a row of cards you
 * rearrange rather than a form you fill in. Nothing about a card is disclosed
 * before you commit: you have the image, and how much of it you choose to look
 * at costs you score.
 */
import { ambiguous, COLLECTIONS, DIFFICULTIES, buildSet, seededRandom } from "./deck.js";
import {
  charged, clampStep, cropBox, cycleStep, EXPANSION_STEPS, focusPoint, LAST_STEP, moveDial,
  SOURCE_WIDTH,
} from "./crop.js";
import { isReadable, parchmentFraction } from "./readable.js";
import { loadImage } from "./pageimage.js";
import { orderResult } from "./order.js";
import { MULTIPLIERS, shareGrid } from "./scoring.js";
import { renderReveal } from "./reveal.js";
import { createShelf } from "./shelf.js";
import { createRecords, fetchDetails } from "./records.js";
import {
  createDailyLog, DAILY_COLLECTION, DAILY_DIFFICULTY, dailyLabel, dailySeed,
  puzzleNumber, shareText, streak, todayISO,
} from "./daily.js";

const DATA = "data/";
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

/**
 * A canvas sized for the screen it is on, not for CSS pixels.
 *
 * The backing store used to be the CSS size, so on any retina display the
 * browser stretched a 190px bitmap across 380 device pixels on top of whatever
 * the crop had already upscaled. At the widest two steps the source has the
 * pixels to spare — the whole leaf is 682px wide — and they were being thrown
 * away before they reached the glass. Capped at 2: a 3x backing store costs
 * 2.25x the memory per card for a difference nobody reports seeing.
 */
const RATIO = () => Math.min(window.devicePixelRatio || 1, 2);

function fitCanvas(canvas, size) {
  const r = RATIO();
  canvas.width = Math.round(size.w * r);
  canvas.height = Math.round(size.h * r);
  canvas.style.width = `${size.w}px`;
  canvas.style.height = `${size.h}px`;
}

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
  cards: [],          // { puzzle, image, focus, zoom, seen }
  drag: null,
  committed: false,
  score: 0,
  best: Number(window.localStorage.getItem("ante-quem:best") ?? 0),
};

/* ---------------------------------------------------------------- images */

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

/**
 * A seat whose page has not arrived, drawn rather than left blank.
 *
 * Five empty rectangles read as a broken game; a ruled page with a rubricated
 * initial reads as a deal in progress. It is the same mark as the favicon, and
 * it is drawn at the card's own size so nothing reflows when the page lands.
 */
function paintFaceDown(canvas) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  ctx.fillStyle = "#efe9df";
  ctx.fillRect(0, 0, w, h);

  const margin = Math.round(w * 0.14);
  const initial = Math.round(w * 0.2);
  ctx.fillStyle = "rgba(158, 43, 37, 0.22)";
  ctx.fillRect(margin, margin, initial, initial);

  ctx.fillStyle = "rgba(111, 97, 80, 0.15)";
  const leading = Math.max(4, Math.round(h * 0.046));
  const rule = Math.max(2, Math.round(leading * 0.32));
  let y = margin;
  for (let i = 0; y + rule < h - margin; i++) {
    const beside = y < margin + initial;                 // lines beside the initial
    const x = beside ? margin + initial + Math.round(margin * 0.5) : margin;
    const full = w - x - margin;
    ctx.fillRect(x, y, i % 7 === 6 ? Math.round(full * 0.55) : full, rule);
    y += leading;
  }
}

function paint(card) {
  const canvas = card.canvas;
  if (!card.image) return paintFaceDown(canvas);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#efe9df";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // The tightest crop is 95px of a 682px source drawn into a 190px card, a 2x
  // upscale -- and it is the view every player meets first, since the score
  // rewards them for not looking wider. Every later step is a downscale. The
  // browser default resampling is cheap and blocky; this costs nothing and is
  // the only free improvement to the one view that needs it.
  ctx.imageSmoothingQuality = "high";

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

const zoomsUsed = () => charged(state.cards);

function moveCard(from, to) {
  if (to < 0 || to >= state.cards.length) return;
  const [card] = state.cards.splice(from, 1);
  state.cards.splice(to, 0, card);
  renderTable();
}

/** Move one card's crop dial. The arithmetic, and why it is two numbers, is in crop.js. */
function showStep(card, step) {
  // A face-down seat has no page to widen or tighten yet.
  if (state.committed || card.pending) return;
  if (clampStep(step) === card.zoom) return;
  Object.assign(card, moveDial(card, step));
  paint(card);
  updateStats();
}

/** A tap on the page works the dial, wrapping from the whole leaf to the detail. */
const cycleCard = (card) => showStep(card, cycleStep(card.zoom));

/**
 * Dragging, on document-level listeners rather than pointer capture.
 *
 * The row re-renders as cards reorder under the pointer, which destroys the
 * element being dragged; listening on the document survives that, and the drag
 * is tracked by card object rather than by node.
 */
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
    // A press that never travelled is a tap, and a tap works the crop dial.
    if (!moved) cycleCard(card);
    renderTable();
  };

  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  event.preventDefault();
}

/**
 * Which control the keyboard is on, as something that survives a re-render.
 *
 * renderTable() throws the row away and builds it again, so the focused button
 * is a different object afterwards and focus falls to the body. Reordering by
 * keyboard meant tabbing back in from the top of the page for every single
 * nudge. Remembered by card and role rather than by node, for the same reason
 * the drag is tracked by card: the node does not survive.
 */
function focusedControl() {
  const el = document.activeElement;
  const bar = el?.closest?.(".card-bar");
  if (!bar) return null;
  const seat = bar.parentElement;
  const i = [...document.querySelectorAll(".card")].indexOf(seat);
  return i < 0 ? null : { card: state.cards[i], role: el.dataset.role };
}

function restoreControl(mark) {
  if (!mark) return;
  const i = state.cards.indexOf(mark.card);
  if (i < 0) return;
  const seat = document.querySelectorAll(".card")[i];
  const next = seat?.querySelector(`.card-bar [data-role="${mark.role}"]`);
  // A control that just became unavailable hands focus to its opposite rather
  // than dropping it: tightening to the last step disables "closer".
  const fallback = { closer: "wider", wider: "closer", earlier: "later", later: "earlier" };
  const live = next && !next.disabled
    ? next
    : seat?.querySelector(`.card-bar [data-role="${fallback[mark.role]}"]:not(:disabled)`);
  live?.focus({ preventScroll: true });
}

function renderTable() {
  const table = $("table");
  const mark = focusedControl();
  table.innerHTML = "";

  state.cards.forEach((card, i) => {
    const el = document.createElement("div");
    el.className = "card";
    if (state.drag === card) el.classList.add("is-dragging");
    if (card.pending) el.classList.add("is-pending");
    if (state.committed) {
      el.classList.add(card.wrong ? "is-wrong" : "is-right");
    }

    const seat = document.createElement("div");
    seat.className = "card-seat";
    seat.setAttribute("role", "img");
    seat.setAttribute("aria-label", card.pending
      ? `Manuscript in position ${i + 1} of ${state.cards.length}. Its page is still loading.`
      : `Manuscript in position ${i + 1} of ${state.cards.length}. Drag to reorder, or use the arrows below.`);
    // The hover hint has to name what the next tap actually does. It used to
    // promise "look closer" while every tap showed more of the page.
    seat.dataset.hint = card.zoom >= LAST_STEP
      ? "tap for the detail again"
      : "tap to see more of the page";
    seat.append(card.canvas);
    seat.onpointerdown = (e) => startDrag(card, e);
    el.append(seat);

    const bar = document.createElement("div");
    bar.className = "card-bar";
    // A flex column is as wide as its widest child, so a bar that outgrows the
    // page would quietly stretch the card past its own photograph — and on the
    // 116px tier that is the difference between two manuscripts fitting side
    // by side and one. Cap it at the image and let it take a second row.
    bar.style.maxWidth = `${card.size.w}px`;

    const crop = document.createElement("div");
    crop.className = "card-group";
    bar.append(crop);

    // Words, not a magnifier. A magnifying glass says "closer" and this
    // control does the opposite: it pulls back to show more of the leaf.
    const dial = [
      ["closer", card.zoom - 1, "Back to the tighter crop. Already paid for, so it is free.",
       `Show less of the manuscript in position ${i + 1}`, card.zoom <= 0],
      ["wider", card.zoom + 1, "Show more of the page. Costs score.",
       `Show more of the manuscript in position ${i + 1}`, card.zoom >= LAST_STEP],
    ];
    for (const [text, step, title, label, spent] of dial) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon crop";
      button.dataset.role = text;
      button.textContent = text;
      button.title = title;
      button.setAttribute("aria-label", label);
      button.disabled = state.committed || card.pending || spent;
      button.onpointerdown = (e) => e.stopPropagation();
      button.onclick = (e) => {
        e.stopPropagation();
        showStep(card, step);
        renderTable();
      };
      crop.append(button);
    }

    if (!state.committed) {
      const move = document.createElement("div");
      move.className = "card-group";
      bar.append(move);
      for (const [dir, glyph, label] of [[-1, "‹", "earlier"], [1, "›", "later"]]) {
        const nudge = document.createElement("button");
        nudge.type = "button";
        nudge.className = "icon";
        nudge.dataset.role = label;
        nudge.textContent = glyph;
        nudge.setAttribute("aria-label", `Move this manuscript one place ${label}`);
        nudge.disabled = dir < 0 ? i === 0 : i === state.cards.length - 1;
        nudge.onpointerdown = (e) => e.stopPropagation();
        nudge.onclick = (e) => { e.stopPropagation(); moveCard(i, i + dir); };
        move.append(nudge);
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
        card.puzzle.date_label || `${card.puzzle.not_before}–${card.puzzle.not_after}`;
      facts.querySelector("span").textContent = card.puzzle.shelfmark || card.puzzle.id;
      el.append(facts);
    }

    table.append(el);
  });

  restoreControl(mark);
}

function updateStats() {
  $("score").textContent = state.score;
  $("count").textContent = state.cards.length;
  $("best").textContent = state.best;
  const run = streak(dailyLog.days(), state.day);
  $("streak").textContent = run;
  // A streak of one is a day played, not a run. Saying "1" invites a player to
  // read it as a thing they could break tomorrow, which is the point.
  $("streak-label").textContent = run === 1 ? "Day" : "Day run";
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
    expansions: c.seen,
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
  const text = shareText(state.day, row, window.location.href.split(/[?#]/)[0],
                         streak(dailyLog.days(), state.day));
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

/** A seat at the table: a card with a canvas, face down until its page lands. */
function seat(puzzle) {
  const size = cardSize();
  const canvas = document.createElement("canvas");
  fitCanvas(canvas, size);
  const card = { puzzle, image: null, focus: null, zoom: 0, seen: 0, canvas, size, pending: true };
  paint(card);
  return card;
}

// How many manuscripts one seat will try before giving up on itself.
const DRAWS_PER_SEAT = 3;

/** One manuscript legal against everything else currently on the table. */
function redraw(card, pool, seed) {
  const others = state.cards.filter((c) => c !== card).map((c) => c.puzzle);
  const taken = new Set([...others.map((p) => p.id), card.puzzle.id]);
  const set = buildSet(pool.filter((p) => !taken.has(p.id)), {
    size: others.length + 1,
    seed,
    startGap: state.difficulty.startGap,
    floor: state.difficulty.floor,
    keep: others,
  });
  return set.length > others.length ? set[others.length] : null;
}

/**
 * Turn one seat over, redrawing its manuscript in place if the page is dead,
 * slow, or not a page at all.
 *
 * The seat stays put while this happens. A card vanishing from a row the
 * player has started arranging is worse than a slot that takes a moment, so
 * the substitution is invisible: the same position, a different manuscript.
 *
 * A daily can diverge here, because which seats need redrawing depends on
 * whose network failed. The grid still compares -- it is one square per
 * position, and a substituted manuscript is still a manuscript to place.
 */
async function turnOver(card, pool, seed) {
  for (let draw = 0; draw < DRAWS_PER_SEAT; draw++) {
    try {
      const image = await loadImage(card.puzzle);
      const { focus, parchment } = inspect(image);
      // Conservation trays, carbonised rolls and rulers are catalogued as
      // folios, so the only way to spot them is to look at the photograph.
      if (isReadable(parchment, card.puzzle.material)) {
        Object.assign(card, { image, focus, pending: false });
        paint(card);
        renderTable();
        return true;
      }
    } catch {
      /* dead or slow page: draw another manuscript into this seat */
    }
    const replacement = redraw(card, pool, `${seed}-redraw-${draw}`);
    if (!replacement) break;
    card.puzzle = replacement;
  }
  card.pending = false;
  card.dead = true;
  return false;
}

/**
 * Drop any card whose dates overlap another's, after the deal has settled.
 *
 * `redraw` checks a replacement against the other seats as they stand, but a
 * seat that has not turned over yet may redraw after it -- so two substitutions
 * in one deal can leave a pair whose ranges overlap. Both orders of that pair
 * would then be defensible and the player would be marked wrong for being
 * right, which is the one outcome the disjointness rule exists to prevent.
 *
 * Dropping is the honest repair, and it is the rule buildSet already follows: a
 * short set beats an unanswerable one.
 */
function pruneAmbiguous() {
  const clashing = new Set(ambiguous(state.cards.map((c) => c.puzzle)).map((p) => p.id));
  if (!clashing.size) return false;
  state.cards = state.cards.filter((c) => !clashing.has(c.puzzle.id));
  return true;
}

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

  // Seat every new card at once, face down, and let each turn itself over as
  // its page arrives. The round is arrangeable immediately: before this, one
  // Promise.all held the whole table hostage to the slowest fetch, on a server
  // that fails one request in five.
  const seats = fresh.map(seat);
  state.cards.push(...seats);

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
    "Drag them into order, oldest on the left. Or nudge one with ‹ ›. "
    + "Tap a page to see more of it — it costs score, and you can go back."
    + (standing ? ` You scored ${standing.score} earlier today.` : "");
  $("check").hidden = false;
  $("more").hidden = true;
  $("again").hidden = true;
  $("reveal").hidden = true;
  renderTable();
  updateStats();

  await Promise.all(seats.map((card) => turnOver(card, pool, seed)));

  // A seat that never found a usable page leaves the table. This is the only
  // case where a card the player could already see disappears, and it takes
  // DRAWS_PER_SEAT dead draws in a row to happen.
  const lost = state.cards.some((c) => c.dead);
  if (lost) state.cards = state.cards.filter((c) => !c.dead);
  if (pruneAmbiguous() || lost) {
    renderTable();
    updateStats();
  }
  if (!state.cards.length) {
    $("prompt").textContent =
      "Bodleian's image server is not answering. Try again in a moment.";
    $("check").hidden = true;
    $("again").hidden = false;
  }
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
  // The cache is NOT cleared here. Clearing it every round discarded the one
  // thing it exists for; an earlier commit said this line was gone and it was
  // not. A manuscript seen in a previous round now costs no request at all.
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
    if (item.blurb) chip.setAttribute("aria-label", `${item.label}. ${item.blurb}`);
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
    card.size = size;
    fitCanvas(card.canvas, size);
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
  // Five greyed chips look like a broken filter bar unless something says
  // why. The reason is the point of a daily, so it is worth one line.
  $("locked-note").textContent =
    "The daily set is the same for everyone, so these are fixed. Play Endless to choose your own.";
  $("locked-note").hidden = !locked;
  $("round-label").textContent = locked
    ? `Daily #${puzzleNumber(state.day)} · ${dailyLabel(state.day)}`
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
