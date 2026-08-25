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
/**
 * Split a row, sorted by x, wherever the spacing jumps.
 *
 * Cards in a hand sit at a regular pitch. A region that merely shares the
 * row's height and top edge — one sat at x=1155 against a panel hand running
 * 265 to 374 — arrives after a gap many times that pitch, and belongs to a
 * different group entirely.
 */
function splitIntoRuns(row: CardRegion[]): CardRegion[][] {
  if (row.length < 2) return [row];
  const gaps = row.slice(1).map((c, i) => c.x - row[i].x);
  const pitch = Math.min(...gaps);
  if (pitch <= 0) return [row];

  const runs: CardRegion[][] = [[row[0]]];
  for (let i = 1; i < row.length; i++) {
    if (row[i].x - row[i - 1].x > pitch * 2.5) runs.push([]);
    runs[runs.length - 1].push(row[i]);
  }
  return runs;
}

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
        // Scaled by the taller of the two. A dimmed card's lower edge fades
        // into the panel and stops registering, so heights within one row run
        // 45, 45, 35, 32 — and whichever of the pair is clipped, the tolerance
        // has to be judged against the card that isn't. Measuring against the
        // candidate loses a short card joining a tall row; against the row,
        // a tall card joining a row that happens to start short.
        Math.abs(r[0].height - card.height) <
          Math.max(r[0].height, card.height) * 0.35 &&
        // Width is held to much closer than that, because it is the dimension
        // that stays true: clipping eats a card's lower edge, never its sides,
        // so cards in a row measure within a pixel of each other. This is what
        // keeps a player's avatar out of their hand — one sat 66px wide beside
        // 38px cards, close enough in height and spacing to join the row, and
        // a row of five is thrown away as not being a hand.
        Math.max(r[0].width, card.width) / Math.min(r[0].width, card.width) < 1.4
    );
    if (row) row.push(card);
    else rows.push([card]);
  }

  // A hand is a run of at most four cards at a regular pitch. Anything else
  // that happens to share the row's height and top edge — a card on the felt,
  // the status bar along the bottom of the client, which reads as twenty
  // "cards" — is separated out by splitting each row wherever the spacing
  // jumps, then keeping only the runs that are hand-sized. Discarding the
  // whole row instead cost real hands: one lost four panel cards because two
  // unrelated regions elsewhere in the image had joined them.
  const usable = rows
    .map(r => r.sort((a, b) => a.x - b.x))
    .flatMap(splitIntoRuns)
    .filter(r => r.length >= minCards && r.length <= CARDS_IN_HAND);

  // When the hands panel is open it lists every revealed hand, and the same
  // players are also drawn at their seats — so a hand can be found twice and
  // reported as two opponents. Counting one player's cards twice is worse than
  // missing them: it removes cards from the deck that are still live.
  //
  // The panel is a column down the left edge, and it is recognised by that
  // rather than by holding two or more rows. A screenshot where only one hand
  // was revealed has no second row to compare against, and what came through
  // instead was the client's status bar, split into three hand-sized runs and
  // read as three opponents.
  //
  // Size is deliberately not compared between rows here: dimming shortens
  // whole rows, not just single cards, so two rows of the same panel
  // legitimately measure 41 and 29 pixels tall and any similarity test tight
  // enough to be worth having throws one of them away.
  const inPanel = image
    ? usable.filter(row => row[0].x < image.width * PANEL_MAX_ORIGIN)
    : [];
  const chosen = inPanel.length > 0 ? inPanel : usable;

  const filled = image ? chosen.map(row => fillRowGaps(row, image)) : chosen;
  const faceUp = image ? filled.filter(row => !isFaceDown(row, image)) : filled;
  return faceUp.map(squareUpRow).sort((a, b) => a[0].y - b[0].y);
}

/**
 * Whether a row is a player's cards drawn face down.
 *
 * A folded player still gets a row in the hands panel, holding four card backs.
 * They are card-shaped, card-sized and a flat grey that reads as the same
 * colour as a spade, so they arrive here as a perfectly ordinary hand — and the
 * client's back is a chevron weave whose corner matched a five at 0.88, well
 * past the bar for accepting a rank. Two of those rows came through as
 * opponents holding 5s 5s 5s 5s.
 *
 * What gives them away is that the four are the same picture. Every card is
 * compared against every other over the patch where a rank would be, and a row
 * where all of them agree is not a hand — no hand holds four of one card. The
 * comparison is deliberately of the rank's patch rather than the whole card:
 * two faces sharing a suit share most of their area, and it is only at the rank
 * that they are certain to differ.
 *
 * Suit is required to agree as well, which costs nothing on a back — all four
 * are the same grey — and rules out the one real hand that could otherwise
 * trip this, four of a kind in the hole, whose four cards are four suits.
 */
