/**
 * Is this photograph even a readable page?
 *
 * Roughly 5% of Digital Bodleian images are not a leaf at all — conservation
 * trays, carbonised rolls, rulers and colour targets. Choosing a canvas by
 * label does not catch them, because the manifest labels them as folios. The
 * only way to tell is to look at the photograph.
 */

/**
 * The fraction of an image that looks like parchment or papyrus: light enough
 * to read against, and warm rather than neutral.
 */
export function parchmentFraction(imageData) {
  const { data, width, height } = imageData;
  let good = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * data[i + 1] + 0.114 * b;
      if (lum >= 135 && lum <= 242 && r - b >= 8) good++;
      n++;
    }
  }
  return n ? good / n : 0;
}

/**
 * Floors measured against the live corpus, not chosen by feel. Sampled
 * parchment pages run 0.22-0.95; papyri run 0.12-0.53 because the material is
 * darker; a tray of carbonised rolls scored 0.078.
 */
export const READABILITY_FLOOR = { papyrus: 0.10, default: 0.18 };

export function isReadable(fraction, material) {
  return fraction >= (READABILITY_FLOOR[material] ?? READABILITY_FLOOR.default);
}
