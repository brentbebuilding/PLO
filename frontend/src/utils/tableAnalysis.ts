/**
 * Finding cards on a ClubWPT Gold table.
 *
 * Card faces are solid colour blocks — blue diamonds, green clubs, dark red
 * hearts, grey spades — which makes them findable directly, without knowing
 * where the table sits in the image.
 *
 * Everything downstream is expressed relative to the board rather than to the
 * image. A screenshot taken at a different window size, or with the table
 * framed differently, moves every absolute coordinate but leaves board-relative
 * ones alone: measured across two screenshots at 1014px and 1158px wide, the
 * same card landed within 2% of the same board-relative position.
 */

import { Suit } from '../types';

export interface PixelSource {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8ClampedArray | Uint8Array;
}

export interface CardRegion {
  suit: Suit;
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: number;
  /** Share of the bounding box that is actually card-coloured. */
  fill: number;
}

/** Board position and scale, the frame everything else is measured against. */
export interface BoardAnchor {
  cards: CardRegion[];
  /** Left edge of the leftmost board card. */
  originX: number;
  /** Top edge of the board row. */
  originY: number;
  /** Median board card width — one horizontal unit. */
  unitX: number;
  /** Median board card height — one vertical unit. */
  unitY: number;
}

export interface SuitReference {
  suit: Suit;
  r: number;
  g: number;
  b: number;
}

/**
 * Card face colours, measured as the median of card interiors in real
 * screenshots. Used when the user hasn't taught their own.
 *
 * One sample per suit is enough even though the client dims cards the winner
 * didn't use: dimming is a pure brightness scale, not a desaturation. A greyed
 * heart measured (0.569, 0.207) against a bright one's (0.570, 0.204) — same
 * hue, same saturation, a third of the luminance. Matching ignores brightness,
 * so both states land on the same reference.
 */
export const DEFAULT_SUIT_REFERENCES: SuitReference[] = [
  { suit: 'd', r: 27, g: 73, b: 98 },
  { suit: 's', r: 63, g: 64, b: 63 },
  { suit: 'h', r: 106, g: 38, b: 42 },
  { suit: 'c', r: 34, g: 100, b: 51 },
];

/**
 * How close a pixel's chromaticity must sit to a reference to count as that suit.
 *
 * The four suits are 0.18 apart or more in chromaticity, so this leaves ample
 * margin between them while absorbing the gradient across a card face.
 */
const CHROMA_TOLERANCE = 0.07;

/** A reference at or below this saturation is an achromatic suit (spades). */
const ACHROMATIC_REF = 0.15;

/** Saturation limits a pixel must satisfy to match an achromatic or coloured suit. */
const ACHROMATIC_MAX = 0.2;
const CHROMATIC_MIN = 0.35;

/**
 * Below this luminance colour is just noise.
 *
 * Deliberately low: a greyed-out card reads as dim as luminance 18, while the
 * felt reads 43 — brighter than the cards we need to keep. So this cannot
 * double as a card/felt separator; chromaticity does that job.
 */
const MIN_LUMINANCE = 8;

type Features = [number, number, number];

/**
 * Chromaticity plus saturation.
 *
 * Chromaticity carries hue independently of brightness, which is what lets a
 * dimmed card match a sample taken from a bright one. Saturation is a separate
 * axis so achromatic spades stay distinct from the coloured suits.
 */
function features(r: number, g: number, b: number): Features {
  const sum = r + g + b || 1;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return [r / sum, g / sum, max === 0 ? 0 : (max - min) / max];
}

/**
 * Distance in chromaticity alone, ignoring saturation.
 *
 * Card faces carry a vertical gradient that is not a plain brightness ramp —
 * one blue card runs (78,151,187) to (12,48,73), which moves saturation from
 * 0.58 to 0.84 while chromaticity barely shifts. Folding saturation into the
 * distance made the top of such a card fail to match its own suit.
 */
function chromaDistance(a: Features, b: Features): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Whether a pixel's saturation is consistent with the suit it matched.
 *
 * This is the job saturation actually needs to do. Table felt sits only 0.05
 * from spades in chromaticity — close enough to be mistaken for it — but felt
 * carries saturation 0.27 against a spade's 0.02, so a gate separates them
 * cleanly where a distance term could not.
 */
function saturationAgrees(pixelSaturation: number, referenceSaturation: number): boolean {
  return referenceSaturation <= ACHROMATIC_REF
    ? pixelSaturation <= ACHROMATIC_MAX
    : pixelSaturation >= CHROMATIC_MIN;
}

/**
 * Find every card-coloured region in the image.
 *
 * Labels each pixel with the nearest suit colour, then takes connected
 * components of matching labels.
 */
