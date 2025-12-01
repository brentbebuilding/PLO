/**
 * PLO Equity Calculator - Client-side implementation
 *
 * Uses Monte Carlo simulation to calculate win percentages
 * for PLO (Pot Limit Omaha) poker hands.
 */

import { Card, Rank, Suit } from '../types';

// Hand rankings
enum HandRank {
  HIGH_CARD = 1,
  ONE_PAIR = 2,
  TWO_PAIR = 3,
  THREE_OF_A_KIND = 4,
  STRAIGHT = 5,
  FLUSH = 6,
  FULL_HOUSE = 7,
  FOUR_OF_A_KIND = 8,
  STRAIGHT_FLUSH = 9,
}

// Rank values for comparison
const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

interface EvaluatedHand {
  rank: HandRank;
  kickers: number[];
}

interface EquityResult {
  playerIndex: number;
  cards: string[];
  winPercentage: number;
  tiePercentage: number;
  equity: number;
}

export interface SimulationResult {
  stage: string;
  board: string[];
  simulationsRun: number;
  players: EquityResult[];
}

/**
 * Create a full deck of cards, optionally excluding certain cards.
 */
function createDeck(exclude: Set<string>): Card[] {
  const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const suits: Suit[] = ['c', 'd', 'h', 's'];
  const deck: Card[] = [];

  for (const rank of ranks) {
    for (const suit of suits) {
      const cardStr = `${rank}${suit}`;
      if (!exclude.has(cardStr)) {
        deck.push({ rank, suit });
      }
    }
  }

  return deck;
}

/**
 * Shuffle array in place using Fisher-Yates algorithm.
 */
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Generate all combinations of k elements from array.
 */
function combinations<T>(array: T[], k: number): T[][] {
  const result: T[][] = [];

  function combine(start: number, combo: T[]) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < array.length; i++) {
      combo.push(array[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  }

  combine(0, []);
  return result;
}

/**
 * Check if ranks form a straight.
 */
function checkStraight(ranks: number[]): { isStraight: boolean; highCard: number } {
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);

  if (uniqueRanks.length !== 5) {
    return { isStraight: false, highCard: 0 };
  }

  // Regular straight
  if (uniqueRanks[0] - uniqueRanks[4] === 4) {
    return { isStraight: true, highCard: uniqueRanks[0] };
  }

  // Wheel (A-2-3-4-5)
  if (
    uniqueRanks[0] === 14 &&
    uniqueRanks[1] === 5 &&
    uniqueRanks[2] === 4 &&
    uniqueRanks[3] === 3 &&
    uniqueRanks[4] === 2
  ) {
    return { isStraight: true, highCard: 5 };
  }

  return { isStraight: false, highCard: 0 };
}

/**
 * Evaluate a 5-card poker hand.
 */
function evaluate5Cards(cards: Card[]): EvaluatedHand {
  const ranks = cards.map((c) => RANK_VALUES[c.rank]).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);

  const isFlush = new Set(suits).size === 1;
  const { isStraight, highCard: straightHigh } = checkStraight(ranks);

  // Count rank occurrences
  const rankCounts: Map<number, number> = new Map();
  for (const r of ranks) {
    rankCounts.set(r, (rankCounts.get(r) || 0) + 1);
  }

  const counts = [...rankCounts.values()].sort((a, b) => b - a);
  const sortedByCount = [...rankCounts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0] - a[0];
    })
    .map((e) => e[0]);

  // Straight flush
  if (isStraight && isFlush) {
    return { rank: HandRank.STRAIGHT_FLUSH, kickers: [straightHigh] };
  }

  // Four of a kind
  if (counts[0] === 4) {
    return {
      rank: HandRank.FOUR_OF_A_KIND,
      kickers: [sortedByCount[0], sortedByCount[1]],
    };
  }

  // Full house
  if (counts[0] === 3 && counts[1] === 2) {
    return {
      rank: HandRank.FULL_HOUSE,
      kickers: [sortedByCount[0], sortedByCount[1]],
    };
  }

  // Flush
  if (isFlush) {
    return { rank: HandRank.FLUSH, kickers: ranks };
  }

  // Straight
  if (isStraight) {
    return { rank: HandRank.STRAIGHT, kickers: [straightHigh] };
  }

  // Three of a kind
  if (counts[0] === 3) {
    const kickers = ranks.filter((r) => r !== sortedByCount[0]).slice(0, 2);
    return {
      rank: HandRank.THREE_OF_A_KIND,
      kickers: [sortedByCount[0], ...kickers],
    };
  }

  // Two pair
  if (counts[0] === 2 && counts[1] === 2) {
    const pairs = sortedByCount.filter((r) => rankCounts.get(r) === 2).sort((a, b) => b - a);
    const kicker = ranks.find((r) => rankCounts.get(r) === 1)!;
    return {
      rank: HandRank.TWO_PAIR,
      kickers: [...pairs, kicker],
    };
  }

  // One pair
  if (counts[0] === 2) {
    const pairRank = sortedByCount[0];
    const kickers = ranks.filter((r) => r !== pairRank).slice(0, 3);
    return {
      rank: HandRank.ONE_PAIR,
      kickers: [pairRank, ...kickers],
    };
  }

  // High card
  return { rank: HandRank.HIGH_CARD, kickers: ranks };
}

