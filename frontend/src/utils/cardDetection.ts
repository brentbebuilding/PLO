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
  findHeroRow,
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

/**
 * A read this far ahead of the runner-up is accepted a little below the score
 * floor.
 *
 * The floor exists because ranks resemble each other — an eight scored 0.85
 * against a queen's template while two clean eights scored 0.73 — and the
 * defence against that is the gap to the second-best rank, not the absolute
 * score. A heavily dimmed ten came back at 0.838, just under the floor, having
 * beaten every other rank by 0.42. Declining that is throwing away a certain
 * read to guard against a confusion that a margin of 0.42 rules out.
 *
 * Lowered from 0.80 on the evidence of a ten that scored 0.794 and led by
 * 0.331 — the right rank by a mile, refused over six thousandths of score.
 * Across the 349 rank glyphs in the screenshots to hand, the change admits
 * that one card and nothing else, and leaves nothing at all refused. Which is
 * the argument for it: 0.25 clear of every other rank is the evidence, and the
 * score was only ever standing in for it.
 */
const CONFIDENT_SCORE = 0.75;
const CONFIDENT_MARGIN = 0.25;

/**
 * How tall a rank has to be drawn to be held to the full floor, and the floor
 * for one drawn smaller.
 *
 * A rank is matched by stretching it to a fixed grid and correlating against
 * templates. How well the best template can possibly fit depends on how much
 * of the rank there was to stretch: on a small window the client draws these
 * eleven or twelve pixels tall, and stretching that to the grid invents detail
 * that cannot line up with a template taken from twenty.
 *
 * Where the line sits is measured rather than picked. Grouping the 379 rank
 * glyphs in the screenshots to hand by how tall they were drawn:
 *
 *   under 13px    20 glyphs   lowest score 0.769
 *   13 to 15px     8 glyphs   lowest score 0.828
 *   16 to 19px   180 glyphs   lowest score 0.787
 *   20 to 23px    46 glyphs   lowest score 0.884
 *   24px and up  125 glyphs   lowest score 0.884
 *
 * Twenty is where scores stop reaching below the full floor. Under it they do,
 * and 180 glyphs is enough of a sample to say so. The margin test still
 * applies to every read either way, and it is the one that catches a genuine
 * confusion: the only real non-match in the set scored 0.474 and led by 0.031,
 * so it stays refused on both counts.
 */
const FULL_DETAIL_GLYPH = 20;
const SMALL_GLYPH_MIN_SCORE = 0.75;

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
  /** How long the read took, decoding the screenshot included. */
  elapsedMs?: number;
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

  // Timed from here, so the figure covers decoding the screenshot as well as
  // reading it — that is the wait, and separating them would flatter the read.
  const startedAt = performance.now();

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
      ? findHandRows(regions, anchor, 2, imageData)
      : findHandRows(regions, { cards: [], originX: 0, originY: 0, unitX: 1, unitY: 1 }, 3, imageData);
    // The user always sits bottom-centre, so whichever row's avatar is drawn
    // there is theirs.
    //
    // When no row matches confidently, no row is treated as the user's. The
    // previous fallback to the first row put an opponent's cards in the user's
    // seat with nothing to say it had guessed, which is worse than leaving the
    // seat empty for them to fill in: a wrong hand quietly produces a wrong
    // equity, a missing one is obvious.
    const hero = findHeroRow(imageData, rows, anchor, regions);
    const heroRow = hero ? hero.row : -1;

    let opponentSeat = 0;
    rows.forEach((row, seatIndex) => {
      const isHero = seatIndex === heroRow;
      const seat = isHero ? 0 : opponentSeat++;
      let slot = 0;
      row.forEach(card => {
        const reading = readBoardCard(imageData, card, slot, templates);
        // Regions that yield no glyph at all are not cards — they are chips,
        // buttons and bars of table furniture that happened to group into a
        // row. Showing them as unread cards would pad a hand with slots that
        // can never be filled, so they are dropped rather than displayed.
        if (!reading.signature) return;
        handReadings.push({
          ...reading,
          role: isHero ? 'hero' : 'opponent',
          index: isHero ? slot : seat * CARDS_PER_HAND + slot,
        });
        slot++;
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

  const elapsedMs = performance.now() - startedAt;

  return {
    success: total > 0,
    hero,
    villains,
    board,
    readings,
    elapsedMs,
    message:
      total > 0
        ? `Read ${total} card${total === 1 ? '' : 's'} in ${describeElapsed(elapsedMs)}` +
          (anchor ? '' : ' (preflop — no community cards dealt)') +
          // Say so rather than leaving them to notice the empty seat, since
          // the hands that did read look no different either way.
          (hero.length === 0 && villains.length > 0
            ? " — couldn't tell which hand is yours, so add it yourself"
            : '')
        : 'No cards read. Is a hand visible in this screenshot?',
  };
}

/**
 * How long the read took, in whichever unit reads plainly.
 *
 * Milliseconds up to a second, because that is the range this lives in and a
 * change of fifty of them is worth seeing; seconds beyond, where three digits
 * of precision would be noise.
 */
function describeElapsed(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
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
  const bounds = rankGlyphBounds(card);
  const signature = extractSignature(imageData, bounds);
  return finishReading(
    { role: 'board', index, card: null, score: 0, margin: 0 },
    signature,
    card.suit,
    templates,
    bounds.height
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

  return finishReading(base, signature, suit, templates, bounds.height);
}

/** Shared tail: match the rank and decide whether the read is trustworthy. */
function finishReading(
  base: SlotReading,
  signature: Signature | null,
  suit: Suit,
  templates: GlyphTemplate[],
  /** Height of the rank as drawn, before it was stretched to the grid. */
  glyphHeight: number
): SlotReading {
  if (!signature) {
    // No ink — an empty seat, an undealt street, or a face-down card.
    return { ...base, note: 'empty' };
  }

  const match = matchSignature(signature, templates);
  if (!match) {
    return { ...base, signature, note: 'no templates' };
  }

  const confident =
    match.score >= CONFIDENT_SCORE && match.margin >= CONFIDENT_MARGIN;
  const floor =
    glyphHeight >= FULL_DETAIL_GLYPH ? MIN_SCORE : SMALL_GLYPH_MIN_SCORE;

  if (match.score < floor && !confident) {
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
