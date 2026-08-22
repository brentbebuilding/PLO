/**
 * Glyph Template Matching
 *
 * ClubWPT Gold renders every card from the same sprite, so recognising a card
 * is a lookup rather than a vision problem. We reduce a card's rank glyph to a
 * small normalised bitmap ("signature") and compare it against signatures the
 * user taught us during calibration.
 *
 * Nothing here knows what ClubWPT's cards actually look like — the signature is
 * built from whatever ink sits on the card background, so it works on dark cards
 * with light glyphs or light cards with dark glyphs, at any resolution.
 */

import { Card, Rank, Suit } from '../types';

/** Normalised glyph dimensions. Small enough to compare cheaply, big enough to tell 6 from 8. */
export const GLYPH_W = 16;
export const GLYPH_H = 20;

export interface Signature {
  w: number;
  h: number;
  /** Row-major grayscale, 0 = background, 255 = ink. Length is w * h. */
  data: number[];
}

export interface GlyphTemplate {
  rank: Rank;
  /** Suit the sample was taken from. Kept for provenance; matching is suit-agnostic. */
  suit: Suit;
  signature: Signature;
}

export interface MatchResult {
  rank: Rank;
  /** Similarity of the winning template, 0..1. */
  score: number;
  /** Gap between the best and second-best template. Low margin means an ambiguous read. */
  margin: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Build a normalised signature from a rectangular patch of an image.
 *
 * The patch is reduced to ink-vs-background, cropped to the ink, then fitted
 * into a fixed box preserving aspect ratio. Preserving aspect matters: it is
 * what keeps a narrow "J" distinguishable from a wide "10".
 *
 * Returns null when the patch holds too little ink to be a glyph.
 */
export function extractSignature(
  imageData: ImageData,
  bounds: Bounds
): Signature | null {
  const { data, width: imgW, height: imgH } = imageData;

  const x0 = Math.max(0, Math.floor(bounds.x));
  const y0 = Math.max(0, Math.floor(bounds.y));
  const x1 = Math.min(imgW, Math.ceil(bounds.x + bounds.width));
  const y1 = Math.min(imgH, Math.ceil(bounds.y + bounds.height));

  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 3 || h < 3) return null;

  // Luminance of every pixel in the patch.
  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = ((y0 + y) * imgW + (x0 + x)) * 4;
      lum[y * w + x] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
  }

  // Background is whatever dominates the patch border; ink is whatever is far
  // from it. This avoids assuming glyphs are darker or lighter than the card.
  const border: number[] = [];
  for (let x = 0; x < w; x++) {
    border.push(lum[x], lum[(h - 1) * w + x]);
  }
  for (let y = 0; y < h; y++) {
    border.push(lum[y * w], lum[y * w + (w - 1)]);
  }
  border.sort((a, b) => a - b);
  const background = border[Math.floor(border.length / 2)];

  // Threshold at the midpoint between background and the furthest-away pixel.
  let maxDist = 0;
  for (let i = 0; i < lum.length; i++) {
    const d = Math.abs(lum[i] - background);
    if (d > maxDist) maxDist = d;
  }
  if (maxDist < 24) return null; // Flat patch — no glyph here.
  const threshold = maxDist * 0.45;

  const ink = new Uint8Array(w * h);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let inkCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dist = Math.abs(lum[i] - background);
      if (dist >= threshold) {
        // Store normalised intensity so anti-aliased edges carry weight.
        ink[i] = Math.min(255, Math.round((dist / maxDist) * 255));
        inkCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (inkCount < 6 || maxX < minX || maxY < minY) return null;

  return fitToBox(ink, w, minX, minY, maxX, maxY);
}

export interface InkColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Mean colour of the ink in a region.
 *
 * Uses the same background-from-the-border rule as extractSignature, so it
 * measures the glyph itself rather than the card it sits on.
 */
