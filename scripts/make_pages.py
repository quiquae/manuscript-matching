"""Write one page per manuscript, the browse list, and the sitemap.

    python3 scripts/make_pages.py

Reads only the committed JSON in site/data, so it needs no corpus, no network
and no cache -- which is what lets CI regenerate the pages on a clean checkout.
Run it after `python -m build`, or on its own after editing a template.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from build.pages import browse_page, manuscript_page, sitemap   # noqa: E402

SITE = Path(__file__).resolve().parent.parent / "site"
DATA = SITE / "data"

# The pages that are written by hand and live at the top level.
HAND_WRITTEN = ["", "look.html", "shelf.html", "search.html"]


def main() -> None:
    index = json.loads((DATA / "puzzles.json").read_text())
    details = json.loads((DATA / "details.json").read_text())
    lookalikes = json.loads((DATA / "lookalikes.json").read_text())
    vocab = json.loads((DATA / "vocab.json").read_text())

    # The slugs come out of the index rather than being recomputed here: one
    # algorithm, one result, no chance of the links and the filenames diverging.
    slug_of = {r["id"]: r["slug"] for r in index}
    by_id = {r["id"]: r for r in index}
    assert len(set(slug_of.values())) == len(slug_of), "two manuscripts share a slug"

    out = SITE / "ms"
    out.mkdir(exist_ok=True)
    for stale in out.glob("*.html"):
        stale.unlink()               # a renamed shelfmark must not leave a ghost

    for row in index:
        page = manuscript_page(row, details.get(row["id"], {}), vocab,
                               by_id, slug_of, lookalikes)
        (out / f"{slug_of[row['id']]}.html").write_text(page)
    print(f"  wrote {len(index)} pages to site/ms/")

    (SITE / "browse.html").write_text(browse_page(index, slug_of, vocab))
    print("  wrote site/browse.html")

    paths = HAND_WRITTEN + ["browse.html"] + [f"ms/{s}.html" for s in sorted(slug_of.values())]
    (SITE / "sitemap.xml").write_text(sitemap(paths))
    print(f"  wrote site/sitemap.xml  {len(paths)} URLs")


if __name__ == "__main__":
    main()
