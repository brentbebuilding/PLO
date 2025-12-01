"""
Card and Deck representations for PLO poker.
"""
from typing import List, Optional, Set
from dataclasses import dataclass
from enum import IntEnum
import random


class Suit(IntEnum):
    CLUBS = 0
    DIAMONDS = 1
    HEARTS = 2
    SPADES = 3


class Rank(IntEnum):
    TWO = 2
    THREE = 3
    FOUR = 4
    FIVE = 5
    SIX = 6
    SEVEN = 7
    EIGHT = 8
    NINE = 9
    TEN = 10
    JACK = 11
    QUEEN = 12
    KING = 13
    ACE = 14


SUIT_SYMBOLS = {
    Suit.CLUBS: 'c',
    Suit.DIAMONDS: 'd',
    Suit.HEARTS: 'h',
    Suit.SPADES: 's'
}

SUIT_NAMES = {
    Suit.CLUBS: 'Clubs',
    Suit.DIAMONDS: 'Diamonds',
    Suit.HEARTS: 'Hearts',
    Suit.SPADES: 'Spades'
}

RANK_SYMBOLS = {
    Rank.TWO: '2',
    Rank.THREE: '3',
    Rank.FOUR: '4',
    Rank.FIVE: '5',
    Rank.SIX: '6',
    Rank.SEVEN: '7',
    Rank.EIGHT: '8',
    Rank.NINE: '9',
    Rank.TEN: 'T',
    Rank.JACK: 'J',
    Rank.QUEEN: 'Q',
    Rank.KING: 'K',
    Rank.ACE: 'A'
}

SYMBOL_TO_RANK = {v: k for k, v in RANK_SYMBOLS.items()}
SYMBOL_TO_SUIT = {v: k for k, v in SUIT_SYMBOLS.items()}


@dataclass(frozen=True)
class Card:
    """Represents a single playing card."""
    rank: Rank
    suit: Suit

    def __str__(self) -> str:
        return f"{RANK_SYMBOLS[self.rank]}{SUIT_SYMBOLS[self.suit]}"

    def __repr__(self) -> str:
        return f"Card({self})"

    def __hash__(self) -> int:
        return hash((self.rank, self.suit))

    def __eq__(self, other) -> bool:
        if not isinstance(other, Card):
            return False
        return self.rank == other.rank and self.suit == other.suit

    def __lt__(self, other) -> bool:
        if not isinstance(other, Card):
            return NotImplemented
        if self.rank != other.rank:
            return self.rank < other.rank
        return self.suit < other.suit

    @classmethod
    def from_string(cls, s: str) -> 'Card':
        """
        Parse a card from a string like 'As', 'Kh', 'Tc', '2d'.
        """
        if len(s) != 2:
            raise ValueError(f"Invalid card string: {s}")

        rank_char = s[0].upper()
        suit_char = s[1].lower()

        if rank_char not in SYMBOL_TO_RANK:
            raise ValueError(f"Invalid rank: {rank_char}")
        if suit_char not in SYMBOL_TO_SUIT:
            raise ValueError(f"Invalid suit: {suit_char}")

        return cls(SYMBOL_TO_RANK[rank_char], SYMBOL_TO_SUIT[suit_char])

    def to_index(self) -> int:
        """Convert card to a unique index 0-51."""
        return (self.rank - 2) * 4 + self.suit


class Deck:
    """Represents a standard 52-card deck."""

    def __init__(self, exclude: Optional[Set[Card]] = None):
        """
        Create a new deck, optionally excluding certain cards.

        Args:
            exclude: Set of cards to exclude from the deck
        """
        self.cards: List[Card] = []
        exclude = exclude or set()

        for rank in Rank:
            for suit in Suit:
                card = Card(rank, suit)
                if card not in exclude:
                    self.cards.append(card)

    def shuffle(self) -> None:
        """Shuffle the deck in place."""
        random.shuffle(self.cards)

    def deal(self, n: int = 1) -> List[Card]:
        """Deal n cards from the top of the deck."""
        if n > len(self.cards):
            raise ValueError(f"Cannot deal {n} cards, only {len(self.cards)} remaining")
        dealt = self.cards[:n]
        self.cards = self.cards[n:]
        return dealt

    def __len__(self) -> int:
        return len(self.cards)

    def copy(self) -> 'Deck':
        """Create a copy of the deck."""
        new_deck = Deck.__new__(Deck)
        new_deck.cards = self.cards.copy()
        return new_deck


def parse_cards(card_strings: List[str]) -> List[Card]:
    """Parse a list of card strings into Card objects."""
    return [Card.from_string(s) for s in card_strings]


def cards_to_string(cards: List[Card]) -> str:
    """Convert a list of cards to a space-separated string."""
    return ' '.join(str(card) for card in cards)