function isFaceDown(row: CardRegion[], image: PixelSource): boolean {
  // Two cards are not enough to argue from: a genuine pair sits at the top of
  // this range, and a two-card row is a partial read of a real hand often
  // enough to be worth keeping.
  if (row.length < 3) return false;
  if (!row.every(card => card.suit === row[0].suit)) return false;

  // Sampled straight from the pixels. The boxes here are a rank's worth each —
  // a few hundred pixels — and building the prefix-sum table that would answer
  // them in constant time costs more than a hundred megabytes on a large
  // screenshot, which is a great deal of work to save none.
  const ranks = row.map(card => {
    const box = rankGlyphBounds(card);
    return box ? crop(image, box.x, box.y, box.width, box.height) : null;
  });

  for (let a = 0; a < ranks.length; a++)
    for (let b = a + 1; b < ranks.length; b++) {
      const one = ranks[a];
      const other = ranks[b];
      if (!one || !other) return false;
      if (correlate(one, other) < FACE_DOWN_MIN_LIKENESS) return false;
    }
  return true;
}

/**
 * How alike two rank patches must be to be called the same picture.
 *
 * Measured across every screenshot to hand: real hands reach 0.58 at their most
 * alike, four card backs sit at 0.77. The bar is set between them. It is not a
 * wide gap, which is why agreeing on suit is required too — no real row that
 * came close on likeness also agreed on suit.
 */
const FACE_DOWN_MIN_LIKENESS = 0.68;

/**
 * Restore every card in a row to the row's own size.
 *
 * Cards in a row are drawn identically, but a dimmed one stops registering
 * partway down and its region comes back short — 35 and 32 pixels against its
 * neighbours' 45 in one observed hand. The rank is read from a box measured as
 * a fraction of the card, so a short region puts that box in the wrong place
 * and crops the glyph: the ten in that hand came back unread.
 *
 * The row's median is the honest size, since clipping only ever takes pixels
 * away. Only the extent is corrected, never the position of the top-left
 * corner, which is where the rank is and is the part that always registers.
 */
function squareUpRow(row: CardRegion[]): CardRegion[] {
  if (row.length < 2) return row;
  const height = median(row.map(c => c.height));
  return row.map(card => (card.height === height ? card : { ...card, height }));
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

// ---------------------------------------------------------------------------
// Identifying the user among the revealed hands
// ---------------------------------------------------------------------------

/**
 * Prefix sums over each colour channel, so the mean colour of any rectangle is
 * four lookups instead of a loop. The hero search evaluates thousands of boxes
 * across position and scale, which is far too slow without this.
 */
interface Integral {
  width: number;
  height: number;
  sums: Float64Array;
}

function buildIntegral(image: PixelSource): Integral {
  const { width: W, height: H, data } = image;
  const stride = (W + 1) * 3;
  const sums = new Float64Array((W + 1) * (H + 1) * 3);

  for (let y = 0; y < H; y++) {
    let rowR = 0;
    let rowG = 0;
    let rowB = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      rowR += data[i];
      rowG += data[i + 1];
      rowB += data[i + 2];
      const here = (y + 1) * stride + (x + 1) * 3;
      const above = y * stride + (x + 1) * 3;
      sums[here] = sums[above] + rowR;
      sums[here + 1] = sums[above + 1] + rowG;
      sums[here + 2] = sums[above + 2] + rowB;
    }
  }
  return { width: W, height: H, sums };
}

/** Mean colour of a rectangle, clamped to the image. */
function meanColor(
  integral: Integral,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  out: number[],
  at: number
): void {
  const { width: W, height: H, sums } = integral;
  const stride = (W + 1) * 3;
  const ax = Math.max(0, Math.min(W, Math.round(x0)));
  const ay = Math.max(0, Math.min(H, Math.round(y0)));
  const bx = Math.max(0, Math.min(W, Math.round(x1)));
  const by = Math.max(0, Math.min(H, Math.round(y1)));

  const area = (bx - ax) * (by - ay);
  if (area <= 0) {
    out[at] = out[at + 1] = out[at + 2] = 0;
    return;
  }

  const A = ay * stride + ax * 3;
  const B = ay * stride + bx * 3;
  const C = by * stride + ax * 3;
  const D = by * stride + bx * 3;
  out[at] = (sums[D] - sums[B] - sums[C] + sums[A]) / area;
  out[at + 1] = (sums[D + 1] - sums[B + 1] - sums[C + 1] + sums[A + 1]) / area;
  out[at + 2] = (sums[D + 2] - sums[B + 2] - sums[C + 2] + sums[A + 2]) / area;
}

