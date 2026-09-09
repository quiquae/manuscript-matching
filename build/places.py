"""The place authority file, reduced to what the game needs."""
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

NS = {"t": "http://www.tei-c.org/ns/1.0"}
XML_ID = "{http://www.w3.org/XML/1998/namespace}id"

# Ordered: first substring match wins.
#
# Egypt and Byzantium are separated out rather than swept into "Elsewhere":
# together they are 160 of the 228 that would otherwise land there, and Egyptian
# papyrus is the single most visually identifiable category in the corpus.
# Telling a player it is "Elsewhere" would be both unfair and uninformative.
_REGION_RULES = [
    ("England", ("england", "english", "britain", "wales", "scotland")),
    ("Italy", ("italia", "italy", "italian", "roma", "venice", "florence", "milan")),
    ("Germany", ("deutschland", "german", "austria", "osterreich", "österreich")),
    ("France", ("france", "french", "paris", "flanders", "flemish", "netherlands",
                "países bajos", "belgium")),
    ("Egypt", ("bahnas", "ḩībah", "hibah", "hermopolis", "egypt", "oxyrhynch",
               "arsinoe", "fayum", "antinoop")),
    ("Byzantium", ("constantinople", "istanbul", "byzan", "crete", "cyprus", "thessalon")),
]


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    lat: float
    lon: float


def region_for(name: str) -> str:
    low = (name or "").lower()
    for region, needles in _REGION_RULES:
        if any(n in low for n in needles):
            return region
    return "Elsewhere"


def load_places(root: Path) -> dict[str, Place]:
    """Place id -> Place, for the places that carry coordinates."""
    tree = ET.parse(root / "places.xml").getroot()
    out: dict[str, Place] = {}
    for el in tree.iter("{http://www.tei-c.org/ns/1.0}place"):
        pid = el.get(XML_ID)
        geo = el.find(".//t:location/t:geo", NS)
        name_el = el.find("./t:placeName", NS)
        if not pid or geo is None or geo.text is None or name_el is None:
            continue
        parts = [p for p in geo.text.replace(",", " ").split() if p]
        if len(parts) < 2:
            continue
        try:
            lat, lon = float(parts[0]), float(parts[1])
        except ValueError:
            continue
        out[pid] = Place(pid, "".join(name_el.itertext()).strip(), lat, lon)
    return out