/**
 * Compare two evaluated hands.
 * Returns: 1 if hand1 wins, -1 if hand2 wins, 0 if tie.
 */
function compareHands(hand1: EvaluatedHand, hand2: EvaluatedHand): number {
  if (hand1.rank !== hand2.rank) {
    return hand1.rank > hand2.rank ? 1 : -1;
  }

  for (let i = 0; i < hand1.kickers.length; i++) {
    if (hand1.kickers[i] !== hand2.kickers[i]) {
      return hand1.kickers[i] > hand2.kickers[i] ? 1 : -1;
    }
  }

  return 0;
}

/**
 * Find the best PLO hand using exactly 2 hole cards and 3 board cards.
 */
function bestPLOHand(holeCards: Card[], board: Card[]): EvaluatedHand {
  let bestHand: EvaluatedHand | null = null;

  // Try all combinations of 2 hole cards and 3 board cards
  const holeCombos = combinations(holeCards, 2);
  const boardCombos = combinations(board, 3);

  for (const holeCombo of holeCombos) {
    for (const boardCombo of boardCombos) {
      const fiveCards = [...holeCombo, ...boardCombo];
      const handEval = evaluate5Cards(fiveCards);

      if (bestHand === null || compareHands(handEval, bestHand) > 0) {
        bestHand = handEval;
      }
    }
  }

  return bestHand!;
}

/**
 * Find the indices of the winning hand(s).
 */
function findWinners(hands: EvaluatedHand[]): number[] {
  if (hands.length === 0) return [];

  let bestIndices = [0];
  let bestHand = hands[0];

  for (let i = 1; i < hands.length; i++) {
    const comparison = compareHands(hands[i], bestHand);
    if (comparison > 0) {
      bestHand = hands[i];
      bestIndices = [i];
    } else if (comparison === 0) {
      bestIndices.push(i);
    }
  }

  return bestIndices;
}

/**
 * Get the stage name based on board card count.
 */
function getStage(boardCount: number): string {
  if (boardCount === 0) return 'preflop';
  if (boardCount <= 3) return 'flop';
  if (boardCount === 4) return 'turn';
  return 'river';
}

/**
 * Convert card to string representation.
 */
function cardToString(card: Card): string {
  return `${card.rank}${card.suit}`;
}

/**
 * Calculate PLO equity using Monte Carlo simulation.
 * Runs entirely in the browser.
 */