/** Avatar grid resolution. 8x8 carries enough of a face to be distinctive. */
const AVATAR_GRID = 8;

/**
 * Scale-invariant colour signature of a rectangle.
 *
 * Sampling a fixed grid rather than fixed pixels is what lets a 60px panel
 * thumbnail be compared against the same avatar drawn at 90px on the table.
 */
function avatarSignature(
  integral: Integral,
  x: number,
  y: number,
  w: number,
  h: number
): number[] {
  const out = new Array<number>(AVATAR_GRID * AVATAR_GRID * 3);
  let at = 0;
  for (let gy = 0; gy < AVATAR_GRID; gy++) {
    for (let gx = 0; gx < AVATAR_GRID; gx++) {
      meanColor(
        integral,
        x + (w * gx) / AVATAR_GRID,
        y + (h * gy) / AVATAR_GRID,
        x + (w * (gx + 1)) / AVATAR_GRID,
        y + (h * (gy + 1)) / AVATAR_GRID,
        out,
        at
      );
      at += 3;
    }
  }
  return out;
}

/**
 * The same grid as avatarSignature, read straight from the pixels.
 *
 * Worth having for small boxes, where filling an integral over the whole image
 * to sample a few hundred pixels is far more work than reading them.
 */
function crop(
  image: PixelSource,
  x: number,
  y: number,
  w: number,
  h: number
): number[] {
  const out: number[] = [];
  for (let gy = 0; gy < AVATAR_GRID; gy++) {
    for (let gx = 0; gx < AVATAR_GRID; gx++) {
      const x0 = Math.max(0, Math.round(x + (w * gx) / AVATAR_GRID));
      const x1 = Math.min(image.width, Math.round(x + (w * (gx + 1)) / AVATAR_GRID));
      const y0 = Math.max(0, Math.round(y + (h * gy) / AVATAR_GRID));
      const y1 = Math.min(image.height, Math.round(y + (h * (gy + 1)) / AVATAR_GRID));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let py = y0; py < y1; py++)
        for (let px = x0; px < x1; px++) {
          const i = (py * image.width + px) * 4;
          r += image.data[i];
          g += image.data[i + 1];
          b += image.data[i + 2];
          n++;
        }
      out.push(n ? r / n : 0, n ? g / n : 0, n ? b / n : 0);
    }
  }
  return out;
}

/** Correlation, so a brightness difference between the two draws doesn't dominate. */
function correlate(a: number[], b: number[]): number {
  const n = a.length;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= n;
  meanB /= n;

  let num = 0;
  let devA = 0;
  let devB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    devA += da * da;
    devB += db * db;
  }
  return devA && devB ? num / Math.sqrt(devA * devB) : 0;
}

/**
 * Where a hands-panel row draws that player's avatar: left of their cards,
 * spanning a little more than the card height. Measured off the client.
 */
function panelAvatarBox(row: CardRegion[]) {
  const h = row[0].height;
  return { x: row[0].x - h * 2.15, y: row[0].y - h * 0.05, w: h * 1.5, h: h * 1.33 };
}

/** Below this correlation the match is not trusted and no hero is claimed. */
const HERO_MIN_CORRELATION = 0.8;

/**
 * How far into the image the hands panel can start, as a fraction of width.
 *
 * Measured across the screenshots: every panel row begins at 0.13 of the image
 * width, every row of cards lying on the felt at 0.46 or beyond.
 */
const PANEL_MAX_ORIGIN = 0.25;

/** Cards in an Omaha hand, and so the most a panel row can hold. */
const CARDS_IN_HAND = 4;

/**
 * Narrow a set of rows to the ones actually drawn in the hands panel.
 *
 * Row detection also picks up cards lying on the felt, and an avatar box
 * measured off one of those lands on table rather than on a face. Those crops
 * are not blank — a green felt edge against the dark panel carries more
 * contrast than a real avatar does — so they correlate at 0.86 and upwards
 * against any similar patch of table, comfortably past the threshold for
 * claiming a hero. Excluding them here is what stops that.
 *
 * Rows are picked out by where they start rather than by how many cards they
 * hold. A panel row nominally shows a whole Omaha hand, but detection returns
 * three regions when a card fails to separate and five when something else on
 * the table gets swept into the row, so counting them is unreliable. The left
 * edge is not: the panel is a column, and every row in it begins at the same x.
 */