export function extractInkColor(imageData: ImageData, bounds: Bounds): InkColor | null {
  const { data, width: imgW, height: imgH } = imageData;

  const x0 = Math.max(0, Math.floor(bounds.x));
  const y0 = Math.max(0, Math.floor(bounds.y));
  const x1 = Math.min(imgW, Math.ceil(bounds.x + bounds.width));
  const y1 = Math.min(imgH, Math.ceil(bounds.y + bounds.height));

  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 3 || h < 3) return null;

  const lumAt = (x: number, y: number) => {
    const idx = ((y0 + y) * imgW + (x0 + x)) * 4;
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  };

  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(lumAt(x, 0), lumAt(x, h - 1));
  for (let y = 0; y < h; y++) border.push(lumAt(0, y), lumAt(w - 1, y));
  border.sort((a, b) => a - b);
  const background = border[Math.floor(border.length / 2)];

  let maxDist = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.abs(lumAt(x, y) - background);
      if (d > maxDist) maxDist = d;
    }
  }
  if (maxDist < 24) return null;

  // Average only the strongest ink, so anti-aliased edges blending into the
  // card background don't wash the colour out.
  const threshold = maxDist * 0.7;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let n = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.abs(lumAt(x, y) - background) < threshold) continue;
      const idx = ((y0 + y) * imgW + (x0 + x)) * 4;
      sumR += data[idx];
      sumG += data[idx + 1];
      sumB += data[idx + 2];
      n++;
    }
  }

  if (n === 0) return null;
  return { r: sumR / n, g: sumG / n, b: sumB / n };
}

/**
 * Median colour of the region's border — the card face behind the glyph.
 *
 * ClubWPT Gold encodes the suit in the card background (blue diamonds, green
 * clubs, dark red hearts, grey spades) and draws every rank in white. So the
 * suit lives here, not in the ink. Median rather than mean, so a few stray
 * pixels of table felt along one edge don't drag the reading.
 */
export function extractBackgroundColor(
  imageData: ImageData,
  bounds: Bounds
): InkColor | null {
  const { data, width: imgW, height: imgH } = imageData;

  const x0 = Math.max(0, Math.floor(bounds.x));
  const y0 = Math.max(0, Math.floor(bounds.y));
  const x1 = Math.min(imgW, Math.ceil(bounds.x + bounds.width));
  const y1 = Math.min(imgH, Math.ceil(bounds.y + bounds.height));

  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 3 || h < 3) return null;

  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];

  const sample = (x: number, y: number) => {
    const idx = ((y0 + y) * imgW + (x0 + x)) * 4;
    rs.push(data[idx]);
    gs.push(data[idx + 1]);
    bs.push(data[idx + 2]);
  };

  for (let x = 0; x < w; x++) {
    sample(x, 0);
    sample(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    sample(0, y);
    sample(w - 1, y);
  }

  if (rs.length === 0) return null;

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  return { r: median(rs), g: median(gs), b: median(bs) };
}

/**
 * Reduce a colour to features that survive dimming.
 *
 * Chromaticity carries the hue independent of brightness, which matters because
 * folded hands are drawn greyed out. Saturation is kept as a separate axis so an
 * achromatic glyph stays distinguishable from a coloured one.
 */
function colorFeatures(color: InkColor): [number, number, number] {
  const sum = color.r + color.g + color.b || 1;
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  return [color.r / sum, color.g / sum, saturation];
}

/**
 * Nearest taught suit colour.
 *
 * Every sample the user labelled during calibration is a ground-truth example
 * of what that suit looks like on their table, so this needs no thresholds.
 */
export function matchSuitByColor(
  color: InkColor,
  samples: SuitSample[]
): { suit: Suit; distance: number } | null {
  if (samples.length === 0) return null;

  const [fr, fg, fs] = colorFeatures(color);
  let best: { suit: Suit; distance: number } | null = null;

  for (const sample of samples) {
    const [sr, sg, ss] = colorFeatures(sample);
    // Chromaticity dominates; saturation breaks ties between similar hues.
    const distance = Math.sqrt(
      (fr - sr) ** 2 + (fg - sg) ** 2 + ((fs - ss) * 0.5) ** 2
    );
    if (!best || distance < best.distance) {
      best = { suit: sample.suit, distance };
    }
  }

  return best;
}

/**
 * Fit the ink bounding box into GLYPH_W x GLYPH_H, preserving aspect ratio and
 * centering the result. Uses box sampling so downscaling keeps thin strokes.
 */
