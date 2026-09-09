"""Resolve a Digital Bodleian object into one IIIF image service."""
import json
import re
import subprocess
import time
from pathlib import Path

MANIFEST = "https://iiif.bodleian.ox.ac.uk/iiif/manifest/{}.json"
_TAGS = re.compile(r"<[^>]+>")


def pick_canvas(n: int) -> int:
    """A third of the way in: past the binding and flyleaves, into the text."""
    return max(0, min(n - 1, n // 3))


def parse_manifest(doc: dict) -> tuple[str, str] | None:
    """(image service url, attribution) for one representative canvas."""
    canvases = (doc.get("sequences") or [{}])[0].get("canvases") or []
    if not canvases:
        return None
    canvas = canvases[pick_canvas(len(canvases))]
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
