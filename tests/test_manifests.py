from build.manifests import parse_manifest, pick_canvas


def test_pick_canvas_skips_the_binding_and_lands_a_third_in():
    assert pick_canvas(10) == 3
    assert pick_canvas(1) == 0
    assert pick_canvas(3) == 1


def test_parse_manifest_reads_service_and_attribution():
    doc = {
        "attribution": "Photo: <span>(c) Bodleian Libraries. CC BY-NC 4.0</span>",
        "sequences": [{"canvases": [
            {"images": [{"resource": {"service": {"@id": "https://iiif/img/AAA"}}}]},
            {"images": [{"resource": {"service": {"@id": "https://iiif/img/BBB"}}}]},
            {"images": [{"resource": {"service": {"@id": "https://iiif/img/CCC"}}}]},
        ]}],
    }
    service, attribution = parse_manifest(doc)
    assert service == "https://iiif/img/BBB"
    assert "CC BY-NC 4.0" in attribution
    assert "<span>" not in attribution


def test_parse_manifest_returns_none_when_there_are_no_canvases():
    assert parse_manifest({"sequences": [{"canvases": []}]}) is None
    assert parse_manifest({}) is None


def test_parse_manifest_falls_back_to_the_resource_id():
    doc = {"sequences": [{"canvases": [{"images": [{"resource": {"@id": "https://iiif/img/Z"}}]}]}]}
    assert parse_manifest(doc)[0] == "https://iiif/img/Z"