function fitToBox(
  ink: Uint8Array,
  srcStride: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): Signature {
  const srcW = maxX - minX + 1;
  const srcH = maxY - minY + 1;

  const scale = Math.min(GLYPH_W / srcW, GLYPH_H / srcH);
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));
  const offsetX = Math.floor((GLYPH_W - dstW) / 2);
  const offsetY = Math.floor((GLYPH_H - dstH) / 2);

  const out = new Array<number>(GLYPH_W * GLYPH_H).fill(0);

  for (let dy = 0; dy < dstH; dy++) {
    const sy0 = minY + Math.floor((dy * srcH) / dstH);
    const sy1 = minY + Math.max(sy0 + 1 - minY, Math.floor(((dy + 1) * srcH) / dstH));
    for (let dx = 0; dx < dstW; dx++) {
      const sx0 = minX + Math.floor((dx * srcW) / dstW);
      const sx1 = minX + Math.max(sx0 + 1 - minX, Math.floor(((dx + 1) * srcW) / dstW));

      let sum = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          sum += ink[sy * srcStride + sx];
          n++;
        }
      }
      out[(dy + offsetY) * GLYPH_W + (dx + offsetX)] = n > 0 ? Math.round(sum / n) : 0;
    }
  }

  return { w: GLYPH_W, h: GLYPH_H, data: out };
}

/**
 * Normalised cross-correlation of two signatures, mapped to 0..1.
 *
 * NCC ignores overall brightness and contrast differences, so a glyph read from
 * a dimmed (folded) card still matches a template taken from a bright one.
 */
export function compareSignatures(a: Signature, b: Signature): number {
  if (a.data.length !== b.data.length) return 0;
  const n = a.data.length;

  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    meanA += a.data[i];
    meanB += b.data[i];
  }
  meanA /= n;
  meanB /= n;

  let num = 0;
  let devA = 0;
  let devB = 0;
  for (let i = 0; i < n; i++) {
    const da = a.data[i] - meanA;
    const db = b.data[i] - meanB;
    num += da * db;
    devA += da * da;
    devB += db * db;
  }

  const denom = Math.sqrt(devA * devB);
  if (denom === 0) return 0;

  // NCC runs -1..1; fold to 0..1 so callers can treat it as a plain similarity.
  return Math.max(0, num / denom);
}

/**
 * Find the best-matching rank for a signature.
 *
 * Templates for every suit are considered — the rank glyph is the same shape
 * whatever colour it is drawn in, so pooling suits gives more samples per rank.
 */
