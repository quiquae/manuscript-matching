/**
 * Sharp crops for a zoomed-in reader.
 *
 * The page arrives once at 682px wide, which is plenty at fit scale and mush
 * at 4x. Rather than downloading a huge image up front, ask IIIF for exactly
 * the region being looked at, only once the reader has zoomed past the point
 * where the base image has pixels to spare. This is what a level-2 image
 * server is for.
 */

/** Below this the downloaded page is sharp enough; above it, fetch detail. */
export const DETAIL_FROM_SCALE = 2.2;

/** Widths the Bodleian server returns quickly. 341 and 420 both timed out. */
const SAFE_WIDTHS = [400, 512, 600, 800, 1024];

/** The slice of the page currently inside the canvas, in image pixels. */
export function visiblePageRegion(canvas, view, image) {
  const x = Math.max(0, -view.x / view.scale);
  const y = Math.max(0, -view.y / view.scale);
  const w = Math.min(image.width - x, canvas.width / view.scale);
  const h = Math.min(image.height - y, canvas.height / view.scale);
  return { x, y, w, h };
}

function nearestSafeWidth(want) {
  return SAFE_WIDTHS.reduce((best, w) =>
    Math.abs(w - want) < Math.abs(best - want) ? w : best);
}

export function detailUrl(service, region, image, wantWidth) {
  const pct = (v, total) => ((v / total) * 100).toFixed(3);
  const box = [
    pct(region.x, image.width), pct(region.y, image.height),
    pct(region.w, image.width), pct(region.h, image.height),
  ].join(",");
  return `${service}/pct:${box}/${nearestSafeWidth(wantWidth)},/0/default.jpg`;
}

/**
 * A coarse key so nudging the view by a few pixels reuses the fetch already in
 * flight instead of starting another against a server that fails one request
 * in five.
 */
export function detailKey(region, image) {
  const step = (v, total) => Math.round((v / total) * 20);
  return [
    step(region.x, image.width), step(region.y, image.height),
    step(region.w, image.width), step(region.h, image.height),
  ].join(":");
}
