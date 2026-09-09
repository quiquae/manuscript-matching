from build.places import load_places, region_for

TEI = """<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><listPlace>
  <place xml:id="place_7008038" type="settlement">
    <placeName type="index">Paris</placeName>
    <location><geo>48.8566, 2.3522</geo></location>
  </place>
  <place xml:id="place_nogeo" type="country"><placeName type="index">Nowhere</placeName></place>
</listPlace></body></text></TEI>"""


def test_load_places_keeps_only_geocoded(tmp_path):
    (tmp_path / "places.xml").write_text(TEI)
    places = load_places(tmp_path)
    assert set(places) == {"place_7008038"}
    assert places["place_7008038"].name == "Paris"
    assert places["place_7008038"].lat == 48.8566


def test_region_for_maps_names_to_named_buckets():
    assert region_for("France") == "France"
    assert region_for("Italia") == "Italy"
    assert region_for("Deutschland") == "Germany"
    assert region_for("England") == "England"
    assert region_for("") == "Elsewhere"
    assert region_for("Somewhere unrecorded") == "Elsewhere"


def test_egypt_and_byzantium_are_their_own_regions():
    """Papyri from Oxyrhynchus are the most visually distinctive thing in the
    corpus. Filing them under "Elsewhere" with Irish gospel books would be both
    unfair to guess and uninformative to be told."""
    assert region_for("Al Bahnasā") == "Egypt"
    assert region_for("Al Ḩībah") == "Egypt"
    assert region_for("Hermopolis") == "Egypt"
    assert region_for("Constantinople (Istanbul)") == "Byzantium"
    assert region_for("Crete") == "Byzantium"
    assert region_for("Ireland") == "Elsewhere"
    assert region_for("México") == "Elsewhere"
