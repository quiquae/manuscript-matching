from build.works import load_subjects

TEI = """<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><listBibl>
  <bibl xml:id="work_1"><title>Missal</title>
    <term ref="#subject_liturgy"/><term ref="#subject_christian_literature"/></bibl>
  <bibl xml:id="work_2"><title>Untagged</title></bibl>
</listBibl></body></text></TEI>"""


def test_load_subjects_strips_prefix_and_skips_untagged(tmp_path):
    (tmp_path / "works.xml").write_text(TEI)
    subs = load_subjects(tmp_path)
    assert subs == {"work_1": ["liturgy", "christian_literature"]}


TEI_UNPREFIXED = """<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><listBibl>
  <bibl xml:id="work_1"><term ref="#subject_science"/></bibl>
  <bibl xml:id="work_2"><term ref="#science"/></bibl>
  <bibl xml:id="work_3"><term ref="#person_12345"/></bibl>
</listBibl></body></text></TEI>"""


def test_bare_refs_matching_the_vocabulary_are_recovered(tmp_path):
    """Four works in the real file write "#science" for "#subject_science".

    They are the same controlled vocabulary with the prefix dropped, so they
    count -- but a ref that is not in the vocabulary at all (a person) does not.
    """
    (tmp_path / "works.xml").write_text(TEI_UNPREFIXED)
    subs = load_subjects(tmp_path)
    assert subs == {"work_1": ["science"], "work_2": ["science"]}
