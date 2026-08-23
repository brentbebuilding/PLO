/**
 * PLO equity, by exhaustive enumeration.
 *
 * Every possible run-out of the remaining board is counted, so the answer is
 * exact and identical every time the same spot is entered — no sampling, no
 * drift between runs.
 *
 * The trick that makes this cheap is Omaha's own rule. A player must use
 * exactly three cards from the board, so the board only ever reaches the hand
 * through its three-card subsets. Every (player, hole-pair, board-triple)
 * combination is therefore scored once up front — well under 200,000 hand
 * evaluations even in the worst case — and each run-out then reduces to ten
 * table lookups per player instead of sixty hand evaluations.
 *
 * That turns the heaviest case, two players preflop, from ~130 million hand
 * evaluations into ~160,000 plus a tight scan over 1,086,008 boards.
 */

import { Card, Rank, Suit } from '../types';

const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS: Suit[] = ['c', 'd', 'h', 's'];

const RANK_INDEX: Record<string, number> = {};
RANKS.forEach((r, i) => (RANK_INDEX[r] = i));
const SUIT_INDEX: Record<string, number> = {};
SUITS.forEach((s, i) => (SUIT_INDEX[s] = i));

/** A card as a number 0-51: rank index * 4 + suit index. */
function encode(card: Card): number {
  return RANK_INDEX[card.rank] * 4 + SUIT_INDEX[card.suit];
}

function cardToString(card: Card): string {
  return `${card.rank}${card.suit}`;
}

// ---------------------------------------------------------------------------
// Five-card evaluation
// ---------------------------------------------------------------------------

const HIGH_CARD = 0;
const ONE_PAIR = 1;
const TWO_PAIR = 2;
const TRIPS = 3;
const STRAIGHT = 4;
const FLUSH = 5;
const FULL_HOUSE = 6;
const QUADS = 7;
const STRAIGHT_FLUSH = 8;

/**
 * For every 13-bit set of ranks, the top rank of the straight it contains, or
 * -1. Indexed by the mask so straights cost one lookup.
 */
const STRAIGHT_TOP = (() => {
  const table = new Int8Array(1 << 13).fill(-1);
  for (let mask = 0; mask < 1 << 13; mask++) {
    // Five in a row, from ace-high down.
    for (let top = 12; top >= 4; top--) {
      if (((mask >> (top - 4)) & 0b11111) === 0b11111) {
        table[mask] = top;
        break;
      }
    }
    // The wheel: the ace plays low, and the hand is a five-high straight.
    if (table[mask] < 0 && mask & (1 << 12) && (mask & 0b1111) === 0b1111) {
      table[mask] = 3;
    }
  }
  return table;
})();

/** Scratch rank counts, reused so evaluation allocates nothing. */
const counts = new Int32Array(13);

/**
 * Score five cards as a single integer; higher is better.
 *
 * Packed as category in the high bits then up to five kickers, four bits
 * each, so two hands compare with one integer comparison.
 */
function evaluate5(a: number, b: number, c: number, d: number, e: number): number {
  counts.fill(0);
  const ra = a >> 2;
  const rb = b >> 2;
  const rc = c >> 2;
  const rd = d >> 2;
  const re = e >> 2;
  counts[ra]++;
  counts[rb]++;
  counts[rc]++;
  counts[rd]++;
  counts[re]++;

  const mask = (1 << ra) | (1 << rb) | (1 << rc) | (1 << rd) | (1 << re);

  const suit = a & 3;
  const isFlush =
    (b & 3) === suit && (c & 3) === suit && (d & 3) === suit && (e & 3) === suit;

  // A straight needs five distinct ranks, which is exactly when the mask has
  // five bits — the lookup returns -1 otherwise, so no separate check.
  const straightTop = STRAIGHT_TOP[mask];

  if (isFlush && straightTop >= 0) return (STRAIGHT_FLUSH << 20) | (straightTop << 16);

  // Walk the ranks once, high to low, sorting them by how often they appear.
  let quad = -1;
  let trip = -1;
  let pairHigh = -1;
  let pairLow = -1;
  let s1 = -1;
  let s2 = -1;
  let s3 = -1;
  for (let r = 12; r >= 0; r--) {
    const n = counts[r];
    if (n === 0) continue;
    if (n === 4) quad = r;
    else if (n === 3) trip = r;
    else if (n === 2) {
      if (pairHigh < 0) pairHigh = r;
      else pairLow = r;
    } else if (s1 < 0) s1 = r;
    else if (s2 < 0) s2 = r;
    else if (s3 < 0) s3 = r;
  }

  if (quad >= 0) return (QUADS << 20) | (quad << 16) | (s1 << 12);
  if (trip >= 0 && pairHigh >= 0) return (FULL_HOUSE << 20) | (trip << 16) | (pairHigh << 12);
  if (isFlush) {
    // Five distinct ranks by definition, so the singles are the whole hand.
    return (FLUSH << 20) | (s1 << 16) | (s2 << 12) | (s3 << 8) | packLowTwo(mask, s3);
  }
  if (straightTop >= 0) return (STRAIGHT << 20) | (straightTop << 16);
  if (trip >= 0) return (TRIPS << 20) | (trip << 16) | (s1 << 12) | (s2 << 8);
  if (pairLow >= 0) return (TWO_PAIR << 20) | (pairHigh << 16) | (pairLow << 12) | (s1 << 8);
  if (pairHigh >= 0) return (ONE_PAIR << 20) | (pairHigh << 16) | (s1 << 12) | (s2 << 8) | (s3 << 4);
  return (HIGH_CARD << 20) | (s1 << 16) | (s2 << 12) | (s3 << 8) | packLowTwo(mask, s3);
}

