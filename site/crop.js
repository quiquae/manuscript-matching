/**
 * Crop geometry and focus detection.
 *
 * Every expansion step is a local canvas operation on the one image already
 * downloaded for this manuscript. Bodleian's IIIF server timed out on roughly
 * one request in five during testing, so nothing here may touch the network.
 */

/** Fraction of the page shown at each expansion step. */
export const EXPANSION_STEPS = [0.14, 0.30, 0.58, 1.0];

/**
 * A crop covering `zoom` of each dimension, centred on (cx, cy) in fractional
 * coordinates and clamped to the image bounds. Keeps the page's aspect ratio,
 * so a tall folio crops to a tall window rather than a square.
 */
export function cropBox(imgW, imgH, cx, cy, zoom) {
  const w = Math.round(imgW * zoom);
  const h = Math.round(imgH * zoom);
  const x = Math.round(Math.min(Math.max(cx * imgW - w / 2, 0), imgW - w));
  const y = Math.round(Math.min(Math.max(cy * imgH - h / 2, 0), imgH - h));
  return { x, y, w, h };
}

/**
 * The busiest cell of a gridN x gridN partition, by luminance variance.
 *
 * This is what keeps an opening crop off blank parchment. Doing it client-side
 * rather than at build time saves 2,201 image fetches against a flaky server,
 * and stays correct if Bodleian replaces a scan.
 */
export function focusPoint(imageData, gridN = 8) {
  const { data, width, height } = imageData;
  let best = { score: -1, gx: (gridN - 1) / 2, gy: (gridN - 1) / 2 };

  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      const x0 = Math.floor((gx * width) / gridN);
      const x1 = Math.floor(((gx + 1) * width) / gridN);
      const y0 = Math.floor((gy * height) / gridN);
      const y1 = Math.floor(((gy + 1) * height) / gridN);

      let sum = 0;
      let sumSq = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          sum += lum;
          sumSq += lum * lum;
          n++;
        }
      }
      if (!n) continue;
      const variance = sumSq / n - (sum / n) ** 2;
      if (variance > best.score) best = { score: variance, gx, gy };
    }
  }
  return { cx: (best.gx + 0.5) / gridN, cy: (best.gy + 0.5) / gridN };
}
