"""Deck legality and daily deck generation.

Every rule that decides whether an answer is defensible lives here, in Python,
under test. The browser never re-implements it for the daily mode.
"""
import random
from bisect import bisect_left

Card = tuple[str, int, int]  # (id, not_before, not_after)

GAP_START = 300
GAP_FLOOR = 25
GAP_DECAY = 0.75
CANDIDATES_PER_CENTURY = 40

# The first card is dealt face-up as an anchor. Without it the opening round
# has an empty board and therefore exactly one slot -- no decision, free points.
# With it, round one is a real older-or-newer call.
ANCHOR = 1
PLAYED_ROUNDS = 10
DECK_LENGTH = PLAYED_ROUNDS + ANCHOR


def gap_for(round_index: int) -> int:
    """Minimum years between a new card and its neighbours, by round (1-based)."""
    return max(GAP_FLOOR, round(GAP_START * GAP_DECAY ** (round_index - 1)))


def _neighbours(board: list[Card], card: Card) -> tuple[Card | None, Card | None]:
    """The cards that would sit either side of `card` in the true order."""
    i = bisect_left([c[1] for c in board], card[1])
    return (board[i - 1] if i > 0 else None, board[i] if i < len(board) else None)


def is_legal(board: list[Card], card: Card, min_gap: int) -> bool:
    """True when the card's date range clears both neighbours by at least min_gap years.

    This is what makes the correct slot unambiguous: if a card's range overlapped
    a neighbour's, two different placements would both be defensible.
    """
    before, after = _neighbours(board, card)
    if before is not None and card[1] - before[2] < min_gap:
        return False
    if after is not None and after[1] - card[2] < min_gap:
        return False
    return True


def _place(board: list[Card], card: Card, chosen: list[str]) -> None:
    board.append(card)
    board.sort(key=lambda c: c[1])
    chosen.append(card[0])


def build_deck(pool: list[Card], seed: str = "", length: int = DECK_LENGTH) -> list[str]:
    """A deck whose every card is legal at the moment it is dealt.

    Candidates are stratified by century, because the playable set is 41%
    fifteenth-century and an unstratified draw jams the board in one place.
    Difficulty rises via gap_for(): wide gaps early, a 25-year floor later.
    """
    rng = random.Random(seed)
    by_century: dict[int, list[Card]] = {}
    for card in pool:
        by_century.setdefault(card[1] // 100, []).append(card)
    for cards in by_century.values():
        rng.shuffle(cards)
    centuries = sorted(by_century)

    board: list[Card] = []
    chosen: list[str] = []
    for round_index in range(1, length + 1):
        candidates: list[Card] = []
        for century in rng.sample(centuries, len(centuries)):
            candidates.extend(by_century[century][:CANDIDATES_PER_CENTURY])
        rng.shuffle(candidates)
        fresh = [c for c in candidates if c[0] not in chosen]

        for min_gap in (gap_for(round_index), GAP_FLOOR):
            match = next((c for c in fresh if is_legal(board, c, min_gap)), None)
            if match is not None:
                _place(board, match, chosen)
                break
        else:
            break   # nothing legal remains; a short deck beats an unfair one
    return chosen


def build_daily_decks(
    pool: list[Card], days: list[str], length: int = DECK_LENGTH
) -> dict[str, list[str]]:
    """One deck per date, seeded by the date so every player gets the same run."""
    return {day: build_deck(pool, seed=day, length=length) for day in days}