export function matchSignature(
  signature: Signature,
  templates: GlyphTemplate[]
): MatchResult | null {
  if (templates.length === 0) return null;

  // Best score per rank, so a rank taught in three suits doesn't outvote one
  // taught in a single suit.
  const bestByRank = new Map<Rank, number>();
  for (const template of templates) {
    const score = compareSignatures(signature, template.signature);
    const prev = bestByRank.get(template.rank);
    if (prev === undefined || score > prev) {
      bestByRank.set(template.rank, score);
    }
  }

  const ranked = [...bestByRank.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;

  const [rank, score] = ranked[0];
  const runnerUp = ranked.length > 1 ? ranked[1][1] : 0;

  return { rank, score, margin: score - runnerUp };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const TEMPLATE_KEY = 'plo_glyph_templates_v1';
const SLOTS_KEY = 'plo_card_slots_v1';
const SUIT_SAMPLES_KEY = 'plo_suit_samples_v1';

/** A colour the user confirmed belongs to a given suit. */
export interface SuitSample extends InkColor {
  suit: Suit;
  /**
   * Which slot this was taken from, as "role:index".
   *
   * Re-teaching a slot has to replace its colour sample, not add another — a
   * mislabelled card would otherwise poison the suit it was wrongly assigned to
   * for good, with a full reset the only way out.
   */
  slotKey?: string;
}

export type SlotRole = 'hero' | 'opponent' | 'board';

/** Opponent seats at a 6-max table, excluding the hero's own seat. */
export const OPPONENT_SEATS = 5;
export const CARDS_PER_HAND = 4;

/**
 * A card position on the table, captured once during calibration.
 *
 * Poker clients draw cards into fixed slots — the flop always lands in the same
 * three places — so knowing the slots removes the need to hunt for cards in the
 * image, and tells us whose card it is without guessing from position.
 *
 * Stored as fractions of the image so a different window size still lines up.
 */
export interface CardSlot {
  role: SlotRole;
  /** Position within the role, left to right. */
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function loadTemplates(): GlyphTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTemplates(templates: GlyphTemplate[]): void {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
}

/** Add a template, replacing any existing sample for the same rank and suit. */
export function addTemplate(templates: GlyphTemplate[], next: GlyphTemplate): GlyphTemplate[] {
  const filtered = templates.filter(t => !(t.rank === next.rank && t.suit === next.suit));
  const updated = [...filtered, next];
  saveTemplates(updated);
  return updated;
}

export function clearTemplates(): void {
  localStorage.removeItem(TEMPLATE_KEY);
}

export function loadSlots(): CardSlot[] {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSlots(slots: CardSlot[]): void {
  localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
}

/** Add a slot, replacing any existing one for the same role and index. */
export function addSlot(slots: CardSlot[], next: CardSlot): CardSlot[] {
  const filtered = slots.filter(s => !(s.role === next.role && s.index === next.index));
  const updated = [...filtered, next].sort(
    (a, b) => a.role.localeCompare(b.role) || a.index - b.index
  );
  saveSlots(updated);
  return updated;
}

export function clearSlots(): void {
  localStorage.removeItem(SLOTS_KEY);
}

export function loadSuitSamples(): SuitSample[] {
  try {
    const raw = localStorage.getItem(SUIT_SAMPLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSuitSamples(samples: SuitSample[]): void {
  localStorage.setItem(SUIT_SAMPLES_KEY, JSON.stringify(samples));
}

/**
 * Record a confirmed suit colour.
 *
 * Several samples per suit are kept — the client dims cards that aren't in the
 * winning hand, so one suit legitimately appears at different brightnesses —
 * but capped so a suit can't crowd out the others in the nearest-neighbour
 * search. Re-teaching a slot replaces that slot's sample rather than stacking a
 * second one, so corrections actually take effect.
 */
export function addSuitSample(samples: SuitSample[], next: SuitSample): SuitSample[] {
  const MAX_PER_SUIT = 6;

  const withoutSlot = next.slotKey
    ? samples.filter(s => s.slotKey !== next.slotKey)
    : samples;

  const sameSuit = withoutSlot.filter(s => s.suit === next.suit);
  const others = withoutSlot.filter(s => s.suit !== next.suit);
  const trimmed = [...sameSuit, next].slice(-MAX_PER_SUIT);

  const updated = [...others, ...trimmed];
  saveSuitSamples(updated);
  return updated;
}

export function clearSuitSamples(): void {
  localStorage.removeItem(SUIT_SAMPLES_KEY);
}

/**
 * How many slots each role expects.
 *
 * Opponents cover every other seat at a 6-max table rather than a single
 * "villain": which seat shows down changes hand to hand, so fixed villain slots
 * only ever caught opponents sitting in one place.
 */
export const SLOT_COUNTS: Record<SlotRole, number> = {
  hero: CARDS_PER_HAND,
  opponent: OPPONENT_SEATS * CARDS_PER_HAND,
  board: 5,
};

/** Seat number (1-based) an opponent slot index belongs to. */
export function opponentSeat(index: number): number {
  return Math.floor(index / CARDS_PER_HAND) + 1;
}

/** Ranks still missing a template, so the UI can tell the user what's left. */
export function missingRanks(templates: GlyphTemplate[], allRanks: readonly Rank[]): Rank[] {
  const taught = new Set(templates.map(t => t.rank));
  return allRanks.filter(r => !taught.has(r));
}

/** Convenience for rendering a signature into a canvas during calibration. */
export function signatureToDataUrl(signature: Signature, scale = 4): string {
  const canvas = document.createElement('canvas');
  canvas.width = signature.w * scale;
  canvas.height = signature.h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < signature.h; y++) {
    for (let x = 0; x < signature.w; x++) {
      const v = signature.data[y * signature.w + x];
      if (v > 0) {
        ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }

  return canvas.toDataURL();
}

/** Card helper used by the detector once rank and suit are both known. */
export function toCard(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}
