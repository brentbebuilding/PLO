"""
PLO Equity Calculator using Monte Carlo simulation.

Calculates win/tie percentages for each player in a PLO hand.
"""
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from .cards import Card, Deck
from .hand_evaluator import HandEvaluator
import random


@dataclass
class EquityResult:
    """Results of an equity calculation for a single player."""
    player_index: int
    win_percentage: float
    tie_percentage: float
    equity: float  # win + tie/n_tying_players
    hand_cards: List[str]


@dataclass
class SimulationResult:
    """Complete results of an equity simulation."""
    players: List[EquityResult]
    board: List[str]
    simulations_run: int
    stage: str  # 'preflop', 'flop', 'turn', 'river'


class PLOEquityCalculator:
    """Calculate PLO equity using Monte Carlo simulation."""

    def __init__(self, num_simulations: int = 10000):
        """
        Initialize the calculator.

        Args:
            num_simulations: Number of Monte Carlo simulations to run
        """
        self.num_simulations = num_simulations

    def calculate_equity(
        self,
        player_hands: List[List[Card]],
        board: Optional[List[Card]] = None
    ) -> SimulationResult:
        """
        Calculate equity for all players.

        Args:
            player_hands: List of player hands (each hand is 4 cards)
            board: Community cards (0-5 cards)

        Returns:
            SimulationResult with equity percentages for each player
        """
        if not player_hands:
            raise ValueError("Need at least one player")

        for i, hand in enumerate(player_hands):
            if len(hand) != 4:
                raise ValueError(f"Player {i+1} must have exactly 4 cards, got {len(hand)}")

        board = board or []
        if len(board) > 5:
            raise ValueError("Board cannot have more than 5 cards")

        # Determine stage
        stage = self._get_stage(board)

        # Get all known cards
        known_cards = set()
        for hand in player_hands:
            for card in hand:
                if card in known_cards:
                    raise ValueError(f"Duplicate card: {card}")
                known_cards.add(card)
        for card in board:
            if card in known_cards:
                raise ValueError(f"Duplicate card on board: {card}")
            known_cards.add(card)

        # Run simulations
        num_players = len(player_hands)
        wins = [0] * num_players
        ties = [0.0] * num_players

        for _ in range(self.num_simulations):
            # Create deck without known cards
            deck = Deck(exclude=known_cards)
            deck.shuffle()

            # Complete the board
            cards_needed = 5 - len(board)
            simulated_board = list(board) + deck.deal(cards_needed)

            # Evaluate each player's best hand
            best_hands = []
            for hand in player_hands:
                eval_result = HandEvaluator.best_plo_hand(hand, simulated_board)
                best_hands.append((eval_result[0], eval_result[1]))

            # Determine winner(s)
            winner_indices = self._find_winners(best_hands)

            if len(winner_indices) == 1:
                wins[winner_indices[0]] += 1
            else:
                # Tie - split the pot
                tie_share = 1.0 / len(winner_indices)
                for idx in winner_indices:
                    ties[idx] += tie_share

        # Calculate percentages
        results = []
        for i in range(num_players):
            win_pct = (wins[i] / self.num_simulations) * 100
            tie_pct = (ties[i] / self.num_simulations) * 100
            equity = win_pct + tie_pct

            results.append(EquityResult(
                player_index=i,
                win_percentage=round(win_pct, 2),
                tie_percentage=round(tie_pct, 2),
                equity=round(equity, 2),
                hand_cards=[str(c) for c in player_hands[i]]
            ))

        return SimulationResult(
            players=results,
            board=[str(c) for c in board],
            simulations_run=self.num_simulations,
            stage=stage
        )

    def _find_winners(self, hands: List[Tuple]) -> List[int]:
        """Find the indices of the winning hand(s)."""
        if not hands:
            return []

        best_indices = [0]
        best_hand = hands[0]

        for i in range(1, len(hands)):
            comparison = HandEvaluator.compare_hands(hands[i], best_hand)
            if comparison > 0:
                best_hand = hands[i]
                best_indices = [i]
            elif comparison == 0:
                best_indices.append(i)

        return best_indices

    def _get_stage(self, board: List[Card]) -> str:
        """Determine the stage of the hand based on board cards."""
        if len(board) == 0:
            return "preflop"
        elif len(board) == 3:
            return "flop"
        elif len(board) == 4:
            return "turn"
        elif len(board) == 5:
            return "river"
        else:
            return "unknown"


def quick_equity(
    hands: List[List[str]],
    board: Optional[List[str]] = None,
    simulations: int = 10000
) -> Dict:
    """
    Quick helper function to calculate equity from string representations.

    Args:
        hands: List of hands, each hand is a list of card strings like ['As', 'Kh', 'Qd', 'Jc']
        board: Board cards as strings
        simulations: Number of simulations

    Returns:
        Dictionary with equity results
    """
    from .cards import Card

    player_hands = [[Card.from_string(c) for c in hand] for hand in hands]
    board_cards = [Card.from_string(c) for c in (board or [])]

    calculator = PLOEquityCalculator(num_simulations=simulations)
    result = calculator.calculate_equity(player_hands, board_cards)

    return {
        'stage': result.stage,
        'simulations': result.simulations_run,
        'board': result.board,
        'players': [
            {
                'index': p.player_index,
                'cards': p.hand_cards,
                'win': p.win_percentage,
                'tie': p.tie_percentage,
                'equity': p.equity
            }
            for p in result.players
        ]
    }
