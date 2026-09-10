from build.decks import (
    DECK_LENGTH, GAP_FLOOR, build_daily_decks, build_deck, gap_for, is_legal,
)


def _pool(n=120, step=20):
    return [(f"m{i}", 800 + i * step, 800 + i * step + 10) for i in range(n)]


def test_gap_ladder_decays_to_a_floor():
    assert gap_for(1) == 300
    assert gap_for(2) == 225
    assert gap_for(3) == 169
    assert gap_for(20) == GAP_FLOOR
    assert all(gap_for(i) >= gap_for(i + 1) for i in range(1, 20))


def test_card_overlapping_a_neighbour_is_illegal():
    board = [("a", 1000, 1050), ("c", 1400, 1450)]
    assert not is_legal(board, ("b", 1040, 1100), min_gap=0)
    assert is_legal(board, ("b", 1200, 1250), min_gap=0)


def test_min_gap_is_enforced_against_both_neighbours():
    board = [("a", 1000, 1050), ("c", 1400, 1450)]
    assert is_legal(board, ("b", 1200, 1250), min_gap=100)
    assert not is_legal(board, ("b", 1100, 1150), min_gap=100)


def test_card_before_or_after_everything_only_has_one_neighbour():
    board = [("a", 1000, 1050)]
    assert is_legal(board, ("z", 500, 550), min_gap=100)
    assert not is_legal(board, ("z", 900, 990), min_gap=100)


def test_first_card_is_always_legal():
    assert is_legal([], ("a", 1000, 1050), min_gap=300)


def test_build_deck_is_deterministic():
    assert build_deck(_pool(), seed="2026-09-09") == build_deck(_pool(), seed="2026-09-09")


def test_build_deck_has_no_repeats():
    deck = build_deck(_pool())
    assert len(deck) == len(set(deck)) == DECK_LENGTH


def test_different_seeds_give_different_decks():
    assert build_deck(_pool(), seed="2026-09-09") != build_deck(_pool(), seed="2026-09-10")


def test_daily_decks_cover_every_requested_day():
    decks = build_daily_decks(_pool(), ["2026-09-09", "2026-09-10"])
    assert set(decks) == {"2026-09-09", "2026-09-10"}
    assert all(len(v) == DECK_LENGTH for v in decks.values())


def test_every_dealt_deck_is_internally_legal():
    """The property that matters: no deck ever contains two overlapping cards."""
    pool = [(f"m{i}", 800 + i * 7, 800 + i * 7 + 30) for i in range(400)]
    by_id = {c[0]: c for c in pool}
    for day in range(200):
        deck = build_deck(pool, seed=f"day-{day}")
        ranges = sorted((by_id[i][1], by_id[i][2]) for i in deck)
        for (_, end), (start, _) in zip(ranges, ranges[1:]):
            assert start > end, f"overlap in deck for day-{day}"


def test_deck_shrinks_rather_than_repeating_when_the_pool_is_tiny():
    tiny = [("a", 1000, 1010), ("b", 1400, 1410)]
    deck = build_deck(tiny)
    assert len(deck) == len(set(deck)) <= 2


def test_deck_carries_an_anchor_plus_the_played_rounds():
    """The first card is dealt face-up as a reference point.

    Without it the first round has an empty board, one slot, and therefore no
    decision to make -- a free 1000 points. With it, round one is a genuine
    older-or-newer call.
    """
    from build.decks import ANCHOR, DECK_LENGTH, PLAYED_ROUNDS
    assert ANCHOR == 1
    assert DECK_LENGTH == PLAYED_ROUNDS + ANCHOR
    deck = build_deck(_pool(n=300))
    assert len(deck) == DECK_LENGTH
