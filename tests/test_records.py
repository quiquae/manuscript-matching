from build.places import Place
from build.records import extract, playable

PLACES = {"place_7008038": Place("place_7008038", "Paris", 48.86, 2.35)}
SUBJECTS = {"work_1938": ["bible"]}

TEI = """<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="manuscript_4472"><teiHeader><fileDesc>
<sourceDesc><msDesc xml:id="X">
 <msIdentifier><idno type="shelfmark">MS. Douce 211</idno></msIdentifier>
 <msContents><msItem><author key="person_1">Guyart</author>
   <title key="work_1938">Bible historiale</title>
   <textLang mainLang="fro">Old French</textLang></msItem></msContents>
 <physDesc><objectDesc><supportDesc material="perg"/>
     <layoutDesc><layout>2 columns, 40 lines</layout></layoutDesc></objectDesc>
   <decoDesc><decoNote>Fine miniatures.</decoNote></decoDesc>
   <handDesc><handNote>A large protogothic bookhand.</handNote></handDesc></physDesc>
 <history><origin>
   <origDate notBefore="1300" notAfter="1325">14th century, first quarter</origDate>
   <origPlace><settlement key="place_7008038">Paris</settlement></origPlace></origin>
   <provenance><persName key="person_69848690" role="fmo">Francis Douce</persName></provenance>
   <acquisition>Bequeathed in 1834</acquisition></history>
 <additional><surrogates><bibl type="digital-facsimile">
   <ref target="https://digital.bodleian.ox.ac.uk/objects/ca766e0e-08d7-4a5d-adae-e9ac14cd6bdc/"/>
   </bibl></surrogates></additional>
</msDesc></sourceDesc></fileDesc></teiHeader></TEI>"""


def _write(tmp_path, text):
    p = tmp_path / "r.xml"
    p.write_text(text)
    return p


def test_extract_pulls_every_field(tmp_path):
    rec = extract(_write(tmp_path, TEI), PLACES, SUBJECTS)[0]
    assert rec.id == "manuscript_4472"
    assert rec.shelfmark == "MS. Douce 211"
    assert (rec.not_before, rec.not_after) == (1300, 1325)
    assert rec.date_display == "14th century, first quarter"
    assert rec.region == "France"
    assert rec.subjects == ["bible"]
    assert rec.language == "fro"
    assert rec.material == "perg"
    assert rec.hand == "A large protogothic bookhand."
    assert rec.layout == "2 columns, 40 lines"
    assert rec.decoration == ["Fine miniatures."]
    assert rec.owners == [{"name": "Francis Douce", "role": "fmo"}]
    assert rec.db_uuid == "ca766e0e-08d7-4a5d-adae-e9ac14cd6bdc"
    assert rec.catalogue.endswith("/catalog/manuscript_4472")
    assert playable(rec)


def test_record_without_images_is_not_playable(tmp_path):
    stripped = TEI.replace(
        "https://digital.bodleian.ox.ac.uk/objects/ca766e0e-08d7-4a5d-adae-e9ac14cd6bdc/", "")
    assert not playable(extract(_write(tmp_path, stripped), PLACES, SUBJECTS)[0])


def test_record_without_a_date_range_is_not_playable(tmp_path):
    undated = TEI.replace('notBefore="1300" notAfter="1325"', "")
    assert not playable(extract(_write(tmp_path, undated), PLACES, SUBJECTS)[0])


def test_bc_dates_parse_as_negative_years(tmp_path):
    bc = TEI.replace('notBefore="1300" notAfter="1325"', 'notBefore="-0300" notAfter="-0250"')
    rec = extract(_write(tmp_path, bc), PLACES, SUBJECTS)[0]
    assert (rec.not_before, rec.not_after) == (-300, -250)
    assert playable(rec)


def test_inverted_date_range_is_rejected(tmp_path):
    """notAfter earlier than notBefore is a cataloguing error, not a puzzle."""
    bad = TEI.replace('notBefore="1300" notAfter="1325"', 'notBefore="1325" notAfter="1300"')
    assert not playable(extract(_write(tmp_path, bad), PLACES, SUBJECTS)[0])
