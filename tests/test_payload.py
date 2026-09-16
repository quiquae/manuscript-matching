"""The index/details split: what the browser gets before it can play."""
import gzip
import json
from pathlib import Path

import pytest

from build.payload import PLAY_FIELDS, detail_row, index_row, split

BUILT = Path("site/data")

# What the first load of Arrange is allowed to weigh, gzipped, as GitHub Pages
# serves it. The split took it from 708 KB to 88 KB; this is a ceiling, not a
# target, and it exists so that adding a field back is a decision somebody has
# to make on purpose rather than a diff nobody measured.
INDEX_CEILING_KB = 150


def _record(rid="manuscript_1", **over):
    rec = {
        "id": rid, "shelfmark": "MS. Douce 1", "catalogue": "https://example/1",
        "not_before": 1300, "not_after": 1325, "date_display": "c. 1300–1325",
        "place_name": "Paris", "region": "France", "subjects": ["bible"],
        "language": "la", "material": "perg",
        "hand": "Gothic textualis, one hand throughout.",
        "layout": "Two columns of 40 lines.",
        "decoration": ["Fine initials", "A miniature at fol. 1r"],
        "owners": [{"name": "Douce", "role": "fmo"}],
        "acquisition": "Bequeathed 1834.", "contents": ["Psalter"],
        "iiif": "https://iiif/1", "attribution": "Bodleian Libraries",
        "digitalBodleian": "https://digital/1",
    }
    rec.update(over)
    return rec


def test_split_loses_nothing():
    rec = _record()
    index, details = split([rec])
    assert set(index[0]) | set(details[rec["id"]]) >= set(rec)


def test_the_index_carries_a_slug_to_link_by():
    index, _ = split([_record()])
    assert index[0]["slug"] == "ms-douce-1"


def test_index_and_details_do_not_overlap():
    """A field in both files is a field that can drift between them."""
    rec = _record()
    index, details = split([rec])
    assert set(index[0]) & set(details[rec["id"]]) == set()


def test_the_index_holds_exactly_the_play_fields_and_one_boolean():
    """The alarm for a prose field creeping back into the first load."""
    index, _ = split([_record()])
    assert set(index[0]) == set(PLAY_FIELDS) | {"decorated", "painted", "slug"}


def test_painted_is_narrower_than_decorated_and_says_why():
    """The Illuminated collection was selecting 88% of the corpus.

    Its blurb has always promised painted decoration, so the label was right and
    the test was wrong: any decoration note at all admitted "Two-line initials in
    red", which is rubrication. Red penwork is not illumination.
    """
    penwork = _record(decoration=["Two-line initials in red.",
                                  "One 4-line puzzle initial in red and blue, with penwork"])
    assert index_row(penwork)["decorated"] is True
    assert index_row(penwork)["painted"] is False

    for note in ["36 column miniatures", "A full-page miniature", "Gold initials",
                 "Initials illuminated on a ground of red and blue",
                 "18 historiated initials", "Burnished gilt ground"]:
        assert index_row(_record(decoration=[note]))["painted"] is True, note

    for note in ["Two-line initials in red.", "Fine borders", "Rubricated throughout",
                 "Spaces left for initials"]:
        assert index_row(_record(decoration=[note]))["painted"] is False, note


def test_nothing_painted_without_decoration():
    assert index_row({"id": "x"})["painted"] is False
    assert index_row(_record(decoration=[]))["painted"] is False


def test_decorated_is_the_test_it_replaces():
    """`decorated` must mean exactly `(decoration ?? []).length > 0`, as deck.js did."""
    for decoration, expected in (
        (["Fine initials"], True),
        ([], False),
        (None, False),
    ):
        assert index_row(_record(decoration=decoration))["decorated"] is expected
    assert index_row({"id": "x"})["decorated"] is False      # field absent entirely


def test_date_display_is_in_the_index_because_the_card_shows_it():
    """Regression: the split put it in the details and every card lost its "c.".

    `renderTable` writes `date_display || not_before-not_after` onto the card as
    soon as the order is committed, which happens before the reveal's details
    have been merged in. A missing `date_display` does not fail, it silently
    degrades "c. 1470-1480" to "1470-1480" -- a circa quietly becoming a claim.
    """
    index, details = split([_record()])
    assert index[0]["date_display"] == "c. 1300–1325"
    assert "date_display" not in details["manuscript_1"]


def test_hand_stays_in_the_details():
    """Look Closer grades against the prose, so it must not be reduced to a flag.

    `gradeHand` matches the description against a vocabulary of script names, so
    a non-empty description can still be ungradable. A boolean computed here
    would be a different rule with the same name.
    """
    rec = _record()
    index, details = split([rec])
    assert "hand" not in index[0]
    assert details[rec["id"]]["hand"] == rec["hand"]
    assert not any(k.startswith("hand") for k in index[0])


def test_every_record_gets_a_details_entry():
    recs = [_record("a"), _record("b"), _record("c")]
    index, details = split(recs)
    assert [r["id"] for r in index] == ["a", "b", "c"]
    assert set(details) == {"a", "b", "c"}


def test_a_record_missing_optional_fields_still_splits():
    bare = {"id": "m", "not_before": 900, "not_after": 950, "iiif": "x"}
    index, details = split([bare])
    assert index[0]["id"] == "m"
    assert index[0]["decorated"] is False
    assert detail_row(bare) == {}


# ---------------------------------------------------------------- built output

built = pytest.mark.skipif(not (BUILT / "puzzles.json").exists(),
                           reason="run `python -m build` first")


@built
def test_the_built_index_carries_no_prose():
    rows = json.loads((BUILT / "puzzles.json").read_text())
    assert rows, "puzzles.json is empty"
    for field in set().union(*(set(r) for r in rows)):
        assert field in set(PLAY_FIELDS) | {"decorated", "painted", "slug"}, \
            f"{field} is in the first load"


@built
def test_the_built_index_stays_small():
    size = len(gzip.compress((BUILT / "puzzles.json").read_bytes(), 9)) / 1024
    assert size < INDEX_CEILING_KB, (
        f"puzzles.json is {size:.0f} KB gzipped, over the {INDEX_CEILING_KB} KB ceiling; "
        "a field was added to the first load")


@built
def test_the_two_built_files_agree_on_every_manuscript():
    rows = json.loads((BUILT / "puzzles.json").read_text())
    details = json.loads((BUILT / "details.json").read_text())
    assert {r["id"] for r in rows} == set(details), "a manuscript is in one file only"
