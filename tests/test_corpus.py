from build.corpus import record_files


def test_record_files_finds_only_xml_under_collections(tmp_path):
    (tmp_path / "collections" / "Douce").mkdir(parents=True)
    (tmp_path / "collections" / "Douce" / "MS_Douce_1.xml").write_text("<TEI/>")
    (tmp_path / "collections" / "bodley-msDesc.rng").write_text("<grammar/>")
    (tmp_path / "works.xml").write_text("<TEI/>")
    found = record_files(tmp_path)
    assert [p.name for p in found] == ["MS_Douce_1.xml"]


def test_corpus_root_rejects_a_directory_that_is_not_a_usable_corpus(tmp_path, monkeypatch):
    """A half-deleted cache directory must not be trusted just because it exists.

    Found the hard way: rewriting git history checked out a tree without the
    cache, deleting the extracted corpus but leaving the directory behind. The
    build then failed deep inside an XML parse instead of re-fetching.
    """
    from build import corpus

    stale = tmp_path / "medieval-mss-master"
    (stale / "collections").mkdir(parents=True)
    # looks like a corpus, but the authority files are gone

    called = []
    monkeypatch.setattr(corpus, "_download", lambda cache: called.append(cache))
    try:
        corpus.corpus_root(tmp_path)
    except Exception:
        pass
    assert called, "corpus_root should have re-fetched rather than trusting the shell"


def test_corpus_root_accepts_a_complete_corpus(tmp_path, monkeypatch):
    from build import corpus

    root = tmp_path / "medieval-mss-master"
    (root / "collections").mkdir(parents=True)
    for name in ("places.xml", "works.xml", "persons.xml"):
        (root / name).write_text("<TEI/>")

    monkeypatch.setattr(corpus, "_download", lambda cache: (_ for _ in ()).throw(
        AssertionError("should not re-download a complete corpus")))
    assert corpus.corpus_root(tmp_path) == root