/**
 * The fourth and fifth kickers of an unpaired hand.
 *
 * Only the top three singles are tracked in the main scan, so the last two
 * come back off the rank mask.
 */
function packLowTwo(mask: number, afterRank: number): number {
  let fourth = -1;
  let fifth = -1;
  for (let r = afterRank - 1; r >= 0; r--) {
    if (!(mask & (1 << r))) continue;
    if (fourth < 0) fourth = r;
    else {
      fifth = r;
      break;
    }
  }
  return (fourth << 4) | fifth;
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------

export interface PlayerEquity {
  playerIndex: number;
  cards: string[];
  winPercentage: number;
  tiePercentage: number;
  equity: number;
}

export interface SimulationResult {
  stage: string;
  board: string[];
  /** How many complete boards were counted. Every one of them, always. */
  boardsEvaluated: number;
  players: PlayerEquity[];
}

function getStage(boardCount: number): string {
  if (boardCount === 0) return 'preflop';
  if (boardCount <= 3) return 'flop';
  if (boardCount === 4) return 'turn';
  return 'river';
}

/** The six ways to pick two of four hole cards. */
const HOLE_PAIRS = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];

/**
 * Index a three-card subset by its sorted positions, via the combinatorial
 * number system: C(i,1) + C(j,2) + C(k,3) for i < j < k.
 */
function tripleTables(poolSize: number) {
  const c2 = new Int32Array(poolSize);
  const c3 = new Int32Array(poolSize);
  for (let n = 0; n < poolSize; n++) {
    c2[n] = (n * (n - 1)) / 2;
    c3[n] = (n * (n - 1) * (n - 2)) / 6;
  }
  return { c2, c3, size: (poolSize * (poolSize - 1) * (poolSize - 2)) / 6 };
}

