"""The per-manuscript pages: that they exist, say where they came from, and stay put."""
import json
import re
from pathlib import Path

import pytest

from build.pages import (BASE, browse_page, indexable, manuscript_page, prose_length,
                         sitemap)
from build.vocab import slugs

BUILT = Path("site/data")

VOCAB = {"languages": {"la": "Latin"}, "materials": {"perg": "parchment"},
         "roles": {"fmo": "former owner"}}


def _record(rid="manuscript_1", **over):
    rec = {
        "id": rid, "shelfmark": "MS. Douce 1", "catalogue": "https://example/1",
        "not_before": 1300, "not_after": 1325, "date_display": "c. 1300–1325",
        "region": "France", "language": "la", "material": "perg",
        "iiif": "https://iiif/1", "attribution": "Bodleian Libraries", "decorated": True,
        "slug": "ms-douce-1",
    }
    rec.update(over)
    return rec


def _detail(**over):
    d = {
        "place_name": "Paris", "subjects": ["bible"],
        "hand": "Gothic textualis, one hand throughout.",
        "layout": "Two columns of 40 lines.",
        "decoration": ["Fine initials", "A miniature at fol. 1r"],
        "owners": [{"name": "Francis Douce", "role": "fmo"}],
        "acquisition": "Bequeathed 1834.", "contents": ["Psalter"],
        "digitalBodleian": "https://digital/1",
    }
    d.update(over)
    return d


def _page(row=None, detail=None, lookalikes=None):
    row = row or _record()
    return manuscript_page(row, detail if detail is not None else _detail(), VOCAB,
                           {row["id"]: row}, {row["id"]: row["slug"]}, lookalikes or {})


# ------------------------------------------------------------ what it must say

def test_the_page_names_its_source_and_tells_you_what_to_cite():
    page = _page()
    assert "medieval-mss" in page
    assert "with the Library's permission" in page
    assert "Cite the catalogue, not this page" in page


def test_the_derived_range_is_marked_as_ours_not_the_cataloguers():
    """The one claim on the page that is not the Bodleian's must say so."""
    page = _page()
    assert "c. 1300–1325" in page, "the catalogued date must be shown"
    assert "1300–1325 beside it is" in page
    assert "this site's own reading" in page


def test_the_catalogue_prose_is_quoted_not_paraphrased():
    page = _page()
    for quoted in ["Gothic textualis, one hand throughout.",
                   "Two columns of 40 lines.", "Fine initials", "Bequeathed 1834."]:
        assert quoted in page, quoted


def test_provenance_expands_a_verified_role_and_says_where_from():
    page = _page()
    assert "Francis Douce" in page
    assert "former owner" in page
    assert "id.loc.gov/vocabulary/relators" in page


def test_an_unverified_role_is_left_as_catalogued():
    page = _page(detail=_detail(owners=[{"name": "A Person", "role": "zzz"}]))
    assert "zzz" in page
    assert "id.loc.gov" not in page, "do not cite a list we did not use"


def test_one_person_catalogued_twice_is_one_line():
    page = _page(detail=_detail(owners=[{"name": "Elias Ashmole", "role": "fmo"},
                                        {"name": "Elias Ashmole", "role": ""}]))
    assert page.count("Elias Ashmole") == 1


# --------------------------------------------------------------- how it is made

def test_the_shelfmark_is_the_heading_and_the_title():
    page = _page()
    assert page.count("<h1") == 1, "a page has exactly one h1"
    assert "<h1 class=\"ms-shelfmark\">MS. Douce 1</h1>" in page
    assert "<title>MS. Douce 1" in page


def test_entities_in_the_source_are_not_escaped_twice():
    """The TEI carries "Sommer&#x27;s"; escaping that again prints the entity."""
    page = _page(detail=_detail(hand="Sommer&#x27;s hand, with &amp; ligatures."))
    assert "&amp;#x27;" not in page
    assert "&amp;amp;" not in page


def test_a_long_note_is_folded_rather_than_dumped():
    page = _page(detail=_detail(decoration=["x" * 900, "y" * 100]))
    assert "<details" in page
    assert "2 notes" in page
    assert "x" * 900 in page, "folding must not drop the text"


def test_a_short_note_is_not_folded():
    assert "<details" not in _page(detail=_detail(decoration=["Fine initials"]))


def test_each_note_is_its_own_paragraph():
    page = _page(detail=_detail(contents=["Psalter", "Hours of the Virgin"]))
    assert "<p>Psalter</p>" in page
    assert "<p>Hours of the Virgin</p>" in page


def test_the_credit_is_not_doubled_when_it_already_names_the_licence():
    already = "Photo: © Bodleian Libraries. Terms of use: CC BY-NC 4.0"
    page = _page(_record(attribution=already))
    assert page.count("CC BY-NC 4.0</a>") == 1, "only the footer's link"


def test_the_image_alt_reads_as_a_sentence():
    alt = re.search(r'alt="([^"]+)"', _page()).group(1)
    assert "·" not in alt, "a screen reader should not read middle dots aloud"
    assert alt.startswith("A page of MS. Douce 1,")


def test_a_record_with_almost_nothing_still_makes_a_page():
    bare = {"id": "m", "not_before": 900, "not_after": 950, "iiif": "https://i/1",
            "slug": "m", "shelfmark": "", "catalogue": ""}
    page = manuscript_page(bare, {}, VOCAB, {"m": bare}, {"m": "m"}, {})
    assert "<h1" in page and "Cite the catalogue" in page


def test_the_structured_data_is_valid_json_and_the_right_type():
    block = re.search(r'<script type="application/ld\+json">(.*?)</script>',
                      _page(), re.S).group(1)
    ld = json.loads(block)
    assert ld["@type"] == "Manuscript"        # schema.org, subClassOf CreativeWork
    assert ld["name"] == "MS. Douce 1"
    assert ld["url"] == BASE + "ms/ms-douce-1.html"
    assert "https://example/1" in ld["sameAs"]


