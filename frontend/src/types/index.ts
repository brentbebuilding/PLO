// Card types
export type Suit = 'c' | 'd' | 'h' | 's';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface PlayerHand {
  cards: Card[];
}

// API types
export interface EquityResult {
  player_index: number;
  cards: string[];
  win_percentage: number;
  tie_percentage: number;
  equity: number;
}

export interface EquityResponse {
  stage: 'preflop' | 'flop' | 'turn' | 'river';
  board: string[];
  simulations_run: number;
  players: EquityResult[];
}

export interface DetectedCard {
  rank: string;
  suit: string;
  card: string;
  confidence: number;
}

export interface CardDetectionResponse {
  success: boolean;
  players: { cards: DetectedCard[] }[];
  board: DetectedCard[];
  unassigned: DetectedCard[];
  message?: string;
}

// UI state types
export interface PlayerState {
  id: number;
  cards: (Card | null)[];
}

export interface GameState {
  players: PlayerState[];
  board: (Card | null)[];
  stage: 'preflop' | 'flop' | 'turn' | 'river';
}
