"""python -m build  ->  data/{puzzles,details,context,lookalikes}.json"""
import json
from dataclasses import asdict
from pathlib import Path

from build.aggregates import corpus_context, lookalike_index
from build.corpus import corpus_root, record_files
from build.manifests import image_service
from build.payload import split
from build.places import load_places
from build.records import Record, extract, playable
from build.works import load_subjects

CACHE = Path("data/cache")
OUT = Path("site/data")

# Fields the browser never uses; dropped to keep puzzles.json small.
DROP = {"db_uuid", "place_id"}


def _row(rec: Record, service: str, attribution: str) -> dict:
    row = {k: v for k, v in asdict(rec).items() if k not in DROP}
    row["iiif"] = service
    row["attribution"] = attribution
    row["digitalBodleian"] = f"https://digital.bodleian.ox.ac.uk/objects/{rec.db_uuid}/"
    return row


def main() -> None:
    root = corpus_root(CACHE)
    places, subjects = load_places(root), load_subjects(root)
    records = [r for f in record_files(root) for r in extract(f, places, subjects)]
    candidates = [r for r in records if playable(r)]
    print(f"{len(records)} records, {len(candidates)} playable")

    rows, dropped = [], 0
    for i, rec in enumerate(candidates, 1):
        found = image_service(rec.db_uuid, CACHE / "manifests")
        if not found:
            dropped += 1
            continue
        rows.append(_row(rec, *found))
        if i % 500 == 0:
            print(f"  manifests {i}/{len(candidates)}")
    print(f"{len(rows)} puzzles ({dropped} dropped: no resolvable manifest)")

    playable_by_id = {r.id: r for r in candidates}
    resolved = [playable_by_id[r["id"]] for r in rows]

    # puzzles.json is what play needs; details.json is what the reveal needs and
    # is fetched after a round has started. See build/payload.py.
    index, details = split(rows)

    OUT.mkdir(exist_ok=True)
    written = {
        "puzzles": index,
        "details": details,
        "context": corpus_context(resolved),
        "lookalikes": lookalike_index(resolved),
    }
    for name, payload in written.items():
        path = OUT / f"{name}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False))
        print(f"  wrote {path}  {path.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
