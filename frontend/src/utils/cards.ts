import { Card, Rank, Suit } from '../types';

export const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
export const SUITS: Suit[] = ['s', 'h', 'd', 'c'];

export const SUIT_SYMBOLS: Record<Suit, string> = {
  c: '\u2663', // clubs
  d: '\u2666', // diamonds
  h: '\u2665', // hearts
  s: '\u2660', // spades
};

export const SUIT_NAMES: Record<Suit, string> = {
  c: 'Clubs',
  d: 'Diamonds',
  h: 'Hearts',
  s: 'Spades',
};

export const RANK_NAMES: Record<Rank, string> = {
  '2': 'Two',
  '3': 'Three',
  '4': 'Four',
  '5': 'Five',
  '6': 'Six',
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
  'T': 'Ten',
  'J': 'Jack',
  'Q': 'Queen',
  'K': 'King',
  'A': 'Ace',
};

export function cardToString(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function stringToCard(s: string): Card | null {
  if (s.length !== 2) return null;
  const rank = s[0].toUpperCase() as Rank;
  const suit = s[1].toLowerCase() as Suit;
  if (!RANKS.includes(rank) || !SUITS.includes(suit)) return null;
  return { rank, suit };
}

export function isRedSuit(suit: Suit): boolean {
  return suit === 'h' || suit === 'd';
}

export function getSuitColor(suit: Suit): string {
  return isRedSuit(suit) ? 'text-red-600' : 'text-gray-900';
}

export function formatCardDisplay(card: Card): { rank: string; suit: string } {
  const displayRank = card.rank === 'T' ? '10' : card.rank;
  return {
    rank: displayRank,
    suit: SUIT_SYMBOLS[card.suit],
  };
}

export function getAllCards(): Card[] {
  const cards: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      cards.push({ rank, suit });
    }
  }
  return cards;
}

export function isCardEqual(a: Card | null, b: Card | null): boolean {
  if (!a || !b) return false;
  return a.rank === b.rank && a.suit === b.suit;
}

export function isCardInArray(card: Card, cards: (Card | null)[]): boolean {
  return cards.some((c) => isCardEqual(c, card));
}
