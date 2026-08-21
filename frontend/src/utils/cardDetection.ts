/**
 * Card Detection for ClubWPT Gold Screenshots
 *
 * Detection is driven entirely by calibration data the user supplies once:
 *
 *   - Card slots  — where each card sits on the table, as fractions of the image
 *   - Glyph templates — what each rank looks like, as normalised bitmaps
 *
 * With both in hand, reading a screenshot is deterministic: crop each slot,
 * take the suit from the ink colour, match the rank glyph against the templates.
 * No model, no network call, no heuristics about where cards might be.
 */

import { Card, Rank, Suit } from '../types';
import {
  Bounds,
  CardSlot,
  GlyphTemplate,
  Signature,
  SlotRole,
  extractSignature,
  matchSignature,
} from './glyphTemplates';

/** Below this similarity we treat the read as a miss rather than guess. */
const MIN_SCORE = 0.55;

/** A win this narrow over the runner-up means two ranks looked alike. */
const MIN_MARGIN = 0.04;

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
  villain: Card[];
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
  templates: GlyphTemplate[]
): Promise<DetectionResult> {
  if (slots.length === 0) {
    return emptyResult('No card slots calibrated yet.');
  }
  if (templates.length === 0) {
    return emptyResult('No rank templates taught yet.');
  }

  let imageData: ImageData;
  try {
    imageData = await loadImageData(imageSrc);
  } catch (error) {
    return emptyResult(error instanceof Error ? error.message : 'Failed to load image');
  }

  const readings = slots.map(slot => readSlot(imageData, slot, templates));

  const cardsFor = (role: SlotRole): Card[] =>
    readings
      .filter(r => r.role === role && r.card !== null)
      .sort((a, b) => a.index - b.index)
      .map(r => r.card as Card);

  const hero = cardsFor('hero');
  const villain = cardsFor('villain');
  const board = cardsFor('board');
  const total = hero.length + villain.length + board.length;

  return {
    success: total > 0,
    hero,
    villain,
    board,
    readings,
    message:
      total > 0
        ? `Read ${total} card${total === 1 ? '' : 's'} from ${slots.length} slots`
        : 'No cards read. Check the calibration lines up with this screenshot.',
  };
}

function emptyResult(message: string): DetectionResult {
  return { success: false, hero: [], villain: [], board: [], readings: [], message };
}

/**
 * Read a single slot: is a card there, what suit, what rank.
 */
function readSlot(
  imageData: ImageData,
  slot: CardSlot,
  templates: GlyphTemplate[]
): SlotReading {
  const base: SlotReading = { role: slot.role, index: slot.index, card: null, score: 0, margin: 0 };

  const bounds = slotToBounds(slot, imageData.width, imageData.height);

  const signature = extractSignature(imageData, bounds);
  if (!signature) {
    // No ink in the slot — normally just an empty seat or an undealt street.
    return { ...base, note: 'empty' };
  }

  const suit = detectSuit(imageData, bounds);
  if (!suit) {
    return { ...base, signature, note: 'suit unclear' };
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

/** Convert a slot's stored fractions into pixel bounds for this image. */
function slotToBounds(slot: CardSlot, imageWidth: number, imageHeight: number): Bounds {
  return {
    x: slot.x * imageWidth,
    y: slot.y * imageHeight,
    width: slot.width * imageWidth,
    height: slot.height * imageHeight,
  };
}

/**
 * Identify the suit from the colour of the ink in a region.
 *
 * ClubWPT Gold uses a four-colour deck, so colour alone separates three suits.
 * Spades are whatever is left: ink that is present but carries no strong hue.
 * That "leftover" rule is what lets us read spades at all — trying to detect
 * black directly is hopeless against a dark table.
 */
function detectSuit(imageData: ImageData, bounds: Bounds): Suit | null {
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
  bounds: Bounds
): { signature: Signature | null; suit: Suit | null } {
  return {
    signature: extractSignature(imageData, bounds),
    suit: detectSuit(imageData, bounds),
  };
}