function panelRows(rows: CardRegion[][], imageWidth: number): number[] {
  const left = rows
    .map((_, i) => i)
    .filter(i => rows[i][0].x < imageWidth * PANEL_MAX_ORIGIN);
  if (left.length <= 1) return left;

  // Group by left edge and keep the largest group, so that a stray region far
  // down the panel's own column can't drag the set sideways. Ties go to the
  // leftmost, the panel being the leftmost thing on the table.
  const bucket = (i: number) => Math.round(rows[i][0].x / 8) * 8;
  const counts = new Map<number, number>();
  for (const i of left) counts.set(bucket(i), (counts.get(bucket(i)) ?? 0) + 1);
  const origin = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0] - b[0]
  )[0][0];
  return left.filter(i => bucket(i) === origin);
}

export interface HeroMatch {
  /** Index into the rows passed in. */
  row: number;
  correlation: number;
}

/**
 * Work out which revealed hand belongs to the user.
 *
 * Two ways, in order of how directly they answer the question. The user sits
 * bottom-centre, so a row whose avatar is drawn there is theirs and nothing
 * more need be worked out. When that avatar is covered — the client stamps a
 * yellow ALL-IN disc across it, which is exactly the hand worth reviewing — the
 * seat says nothing, and the answer has to be triangulated from the seats that
 * are still legible.
 */
export function findHeroRow(
  image: PixelSource,
  rows: CardRegion[][],
  board?: BoardAnchor | null
): HeroMatch | null {
  if (panelRows(rows, image.width).length === 0) return null;
  // A prefix sum over every pixel, which on a large screenshot is a hundred
  // megabytes to fill. One, shared by everything below.
  const integral = buildIntegral(image);
  return board && board.cards.length >= 3
    ? findHeroFromSeats(image, rows, board, integral)
    : findHeroBySweep(image, rows, integral);
}

/**
 * Find the user by hunting for their avatar across the bottom of the table.
 *
 * Only for a screenshot with no board on it, where there is no frame to measure
 * the seat against and so nothing to do but search. Everything else goes
 * through findHeroFromSeats, which knows where to look and is an order of
 * magnitude cheaper for it.
 *
 * Their cards at the seat are useless for this: once they fold, the client greys them
 * until neither suit nor rank survives — one folded hand measured as a single
 * uniform blob with no rank ink anywhere in it.
 *
 * Their avatar is not greyed, and the same avatar appears both at the seat and
 * beside their row in the hands panel. So each row's avatar is searched for
 * across the bottom-centre of the table, over position and scale, and whichever
 * row is found there is the user's. The seat is universal, so this works for any
 * player without knowing their name or picture.
 *
 * A single panel row is still matched rather than assumed to be the user's: the
 * client will happily show one opponent's hand and none of the user's.
 */
function findHeroBySweep(
  image: PixelSource,
  rows: CardRegion[][],
  integral: Integral
): HeroMatch | null {
  const candidates = panelRows(rows, image.width);
  const centreX = image.width / 2;
  const step = Math.max(4, Math.round(image.height / 200));

  let best: HeroMatch | null = null;

  // Each row is swept at its own size rather than all of them sharing the first
  // row's. Panel rows are drawn identically, but their measured card heights
  // are not: dim cards register short, and one panel held rows measuring 41px
  // and 29px. Probes cut to the first row's size then framed the second row's
  // avatar wrongly everywhere, and it failed to match its own seat.
  for (const i of candidates) {
    const box = panelAvatarBox(rows[i]);
    const panel = avatarSignature(integral, box.x, box.y, box.w, box.h);

    // The table avatar is drawn larger than the panel thumbnail, and by how
    // much depends on the window size, so scale is searched rather than assumed.
    for (let scale = 1.0; scale <= 2.2; scale += 0.15) {
      const w = box.w * scale;
      const h = box.h * scale;
      for (let y = image.height * 0.52; y < image.height * 0.78 - h; y += step) {
        for (let dx = -w * 0.9; dx <= w * 0.9; dx += step) {
          const probe = avatarSignature(integral, centreX + dx - w / 2, y, w, h);
          const c = correlate(probe, panel);
          if (!best || c > best.correlation) best = { row: i, correlation: c };
        }
      }
    }
  }

  return best && best.correlation >= HERO_MIN_CORRELATION ? best : null;
}

