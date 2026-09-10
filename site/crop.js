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

  // Two corrections, both learned from real pages:
  //
  // 1. Centrality. Scans carry a mount, a colour bar and a ruler at the edges,
  //    all of which are far busier than the text they surround.
  // 2. Mid-tone preference. A hard white-to-black mount boundary has enormous
  //    variance and no information; ink on parchment has less of both.
  // 3. The outer ring is skipped outright when the grid is large enough to have
  //    one: a text block always sits inside its margins, and a scan always has
  //    mount outside the leaf.
  const centre = (g) => 1 - Math.abs((g + 0.5) / gridN - 0.5) * 2;   // 1 at middle, 0 at edge
  const midtone = (mean) => Math.exp(-(((mean - 140) / 85) ** 2));   // peaks on parchment
  const margin = gridN >= 4 ? 1 : 0;

  for (let gy = margin; gy < gridN - margin; gy++) {
    for (let gx = margin; gx < gridN - margin; gx++) {
      const x0 = Math.floor((gx * width) / gridN);
      const x1 = Math.floor(((gx + 1) * width) / gridN);
      const y0 = Math.floor((gy * height) / gridN);
      const y1 = Math.floor(((gy + 1) * height) / gridN);

      let sum = 0;
      let sumSq = 0;
      let warm = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          sum += lum;
          sumSq += lum * lum;
          warm += data[i] - data[i + 2];   // red minus blue
          n++;
        }
      }
      if (!n) continue;
      const mean = sum / n;
      const variance = sumSq / n - mean ** 2;

      // Parchment and iron-gall ink are warm: red runs well ahead of blue.
      // Conservation rulers, colour targets and grey mounts are neutral, so
      // this is what keeps the opening crop off the apparatus rather than the
      // manuscript. Neutral pages still score, just lower.
      const warmth = 0.35 + 0.65 * Math.min(1, Math.max(0, warm / n / 30));

      const weight = centre(gx) * centre(gy) * midtone(mean) * warmth;
      const score = Math.sqrt(variance) * weight;
      if (score > best.score) best = { score, gx, gy };
    }
  }
  return { cx: (best.gx + 0.5) / gridN, cy: (best.gy + 0.5) / gridN };
}
