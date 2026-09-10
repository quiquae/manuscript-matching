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
  // one inked cell in the lower-right of the *interior* -- the outer ring is
  // deliberately excluded by focusPoint, so content there would not be chosen
  const ink = (x, y) => { const i = (y * W + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; };
  ink(4, 4); ink(5, 4); ink(4, 5);
  const { cx, cy } = focusPoint({ data: px, width: W, height: H }, 4);
  assert.ok(cx > 0.5, `cx ${cx} should be in the right half`);
  assert.ok(cy > 0.5, `cy ${cy} should be in the lower half`);
});

test("focus point on a perfectly flat image is still in range", () => {
  const px = new Uint8ClampedArray(4 * 4 * 4).fill(200);
  const { cx, cy } = focusPoint({ data: px, width: 4, height: 4 }, 4);
  assert.ok(cx > 0 && cx < 1 && cy > 0 && cy < 1);
});

test("focus ignores the mount: a bright edge loses to real ink", () => {
  // Left half is a hard white/black mount edge (huge variance, no information).
  // Right half is mid-tone parchment with ink strokes (lower variance, real content).
  const W = 16, H = 16;
  const px = new Uint8ClampedArray(W * H * 4);
  const put = (x, y, v) => {
    const i = (y * W + x) * 4;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x < 8) put(x, y, x < 4 ? 255 : 0);        // mount edge: white | black
      else put(x, y, (x + y) % 3 === 0 ? 70 : 205); // parchment with ink
    }
  }
  const { cx } = focusPoint({ data: px, width: W, height: H }, 4);
  assert.ok(cx > 0.5, `cx ${cx} should land on the inked side, not the mount edge`);
});

test("focus stays inside the page rather than hugging the border", () => {
  const W = 32, H = 32;
  const px = new Uint8ClampedArray(W * H * 4).fill(200);
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  // noisy border only
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < 2 || y < 2 || x > W - 3 || y > H - 3) {
      const i = (y * W + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = (x * y) % 2 ? 0 : 255;
    }
  }
  const { cx, cy } = focusPoint({ data: px, width: W, height: H }, 8);
  assert.ok(cx > 0.12 && cx < 0.88, `cx ${cx} hugged the border`);
  assert.ok(cy > 0.12 && cy < 0.88, `cy ${cy} hugged the border`);
});

test("focus prefers warm parchment over a neutral grey ruler", () => {
  // Left interior: neutral grey with hard black ticks -- a conservation ruler.
  // Right interior: warm parchment with brown ink -- the actual leaf.
  const W = 24, H = 24;
  const px = new Uint8ClampedArray(W * H * 4);
  const put = (x, y, r, g, b) => {
    const i = (y * W + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x < W / 2) {
        const tick = x % 3 === 0;                      // regular neutral ticks
        put(x, y, tick ? 20 : 190, tick ? 20 : 190, tick ? 20 : 190);
      } else {
        const ink = (x + y) % 4 === 0;                 // warm ink on warm parchment
        put(x, y, ink ? 90 : 222, ink ? 60 : 205, ink ? 35 : 170);
      }
    }
  }
  const { cx } = focusPoint({ data: px, width: W, height: H }, 6);
  assert.ok(cx > 0.5, `cx ${cx} landed on the ruler rather than the parchment`);
});

test("warmth preference does not break a genuinely grey manuscript", () => {
  // An entirely neutral page: no warm region exists, so focus must still be
  // chosen on contrast rather than returning nothing.
  const W = 16, H = 16;
  const px = new Uint8ClampedArray(W * H * 4).fill(200);
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  const ink = (x, y) => { const i = (y * W + x) * 4; px[i] = px[i + 1] = px[i + 2] = 30; };
  ink(9, 9); ink(10, 9); ink(9, 10);
  const { cx, cy } = focusPoint({ data: px, width: W, height: H }, 4);
  assert.ok(cx > 0.4 && cy > 0.4, `focus ${cx},${cy} should still find the ink`);
});

/* ---- rejecting photographs that are not readable pages ------------------ */

import { READABILITY_FLOOR, isReadable, parchmentFraction } from "../readable.js";

const solid = (W, H, r, g, b) => {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  }
  return { data: px, width: W, height: H };
};

test("a warm light page reads as almost entirely parchment", () => {
  assert.ok(parchmentFraction(solid(16, 16, 215, 200, 165)) > 0.9);
});

test("a dark object reads as almost no parchment", () => {
  assert.ok(parchmentFraction(solid(16, 16, 55, 45, 35)) < 0.05);
});

test("a neutral grey card is not parchment however light it is", () => {
  assert.ok(parchmentFraction(solid(16, 16, 200, 200, 200)) < 0.05);
});

test("thresholds are material-aware because papyrus is genuinely darker", () => {
  assert.ok(READABILITY_FLOOR.papyrus < READABILITY_FLOOR.default);
});

test("measured values from real images fall the right side of the floor", () => {
  // Sampled 2026-09-09 from the live corpus.
  assert.ok(!isReadable(0.078, "papyrus"), "carbonised rolls in a tray must be rejected");
  assert.ok(isReadable(0.120, "papyrus"), "a dark but readable papyrus must be kept");
  assert.ok(!isReadable(0.124, "perg"), "a parchment page this dark is not readable");
  assert.ok(isReadable(0.218, "perg"), "a legible parchment page must be kept");
  assert.ok(isReadable(0.950, "perg"));
});

test("an unknown material falls back to the stricter floor", () => {
  assert.equal(isReadable(0.15, "unobtainium"), isReadable(0.15, "perg"));
});

test("focus prefers dense text over a single hard edge", () => {
  // Left interior: one hard parchment-to-black edge. Huge variance, one
  // transition, no information.
  // Right interior: warm parchment with many fine ink strokes. Lower variance,
  // far more local gradient -- this is what a page of writing looks like.
  const W = 24, H = 24;
  const px = new Uint8ClampedArray(W * H * 4);
  const put = (x, y, r, g, b) => {
    const i = (y * W + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x < W / 2) {
        const black = x > 8;                       // one edge at x=8
        put(x, y, black ? 12 : 220, black ? 10 : 205, black ? 8 : 172);
      } else {
        const stroke = x % 2 === 0 || y % 3 === 0; // dense strokes
        put(x, y, stroke ? 95 : 220, stroke ? 70 : 205, stroke ? 45 : 172);
      }
    }
  }
  const { cx } = focusPoint({ data: px, width: W, height: H }, 6);
  assert.ok(cx > 0.5, `cx ${cx} landed on the backing edge rather than the writing`);
});
