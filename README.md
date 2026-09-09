# Ante Quem

Two browser games that teach you to read a medieval manuscript by eye, built on the Bodleian
Libraries' open TEI catalogue ([bodleian/medieval-mss](https://github.com/bodleian/medieval-mss)).

- **Ante Quem** — place manuscripts in time. Fast, daily, streak-based.
- **Look Closer** — interrogate one page with a limited budget of looking, then commit to a
  reading. *(Milestone 2, not yet built.)*

Every round ends with a link back to the Bodleian's own catalogue record. That is the point:
the game is a front door to 2,201 manuscripts, not a destination.

## How it works

A Python build step turns 11,123 TEI records into four JSON files. A dependency-free static site
consumes them. There is no server, no database and no runtime cost.

The rules that decide whether an answer is *defensible* — deck legality, the difficulty ladder —
live in Python under test and arrive pre-computed. The browser renders and keeps score.

One IIIF image is fetched per manuscript and every crop after that is a local canvas operation.
This is not an optimisation: Bodleian's image server timed out on roughly one request in five
during testing, so any code path that blocks the player on the network is a defect.

## Build

```bash
python -m pytest tests/ -q          # build-step tests
cd site && node --test test/*.test.js   # game logic tests

python scripts/warm_manifests.py    # once: ~7 min, caches 2,201 IIIF manifests
python -m build                     # writes site/data/*.json
```

Then serve the site:

```bash
python3 -m http.server 8020 --directory site
```

## Layout

    build/        the extraction pipeline (stdlib only)
    tests/        pytest
    site/         the static site; this directory is what gets deployed
    site/data/    committed build output
    data/cache/   downloaded corpus and manifest cache (gitignored)
    docs/specs/   the design
    docs/superpowers/plans/   the implementation plan

## Attribution and licensing

Manuscript images are served from Digital Bodleian under
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) and are credited in place.

Catalogue text comes from `bodleian/medieval-mss`, **which has no LICENSE file**. Confirm reuse
terms with the Bodleian before making this public.
