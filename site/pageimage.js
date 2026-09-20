/**
 * Fetching a manuscript page, once, with a deadline.
 *
 * Shared because both games need it and only one of them had it. Arrange grew a
 * timeout, an LRU bound and rejection-eviction after a stalled request was
 * found to hold a whole round; Look Closer kept its own inline `new Image()`
 * with `onerror = reject` and no deadline at all, so a hung connection stopped
 * that game dead and a failing server sent it into unbounded recursion.
 */
// Bodleian's image server timed out on roughly one request in five during
// testing, and an <img> whose connection hangs fires neither load nor error.
// Without a deadline one stalled request stalls the round for as long as the
// player is willing to sit there, which is the failure this game is most
// likely to show a stranger.
const IMAGE_TIMEOUT_MS = 9000;

// A bound on decoded images held in memory, not on what the game may show:
// evicting one costs a refetch, never a manuscript. Least-recently-used, so a
// card still on the table is not the one thrown away.
const IMAGE_CACHE_MAX = 48;

const imageCache = new Map();

/** One request per manuscript while it is cached; every zoom after that is local. */
export function loadImage(puzzle) {
  const hit = imageCache.get(puzzle.id);
  if (hit) {
    imageCache.delete(puzzle.id);         // re-insert so eviction is by age of use
    imageCache.set(puzzle.id, hit);
    return hit;
  }

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const deadline = setTimeout(() => {
      img.src = "";                       // abandon the transfer
      reject(new Error(`${puzzle.id}: no page after ${IMAGE_TIMEOUT_MS}ms`));
    }, IMAGE_TIMEOUT_MS);
    img.onload = () => { clearTimeout(deadline); resolve(img); };
    img.onerror = () => { clearTimeout(deadline); reject(new Error(puzzle.id)); };
    img.src = `${puzzle.iiif}/full/${SOURCE_WIDTH},/0/default.jpg`;
  });

  // A rejection must never be cached. A manuscript that timed out once would
  // otherwise be unavailable for the rest of the session, and on a server that
  // fails one request in five that is a slice of the corpus going dark.
  promise.catch(() => imageCache.delete(puzzle.id));

  imageCache.set(puzzle.id, promise);
  while (imageCache.size > IMAGE_CACHE_MAX) {
    imageCache.delete(imageCache.keys().next().value);
  }
  return promise;
}

/** For tests: how many images are held, and a way to start from nothing. */
export const cacheSize = () => imageCache.size;
export const clearImageCache = () => imageCache.clear();