export function findCardRegions(
  image: PixelSource,
  references: SuitReference[] = DEFAULT_SUIT_REFERENCES,
  minPixels = 400
): CardRegion[] {
  const { width: W, height: H, data } = image;
  const refs = references.map(ref => ({
    suit: ref.suit,
    features: features(ref.r, ref.g, ref.b),
  }));
  if (refs.length === 0) return [];

  const labels = new Int8Array(W * H).fill(-1);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    if (0.299 * r + 0.587 * g + 0.114 * b < MIN_LUMINANCE) continue;

    const f = features(r, g, b);
    let best = -1;
    let bestDistance = Infinity;
    for (let k = 0; k < refs.length; k++) {
      if (!saturationAgrees(f[2], refs[k].features[2])) continue;
      const d = chromaDistance(f, refs[k].features);
      if (d < bestDistance) {
        bestDistance = d;
        best = k;
      }
    }
    if (best >= 0 && bestDistance < CHROMA_TOLERANCE) labels[i] = best;
  }

  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  const regions: CardRegion[] = [];

  for (let start = 0; start < W * H; start++) {
    if (seen[start] || labels[start] < 0) continue;

    const label = labels[start];
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;

    let count = 0;
    let minX = W;
    let maxX = -1;
    let minY = H;
    let maxY = -1;

    while (sp > 0) {
      const p = stack[--sp];
      const x = p % W;
      const y = (p / W) | 0;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0 && !seen[p - 1] && labels[p - 1] === label) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < W - 1 && !seen[p + 1] && labels[p + 1] === label) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && !seen[p - W] && labels[p - W] === label) { seen[p - W] = 1; stack[sp++] = p - W; }
      if (y < H - 1 && !seen[p + W] && labels[p + W] === label) { seen[p + W] = 1; stack[sp++] = p + W; }
    }

    if (count < minPixels) continue;

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    regions.push({
      suit: refs[label].suit,
      x: minX,
      y: minY,
      width,
      height,
      pixels: count,
      fill: count / (width * height),
    });
  }

  return regions;
}

/** Aspect and solidity a lone, unoccluded card falls within. */
const CARD_MIN_ASPECT = 0.55;
const CARD_MAX_ASPECT = 0.95;
const CARD_MIN_FILL = 0.5;
const CARD_MIN_HEIGHT = 24;

/**
 * Locate the board — the widest horizontal run of similarly sized cards.
 *
 * Community cards are the only group on the table drawn face-up, evenly spaced
 * and unoccluded, which is what makes them a dependable anchor. Hole cards are
 * fanned and overlap, so they merge into blobs that fail the fill test.
 */
export function findBoard(regions: CardRegion[]): BoardAnchor | null {
  const candidates = regions.filter(r => {
    const aspect = r.width / r.height;
    return (
      r.height >= CARD_MIN_HEIGHT &&
      r.fill >= CARD_MIN_FILL &&
      aspect >= CARD_MIN_ASPECT &&
      aspect <= CARD_MAX_ASPECT
    );
  });

  // Group into rows: same vertical position, same height.
  const rows: CardRegion[][] = [];
  for (const card of candidates) {
    const row = rows.find(
      r =>
        Math.abs(r[0].y - card.y) < card.height * 0.35 &&
        Math.abs(r[0].height - card.height) < card.height * 0.3
    );
    if (row) row.push(card);
    else rows.push([card]);
  }

  // Pick by card size, not by how many are in the row.
  //
  // Counting fails on a turn: four community cards tie with a four-card hole
  // hand and the winner is arbitrary — which is how a hero's K K 9 2 once got
  // read as the board. The client draws community cards markedly larger than
  // hole cards or sidebar thumbnails (3.6x the area in the case that broke),
  // and across every screenshot tested the largest row was the true board.
  const medianArea = (row: CardRegion[]) => {
    const areas = row.map(c => c.width * c.height).sort((a, b) => a - b);
    return areas[Math.floor(areas.length / 2)];
  };

  const board = rows
    .filter(row => row.length >= 3)
    .sort((a, b) => medianArea(b) - medianArea(a))[0];
  if (!board) return null;

  board.sort((a, b) => a.x - b.x);

  // Median rather than the first card's size: a partially occluded card at the
  // edge of the row reports short, which would skew every derived position.
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  return {
    cards: board,
    originX: board[0].x,
    originY: median(board.map(c => c.y)),
    unitX: median(board.map(c => c.width)),
    unitY: median(board.map(c => c.height)),
  };
}

/** A rectangle expressed in board units, so it survives a rescaled screenshot. */
export interface RelativeRect {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export function toRelative(
  rect: { x: number; y: number; width: number; height: number },
  anchor: BoardAnchor
): RelativeRect {
  return {
    dx: (rect.x - anchor.originX) / anchor.unitX,
    dy: (rect.y - anchor.originY) / anchor.unitY,
    dw: rect.width / anchor.unitX,
    dh: rect.height / anchor.unitY,
  };
}

export function toAbsolute(
  rel: RelativeRect,
  anchor: BoardAnchor
): { x: number; y: number; width: number; height: number } {
  return {
    x: anchor.originX + rel.dx * anchor.unitX,
    y: anchor.originY + rel.dy * anchor.unitY,
    width: rel.dw * anchor.unitX,
    height: rel.dh * anchor.unitY,
  };
}

/**
 * Where the rank character sits within a card.
 *
 * Cards carry the rank in the top-left corner with the suit pip below it. The
 * crop stops short of the pip; anything that still bleeds in is dropped later
 * by keeping only the topmost blob of ink.
 */
export function rankGlyphBounds(card: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  return {
    x: card.x + card.width * 0.06,
    y: card.y + card.height * 0.04,
    width: card.width * 0.62,
    height: card.height * 0.42,
  };
}
