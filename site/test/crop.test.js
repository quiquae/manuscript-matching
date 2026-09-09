import { test } from "node:test";
import assert from "node:assert/strict";
import { cropBox, EXPANSION_STEPS, focusPoint } from "../crop.js";

test("crop box is centred on the focus point", () => {
  assert.deepEqual(cropBox(1000, 1000, 0.5, 0.5, 0.2), { x: 400, y: 400, w: 200, h: 200 });
});

test("crop box clamps to the image edges", () => {
  assert.deepEqual(cropBox(1000, 1000, 0.02, 0.02, 0.2), { x: 0, y: 0, w: 200, h: 200 });
  assert.deepEqual(cropBox(1000, 1000, 0.98, 0.98, 0.2), { x: 800, y: 800, w: 200, h: 200 });
});

test("full zoom returns the whole image", () => {
  assert.deepEqual(cropBox(800, 1200, 0.5, 0.5, 1), { x: 0, y: 0, w: 800, h: 1200 });
});

test("crop keeps the page aspect ratio rather than forcing a square", () => {
  const box = cropBox(600, 1200, 0.5, 0.5, 0.5);
  assert.equal(box.w / box.h, 600 / 1200);
});

test("expansion steps rise and end at the full page", () => {
  assert.equal(EXPANSION_STEPS.at(-1), 1);
  for (let i = 1; i < EXPANSION_STEPS.length; i++) {
    assert.ok(EXPANSION_STEPS[i] > EXPANSION_STEPS[i - 1]);
  }
});

test("focus point finds the busiest cell, not blank parchment", () => {
  const W = 8, H = 8;
  const px = new Uint8ClampedArray(W * H * 4).fill(210);
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  // one high-contrast cell in the bottom-right quadrant
  const ink = (x, y) => { const i = (y * W + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; };
  ink(6, 5); ink(7, 5); ink(6, 6);
  const { cx, cy } = focusPoint({ data: px, width: W, height: H }, 4);
  assert.ok(cx > 0.5, `cx ${cx} should be in the right half`);
  assert.ok(cy > 0.5, `cy ${cy} should be in the lower half`);
});

test("focus point on a perfectly flat image is still in range", () => {
  const px = new Uint8ClampedArray(4 * 4 * 4).fill(200);
  const { cx, cy } = focusPoint({ data: px, width: 4, height: 4 }, 4);
  assert.ok(cx > 0 && cx < 1 && cy > 0 && cy < 1);
});
