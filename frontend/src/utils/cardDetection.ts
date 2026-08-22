/**
 * Card Detection for ClubWPT Gold Screenshots
 *
 * The community cards locate themselves: they are the only face-up group on the
 * table that is evenly spaced and unoccluded, so they can be found from their
 * face colours alone. Their position and size then form the coordinate frame
 * everything else is measured in, which is what lets one calibration serve
 * screenshots taken at different window sizes.
 *
 * Reading is deterministic throughout — suit from the card's face colour, rank
 * by matching its glyph against templates the user taught. No model, no network
 * call.
 */

import { Card, Rank, Suit } from '../types';
import {
  Bounds,
  CardSlot,
  GlyphTemplate,
  Signature,
  SlotRole,
  SuitSample,
  extractBackgroundColor,
  extractSignature,
  matchSignature,
  matchSuitByColor,
  opponentSeat,
  CARDS_PER_HAND,
} from './glyphTemplates';
import {
  BoardAnchor,
  CardRegion,
  findBoard,
  findCardRegions,
  findHandRows,
  rankGlyphBounds,
  toAbsolute,
} from './tableAnalysis';

/**
 * Below this similarity we refuse the read rather than guess.
 *
 * Set from measurement across two screenshots at different scales: every
 * correct read scored 0.906 or better, every incorrect one 0.761 or worse.
 * 0.85 sits in that gap, so an untaught rank is declined instead of being
 * forced onto the nearest template it happens to resemble.
 */
const MIN_SCORE = 0.85;

/** A win this narrow over the runner-up means two ranks looked alike. */
const MIN_MARGIN = 0.05;

export interface SlotReading {
  role: SlotRole;
  index: number;
  /** Null when the slot is empty or the glyph could not be read. */
  card: Card | null;
  /** Template similarity, 0..1. Zero when nothing was read. */
  score: number;
  /** Gap to the runner-up rank. */
  margin: number;
  /** Set when the slot could not be read, explaining why. */
  note?: string;
  /** The normalised glyph, for showing the user what the detector saw. */
  signature?: Signature;
}

export interface DetectionResult {
  success: boolean;
  hero: Card[];
  /** One entry per opponent seat that showed cards, in seat order. */
  villains: Card[][];
  board: Card[];
  /** Per-slot detail, including failures — drives the review UI. */
  readings: SlotReading[];
  message?: string;
}

/**
 * Read every calibrated slot in a screenshot.
 */
export async function detectCards(
  imageSrc: string,
  slots: CardSlot[],
  templates: GlyphTemplate[],
  suitSamples: SuitSample[] = []
): Promise<DetectionResult> {
  if (templates.length === 0) {
    return emptyResult('No rank templates taught yet.');
  }

  let imageData: ImageData;
  try {
    imageData = await loadImageData(imageSrc);
  } catch (error) {
    return emptyResult(error instanceof Error ? error.message : 'Failed to load image');
  }

  // The board locates itself: community cards are the only face-up group that
  // is evenly spaced and unoccluded, so they can be found without calibration.
  // Everything else is then measured against them, which is what makes a
  // calibration survive a screenshot taken at a different size.
  const regions = findCardRegions(imageData);
  // No board means preflop, not failure: the hands panel still shows cards,
  // and preflop equity needs no board anyway.
  const anchor = findBoard(regions, imageData.height);

  const boardReadings = anchor
    ? anchor.cards.map((card, index) => readBoardCard(imageData, card, index, templates))
    : [];

  const seatReadings = anchor
    ? slots
        .filter(slot => slot.role !== 'board')
        .map(slot => readSeatSlot(imageData, slot, anchor, templates, suitSamples))
    : [];

  // Hands shown in the client's hands panel. Read only when nothing has been
  // calibrated by hand, so a user's own slots always take precedence.
  const handReadings: SlotReading[] = [];
  if (seatReadings.length === 0) {
    const rows = anchor
      ? findHandRows(regions, anchor)
      : findHandRows(regions, { cards: [], originX: 0, originY: 0, unitX: 1, unitY: 1 }, 3);
    rows.forEach((row, seatIndex) => {
      row.forEach((card, cardIndex) => {
        const reading = readBoardCard(imageData, card, cardIndex, templates);
        handReadings.push({
          ...reading,
          role: seatIndex === 0 ? 'hero' : 'opponent',
          index: seatIndex === 0 ? cardIndex : (seatIndex - 1) * CARDS_PER_HAND + cardIndex,
        });
      });
    });
  }

  const readings = [...boardReadings, ...seatReadings, ...handReadings];

  const cardsFor = (role: SlotRole): Card[] =>
    readings
      .filter(r => r.role === role && r.card !== null)
      .sort((a, b) => a.index - b.index)
      .map(r => r.card as Card);

  const hero = cardsFor('hero');
  const board = cardsFor('board');

  // Group opponent readings into hands by seat, keeping only seats that
  // actually showed cards — folded seats read as empty and drop out.
  const bySeat = new Map<number, Card[]>();
  for (const reading of readings) {
    if (reading.role !== 'opponent' || reading.card === null) continue;
    const seat = opponentSeat(reading.index);
    const hand = bySeat.get(seat) ?? [];
    hand.push(reading.card);
    bySeat.set(seat, hand);
  }

  const villains = [...bySeat.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, hand]) => hand);

  const total =
    hero.length + board.length + villains.reduce((sum, hand) => sum + hand.length, 0);

  return {
    success: total > 0,
    hero,
    villains,
    board,
    readings,
    message:
      total > 0
        ? `Read ${total} card${total === 1 ? '' : 's'}` +
          (anchor ? '' : ' (preflop — no community cards dealt)')
        : 'No cards read. Is a hand visible in this screenshot?',
  };
}

