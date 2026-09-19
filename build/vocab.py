"""Turning catalogue codes into words, without inventing any of them.

Every expansion here has a named source. That matters more than usual: the
audience for a manuscript page is people who will recognise a wrong relator
code or a mislabelled language on sight, and a page that expands `dnr` to
"former owner" is worse than one that prints `dnr`.

  roles      MARC relator codes, verified one by one against
             id.loc.gov/vocabulary/relators on 2026-09-14 by exact URI match.
             A first pass matched labels anywhere in the returned graph and
             produced "former owner" for `dnr` and "author of afterword" for
             `aut`, which is how a plausible wrong answer gets in.
  languages  not hardcoded at all. Derived from the Bodleian's own
             <textLang> labels in the corpus, so the wording on the page is the
             cataloguer's. See language_labels().
  materials  TEI @material abbreviations, as used throughout medieval-mss.
  subjects   slugs from the work authority file's controlled vocabulary
             (build/works.py), title-cased for display only.

Anything not listed is shown exactly as catalogued. Printing a bare code is a
small cost; asserting the wrong expansion is not.
"""
import re
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

# MARC relators, verified against id.loc.gov (see module docstring).
ROLES = {
    "fmo": "former owner",
    "sgn": "signer",
    "dnr": "donor",
    "pat": "patron",
    "scr": "scribe",
    "aut": "author",
    "bsl": "bookseller",
    "ann": "annotator",
}

# TEI @material, as medieval-mss uses it.
MATERIALS = {
    "perg": "parchment",
    "chart": "paper",
    "papyrus": "papyrus",
    "mixed": "mixed",
    "screenfold": "screenfold",
}


def role_label(role: str) -> str:
    """'pat fmo' -> 'patron, former owner'. Unknown codes pass through."""
    codes = (role or "").split()
    return ", ".join(ROLES.get(c, c) for c in codes)


def material_label(material: str) -> str:
    return MATERIALS.get(material, material or "")


def subject_label(slug: str) -> str:
    return (slug or "").replace("_", " ")


# A label naming a second language, or hedging, describes one record rather than
# the code. Those are skipped in favour of a clean wording, and if a code has
# none, the code itself is shown.
_NOT_A_LANGUAGE_NAME = re.compile(r"\band\b|\?|/|,|;", re.I)


def language_labels(root: Path) -> dict[str, str]:
    """Code -> the cataloguer's own wording, from <textLang> across the corpus.

    Preferred over any external list because it is what the Bodleian calls the
    language in the record the page is about. `xno` is "Anglo-Norman" here;
    id.loc.gov does not hold it at all, being MARC and three-letter.
    """
    ns = "{http://www.tei-c.org/ns/1.0}"
    seen: dict[str, Counter] = defaultdict(Counter)
    for path in sorted((root / "collections").rglob("*.xml")):
        try:
            tree = ET.parse(path).getroot()
        except ET.ParseError:
            continue
        for el in tree.iter(f"{ns}textLang"):
            code = el.get("mainLang")
            label = " ".join("".join(el.itertext()).split())
            if code and label:
                seen[code][label] += 1

    labels = {}
    for code, counter in seen.items():
        clean = [(n, lab) for lab, n in counter.items()
                 if not _NOT_A_LANGUAGE_NAME.search(lab)]
        if clean:
            labels[code] = max(clean)[1]
    return labels


LABEL_MAX = 60


def date_label(date_display: str, fallback: str = "") -> str:
    """A date short enough to sit on a card.

    `date_display` is the cataloguer's own wording and is usually a date --
    "c. 1300-1325", median 22 characters. Sometimes it is an argument. St John's
    College MS 164 carries 789 characters beginning "1365 x 1377. It is unclear
    whether our book should be considered a datable manuscript..." and that ran
    into the card, the summary line, the image alt text and a 938-character meta
    description.

    Prefer the first sentence, which in every long case here is the date itself
    with the discussion after it. Fall back to a word-boundary cut. The full
    text is not lost: the manuscript page quotes it under "Date, as catalogued",
    which is the place that should carry the cataloguer's reasoning.
    """
    text = " ".join(str(date_display or "").split())
    if not text:
        return fallback
    if len(text) <= LABEL_MAX:
        return text
    first = text.split(". ", 1)[0].rstrip(".")
    if first and len(first) <= LABEL_MAX:
        return first
    return text[:LABEL_MAX].rsplit(" ", 1)[0].rstrip(" ,;:-") + "\u2026"


# ------------------------------------------------------------------- slugs

_PUNCT = re.compile(r"[^a-z0-9]+")


def slug(shelfmark: str, fallback: str = "") -> str:
    """'MS. Canon. Ital. 1' -> 'ms-canon-ital-1'.

    The shelfmark is the name a reader searches for and the one a citation
    carries, so it is what the URL should say. `manuscript_16` means nothing to
    anybody outside this repository.
    """
    base = _PUNCT.sub("-", (shelfmark or "").lower()).strip("-")
    return base or _PUNCT.sub("-", fallback.lower()).strip("-")


def _id_tail(record_id: str) -> str:
    """'manuscript_4231' -> '4231'. The record's own identity, for a clash."""
    tail = _PUNCT.sub("-", str(record_id).rsplit("_", 1)[-1].lower()).strip("-")
    return tail or "x"


def slugs(records: list[dict]) -> dict[str, str]:
    """id -> unique slug.

    Shelfmarks are not unique in this corpus: two records share
    `MS. Rawl. liturg. e. 9` and two share `MS. Rawl. liturg. f. 8`, being parts
    of one binding catalogued separately. Four pages out of 2,201.

    When a shelfmark clashes, *every* member of the clash takes a suffix from
    its own record id -- not just the later ones. A counter would be prettier,
    and it would renumber the existing URLs the day upstream catalogues a third
    part: whoever holds the unsuffixed slug today would keep it or lose it
    depending on how the ids happened to sort. A URL somebody has cited must not
    move because a neighbouring record appeared. Four slightly uglier addresses
    is the price of the other 2,197 being permanent.
    """
    grouped: dict[str, list[dict]] = {}
    for rec in records:
        grouped.setdefault(slug(rec.get("shelfmark", ""), rec["id"]), []).append(rec)

    out = {}
    for base, group in grouped.items():
        if len(group) == 1:
            out[group[0]["id"]] = base
        else:
            for rec in group:
                out[rec["id"]] = f"{base}-{_id_tail(rec['id'])}"
    return out
