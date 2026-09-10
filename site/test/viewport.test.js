import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SCALE, MIN_SCALE, clampView, fitScale, pageToScreen, screenToPage, zoomAt,
} from "../viewport.js";

const CANVAS = { width: 500, height: 600 };
const IMAGE = { width: 1000, height: 1500 };

test("fit scale shows the whole page without cropping it", () => {
  const s = fitScale(CANVAS, IMAGE);
  assert.ok(IMAGE.width * s <= CANVAS.width + 0.01);
  assert.ok(IMAGE.height * s <= CANVAS.height + 0.01);
});

test("a point on screen maps to the page and back unchanged", () => {
  const view = { scale: 2.4, x: -120, y: -260 };
  const page = screenToPage({ x: 310, y: 205 }, view);
  const back = pageToScreen(page, view);
  assert.ok(Math.abs(back.x - 310) < 1e-9);
  assert.ok(Math.abs(back.y - 205) < 1e-9);
});

test("zooming holds the point under the cursor still", () => {
  const view = { scale: 1, x: 0, y: 0 };
  const cursor = { x: 200, y: 150 };
  const before = screenToPage(cursor, view);
  const after = screenToPage(cursor, zoomAt(view, cursor, 2.5));
  assert.ok(Math.abs(after.x - before.x) < 1e-6, "x drifted under the cursor");
  assert.ok(Math.abs(after.y - before.y) < 1e-6, "y drifted under the cursor");
});

test("zoom is bounded at both ends", () => {
  const view = { scale: 1, x: 0, y: 0 };
  assert.equal(zoomAt(view, { x: 0, y: 0 }, 1000).scale, MAX_SCALE);
  assert.equal(zoomAt(view, { x: 0, y: 0 }, 0.0001).scale, MIN_SCALE);
});

test("panning cannot drag the page entirely off screen", () => {
  const drawn = { width: 2000, height: 3000 };
  const far = clampView({ scale: 2, x: 99999, y: -99999 }, CANVAS, drawn);
  assert.ok(far.x <= 0 && far.x >= CANVAS.width - drawn.width);
  assert.ok(far.y <= 0 && far.y >= CANVAS.height - drawn.height);
});

test("a page smaller than the canvas is centred, not pinned to a corner", () => {
  const drawn = { width: 200, height: 300 };
  const view = clampView({ scale: 1, x: -500, y: -500 }, CANVAS, drawn);
  assert.equal(view.x, (CANVAS.width - drawn.width) / 2);
  assert.equal(view.y, (CANVAS.height - drawn.height) / 2);
});

test("clamping leaves an already valid view alone", () => {
  const drawn = { width: 1000, height: 1200 };
  const view = { scale: 2, x: -100, y: -200 };
  assert.deepEqual(clampView(view, CANVAS, drawn), view);
});