/**
 * Where the eight seats sit, clockwise from the top of the felt, measured out
 * from the middle of the board in board-card heights.
 *
 * The client draws its table to a fixed plan and scales the whole thing with
 * the window, so a seat's offset from the board is a constant once it is
 * expressed in units the board itself provides. Measured off two screenshots
 * taken at different window sizes — 2190px wide and 2538px — the two sets of
 * offsets agreed to within a tenth of a card, which is what makes hard-coding
 * them reasonable rather than fragile.
 */
const SEAT_OFFSETS: readonly (readonly [number, number])[] = [
  [0.72, -2.3],   // top centre
  [4.06, -1.37],  // upper right
  [4.92, 0.71],   // right
  [3.74, 3.36],   // lower right
  [-0.71, 4.32],  // bottom centre — always the user
  [-3.78, 3.36],  // lower left
  [-4.92, 0.73],  // left
  [-4.08, -1.38], // upper left
];

/** The user's seat, as an index into SEAT_OFFSETS. */
const HERO_SEAT = 4;

/**
 * How well an avatar has to match a seat before it is allowed to vote.
 *
 * Set high deliberately. Most seats in a hand worth reviewing are covered by an
 * ALL-IN disc and will match nothing; a handful of clean ones is all this needs,
 * and letting near-misses vote only lets the covered seats outnumber them.
 */
const SEAT_MIN_CORRELATION = 0.85;

/** How far the winning reading must lead the runner-up to be acted on. */
const ORDER_MIN_MARGIN = 0.06;

/**
 * Contrast a crop must carry before it is allowed to match anything.
 *
 * Correlation divides by the variation it finds, so two nearly flat crops
 * correlate at whatever their noise happens to agree on — and an empty seat
 * against a blank strip below the panel scored 0.96 that way, which is higher
 * than most real recognitions manage. Both sides of every comparison have to
 * carry structure. The panel is drawn dimmed and the table is not, so the two
 * sides need different bars; both sit well below what a real avatar measures.
 */
const PANEL_MIN_CONTRAST = 8;
const SEAT_MIN_CONTRAST = 22;

/** How far either way a seat is searched, in board-card heights. */
const SEAT_SEARCH_RADIUS = 0.45;

/**
 * And how far for the user's own seat, which needs more room.
 *
 * The eight seats sit where the client's plan puts them, to within a tenth of a
 * card — but the user's own avatar is drawn against their name plate and their
 * cards, and shifts with them: measured across screenshots it lands anywhere
 * from a tenth to two thirds of a card off the nominal centre. At 0.45 one
 * screenshot's hero scored 0.49 against their own unobscured face.
 */
const HERO_SEARCH_RADIUS = 0.9;

/**
 * A panel row's height, as a multiple of the cards it holds.
 *
 * Steady across every screenshot measured — 2.72, 2.70, 2.72 at three window
 * sizes — because the client lays the panel out in proportion like everything
 * else.
 */
const PANEL_ROW_PITCH = 2.72;

/**
 * The vertical distance between hands-panel rows.
 *
 * Only some rows are detected — a player who folded holds card backs, which are
 * thrown out before this — so the gaps between the rows that remain are
 * multiples of the pitch rather than the pitch itself. A panel of eight where
 * three players saw a showdown gives gaps of two, two and one row.
 *
 * The card height gives the first guess. Taking the smallest gap instead is the
 * obvious move and it is wrong in exactly the case that matters: a screenshot
 * with two rows two apart has one gap, and reading it as one row doubles the
 * pitch and puts every stepped-out row between the real ones. The guess only
 * has to be close enough to divide each gap into the right number of rows,
 * which it comfortably is; the gaps then set the pitch precisely.
 */
function panelRowPitch(tops: number[], cardHeight: number): number {
  const seed = cardHeight * PANEL_ROW_PITCH;
  let total = 0;
  let count = 0;
  for (let i = 1; i < tops.length; i++) {
    const gap = tops[i] - tops[i - 1];
    const rowsApart = Math.max(1, Math.round(gap / seed));
    total += gap / rowsApart;
    count++;
  }
  return count ? total / count : seed;
}

