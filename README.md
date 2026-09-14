# Manuscript Matching

Three browser games that teach you to read a medieval manuscript by eye, built on the Bodleian
Libraries' open TEI catalogue ([bodleian/medieval-mss](https://github.com/bodleian/medieval-mss)).

- **Arrange** — drag a handful of manuscripts into date order, oldest first. The **Daily** round
  deals everyone the same set, seeded from the date, and gives you a spoiler-free grid to paste.
  **Endless** lets you choose the slice (ancient papyri, medieval codices, illuminated, made in
  England) and the difficulty.
- **Look Closer** — a page under a near-black veil, opened at 9× on its busiest detail. Pan, zoom,
  spend five looks, then commit to a reading: when, where, on what, in which language — and name
  the hand, graded against the cataloguer's own description of it.
- **The Shelf** — everything you have met, by century and region, with the gaps named.

Every round ends with a link back to the Bodleian's own catalogue record. That is the point:
the game is a front door to 2,201 manuscripts, not a destination.

## How it works

A Python build step turns 11,123 TEI records into JSON. A dependency-free static site consumes
it. There is no server, no database and no runtime cost.

The records are split by when the browser needs them. `puzzles.json` (88 KB gzipped) holds what
it takes to deal, filter, draw and score — so Arrange, which is the page people arrive on, is
playable after 103 KB. `details.json` (596 KB) holds the catalogue prose the reveal shows, and is
fetched once a round is dealt, while the player is still arranging. Before the split a single
file put all 708 KB in front of every first load, and 43% of that was one field: `decoration`,
whose entries run to paragraphs and which the game reads as a yes/no.

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
    scripts/      manifest warm-up, the link-preview card, and the no-cache dev server
    site/         the static site; this directory is what gets deployed
    site/data/    committed build output; puzzles.json is the play index, details.json the prose
    site/og.png   the link-preview card; `python3 scripts/make_og.py` after a palette change
    data/cache/   downloaded corpus and manifest cache (gitignored)
    docs/specs/   the design
    docs/superpowers/plans/   the implementation plan

## Deploying

CI runs both test suites on every push. Deploying to GitHub Pages is manual — Actions →
*Test, and deploy on request* → Run workflow. It stays manual on purpose: publishing is a
deliberate act, not a side effect of saving work.

The published address is `https://quiquae.github.io/manuscript-matching/`, which is written into
every canonical URL, the sitemap, `robots.txt`, the JSON-LD block and `404.html`. Changing it
means changing it in all of them, and `site/test/seo.test.js` fails until they agree.

The repository is public, because GitHub Pages is unavailable on private repositories outside
Enterprise Cloud.

## Attribution and licensing

Manuscript images are served from Digital Bodleian under
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) and are credited in place.

Catalogue text comes from `bodleian/medieval-mss`. **That repository still carries no LICENSE
file**, so this site does not rest on one: reuse was confirmed with the Bodleian directly in
September 2026, and that permission is the basis. Anyone forking this needs their own — the
absence of a LICENSE upstream has not changed.

This repository has no LICENSE of its own yet, so its code and prose are all rights reserved by
default. That is a decision deferred, not a position.