# --------------------------------------------------------------------- slugs

def test_a_clash_suffixes_every_member_so_urls_never_move():
    before = [{"id": "manuscript_10", "shelfmark": "MS. X 1"},
              {"id": "manuscript_20", "shelfmark": "MS. X 1"}]
    after = before + [{"id": "manuscript_3", "shelfmark": "MS. X 1"}]
    first, second = slugs(before), slugs(after)
    assert all(first[k] == second[k] for k in first), "an existing URL moved"
    assert second["manuscript_3"] == "ms-x-1-3"


def test_a_shelfmark_that_does_not_clash_keeps_a_clean_url():
    assert slugs([{"id": "manuscript_1", "shelfmark": "MS. Canon. Ital. 1"}]) \
        == {"manuscript_1": "ms-canon-ital-1"}


# -------------------------------------------------------------- built output

built = pytest.mark.skipif(not (BUILT / "puzzles.json").exists(),
                           reason="run `python -m build` first")


@built
def test_every_manuscript_has_a_unique_slug():
    rows = json.loads((BUILT / "puzzles.json").read_text())
    got = [r["slug"] for r in rows]
    assert len(set(got)) == len(got), "two manuscripts would write the same file"
    assert all(re.fullmatch(r"[a-z0-9-]+", s) for s in got), "a slug is not URL-safe"


# ------------------------------------------------------- what is worth indexing

def test_a_page_with_no_catalogue_prose_is_not_offered_to_a_crawler():
    assert indexable({}) is False
    assert indexable({"place_name": "England"}) is False, \
        "an identifier is not prose"
    assert indexable({"hand": "Gothic textualis."}) is True
    assert indexable({"contents": ["Psalter"]}) is True
    assert indexable({"owners": [{"name": "Douce"}]}) is True
    assert indexable({"decoration": ["Fine initials"]}) is True


def test_prose_length_counts_words_not_fields():
    assert prose_length({"hand": "", "layout": "", "decoration": []}) == 0
    assert prose_length({"contents": ["ab", "cde"]}) == 5


def test_a_bare_page_says_noindex_but_still_says_follow():
    """Follow, so the crawler still reaches the neighbours it links to."""
    bare = manuscript_page(_record(), {}, VOCAB,
                           {"manuscript_1": _record()}, {"manuscript_1": "ms-douce-1"}, {})
    assert '<meta name="robots" content="noindex,follow">' in bare


def test_a_page_with_prose_carries_no_robots_tag():
    assert "noindex" not in _page()


@built
def test_the_committed_sitemap_is_not_stale():
    """A sitemap listing a page that no longer exists is a crawl error per URL."""
    rows = json.loads((BUILT / "puzzles.json").read_text())
    details = json.loads((BUILT / "details.json").read_text())
    offered = sorted(r["slug"] for r in rows if indexable(details.get(r["id"], {})))
    paths = (["", "look.html", "shelf.html", "search.html", "dating.html", "browse.html"]
             + [f"ms/{s}.html" for s in offered])
    committed = Path("site/sitemap.xml")
    if not committed.exists():
        pytest.skip("run scripts/make_pages.py first")
    expected = sitemap(sorted(set(paths), key=paths.index))
    assert committed.read_text() == expected, \
        "site/sitemap.xml is out of date; run python3 scripts/make_pages.py"


@built
def test_the_browse_page_reaches_every_manuscript():
    rows = json.loads((BUILT / "puzzles.json").read_text())
    slug_of = {r["id"]: r["slug"] for r in rows}
    page = browse_page(rows, slug_of, json.loads((BUILT / "vocab.json").read_text()))
    linked = set(re.findall(r'href="ms/([a-z0-9-]+)\.html"', page))
    missing = set(slug_of.values()) - linked
    assert not missing, f"{len(missing)} manuscripts are unreachable by a crawler"
    assert page.count("<h1") == 1


@built
def test_no_page_is_both_in_the_sitemap_and_marked_noindex():
    """Submitting a URL and then refusing to index it is a reported error.

    Checked against the real sitemap rather than the generator's own variables,
    because the two could agree in the code and disagree on disk.
    """
    rows = json.loads((BUILT / "puzzles.json").read_text())
    details = json.loads((BUILT / "details.json").read_text())
    listed = set(re.findall(r"<loc>[^<]*/ms/([a-z0-9-]+)\.html</loc>",
                            Path("site/sitemap.xml").read_text()))
    contradictions = [r["slug"] for r in rows
                      if r["slug"] in listed and not indexable(details.get(r["id"], {}))]
    assert not contradictions, contradictions
    # And the ones held back are held back for the stated reason, not lost.
    held = [r["slug"] for r in rows if r["slug"] not in listed]
    assert all(not indexable(details.get(r["id"], {}))
               for r in rows if r["slug"] in set(held)), \
        "a page with catalogue prose is missing from the sitemap"


@built
def test_a_noindex_page_is_still_reachable_by_a_crawler():
    """noindex,follow only works if something still links to it."""
    rows = json.loads((BUILT / "puzzles.json").read_text())
    details = json.loads((BUILT / "details.json").read_text())
    slug_of = {r["id"]: r["slug"] for r in rows}
    page = browse_page(rows, slug_of, json.loads((BUILT / "vocab.json").read_text()))
    bare = [r["slug"] for r in rows if not indexable(details.get(r["id"], {}))]
    assert bare, "the rule is not being exercised; check the corpus"
    for slug in bare:
        assert f'href="ms/{slug}.html"' in page, f"{slug} is unreachable"
