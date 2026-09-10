from build.manifests import is_content_label, parse_manifest, pick_canvas


def _canvases(labels):
    return [
        {"label": lab,
         "images": [{"resource": {"service": {"@id": f"https://iiif/img/{i}"}}}]}
        for i, lab in enumerate(labels)
    ]


def test_binding_and_edge_labels_are_not_content():
    for label in ("Upper board", "Lower board", "Inside upper board", "Spine",
                  "Fore-edge", "Head", "Tail", "Upper cover", "Inside lower cover",
                  "stub recto", "stub verso", "Upper flyleaf recto", "Colour chart",
                  "Ruler", "recto", "verso", ""):
        assert not is_content_label(label), f"{label!r} should be skipped"


def test_roman_numeral_flyleaves_are_not_content():
    """fol. i r, fol. ii v and friends are flyleaves and usually blank."""
    for label in ("fol. i r", "fol. ii v", "fol. iii r", "fol. iv v", "fol. v r"):
        assert not is_content_label(label)


def test_arabic_folios_and_pages_are_content():
    for label in ("fol. 1r", "fol. 12v", "fol. 3 r", "p. 44", "page 7", "f. 22v",
                  "fol. 001v"):
        assert is_content_label(label), f"{label!r} should be usable"


def test_openings_spanning_two_leaves_are_content():
    """Many manifests label a photographed opening, not a single leaf. Those are
    pages of the book and must not be discarded as unlabelled."""
    for label in ("fol. 003v-004r", "fols. 11[c]v 12[a]r", "fols. 21v-22r"):
        assert is_content_label(label), f"{label!r} should be usable"


def test_pick_canvas_skips_the_binding_and_lands_inside_the_text():
    labels = ["Upper board", "Inside upper board", "fol. i r", "fol. i v",
              "fol. 1r", "fol. 1v", "fol. 2r", "fol. 2v", "fol. 3r",
              "Lower board", "Spine"]
    chosen = pick_canvas(_canvases(labels))
    assert is_content_label(labels[chosen]), f"picked {labels[chosen]!r}"


def test_pick_canvas_falls_back_when_nothing_is_labelled():
    labels = ["", "", "", "", "", ""]
    assert pick_canvas(_canvases(labels)) == 2


def test_pick_canvas_handles_a_single_canvas():
    assert pick_canvas(_canvases(["Upper board"])) == 0


def test_parse_manifest_reads_service_and_attribution():
    doc = {
        "attribution": "Photo: <span>(c) Bodleian Libraries. CC BY-NC 4.0</span>",
        "sequences": [{"canvases": _canvases(["Upper board", "fol. 1r", "fol. 2r"])}],
    }
    service, attribution = parse_manifest(doc)
    assert service != "https://iiif/img/0", "must not choose the binding"
    assert "CC BY-NC 4.0" in attribution
    assert "<span>" not in attribution


def test_parse_manifest_returns_none_when_there_are_no_canvases():
    assert parse_manifest({"sequences": [{"canvases": []}]}) is None
    assert parse_manifest({}) is None


def test_parse_manifest_falls_back_to_the_resource_id():
    doc = {"sequences": [{"canvases": [{"label": "fol. 1r",
                                        "images": [{"resource": {"@id": "https://iiif/img/Z"}}]}]}]}
    assert parse_manifest(doc)[0] == "https://iiif/img/Z"


def test_labels_may_arrive_as_lists_or_language_maps():
    doc = {"sequences": [{"canvases": [
        {"label": [{"@value": "Upper board"}],
         "images": [{"resource": {"service": {"@id": "https://iiif/img/0"}}}]},
        {"label": {"@value": "fol. 4r"},
         "images": [{"resource": {"service": {"@id": "https://iiif/img/1"}}}]},
    ]}]}
    assert parse_manifest(doc)[0] == "https://iiif/img/1"
