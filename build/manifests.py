"""Resolve a Digital Bodleian object into one IIIF image service.

The hard part is choosing *which* canvas. Picking by position lands on
bindings and flyleaves: in a sample of 600 manifests, "Upper board" appeared
170 times within the first four canvases. Choose by label instead.
"""
import json
import re
import subprocess
import time
from pathlib import Path

MANIFEST = "https://iiif.bodleian.ox.ac.uk/iiif/manifest/{}.json"
_TAGS = re.compile(r"<[^>]+>")

# A leaf of actual text is anything numbered in arabic: "fol. 12v", "p. 44",
# and openings such as "fol. 003v-004r". Roman numerals are excluded by having
# no arabic digit at all -- "fol. i r" is a flyleaf and usually blank.
_HAS_NUMBER = re.compile(r"\d")

# Everything a camera photographs that is not a page of the book.
_SKIP = re.compile(
    r"board|cover|spine|fore-?edge|\bhead\b|\btail\b|stub|flyleaf|endleaf|"
    r"pastedown|colour\s*chart|color\s*chart|ruler|scale|target",
    re.I,
)


def _label_text(canvas: dict) -> str:
    """IIIF labels arrive as a string, a list, or a language map."""
    label = canvas.get("label")
    if isinstance(label, list):
        label = label[0] if label else ""
    if isinstance(label, dict):
        label = label.get("@value") or next(iter(label.values()), "")
        if isinstance(label, list):
            label = label[0] if label else ""
    return str(label or "").strip()


def is_content_label(label: str) -> bool:
    """Whether this canvas is a written leaf rather than a binding or a blank."""
    if not label or _SKIP.search(label):
        return False
    return bool(_HAS_NUMBER.search(label))


def pick_canvas(canvases: list) -> int:
    """A leaf a third of the way into the written text.

    Far enough in to be past decorated openings and blank flyleaves, not so far
    as to fall off the end of a short book.
    """
    if not canvases:
        return 0
    content = [i for i, c in enumerate(canvases) if is_content_label(_label_text(c))]
    if content:
        return content[len(content) // 3]
    return max(0, min(len(canvases) - 1, len(canvases) // 3))   # nothing labelled


def parse_manifest(doc: dict) -> tuple[str, str] | None:
    """(image service url, attribution) for one representative written leaf."""
    canvases = (doc.get("sequences") or [{}])[0].get("canvases") or []
    if not canvases:
        return None
    canvas = canvases[pick_canvas(canvases)]
    try:
        resource = canvas["images"][0]["resource"]
    except (KeyError, IndexError):
        return None
    service = (resource.get("service") or {}).get("@id") or resource.get("@id")
    if not service:
        return None
    attribution = " ".join(_TAGS.sub(" ", str(doc.get("attribution") or "")).split())
    return service, attribution


def image_service(uuid: str, cache_dir: Path, tries: int = 4) -> tuple[str, str] | None:
    """Cached manifest fetch. Bodleian's server fails ~1 request in 5, so retry."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    cached = cache_dir / f"{uuid}.json"
    if cached.exists():
        try:
            return parse_manifest(json.loads(cached.read_text()))
        except json.JSONDecodeError:
            cached.unlink()
    for attempt in range(tries):
        proc = subprocess.run(
            ["curl", "-sS", "--max-time", "45", MANIFEST.format(uuid)],
            capture_output=True,
        )
        try:
            doc = json.loads(proc.stdout)
        except json.JSONDecodeError:
            time.sleep(2 * (attempt + 1))
            continue
        cached.write_text(json.dumps(doc))
        return parse_manifest(doc)
    return None
