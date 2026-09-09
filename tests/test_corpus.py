from build.corpus import record_files


def test_record_files_finds_only_xml_under_collections(tmp_path):
    (tmp_path / "collections" / "Douce").mkdir(parents=True)
    (tmp_path / "collections" / "Douce" / "MS_Douce_1.xml").write_text("<TEI/>")
    (tmp_path / "collections" / "bodley-msDesc.rng").write_text("<grammar/>")
    (tmp_path / "works.xml").write_text("<TEI/>")
    found = record_files(tmp_path)
    assert [p.name for p in found] == ["MS_Douce_1.xml"]
