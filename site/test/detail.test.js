import { test } from "node:test";
import assert from "node:assert/strict";
import { DETAIL_FROM_SCALE, detailKey, detailUrl, visiblePageRegion } from "../detail.js";

const IMAGE = { width: 1000, height: 1500 };

test("the visible region is the slice of the page the canvas is showing", () => {
  const region = visiblePageRegion({ width: 500, height: 600 },
                                   { scale: 2, x: -200, y: -400 }, IMAGE);
  assert.deepEqual(region, { x: 100, y: 200, w: 250, h: 300 });
});

test("the visible region is clipped to the page, never outside it", () => {
  const region = visiblePageRegion({ width: 500, height: 600 },
                                   { scale: 1, x: 0, y: 0 }, IMAGE);
  assert.ok(region.x >= 0 && region.y >= 0);
  assert.ok(region.x + region.w <= IMAGE.width);
  assert.ok(region.y + region.h <= IMAGE.height);
});

test("a detail url asks IIIF for that region as a percentage", () => {
  const url = detailUrl("https://iiif/img/ABC", { x: 250, y: 300, w: 500, h: 600 }, IMAGE, 800);
  assert.match(url, /^https:\/\/iiif\/img\/ABC\/pct:25(\.0+)?,20(\.0+)?,50(\.0+)?,40(\.0+)?\//);
  assert.match(url, /\/800,\/0\/default\.jpg$/);
});

test("detail widths stay on the sizes the server serves quickly", () => {
  const url = detailUrl("https://iiif/img/ABC", { x: 0, y: 0, w: 100, h: 100 }, IMAGE, 417);
  assert.doesNotMatch(url, /\/(341|420),\//, "341 and 420 both time out on this server");
});

test("keys round the region so small drifts reuse one fetch", () => {
  const a = detailKey({ x: 100, y: 200, w: 250, h: 300 }, IMAGE);
  const b = detailKey({ x: 103, y: 202, w: 251, h: 301 }, IMAGE);
  const far = detailKey({ x: 600, y: 900, w: 250, h: 300 }, IMAGE);
  assert.equal(a, b, "a tiny pan should not trigger a second request");
  assert.notEqual(a, far);
});

test("detail is only worth fetching once the base image runs out of pixels", () => {
  assert.ok(DETAIL_FROM_SCALE > 1, "at fit scale the downloaded page is already sharp enough");
});
