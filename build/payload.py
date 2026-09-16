"""Splitting one record into what play needs and what the reveal needs.

A single `puzzles.json` carrying every field cost 708 KB gzipped on the first
load of every page, and 43% of that was one field: `decoration`, whose entries
run to paragraphs of catalogue prose ("Fine miniatures (coloured drawings) fol.
1v Type miniature Subject Nine philosophers seated in a cave...") and which the
game reads only as a yes/no, to decide whether a manuscript belongs in the
Illuminated collection.

So the split is not by size, it is by when the field is needed:

  index    dealing, filtering, drawing the card, crediting the image, and
           scoring a guess. Needed before the player can do anything.
  details  the reveal, shown after a round is committed. Needed seconds later,
           which is long enough to fetch it while the player is still playing.

Two booleans move to the index in place of the prose they stand for.

`decorated` is any decoration note at all, which is what Look Closer grades its
"Decorated or plain?" question against.

`painted` is narrower, and exists because the Illuminated collection was
selecting 1,940 of 2,201 manuscripts -- 88%, which is not a filter. Its own
blurb has always read "Books with painted decoration", so the label was right
and the test was wrong: `decoration.length > 0` admits "Two-line initials in
red", and red penwork is rubrication, not illumination. Keyed on the
cataloguer's own words for paint and gold, it selects 938 (43%).

`hand` deliberately does NOT get the same treatment. Look Closer decides whether
to offer the hand field by running the description through `gradeHand`, which
matches it against a vocabulary of script names — so a non-empty description can
still be ungradable, and a boolean computed here as `bool(hand)` would be a
different rule wearing the same name. Rather than reimplement that vocabulary in
Python and have two versions of one rule drift apart, `hand` stays in the details
and Look Closer loads them at boot. It is the deep game, and it has to grade
against the prose in any case. Arrange, which is the page people arrive on, keeps
the small index and fetches the rest while they play.
"""
import re

from build.vocab import slugs

# What the catalogue says when a book is painted or gilded rather than merely
# rubricated. Strictly, to illuminate is to apply gold; in loose scholarly use it
# covers painted pictures too, so both are admitted here and penwork initials are
# not. Matched against the decoration notes, which are the cataloguer's words.
PAINTED = re.compile(
    r"miniature|historiated|illuminat|\bgold\b|gilt|burnish|full[- ]page",
    re.IGNORECASE)

# Every field the browser needs before a round is committed.
PLAY_FIELDS = (
    "id",             # the join between index and details
    "shelfmark",      # drawn on the card after a commit
    "not_before",     # the whole ordering game
    "not_after",
    "date_display",   # drawn on the card after a commit, so not reveal-only
    "material",       # a collection filter, and a Look Closer answer
    "region",         # a collection filter, a Look Closer answer, the Shelf
    "language",       # a Look Closer answer
    "iiif",           # the image
    "catalogue",      # the link out, offered on every card
    "attribution",    # the image credit, which must never be absent
)


def index_row(record: dict, slug: str = "") -> dict:
    """The play-time view of one record, plus how to link to its own page."""
    row = {k: record[k] for k in PLAY_FIELDS if k in record}
    row["decorated"] = bool(record.get("decoration"))
    row["painted"] = bool(PAINTED.search(" ".join(record.get("decoration") or [])))
    row["slug"] = slug or record["id"]
    return row


def detail_row(record: dict) -> dict:
    """Everything else: what the reveal shows once the round is over."""
    return {k: v for k, v in record.items() if k not in PLAY_FIELDS}


def split(records: list[dict]) -> tuple[list[dict], dict[str, dict]]:
    """(index, details-by-id). Together they hold every field, and no more.

    `slug` is in the index rather than the details because it is identity, like
    `id`: the search page and the Shelf both need to link to a manuscript
    without first fetching the catalogue prose.
    """
    by_id = slugs(records)
    return ([index_row(r, by_id[r["id"]]) for r in records],
            {r["id"]: detail_row(r) for r in records})
