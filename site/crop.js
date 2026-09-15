/**
 * Crop geometry and focus detection.
 *
 * Every expansion step is a local canvas operation on the one image already
 * downloaded for this manuscript. Bodleian's IIIF server timed out on roughly
 * one request in five during testing, so nothing here may touch the network.
 */

/** Fraction of the page shown at each expansion step. */
export const EXPANSION_STEPS = [0.14, 0.30, 0.58, 1.0];

export const LAST_STEP = EXPANSION_STEPS.length - 1;

/** A requested step, forced into the dial's range. */
export const clampStep = (step) => Math.min(Math.max(step | 0, 0), LAST_STEP);

/**
 * Where a tap on the page goes next: wider, wider, whole leaf, then back to
 * the detail. It wraps because a touch screen has no hover and so no tooltip,
 * which leaves the image itself as the only way back on a phone.
 */
export const cycleStep = (zoom) => (zoom >= LAST_STEP ? 0 : clampStep(zoom) + 1);

/**
 * The dial after a move. Two numbers, not one.
 *
 * `seen` is the widest step ever asked for and only ever rises: the score is
 * charged for what has been disclosed, and stepping back cannot unsee it, so
 * it cannot refund it either. `zoom` is what is drawn now, and moves freely
 * inside what has already been paid for. Collapsing the two made widening a
 * dead end — the tight crop is the thing the player is asked to judge, and one
 * tap took it away for the rest of the round at no saving to anyone.
 */
export function moveDial(card, step) {
  const zoom = clampStep(step);
  return { zoom, seen: Math.max(card.seen ?? 0, zoom) };
}

/** What a round is charged for: the widest each card was ever opened to. */
export const charged = (cards) => cards.reduce((n, c) => n + (c.seen ?? 0), 0);

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

      const lumAt = (x, y) => {
        const i = (y * width + x) * 4;
        return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      };

      let sum = 0;
      let warm = 0;
      let gradient = 0;
      let steps = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const lum = lumAt(x, y);
          sum += lum;
          warm += data[i] - data[i + 2];   // red minus blue
          n++;
          // Local gradient, not variance. A page of writing is thousands of
          // small transitions; the edge between a leaf and its black backing,
          // or the side of a conservation ruler, is one enormous transition
          // with flat ground either side. Variance rewards the edge, mean
          // absolute gradient rewards the writing.
          if (x + 1 < x1) { gradient += Math.abs(lum - lumAt(x + 1, y)); steps++; }
          if (y + 1 < y1) { gradient += Math.abs(lum - lumAt(x, y + 1)); steps++; }
        }
      }
      if (!n) continue;
      const mean = sum / n;
      const energy = steps ? gradient / steps : 0;

      // Parchment and iron-gall ink are warm: red runs well ahead of blue.
      // Conservation rulers, colour targets and grey mounts are neutral, so
      // this is what keeps the opening crop off the apparatus rather than the
      // manuscript. Neutral pages still score, just lower.
      // Neutral regions are apparatus, not manuscript, so the floor is low.
      const warmth = 0.12 + 0.88 * Math.min(1, Math.max(0, warm / n / 30));

      const weight = centre(gx) * centre(gy) * midtone(mean) * warmth;
      const score = energy * weight;
      if (score > best.score) best = { score, gx, gy };
    }
  }
  return { cx: (best.gx + 0.5) / gridN, cy: (best.gy + 0.5) / gridN };
}
