# Manuscript Matching

Three browser games that teach you to read a medieval manuscript by eye, built on the Bodleian
Libraries' open TEI catalogue ([bodleian/medieval-mss](https://github.com/bodleian/medieval-mss)).

- **Arrange** — drag a handful of manuscripts into date order, oldest first. Filter by collection
  (ancient papyri, medieval codices, illuminated, made in England) and by difficulty.
- **Look Closer** — a page under a near-black veil, opened at 9× on its busiest detail. Pan, zoom,
  spend five looks, then commit to a reading: when, where, on what, in which language — and name
  the hand, graded against the cataloguer's own description of it.
- **The Shelf** — everything you have met, by century and region, with the gaps named.

Every round ends with a link back to the Bodleian's own catalogue record. That is the point:
the game is a front door to 2,201 manuscripts, not a destination.

## How it works

A Python build step turns 11,123 TEI records into JSON. A dependency-free static site consumes
it. There is no server, no database and no runtime cost.

Each manuscript's page image is fetched once, and cropping it is a local canvas operation. That
is not an optimisation: Bodleian's image server timed out on roughly one request in five during
testing, so any code path that blocks the player on the network is a defect. The one exception
is Look Closer's zoom, which asks IIIF for a sharp crop of the region in view — debounced, and
optional: if it never arrives, the game carries on with the upscaled page.

## Build

```bash
python -m pytest tests/ -q                  # build-step tests
(cd site && node --test test/*.test.js)     # game logic tests

python scripts/warm_manifests.py    # once: ~7 min, caches 2,201 IIIF manifests
python -m build                     # writes site/data/*.json
```

Then serve the site and open http://localhost:8020/:

```bash
python3 scripts/serve.py 8020 site
```

Use this rather than `python -m http.server`, which sends no `Cache-Control` header — browsers
then keep stale ES modules and an edit appears not to have happened.

## Layout

    build/        the extraction pipeline (stdlib only)
    tests/        pytest
    scripts/      manifest warm-up, and the no-cache dev server
    site/         the static site; this directory is what gets deployed
    site/data/    committed build output
    data/cache/   downloaded corpus and manifest cache (gitignored)
    docs/specs/   the design
    docs/superpowers/plans/   the implementation plan

## Deploying

CI runs both test suites on every push. Deploying to GitHub Pages is manual — Actions →
*Test, and deploy on request* → Run workflow — and should stay manual until the licence question
below is settled.

## Attribution and licensing

Manuscript images are served from Digital Bodleian under
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) and are credited in place.

Catalogue text comes from `bodleian/medieval-mss`, **which has no LICENSE file**. Confirm reuse
terms with the Bodleian before making this public.