/**
 * A signature with its mean already taken out and its length measured.
 *
 * Correlating two signatures needs both centred and both scaled by their own
 * spread. Every seat probe is compared against every panel row, so doing that
 * work once per signature rather than once per comparison takes it off the
 * inner loop entirely — and the length doubles as the contrast test, being the
 * standard deviation up to a constant.
 */
interface Prepared {
  centred: number[];
  norm: number;
}

function prepare(signature: number[]): Prepared {
  let mean = 0;
  for (const v of signature) mean += v;
  mean /= signature.length;

  const centred = new Array<number>(signature.length);
  let sum = 0;
  for (let i = 0; i < signature.length; i++) {
    const d = signature[i] - mean;
    centred[i] = d;
    sum += d * d;
  }
  return { centred, norm: Math.sqrt(sum) };
}

/** The same number `correlate` returns, off signatures already prepared. */
function likeness(a: Prepared, b: Prepared): number {
  if (!a.norm || !b.norm) return 0;
  let sum = 0;
  for (let i = 0; i < a.centred.length; i++) sum += a.centred[i] * b.centred[i];
  return sum / (a.norm * b.norm);
}

/** The same number `contrast` returns. */
function spread(p: Prepared): number {
  return p.norm / Math.sqrt(p.centred.length);
}

interface SeatProbe extends Prepared {
  scale: number;
  x: number;
  y: number;
}

/**
 * Every crop worth comparing against one seat.
 *
 * The seat avatar is drawn larger than the panel thumbnail, and larger again at
 * the user's own seat, which the client rings and enlarges — so scale is
 * searched rather than assumed.
 *
 * These do not depend on which panel row is being looked for, which is the
 * whole point of gathering them here: there are twenty-odd rows to try and the
 * same twelve hundred crops answer all of them. Reading them per row instead
 * was most of what the seat search cost.
 */
function seatProbes(
  integral: Integral,
  image: PixelSource,
  boxWidth: number,
  boxHeight: number,
  centreX: number,
  centreY: number,
  unit: number,
  radius: number
): SeatProbe[] {
  const probes: SeatProbe[] = [];
  const reach = unit * radius;
  const step = unit / 12;

  for (let scale = 0.8; scale <= 2.25; scale += 0.15) {
    const w = boxWidth * scale;
    const h = boxHeight * scale;
    for (let dy = -reach; dy <= reach; dy += step) {
      for (let dx = -reach; dx <= reach; dx += step) {
        const left = centreX + dx - w / 2;
        const top = centreY + dy - h / 2;
        if (left < 0 || top < 0 || left + w > image.width || top + h > image.height)
          continue;
        const probe = prepare(avatarSignature(integral, left, top, w, h));
        // Correlation divides by the variation it finds, so two nearly flat
        // crops correlate at whatever their noise agrees on. An empty seat
        // against a blank strip below the panel scored 0.96 that way.
        if (spread(probe) < SEAT_MIN_CONTRAST) continue;
        probes.push({ ...probe, scale, x: centreX + dx, y: centreY + dy });
      }
    }
  }
  return probes;
}

/**
 * Look again, closely, around the crop that came nearest.
 *
 * Correlation over these signatures varies smoothly enough that the coarse
 * sweep lands on the right hill; this finds the top of it. Kept separate from
 * the sweep because where it looks depends on the row being matched, so unlike
 * the sweep it cannot be shared between them.
 */
function refineSeat(
  integral: Integral,
  image: PixelSource,
  avatar: Prepared,
  boxWidth: number,
  boxHeight: number,
  from: SeatProbe,
  unit: number
): number {
  let best = likeness(from, avatar);
  const reach = unit / 12;
  const step = Math.max(2, Math.round(unit / 32));

  for (
    let scale = Math.max(0.7, from.scale - 0.15);
    scale <= from.scale + 0.15;
    scale += 0.05
  ) {
    const w = boxWidth * scale;
    const h = boxHeight * scale;
    for (let dy = -reach; dy <= reach; dy += step) {
      for (let dx = -reach; dx <= reach; dx += step) {
        const left = from.x + dx - w / 2;
        const top = from.y + dy - h / 2;
        if (left < 0 || top < 0 || left + w > image.width || top + h > image.height)
          continue;
        const probe = prepare(avatarSignature(integral, left, top, w, h));
        if (spread(probe) < SEAT_MIN_CONTRAST) continue;
        const score = likeness(probe, avatar);
        if (score > best) best = score;
      }
    }
  }
  return best;
}

