from build.aggregates import corpus_context, lookalike_index
from build.records import Record


def _rec(rid, nb, na, region, owner=None, subjects=()):
    return Record(
        id=rid, shelfmark=rid, catalogue="", db_uuid="u", not_before=nb, not_after=na,
        date_display="", place_id="p", place_name="Paris", region=region,
        subjects=list(subjects),
        owners=[{"name": owner, "role": "fmo"}] if owner else [],
    )


def test_corpus_context_counts_regions_owners_and_subjects():
    recs = [
        _rec("a", 1300, 1325, "France", "Douce", ["bible"]),
        _rec("b", 1310, 1330, "France", "Douce"),
        _rec("c", 1400, 1450, "Italy", subjects=["liturgy"]),
    ]
    ctx = corpus_context(recs)
    assert ctx["total"] == 3
    assert ctx["regions"] == {"France": 2, "Italy": 1}
    assert ctx["owners"]["Douce"] == 2
    assert ctx["subjects"] == {"bible": 1, "liturgy": 1}


def test_lookalikes_group_by_region_and_half_century_excluding_self():
    recs = [_rec(str(i), 1300, 1325, "France") for i in range(8)]
    idx = lookalike_index(recs)
    assert "0" not in idx["0"]
    assert len(idx["0"]) == 6


def test_lookalikes_omit_manuscripts_with_too_few_neighbours():
    recs = [_rec(str(i), 1300, 1325, "France") for i in range(3)]
    assert lookalike_index(recs) == {}


def test_lookalikes_do_not_cross_regions_or_half_centuries():
    recs = ([_rec(f"f{i}", 1300, 1325, "France") for i in range(7)]
            + [_rec(f"i{i}", 1300, 1325, "Italy") for i in range(7)]
            + [_rec(f"l{i}", 1450, 1470, "France") for i in range(7)])
    idx = lookalike_index(recs)
    assert all(peer.startswith("f") for peer in idx["f0"])
