"""Turn one TEI msDesc into the flat Record the game consumes."""
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

from build.places import Place, region_for

NS = {"t": "http://www.tei-c.org/ns/1.0"}
T = "{http://www.tei-c.org/ns/1.0}"
XML_ID = "{http://www.w3.org/XML/1998/namespace}id"
CATALOGUE = "https://medieval.bodleian.ox.ac.uk/catalog/"

_UUID = re.compile(r"digital\.bodleian\.ox\.ac\.uk/objects/([0-9a-f-]{36})")
_YEAR = re.compile(r"^(-?\d{1,4})")


@dataclass
class Record:
    id: str
    shelfmark: str
    catalogue: str
    db_uuid: str | None
    not_before: int | None
    not_after: int | None
    date_display: str
    place_id: str | None
    place_name: str
    region: str
    subjects: list[str] = field(default_factory=list)
    language: str = ""
    material: str = ""
    hand: str = ""
    layout: str = ""
    decoration: list[str] = field(default_factory=list)
    owners: list[dict] = field(default_factory=list)
    acquisition: str = ""
    contents: list[str] = field(default_factory=list)


_DIMENSIONS = f"{{{NS['t']}}}dimensions"


def _flatten(el) -> str:
    """Element text, with a multiplication sign inside <dimensions>.

    TEI keeps a height and a width as sibling elements, so a plain itertext()
    runs them together: a ruled space of 270 by 175 mm comes out as "270 175".
    On a page a palaeographer may cite, that is not a typo, it is a different
    measurement. Non-mutating, because `_text` is called twice on the same
    element in places and a mutation would double the separator.
    """
    out = [el.text or ""]
    kids = list(el)
    for i, child in enumerate(kids):
        out.append(_flatten(child))
        if el.tag == _DIMENSIONS and i < len(kids) - 1:
            out.append(" × ")
        out.append(child.tail or "")
    return "".join(out)


def _text(el) -> str:
    return " ".join(_flatten(el).split()) if el is not None else ""


def _year(value: str | None) -> int | None:
    """TEI years, including BC dates written as -0300."""
    if not value:
        return None
    m = _YEAR.match(value.strip())
    return int(m.group(1)) if m else None


def extract(path: Path, places: dict[str, Place], subjects: dict[str, list[str]]) -> list[Record]:
    root = ET.parse(path).getroot()
    tei_id = root.get(XML_ID) or ""
    out: list[Record] = []

    for ms in root.iter(T + "msDesc"):
        blob = ET.tostring(ms, encoding="unicode")
        origin_date = ms.find(".//t:history/t:origin//t:origDate", NS)
        origin_place = ms.find(".//t:history/t:origin//t:origPlace", NS)

        place_id, place_name = None, ""
        if origin_place is not None:
            for el in origin_place.iter():
                key = el.get("key")
                if key in places:
                    place_id, place_name = key, places[key].name
                    break
            if not place_name:
                place_name = _text(origin_place)

        subs: list[str] = []
        for title in ms.findall(".//t:msContents//t:msItem/t:title", NS):
            for s in subjects.get(title.get("key") or "", []):
                if s not in subs:
                    subs.append(s)

        uuid = _UUID.search(blob)
        out.append(Record(
            id=tei_id or ms.get(XML_ID, ""),
            shelfmark=_text(ms.find(".//t:msIdentifier/t:idno[@type='shelfmark']", NS)),
            catalogue=CATALOGUE + (tei_id or ""),
            db_uuid=uuid.group(1) if uuid else None,
            not_before=_year(origin_date.get("notBefore")) if origin_date is not None else None,
            not_after=_year(origin_date.get("notAfter")) if origin_date is not None else None,
            date_display=_text(origin_date),
            place_id=place_id,
            place_name=place_name,
            region=region_for(place_name),
            subjects=subs,
            language=next((t.get("mainLang") for t in ms.iter(T + "textLang") if t.get("mainLang")), ""),
            material=next((s.get("material") for s in ms.iter(T + "supportDesc") if s.get("material")), ""),
            hand=_text(ms.find(".//t:handDesc/t:handNote", NS)),
            layout=_text(ms.find(".//t:objectDesc/t:layoutDesc", NS)),
            decoration=[_text(d) for d in ms.findall(".//t:decoDesc/t:decoNote", NS) if _text(d)],
            owners=[
                {"name": _text(p), "role": p.get("role", "")}
                for p in ms.findall(".//t:history/t:provenance//t:persName", NS)
                if p.get("key") and _text(p)
            ],
            acquisition=_text(ms.find(".//t:history/t:acquisition", NS)),
            contents=[_text(t) for t in ms.findall(".//t:msContents//t:msItem/t:title", NS) if _text(t)][:6],
        ))
    return out


def playable(rec: Record) -> bool:
    """Dated, placed and illustrated -- the three things a puzzle needs."""
    return bool(
        rec.not_before is not None
        and rec.not_after is not None
        and rec.not_after >= rec.not_before
        and rec.place_id
        and rec.db_uuid
    )
