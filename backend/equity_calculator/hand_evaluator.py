"""
Hand evaluation for PLO poker.

In PLO, a player must use exactly 2 of their 4 hole cards
and exactly 3 of the 5 community cards to make the best 5-card hand.
"""
from typing import List, Tuple, Optional
from itertools import combinations
from enum import IntEnum
from .cards import Card, Rank


class HandRank(IntEnum):
    """Poker hand rankings from lowest to highest."""
    HIGH_CARD = 1
    ONE_PAIR = 2
    TWO_PAIR = 3
    THREE_OF_A_KIND = 4
    STRAIGHT = 5
    FLUSH = 6
    FULL_HOUSE = 7
    FOUR_OF_A_KIND = 8
    STRAIGHT_FLUSH = 9


class HandEvaluator:
    """Evaluates poker hands and determines winners."""

    @staticmethod
    def evaluate_5_cards(cards: List[Card]) -> Tuple[HandRank, List[int]]:
        """
        Evaluate a 5-card poker hand.

        Returns:
            Tuple of (HandRank, kickers) where kickers is a list of ranks
            used for tiebreaking, ordered from most to least significant.
        """
        if len(cards) != 5:
            raise ValueError("Must provide exactly 5 cards")

        ranks = sorted([c.rank for c in cards], reverse=True)
        suits = [c.suit for c in cards]

        # Check for flush
        is_flush = len(set(suits)) == 1

        # Check for straight
        is_straight, straight_high = HandEvaluator._check_straight(ranks)

        # Count rank occurrences
        rank_counts = {}
        for r in ranks:
            rank_counts[r] = rank_counts.get(r, 0) + 1

        counts = sorted(rank_counts.values(), reverse=True)
        sorted_by_count = sorted(rank_counts.keys(),
                                  key=lambda r: (rank_counts[r], r),
                                  reverse=True)

        # Straight flush
        if is_straight and is_flush:
            return (HandRank.STRAIGHT_FLUSH, [straight_high])

        # Four of a kind
        if counts == [4, 1]:
            quad_rank = sorted_by_count[0]
            kicker = sorted_by_count[1]
            return (HandRank.FOUR_OF_A_KIND, [quad_rank, kicker])

        # Full house
        if counts == [3, 2]:
            trips_rank = sorted_by_count[0]
            pair_rank = sorted_by_count[1]
            return (HandRank.FULL_HOUSE, [trips_rank, pair_rank])

        # Flush
        if is_flush:
            return (HandRank.FLUSH, ranks)

        # Straight
        if is_straight:
            return (HandRank.STRAIGHT, [straight_high])

        # Three of a kind
        if counts == [3, 1, 1]:
            trips_rank = sorted_by_count[0]
            kickers = [r for r in ranks if r != trips_rank]
            return (HandRank.THREE_OF_A_KIND, [trips_rank] + sorted(kickers, reverse=True))

        # Two pair
        if counts == [2, 2, 1]:
            pairs = [r for r in sorted_by_count if rank_counts[r] == 2]
            pairs.sort(reverse=True)
            kicker = [r for r in ranks if rank_counts[r] == 1][0]
            return (HandRank.TWO_PAIR, pairs + [kicker])

        # One pair
        if counts == [2, 1, 1, 1]:
            pair_rank = sorted_by_count[0]
            kickers = sorted([r for r in ranks if r != pair_rank], reverse=True)
            return (HandRank.ONE_PAIR, [pair_rank] + kickers)

        # High card
        return (HandRank.HIGH_CARD, ranks)

    @staticmethod
    def _check_straight(ranks: List[Rank]) -> Tuple[bool, int]:
        """
        Check if the ranks form a straight.

        Returns:
            (is_straight, high_card) tuple
        """
        unique_ranks = sorted(set(ranks), reverse=True)
        if len(unique_ranks) != 5:
            return (False, 0)

        # Check for regular straight
        if unique_ranks[0] - unique_ranks[4] == 4:
            return (True, unique_ranks[0])

        # Check for wheel (A-2-3-4-5)
        if unique_ranks == [Rank.ACE, Rank.FIVE, Rank.FOUR, Rank.THREE, Rank.TWO]:
            return (True, Rank.FIVE)  # 5-high straight

        return (False, 0)

    @staticmethod
    def compare_hands(hand1: Tuple[HandRank, List[int]],
                      hand2: Tuple[HandRank, List[int]]) -> int:
        """
        Compare two evaluated hands.

        Returns:
            1 if hand1 wins, -1 if hand2 wins, 0 if tie
        """
        if hand1[0] != hand2[0]:
            return 1 if hand1[0] > hand2[0] else -1

        # Same hand rank, compare kickers
        for k1, k2 in zip(hand1[1], hand2[1]):
            if k1 != k2:
                return 1 if k1 > k2 else -1

        return 0

    @staticmethod
    def best_plo_hand(hole_cards: List[Card],
                       board: List[Card]) -> Tuple[HandRank, List[int], List[Card]]:
        """
        Find the best PLO hand using exactly 2 hole cards and 3 board cards.

        Args:
            hole_cards: List of 4 hole cards
            board: List of 3-5 community cards

        Returns:
            Tuple of (HandRank, kickers, best_5_cards)
        """
        if len(hole_cards) != 4:
            raise ValueError("PLO requires exactly 4 hole cards")
        if len(board) < 3:
            raise ValueError("Need at least 3 board cards")

        best_hand: Optional[Tuple[HandRank, List[int]]] = None
        best_cards: Optional[List[Card]] = None

        # Try all combinations of 2 hole cards and 3 board cards
        for hole_combo in combinations(hole_cards, 2):
            for board_combo in combinations(board, 3):
                five_cards = list(hole_combo) + list(board_combo)
                hand_eval = HandEvaluator.evaluate_5_cards(five_cards)

                if best_hand is None or HandEvaluator.compare_hands(hand_eval, best_hand) > 0:
                    best_hand = hand_eval
                    best_cards = five_cards

        return (best_hand[0], best_hand[1], best_cards)

    @staticmethod
    def hand_rank_name(hand_rank: HandRank) -> str:
        """Get the human-readable name of a hand rank."""
        names = {
            HandRank.HIGH_CARD: "High Card",
            HandRank.ONE_PAIR: "One Pair",
            HandRank.TWO_PAIR: "Two Pair",
            HandRank.THREE_OF_A_KIND: "Three of a Kind",
            HandRank.STRAIGHT: "Straight",
            HandRank.FLUSH: "Flush",
            HandRank.FULL_HOUSE: "Full House",
            HandRank.FOUR_OF_A_KIND: "Four of a Kind",
            HandRank.STRAIGHT_FLUSH: "Straight Flush"
        }
        return names.get(hand_rank, "Unknown")
