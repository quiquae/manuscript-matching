"""Whole-corpus numbers the reveal panel quotes, and the look-alike index."""
from collections import Counter, defaultdict

from build.records import Record

HALF_CENTURY = 50
LOOKALIKES = 6


def _bucket(rec: Record) -> tuple[str, int]:
    """Region and half-century -- the grain at which manuscripts actually resemble each other."""
    return (rec.region, (rec.not_before or 0) // HALF_CENTURY * HALF_CENTURY)


def corpus_context(records: list[Record]) -> dict:
    """The facts a single catalogue record cannot tell you."""
    buckets = Counter(_bucket(r) for r in records)
    return {
        "total": len(records),
        "regions": dict(Counter(r.region for r in records)),
        "owners": dict(Counter(
            o["name"] for r in records for o in r.owners if o.get("name")).most_common(60)),
        "subjects": dict(Counter(s for r in records for s in r.subjects)),
        "languages": dict(Counter(r.language for r in records if r.language)),
        "buckets": {f"{region}|{half}": n for (region, half), n in buckets.items()},
    }


def lookalike_index(records: list[Record], k: int = LOOKALIKES) -> dict[str, list[str]]:
    """Six other manuscripts from the same region and half-century.

    This is the teaching payload: 'what France, 1300-1350 looks like'. Omitted
    where a manuscript has too few neighbours to make an honest comparison.
    """
    groups: dict[tuple[str, int], list[str]] = defaultdict(list)
    for rec in records:
        groups[_bucket(rec)].append(rec.id)

    out: dict[str, list[str]] = {}
    for rec in records:
        peers = [i for i in groups[_bucket(rec)] if i != rec.id]
        if len(peers) >= k:
            out[rec.id] = peers[:k]
    return out