/**
 * Find the user by working out how the hands panel maps onto the table.
 *
 * The panel lists players in seating order — going clockwise round the felt
 * from whoever happens to be listed first. That ordering is the whole trick:
 * recognising *any one* player at *any one* seat pins down where the whole list
 * sits on the table, and the user's seat is known, so their row follows.
 *
 * So every panel row's avatar is matched against all eight seats. A hand worth
 * reviewing is one where the interesting players are all-in and their seat
 * avatars are covered by the client's yellow disc — but the players who folded
 * are not covered, and they are in the panel too. It is their rows that carry
 * the answer.
 *
 * Rows are stepped out by pitch rather than taken from the detected set,
 * because a folded player's row holds no cards and so is never detected. Those
 * rows are exactly the ones most likely to be legible at the seat. Stepping
 * past the top of the panel lands on the header and its buttons; those crops
 * match no seat at all, so they simply fail to match and need no special case.
 *
 * Which seats are *taken* is solved for rather than assumed. Nothing says a
 * table is full — one six-handed screenshot left the top and upper-right seats
 * empty — and the panel skips empty seats, so the step from one row to the next
 * is not a fixed turn round the felt. Every possible set of occupied seats is
 * tried instead, which is cheap: eight seats is 256 sets, and only those
 * holding the user's own seat and at least as many players as there are rows in
 * the panel are worth scoring. The recognitions pick the set out. Three rows
 * matching seats that run left, upper-left, then jumping to right can only be
 * explained by the two seats in between being empty.
 */
