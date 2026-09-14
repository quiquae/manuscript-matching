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

One boolean moves to the index in place of the prose it stands for: `decorated`,
for the Illuminated filter and the decoration credit in scoring. It is exactly
equivalent to the test it replaces, which was `(decoration ?? []).length > 0`.

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

# Every field the browser needs before a round is committed.
PLAY_FIELDS = (
    "id",             # the join between index and details
    "shelfmark",      # drawn on the card after a commit
    "not_before",     # the whole ordering game
    "not_after",
    "material",       # a collection filter, and a Look Closer answer
    "region",         # a collection filter, a Look Closer answer, the Shelf
    "language",       # a Look Closer answer
    "iiif",           # the image
    "catalogue",      # the link out, offered on every card
    "attribution",    # the image credit, which must never be absent
)


def index_row(record: dict) -> dict:
    """The play-time view of one record."""
    row = {k: record[k] for k in PLAY_FIELDS if k in record}
    row["decorated"] = bool(record.get("decoration"))
    return row


def detail_row(record: dict) -> dict:
    """Everything else: what the reveal shows once the round is over."""
    return {k: v for k, v in record.items() if k not in PLAY_FIELDS}


def split(records: list[dict]) -> tuple[list[dict], dict[str, dict]]:
    """(index, details-by-id). Together they hold every field, and no more."""
    return [index_row(r) for r in records], {r["id"]: detail_row(r) for r in records}