export function calculateEquity(
  playerHands: Card[][],
  board: Card[],
  numSimulations: number = 10000
): SimulationResult {
  if (playerHands.length < 2) {
    throw new Error('Need at least 2 players');
  }

  for (let i = 0; i < playerHands.length; i++) {
    if (playerHands[i].length !== 4) {
      throw new Error(`Player ${i + 1} must have exactly 4 cards`);
    }
  }

  // Get all known cards
  const knownCards = new Set<string>();
  for (const hand of playerHands) {
    for (const card of hand) {
      const cardStr = cardToString(card);
      if (knownCards.has(cardStr)) {
        throw new Error(`Duplicate card: ${cardStr}`);
      }
      knownCards.add(cardStr);
    }
  }
  for (const card of board) {
    const cardStr = cardToString(card);
    if (knownCards.has(cardStr)) {
      throw new Error(`Duplicate card on board: ${cardStr}`);
    }
    knownCards.add(cardStr);
  }

  const numPlayers = playerHands.length;
  const wins: number[] = new Array(numPlayers).fill(0);
  const ties: number[] = new Array(numPlayers).fill(0);

  // Run simulations
  for (let sim = 0; sim < numSimulations; sim++) {
    // Create and shuffle deck
    const deck = shuffle(createDeck(knownCards));

    // Complete the board
    const cardsNeeded = 5 - board.length;
    const simulatedBoard = [...board, ...deck.slice(0, cardsNeeded)];

    // Evaluate each player's best hand
    const bestHands: EvaluatedHand[] = playerHands.map((hand) =>
      bestPLOHand(hand, simulatedBoard)
    );

    // Determine winner(s)
    const winnerIndices = findWinners(bestHands);

    if (winnerIndices.length === 1) {
      wins[winnerIndices[0]]++;
    } else {
      // Tie - split the pot
      const tieShare = 1.0 / winnerIndices.length;
      for (const idx of winnerIndices) {
        ties[idx] += tieShare;
      }
    }
  }

  // Calculate percentages
  const players: EquityResult[] = playerHands.map((hand, i) => {
    const winPct = (wins[i] / numSimulations) * 100;
    const tiePct = (ties[i] / numSimulations) * 100;

    return {
      playerIndex: i,
      cards: hand.map(cardToString),
      winPercentage: Math.round(winPct * 100) / 100,
      tiePercentage: Math.round(tiePct * 100) / 100,
      equity: Math.round((winPct + tiePct) * 100) / 100,
    };
  });

  return {
    stage: getStage(board.length),
    board: board.map(cardToString),
    simulationsRun: numSimulations,
    players,
  };
}

/**
 * Async wrapper that yields to UI between batches for responsiveness.
 */
export async function calculateEquityAsync(
  playerHands: Card[][],
  board: Card[],
  numSimulations: number = 10000,
  onProgress?: (progress: number) => void
): Promise<SimulationResult> {
  // For small simulations, just run synchronously
  if (numSimulations <= 5000) {
    return calculateEquity(playerHands, board, numSimulations);
  }

  // For larger simulations, run in batches to keep UI responsive
  const batchSize = 2500;
  const numBatches = Math.ceil(numSimulations / batchSize);

  let accumulatedResult: SimulationResult | null = null;

  for (let batch = 0; batch < numBatches; batch++) {
    const simsThisBatch = Math.min(batchSize, numSimulations - batch * batchSize);
    const batchResult = calculateEquity(playerHands, board, simsThisBatch);

    if (accumulatedResult === null) {
      accumulatedResult = batchResult;
    } else {
      // Merge results
      const totalSims = accumulatedResult.simulationsRun + batchResult.simulationsRun;
      for (let i = 0; i < accumulatedResult.players.length; i++) {
        const p1 = accumulatedResult.players[i];
        const p2 = batchResult.players[i];
        const w1 = accumulatedResult.simulationsRun;
        const w2 = batchResult.simulationsRun;

        p1.winPercentage = (p1.winPercentage * w1 + p2.winPercentage * w2) / totalSims * (totalSims / (w1 + w2));
        p1.tiePercentage = (p1.tiePercentage * w1 + p2.tiePercentage * w2) / totalSims * (totalSims / (w1 + w2));
        p1.equity = p1.winPercentage + p1.tiePercentage;
      }
      accumulatedResult.simulationsRun = totalSims;
    }

    if (onProgress) {
      onProgress(((batch + 1) / numBatches) * 100);
    }

    // Yield to UI
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return accumulatedResult!;
}