function findHeroFromSeats(
  image: PixelSource,
  rows: CardRegion[][],
  board: BoardAnchor,
  integral: Integral
): HeroMatch | null {
  const candidates = panelRows(rows, image.width);
  if (board.cards.length < 3) return null;

  const last = board.cards[board.cards.length - 1];
  const unit = board.unitY;
  const boardX = (board.originX + last.x + last.width) / 2;
  const boardY = board.originY + unit / 2;

  const tops = candidates.map(i => rows[i][0].y);
  const reference = panelAvatarBox(rows[candidates[0]]);
  const pitch = panelRowPitch(
    tops,
    median(candidates.map(i => rows[i][0].height))
  );
  const offset = reference.y - tops[0];
  const places = candidates.map((_, n) => Math.round((tops[n] - tops[0]) / pitch));

  const seatCount = SEAT_OFFSETS.length;
  const found: { place: number; seat: number; weight: number }[] = [];

  // Enough rows either side of the detected ones to cover a full panel wherever
  // in it they happen to fall, plus slack for a panel scrolled part way. Rows
  // stepped past the top of the panel land on its header and its buttons, and
  // are left in — they match no seat, so they cost a comparison and nothing
  // else.
  const panel: { place: number; avatar: Prepared }[] = [];
  for (let place = -10; place <= 12; place++) {
    const y = tops[0] + place * pitch + offset;
    if (y < 0 || y + reference.h > image.height) continue;
    const avatar = prepare(
      avatarSignature(integral, reference.x, y, reference.w, reference.h)
    );
    if (spread(avatar) < PANEL_MIN_CONTRAST) continue;
    panel.push({ place, avatar });
  }
  if (panel.length === 0) return null;

  /** Every panel row scored against one seat, the crops read once for all. */
  const scoreSeat = (seat: number) => {
    const probes = seatProbes(
      integral,
      image,
      reference.w,
      reference.h,
      boardX + SEAT_OFFSETS[seat][0] * unit,
      boardY + SEAT_OFFSETS[seat][1] * unit,
      unit,
      seat === HERO_SEAT ? HERO_SEARCH_RADIUS : SEAT_SEARCH_RADIUS
    );
    return panel.map(row => {
      if (probes.length === 0) return 0;
      let nearest = probes[0];
      let best = likeness(nearest, row.avatar);
      for (const probe of probes) {
        const score = likeness(probe, row.avatar);
        if (score > best) {
          best = score;
          nearest = probe;
        }
      }
      return refineSeat(
        integral,
        image,
        row.avatar,
        reference.w,
        reference.h,
        nearest,
        unit
      );
    });
  };

  /** The detected row a stepped-out place belongs to, or -1 if it holds no cards. */
  const rowAt = (place: number) => {
    const at = places.indexOf(place);
    return at < 0 ? -1 : candidates[at];
  };

  // The user's own seat first, and on most screenshots that is the end of it:
  // their avatar is drawn there plainly, and a row that matches it is theirs
  // with nothing further to work out. Seven seats of crops are not read at all
  // in that case.
  const atHeroSeat = scoreSeat(HERO_SEAT);

  // Only rows that hold cards can win it outright. The rows stepped out past
  // the top of the panel land on its header and its buttons, and those crops
  // reach 0.88 against a seat often enough to matter — they are worth a vote
  // below, where the reading as a whole can outweigh them, but not the last
  // word. A row without cards is no answer anyway.
  let clearest = -1;
  panel.forEach((row, i) => {
    if (rowAt(row.place) < 0) return;
    if (clearest < 0 || atHeroSeat[i] > atHeroSeat[clearest]) clearest = i;
  });

  if (clearest >= 0 && atHeroSeat[clearest] >= HERO_MIN_CORRELATION)
    return {
      row: rowAt(panel[clearest].place),
      correlation: atHeroSeat[clearest],
    };

  // Otherwise their avatar is covered — the client stamps an ALL-IN disc over
  // it, on exactly the hands worth reviewing — and the answer has to come from
  // where everyone else is sitting.
  atHeroSeat.forEach((score, i) => {
    if (score >= SEAT_MIN_CORRELATION)
      found.push({
        place: panel[i].place,
        seat: HERO_SEAT,
        weight: score - SEAT_MIN_CORRELATION,
      });
  });

  for (let seat = 0; seat < seatCount; seat++) {
    if (seat === HERO_SEAT) continue;
    scoreSeat(seat).forEach((score, i) => {
      // Weight by how far past the bar it got, so one clean recognition
      // outweighs several grudging ones.
      if (score >= SEAT_MIN_CORRELATION)
        found.push({
          place: panel[i].place,
          seat,
          weight: score - SEAT_MIN_CORRELATION,
        });
    });
  }
  if (found.length === 0) return null;

  // The panel cannot hold fewer players than it has rows, and its rows are all
  // different players, so the run of rows detected bounds the table's size from
  // below. That alone rules out most of the 256 sets.
  const span = Math.max(...places) - Math.min(...places) + 1;
  const least = Math.max(2, span, candidates.length);

  // Score each reading of the table by the recognitions it explains, and keep
  // the best score for each row it concludes is the user's. Competing readings
  // that reach the same row are the same answer, so the strongest stands for
  // all of them.
  const everything = found.reduce((sum, hit) => sum + hit.weight, 0);
  const byRow = new Map<number, number>();
  for (let taken = 0; taken < 1 << seatCount; taken++) {
    if (!(taken & (1 << HERO_SEAT))) continue;
    const seats: number[] = [];
    for (let seat = 0; seat < seatCount; seat++)
      if (taken & (1 << seat)) seats.push(seat);
    if (seats.length < least) continue;

    const size = seats.length;
    const heroAt = seats.indexOf(HERO_SEAT);
    for (let turn = 0; turn < size; turn++) {
      let explained = 0;
      for (const hit of found)
        if (seats[(((hit.place + turn) % size) + size) % size] === hit.seat)
          explained += hit.weight;
      if (explained <= 0) continue;
      // Charged for the recognitions it cannot account for as well as credited
      // for the ones it can. Without that a reading that explains three of five
      // scores barely below one that explains all five, and two avatars on a
      // table are alike often enough that the difference decides it.
      const total = explained - (everything - explained);

      // The row that lands on the user's seat. Rows repeat every full turn of
      // the table, but the detected rows span less than one turn, so at most
      // one of them can be it.
      const heroPlace = (((heroAt - turn) % size) + size) % size;
      const row = candidates.findIndex(
        (_, n) => (((places[n] % size) + size) % size) === heroPlace
      );
      // No such row is a real answer, not a failure: the user folded and the
      // client is showing only the hands that reached a showdown. It is scored
      // alongside the rest so that it can win, rather than being passed over in
      // favour of a worse reading that does name a row.
      const key = row < 0 ? -1 : candidates[row];
      byRow.set(key, Math.max(byRow.get(key) ?? 0, total));
    }
  }

  const ranked = [...byRow.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0 || ranked[0][1] <= 0) return null;
  const runnerUp = ranked.length > 1 ? ranked[1][1] : 0;
  if (ranked[0][1] - runnerUp < ORDER_MIN_MARGIN) return null;
  if (ranked[0][0] < 0) return null;

  return {
    row: ranked[0][0],
    correlation: ranked[0][1] + SEAT_MIN_CORRELATION,
  };
}
