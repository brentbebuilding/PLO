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

/**
 * Smallest a board card can be, as a fraction of image height.
 *
 * Sits in the gap between the two populations: 0.028 for the largest preflop
 * candidate, 0.043 for the smallest real board.
 */
const MIN_BOARD_HEIGHT_RATIO = 0.035;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
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
export function findBoard(
  regions: CardRegion[],
  imageHeight?: number
): BoardAnchor | null {
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

  // A row can sweep in unrelated cards that merely share a height, so split it
  // wherever the spacing jumps. Community cards are evenly spaced; one observed
  // row ran 82,81,82,82 then 246, and the tail was a different element entirely.
  const runs = rows.flatMap(splitOnSpacingBreak);

  // Drop the hands panel. It lists every player's cards as rows that share an
  // x origin and card size, so two or more such rows are a list, never the
  // board — which is unique. Without this a preflop screenshot, having no
  // community cards at all, returns somebody's hand as the board.
  const panelKey = (row: CardRegion[]) =>
    `${Math.round(row[0].x / 8)}:${Math.round(row[0].height / 4)}`;
  const keyCounts = new Map<string, number>();
  for (const row of runs) {
    const key = panelKey(row);
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }
  const notPanel = runs.filter(row => (keyCounts.get(panelKey(row)) ?? 0) < 2);

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

  const board = notPanel
    .filter(row => row.length >= 3 && row.length <= 5)
    .sort((a, b) => medianArea(b) - medianArea(a))[0];
  if (!board) return null;

  // Community cards are drawn much larger than anything else on screen. When
  // the biggest row is still small, no board is dealt and what we found is a
  // hand — the preflop case, where the hands panel is the only thing showing
  // cards at all. Measured across twenty screenshots, real boards ran 4.3% to
  // 9.4% of image height while every preflop candidate sat at 2.8% or below.
  if (imageHeight) {
    const relativeHeight = median(board.map(c => c.height)) / imageHeight;
    if (relativeHeight < MIN_BOARD_HEIGHT_RATIO) return null;
  }

  // Median rather than the first card's size: a partially occluded card at the
  // edge of the row reports short, which would skew every derived position.
  return {
    cards: board,
    originX: board[0].x,
    originY: median(board.map(c => c.y)),
    unitX: median(board.map(c => c.width)),
    unitY: median(board.map(c => c.height)),
  };
}

/**
 * Rows of cards that are not the board — revealed hands.
 *
 * The hands panel draws each player's cards as separate upright thumbnails,
 * which read far more reliably than the cards on the table itself: those are
 * fanned in an arc, so the outer two are rotated and half-buried under the
 * player's name plate.
 *
 * Returned largest-row-first. Which row belongs to whom isn't knowable from
 * pixels alone, so callers should treat the assignment as a suggestion.
 */
export function findHandRows(
  regions: CardRegion[],
  board: BoardAnchor,
  minCards = 2,
  image?: PixelSource
): CardRegion[][] {
  const candidates = regions.filter(r => {
    const aspect = r.width / r.height;
    return (
      !board.cards.includes(r) &&
      r.height >= 20 &&
      r.fill >= 0.45 &&
      aspect >= 0.5 &&
      aspect <= 1.0
    );
  });

  const rows: CardRegion[][] = [];
  for (const card of candidates) {
    const row = rows.find(
      r =>
        Math.abs(r[0].y - card.y) < card.height * 0.35 &&
        Math.abs(r[0].height - card.height) < card.height * 0.35
    );
    if (row) row.push(card);
    else rows.push([card]);
  }

  const usable = rows
    .filter(r => r.length >= minCards)
    .map(r => r.sort((a, b) => a.x - b.x));

  // When the hands panel is open it lists every revealed hand, and the same
  // players are also drawn at their seats — so a hand can be found twice and
  // reported as two opponents. Counting one player's cards twice is worse than
  // missing them: it removes cards from the deck that are still live.
  //
  // The panel is recognisable as rows sharing an x origin and card size, so
  // when two or more such rows exist they are the authoritative list and the
  // seat copies are dropped.
  const key = (row: CardRegion[]) =>
    `${Math.round(row[0].x / 8)}:${Math.round(row[0].height / 4)}`;
  const counts = new Map<string, number>();
  for (const row of usable) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);

  const panelKey = [...counts.entries()].find(([, n]) => n >= 2)?.[0];
  const chosen = panelKey ? usable.filter(row => key(row) === panelKey) : usable;

  const filled = image ? chosen.map(row => fillRowGaps(row, image)) : chosen;
  return filled.sort((a, b) => a[0].y - b[0].y);
}

