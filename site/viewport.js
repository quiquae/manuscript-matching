/**
 * Pan and zoom for a single page.
 *
 * Kept pure and separate so the arithmetic that decides what you are looking
 * at can be tested without a browser. The view is a scale plus a top-left
 * offset in canvas pixels; page coordinates are the image's own pixels.
 */

export const MIN_SCALE = 1;
export const MAX_SCALE = 12;

/** The scale at which the whole page fits inside the canvas. */
export function fitScale(canvas, image) {
  return Math.min(canvas.width / image.width, canvas.height / image.height);
}

export function screenToPage(point, view) {
  return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
}

export function pageToScreen(point, view) {
  return { x: point.x * view.scale + view.x, y: point.y * view.scale + view.y };
}

/**
 * Zoom to `scale`, keeping whatever sits under `cursor` exactly where it is.
 * Anything else feels like the page is sliding out from under you.
 */
export function zoomAt(view, cursor, scale) {
  const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  const page = screenToPage(cursor, view);
  return { scale: next, x: cursor.x - page.x * next, y: cursor.y - page.y * next };
}

/**
 * Keep the page in contact with the canvas: no dragging it off into space.
 * When the drawn page is smaller than the canvas it is centred instead.
 */
export function clampView(view, canvas, drawn) {
  const axis = (offset, canvasSize, drawnSize) =>
    drawnSize <= canvasSize
      ? (canvasSize - drawnSize) / 2
      : Math.min(0, Math.max(canvasSize - drawnSize, offset));
  return {
    scale: view.scale,
    x: axis(view.x, canvas.width, drawn.width),
    y: axis(view.y, canvas.height, drawn.height),
  };
}