export function calculateEquity(playerHands: Card[][], board: Card[]): SimulationResult {
  if (playerHands.length < 2) throw new Error('Need at least 2 players');
  for (let i = 0; i < playerHands.length; i++) {
    if (playerHands[i].length !== 4) {
      throw new Error(`Player ${i + 1} must have exactly 4 cards`);
    }
  }

  const seen = new Set<string>();
  for (const hand of playerHands) {
    for (const card of hand) {
      const s = cardToString(card);
      if (seen.has(s)) throw new Error(`Duplicate card: ${s}`);
      seen.add(s);
    }
  }
  for (const card of board) {
    const s = cardToString(card);
    if (seen.has(s)) throw new Error(`Duplicate card on board: ${s}`);
    seen.add(s);
  }

  const numPlayers = playerHands.length;
  const known = board.length;
  const needed = 5 - known;

  // The pool is every card that can end up on the board: the ones already
  // there first, then the rest of the deck. Board positions are pool indices,
  // and because the known cards come first the indices stay sorted.
  const pool: number[] = board.map(encode);
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      if (!seen.has(`${rank}${suit}`)) pool.push(encode({ rank, suit }));
    }
  }
  const poolSize = pool.length;
  const { c2, c3, size: numTriples } = tripleTables(poolSize);

  // Score every (player, hole pair, board triple) once. Each player's table
  // then holds, for each triple, the best five-card hand they can make with it.
  const holes = playerHands.map(hand => hand.map(encode));
  const tables: Int32Array[] = [];
  for (let p = 0; p < numPlayers; p++) {
    const table = new Int32Array(numTriples).fill(-1);
    const hole = holes[p];
    for (let i = 0; i < poolSize; i++) {
      for (let j = i + 1; j < poolSize; j++) {
        const ij = i + c2[j];
        for (let k = j + 1; k < poolSize; k++) {
          const idx = ij + c3[k];
          let best = -1;
          for (let h = 0; h < 6; h++) {
            const v = evaluate5(hole[HOLE_PAIRS[h][0]], hole[HOLE_PAIRS[h][1]], pool[i], pool[j], pool[k]);
            if (v > best) best = v;
          }
          table[idx] = best;
        }
      }
    }
    tables.push(table);
  }

  const wins = new Float64Array(numPlayers);
  const ties = new Float64Array(numPlayers);
  let boardsEvaluated = 0;

  // Board positions chosen so far, and the best hand each player can make from
  // the triples that lie entirely within them. Carrying the running best down
  // the recursion means each new card only costs the triples that include it.
  const chosen = new Int32Array(5);
  const running: Int32Array[] = [];
  for (let d = 0; d <= 5; d++) running.push(new Int32Array(numPlayers).fill(-1));

  for (let d = 0; d < known; d++) chosen[d] = d;
  // Triples among the known board cards.
  for (let i = 0; i < known; i++) {
    for (let j = i + 1; j < known; j++) {
      for (let k = j + 1; k < known; k++) {
        const idx = i + c2[j] + c3[k];
        for (let p = 0; p < numPlayers; p++) {
          const v = tables[p][idx];
          if (v > running[known][p]) running[known][p] = v;
        }
      }
    }
  }

  const finalValues = new Int32Array(numPlayers);

  const tally = (values: Int32Array) => {
    boardsEvaluated++;
    let best = -1;
    let winners = 0;
    for (let p = 0; p < numPlayers; p++) {
      const v = values[p];
      if (v > best) {
        best = v;
        winners = 1;
      } else if (v === best) {
        winners++;
      }
    }
    if (winners === 1) {
      for (let p = 0; p < numPlayers; p++) {
        if (values[p] === best) {
          wins[p]++;
          break;
        }
      }
    } else {
      const share = 1 / winners;
      for (let p = 0; p < numPlayers; p++) {
        if (values[p] === best) ties[p] += share;
      }
    }
  };

  /** Add board card at pool index `x`, folding in every triple that uses it. */
  const extend = (depth: number, x: number, out: Int32Array) => {
    const prev = running[depth];
    const cx = c3[x];
    for (let p = 0; p < numPlayers; p++) out[p] = prev[p];
    for (let a = 0; a < depth; a++) {
      const ia = chosen[a];
      for (let b = a + 1; b < depth; b++) {
        const idx = ia + c2[chosen[b]] + cx;
        for (let p = 0; p < numPlayers; p++) {
          const v = tables[p][idx];
          if (v > out[p]) out[p] = v;
        }
      }
    }
  };

  const recurse = (depth: number, from: number) => {
    if (depth === 4 && needed > 0) {
      // Innermost level: the six triples that pair the new card with two of
      // the four already down are the only new work, and their first two terms
      // don't change as the last card moves, so they're hoisted out.
      const base = new Int32Array(6);
      let n = 0;
      for (let a = 0; a < 4; a++) {
        for (let b = a + 1; b < 4; b++) base[n++] = chosen[a] + c2[chosen[b]];
      }
      const prev = running[4];
      for (let x = from; x < poolSize; x++) {
        const cx = c3[x];
        for (let p = 0; p < numPlayers; p++) {
          const table = tables[p];
          let best = prev[p];
          for (let t = 0; t < 6; t++) {
            const v = table[base[t] + cx];
            if (v > best) best = v;
          }
          finalValues[p] = best;
        }
        tally(finalValues);
      }
      return;
    }

    if (depth === 5) {
      tally(running[5]);
      return;
    }

    const last = poolSize - (5 - depth);
    for (let x = from; x <= last; x++) {
      chosen[depth] = x;
      extend(depth, x, running[depth + 1]);
      recurse(depth + 1, x + 1);
    }
  };

  recurse(known, known);

  const players: PlayerEquity[] = playerHands.map((hand, i) => {
    const winPct = (wins[i] / boardsEvaluated) * 100;
    const tiePct = (ties[i] / boardsEvaluated) * 100;
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
    boardsEvaluated,
    players,
  };
}