/**
 * Insert cards that were missed because their colour region never formed.
 *
 * A very dim card can fail to register at all, leaving a hole. Cards in a row
 * sit at a regular pitch, so a gap of two pitches means exactly one card is
 * missing and its position is known. One observed row ran x = 221, 258, 331:
 * a gap of 73 where the pitch is 37.
 *
 * A dropped card is worse than an unread one — a three-card hand looks
 * complete rather than obviously broken — so it is worth recovering the slot
 * even if the rank then fails to read.
 */
function fillRowGaps(row: CardRegion[], image: PixelSource): CardRegion[] {
  if (row.length < 2) return row;

  // The smallest gap is the true pitch. A median would be wrong exactly when it
  // matters: a row of x = 221, 258, 331 has gaps 37 and 73, and the median of
  // two values takes the larger — reading the hole as the spacing and finding
  // nothing missing.
  const gaps = row.slice(1).map((c, i) => c.x - row[i].x);
  const pitch = Math.min(...gaps);
  if (pitch <= 0) return row;

  const out: CardRegion[] = [row[0]];
  for (let i = 1; i < row.length; i++) {
    const missing = Math.round((row[i].x - row[i - 1].x) / pitch) - 1;
    // Only bridge small holes; a large jump is a different group, not a gap.
    if (missing > 0 && missing <= 2) {
      for (let k = 1; k <= missing; k++) {
        const x = Math.round(row[i - 1].x + pitch * k);
        const template = row[i - 1];
        const suit = dominantSuit(image, x, template.y, template.width, template.height);
        if (!suit) continue;
        out.push({
          suit,
          x,
          y: template.y,
          width: template.width,
          height: template.height,
          pixels: 0,
          fill: 0,
        });
      }
    }
    out.push(row[i]);
  }
  return out;
}

/** Most common card-face suit within a rectangle, for a synthesised slot. */
function dominantSuit(
  image: PixelSource,
  x0: number,
  y0: number,
  w: number,
  h: number
): Suit | null {
  const { width: W, height: H, data } = image;
  const refs = DEFAULT_SUIT_REFERENCES.map(r => ({
    suit: r.suit,
    features: features(r.r, r.g, r.b),
  }));
  const votes = new Map<Suit, number>();

  for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
      const i = (y * W + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (0.299 * r + 0.587 * g + 0.114 * b < MIN_LUMINANCE) continue;
      const f = features(r, g, b);
      for (const ref of refs) {
        if (!saturationAgrees(f[2], ref.features[2])) continue;
        if (chromaDistance(f, ref.features) < CHROMA_TOLERANCE) {
          votes.set(ref.suit, (votes.get(ref.suit) ?? 0) + 1);
          break;
        }
      }
    }
  }

  const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > w * h * 0.15 ? best[0] : null;
}

/**
 * Break a row wherever the spacing between cards jumps.
 *
 * Cards dealt as a group sit at a regular pitch. A gap well outside that pitch
 * means the next card belongs to something else that happens to share a height.
 */
function splitOnSpacingBreak(row: CardRegion[]): CardRegion[][] {
  if (row.length < 3) return [row];
  const sorted = [...row].sort((a, b) => a.x - b.x);

  const gaps = sorted.slice(1).map((c, i) => c.x - sorted[i].x);
  const ordered = [...gaps].sort((a, b) => a - b);
  const typical = ordered[Math.floor(ordered.length / 2)];

  const runs: CardRegion[][] = [];
  let current: CardRegion[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (gaps[i - 1] > typical * 1.6) {
      runs.push(current);
      current = [];
    }
    current.push(sorted[i]);
  }
  runs.push(current);
  return runs;
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
 * The rank sits in the top-left corner. The width matters more than it looks:
 * on a large board card the pip sits below the rank, but on a small sidebar
 * thumbnail it sits beside it, and a crop wide enough to be safe on the former
 * swallowed the pip on the latter — the glyph then normalised as two merged
 * shapes and matched nothing. Narrowing to 0.40 took hand reads from 103 to 135
 * across the screenshot set with no board card lost; 0.35 scored the same, so
 * 0.40 keeps margin for a wide "10".
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
    width: card.width * 0.40,
    height: card.height * 0.42,
  };
}