function emptyResult(message: string): DetectionResult {
  return { success: false, hero: [], villains: [], board: [], readings: [], message };
}

/**
 * Read a community card.
 *
 * The suit is already known — the card was found by its colour — so only the
 * rank needs matching.
 */
function readBoardCard(
  imageData: ImageData,
  card: CardRegion,
  index: number,
  templates: GlyphTemplate[]
): SlotReading {
  const signature = extractSignature(imageData, rankGlyphBounds(card));
  return finishReading(
    { role: 'board', index, card: null, score: 0, margin: 0 },
    signature,
    card.suit,
    templates
  );
}

/**
 * Read a seat card from its board-relative position.
 */
function readSeatSlot(
  imageData: ImageData,
  slot: CardSlot,
  anchor: BoardAnchor,
  templates: GlyphTemplate[],
  suitSamples: SuitSample[]
): SlotReading {
  const base: SlotReading = { role: slot.role, index: slot.index, card: null, score: 0, margin: 0 };

  const bounds = toAbsolute(
    { dx: slot.dx, dy: slot.dy, dw: slot.dw, dh: slot.dh },
    anchor
  );

  const signature = extractSignature(imageData, bounds);
  const suit = identifySuit(imageData, bounds, suitSamples);
  if (!suit) {
    return { ...base, signature: signature ?? undefined, note: 'suit unclear' };
  }

  return finishReading(base, signature, suit, templates);
}

/** Shared tail: match the rank and decide whether the read is trustworthy. */
function finishReading(
  base: SlotReading,
  signature: Signature | null,
  suit: Suit,
  templates: GlyphTemplate[]
): SlotReading {
  if (!signature) {
    // No ink — an empty seat, an undealt street, or a face-down card.
    return { ...base, note: 'empty' };
  }

  const match = matchSignature(signature, templates);
  if (!match) {
    return { ...base, signature, note: 'no templates' };
  }

  if (match.score < MIN_SCORE) {
    return {
      ...base,
      signature,
      score: match.score,
      margin: match.margin,
      note: `weak match (${Math.round(match.score * 100)}%)`,
    };
  }

  if (match.margin < MIN_MARGIN) {
    return {
      ...base,
      signature,
      score: match.score,
      margin: match.margin,
      note: 'ambiguous rank',
    };
  }

  return {
    ...base,
    card: { rank: match.rank as Rank, suit },
    score: match.score,
    margin: match.margin,
    signature,
  };
}


/**
 * Identify the suit of a card region.
 *
 * The suit is carried by the card face, not the rank character — ClubWPT Gold
 * draws every rank in white on a suit-coloured card. So this reads the
 * background and matches it against the colours confirmed during calibration.
 */
export function identifySuit(
  imageData: ImageData,
  bounds: Bounds,
  suitSamples: SuitSample[]
): Suit | null {
  if (suitSamples.length > 0) {
    const color = extractBackgroundColor(imageData, bounds);
    if (color) {
      const match = matchSuitByColor(color, suitSamples);
      if (match) return match.suit;
    }
  }
  return detectSuitHeuristic(imageData, bounds);
}

/**
 * Threshold-based suit guess, used before any colours have been taught.
 *
 * ClubWPT Gold uses a four-colour deck, so colour alone separates three suits.
 * Spades are whatever is left: ink that is present but carries no strong hue.
 * That "leftover" rule is what lets us read spades at all — trying to detect
 * black directly is hopeless against a dark table.
 */
function detectSuitHeuristic(imageData: ImageData, bounds: Bounds): Suit | null {
  const { data, width: imgW, height: imgH } = imageData;

  const x0 = Math.max(0, Math.floor(bounds.x));
  const y0 = Math.max(0, Math.floor(bounds.y));
  const x1 = Math.min(imgW, Math.ceil(bounds.x + bounds.width));
  const y1 = Math.min(imgH, Math.ceil(bounds.y + bounds.height));
  if (x1 <= x0 || y1 <= y0) return null;

  const votes: Record<Suit, number> = { d: 0, c: 0, h: 0, s: 0 };
  let saturated = 0;
  let inkPixels = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * imgW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;

      // Ignore pixels too dim to carry reliable colour.
      if (max < 40) continue;
      inkPixels++;

      if (chroma < 40) continue; // Greyish — could be spade ink or card face.
      saturated++;

      if (b === max && b > r + 30) {
        votes.d++;
      } else if (g === max && g > r + 25 && g > b + 25) {
        votes.c++;
      } else if (r === max && r > g + 40 && r > b + 40) {
        votes.h++;
      }
    }
  }

  if (inkPixels === 0) return null;

  const coloured = votes.d + votes.c + votes.h;

  // Very little saturated colour anywhere means a monochrome glyph: spades.
  if (saturated < inkPixels * 0.08 || coloured === 0) {
    return 's';
  }

  const winner = (Object.entries(votes) as [Suit, number][])
    .filter(([suit]) => suit !== 's')
    .sort((a, b) => b[1] - a[1])[0];

  // Require the winning hue to actually dominate, otherwise call it unclear.
  return winner[1] >= coloured * 0.55 ? winner[0] : null;
}

/** Decode a data URL or object URL into pixel data. */
export function loadImageData(src: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * Read the suit and glyph at an arbitrary region — used during calibration to
 * preview what the detector will see before the user commits a label.
 */
export function inspectRegion(
  imageData: ImageData,
  bounds: Bounds,
  suitSamples: SuitSample[] = []
): { signature: Signature | null; suit: Suit | null } {
  return {
    signature: extractSignature(imageData, bounds),
    suit: identifySuit(imageData, bounds, suitSamples),
  };
}
