"""The work authority file's controlled subject vocabulary."""
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"t": "http://www.tei-c.org/ns/1.0"}
XML_ID = "{http://www.w3.org/XML/1998/namespace}id"
PREFIX = "#subject_"


def _refs(bibl) -> list[str]:
    return [t.get("ref", "") for t in bibl.findall("./t:term", NS) if t.get("ref")]


def load_subjects(root: Path) -> dict[str, list[str]]:
    """Work id -> subject slugs, from <term ref="#subject_x"/>.

    A handful of records in the real file write "#science" where they mean
    "#subject_science". Those are recovered by matching against the vocabulary
    the prefixed refs establish -- a bare ref that is not a known subject (a
    person key, say) is still ignored.
    """
    tree = ET.parse(root / "works.xml").getroot()
    bibls = [b for b in tree.iter("{http://www.tei-c.org/ns/1.0}bibl") if b.get(XML_ID)]

    vocabulary = {
        ref.removeprefix(PREFIX)
        for b in bibls
        for ref in _refs(b)
        if ref.startswith(PREFIX)
    }

    out: dict[str, list[str]] = {}
    for bibl in bibls:
        subs: list[str] = []
        for ref in _refs(bibl):
            slug = ref.removeprefix(PREFIX) if ref.startswith(PREFIX) else ref.lstrip("#")
            if slug in vocabulary and slug not in subs:
                subs.append(slug)
        if subs:
            out[bibl.get(XML_ID)] = subs
    return out
