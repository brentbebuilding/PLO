/**
 * A whole table packed into a URL.
 *
 * The app is a static page with no server behind it, so a shared hand cannot
 * live anywhere except the link itself. That turns out to be plenty of room: a
 * table is at most 43 cards, and a card is one of 52, so the whole thing fits
 * in well under a tweet.
 *
 * It rides in the URL's fragment rather than its query string. A fragment is
 * never sent to the server, which keeps a shared hand as private as the app's
 * promise that nothing is uploaded, and it needs no routing to exist for it.
 */

import { Card, Rank, Suit } from '../types';
import { SUIT_SYMBOLS } from './cards';

/** Deck order for encoding. Not the display order — only this file cares. */
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS: Suit[] = ['c', 'd', 'h', 's'];

/**
 * Table shape. Fixed, because the slot a card sits in is carried by its
 * position in the sequence rather than written out.
 *
 * Changing any of these changes what a link means, so it would need a new
 * format letter — see VERSION.
 */
const SEATS = 6;
const CARDS_PER_SEAT = 4;
const BOARD = 5;
const DEAD = 14;
const SLOTS = SEATS * CARDS_PER_SEAT + BOARD + DEAD;

/** Bits per card: 52 values needs six. */
const CARD_BITS = 6;

/**
 * Format letter, leading the payload.
 *
 * Links get sent to people and kept in bookmarks, so they outlive the code
 * that wrote them. Without a version, changing the layout would silently
 * reinterpret every link already out there — a shared hand would still load,
 * just as the wrong cards. With one, an old link from a future format is
 * refused outright, which is the failure worth having.
 */
const VERSION = 'A';

export interface TableState {
  /** Six hands of four; nulls for empty slots. */
  seats: (Card | null)[][];
  board: (Card | null)[];
  dead: (Card | null)[];
}

function encodeCard(card: Card): number {
  return RANKS.indexOf(card.rank) * SUITS.length + SUITS.indexOf(card.suit);
}

function decodeCard(code: number): Card | null {
  if (code < 0 || code >= RANKS.length * SUITS.length) return null;
  return {
    rank: RANKS[Math.floor(code / SUITS.length)],
    suit: SUITS[code % SUITS.length],
  };
}

/** The table as one flat list, in the order the format writes it. */
function flatten(state: TableState): (Card | null)[] {
  const out: (Card | null)[] = [];
  for (let seat = 0; seat < SEATS; seat++)
    for (let i = 0; i < CARDS_PER_SEAT; i++)
      out.push(state.seats[seat]?.[i] ?? null);
  for (let i = 0; i < BOARD; i++) out.push(state.board[i] ?? null);
  for (let i = 0; i < DEAD; i++) out.push(state.dead[i] ?? null);
  return out;
}

function toBase64Url(bytes: number[]): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): number[] | null {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    return Array.from(binary, ch => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Pack a table into a URL fragment payload, or '' if there is nothing in it.
 *
 * A bitmap of which slots are filled comes first, then six bits for each card
 * that is. Writing all 43 slots out at a fixed six bits each would be simpler
 * and only eleven characters longer, but almost every real table is mostly
 * empty — two hands and a flop is thirteen cards of a possible forty-three —
 * and the bitmap is what keeps those links short.
 */
export function encodeTable(state: TableState): string {
  const cards = flatten(state);
  if (cards.every(c => c === null)) return '';

  const bits: number[] = [];
  for (const card of cards) bits.push(card ? 1 : 0);
  for (const card of cards) {
    if (!card) continue;
    const code = encodeCard(card);
    for (let bit = CARD_BITS - 1; bit >= 0; bit--) bits.push((code >> bit) & 1);
  }

  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ?? 0);
    bytes.push(byte);
  }
  return VERSION + toBase64Url(bytes);
}

/** Unpack a payload, or null if it is not one we wrote. */
export function decodeTable(payload: string): TableState | null {
  if (!payload || payload[0] !== VERSION) return null;
  const bytes = fromBase64Url(payload.slice(1));
  if (!bytes) return null;

  const bits: number[] = [];
  for (const byte of bytes)
    for (let bit = 7; bit >= 0; bit--) bits.push((byte >> bit) & 1);
  if (bits.length < SLOTS) return null;

  const filled = bits.slice(0, SLOTS);
  const count = filled.reduce((n, b) => n + b, 0);
  if (bits.length < SLOTS + count * CARD_BITS) return null;

  const cards: (Card | null)[] = [];
  let at = SLOTS;
  const seen = new Set<number>();
  for (const isFilled of filled) {
    if (!isFilled) {
      cards.push(null);
      continue;
    }
    let code = 0;
    for (let bit = 0; bit < CARD_BITS; bit++) code = (code << 1) | bits[at++];
    const card = decodeCard(code);
    // A deck holds one of each. A payload saying otherwise was corrupted in
    // transit or hand-edited, and loading half of it would be worse than
    // refusing: the equity would be quietly wrong rather than visibly absent.
    if (!card || seen.has(code)) return null;
    seen.add(code);
    cards.push(card);
  }

  const seats: (Card | null)[][] = [];
  for (let seat = 0; seat < SEATS; seat++)
    seats.push(cards.slice(seat * CARDS_PER_SEAT, (seat + 1) * CARDS_PER_SEAT));
  const rest = SEATS * CARDS_PER_SEAT;
  return {
    seats,
    board: cards.slice(rest, rest + BOARD),
    dead: cards.slice(rest + BOARD, rest + BOARD + DEAD),
  };
}

/** The shareable address of a table, against the page this is running on. */
export function linkTo(state: TableState): string {
  const payload = encodeTable(state);
  const base = window.location.origin + window.location.pathname;
  return payload ? `${base}#h=${payload}` : base;
}

/** The payload in the current address, if there is one. */
export function payloadInAddress(): string {
  const match = /[#&]h=([A-Za-z0-9_-]+)/.exec(window.location.hash);
  return match ? match[1] : '';
}

// ---------------------------------------------------------------------------
// Recently viewed hands
// ---------------------------------------------------------------------------

const STORE = 'plo.recent.v1';
const KEEP = 12;

export interface RecentHand {
  /** The same payload a link carries, so restoring one is just decoding. */
  payload: string;
  /** The user's own hand, for showing in the list. */
  label: string;
  at: number;
}

export function loadRecent(): RecentHand[] {
  try {
    const raw = localStorage.getItem(STORE);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as RecentHand[]).slice(0, KEEP) : [];
  } catch {
    // Private browsing, a full quota, a hand-edited entry — none of it is
    // worth an error. The list is a convenience; the app works without it.
    return [];
  }
}

/**
 * Keep a hand in the list.
 *
 * Called when a table is about to be replaced rather than as it is built, so
 * the list holds hands actually looked at instead of every intermediate state
 * on the way to one.
 */
export function remember(state: TableState): void {
  const payload = encodeTable(state);
  if (!payload) return;

  const hero = state.seats[0]?.filter((c): c is Card => c !== null) ?? [];
  // A hand with no cards of the user's own is a spot half built, not one worth
  // coming back to.
  if (hero.length === 0) return;

  const entry: RecentHand = {
    payload,
    // Written the way the cards themselves are, so the list reads as hands
    // rather than as codes.
    label: hero
      .map(c => `${c.rank === 'T' ? '10' : c.rank}${SUIT_SYMBOLS[c.suit]}`)
      .join(' '),
    at: Date.now(),
  };
  try {
    const kept = loadRecent().filter(h => h.payload !== payload);
    localStorage.setItem(STORE, JSON.stringify([entry, ...kept].slice(0, KEEP)));
  } catch {
    /* see loadRecent */
  }
}

export function forgetRecent(): void {
  try {
    localStorage.removeItem(STORE);
  } catch {
    /* see loadRecent */
  }
}
