/**
 * Card Detection for ClubWPT Gold Screenshots
 *
 * ClubWPT Gold color scheme:
 * - Diamonds = BLUE
 * - Clubs = GREEN
 * - Spades = BLACK
 * - Hearts = RED
 *
 * Cards have dark backgrounds with colored rank/suit symbols.
 * Winning hands appear brighter, losing hands are greyed out.
 */

import { Card, Rank, Suit } from '../types';

interface DetectedCard {
  card: Card;
  confidence: number;
  bounds: { x: number; y: number; width: number; height: number };
}

interface DetectionResult {
  success: boolean;
  playerCards: DetectedCard[][];
  boardCards: DetectedCard[];
  message?: string;
}

// ClubWPT Gold suit colors reference:
// - Diamonds = BLUE (b > 150, b > r+50, b > g)
// - Clubs = GREEN (g > 120, g > r+30, g > b+30)
// - Hearts = RED (r > 150, r > g+50, r > b+50)
// - Spades = BLACK (hard to distinguish from background)

/**
 * Main detection function - analyzes a ClubWPT Gold screenshot
 */
export async function detectCardsFromImage(
  imageData: string,
  numPlayers: number = 2
): Promise<DetectionResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve({ success: false, playerCards: [], boardCards: [], message: 'Canvas not supported' });
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      try {
        const result = analyzeClubWPTTable(ctx, canvas.width, canvas.height, numPlayers);
        resolve(result);
      } catch (error) {
        resolve({
          success: false,
          playerCards: [],
          boardCards: [],
          message: error instanceof Error ? error.message : 'Detection failed'
        });
      }
    };

    img.onerror = () => {
      resolve({ success: false, playerCards: [], boardCards: [], message: 'Failed to load image' });
    };

    img.src = imageData;
  });
}

/**
 * Analyze ClubWPT Gold table for cards
 */
function analyzeClubWPTTable(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  numPlayers: number
): DetectionResult {
  const imageData = ctx.getImageData(0, 0, width, height);

  // Find colored regions that match suit colors
  const coloredRegions = findColoredRegions(imageData, width, height);

  if (coloredRegions.length === 0) {
    return {
      success: false,
      playerCards: [],
      boardCards: [],
      message: 'No card colors detected. Make sure the screenshot shows card faces.'
    };
  }

  // Group nearby colored pixels into card regions
  const cardRegions = groupIntoCards(coloredRegions, width, height);

  // Identify each card based on color
  const identifiedCards: DetectedCard[] = cardRegions.map(region => ({
    card: {
      rank: 'A' as Rank, // Rank detection requires more sophisticated analysis
      suit: region.suit
    },
    confidence: region.confidence,
    bounds: region.bounds
  }));

  // Group cards by position
  const { playerCards, boardCards } = groupCardsByPosition(
    identifiedCards,
    width,
    height,
    numPlayers
  );

  return {
    success: identifiedCards.length > 0,
    playerCards,
    boardCards,
    message: `Detected ${identifiedCards.length} cards (suits identified, ranks need manual selection)`
  };
}

interface ColoredPixel {
  x: number;
  y: number;
  suit: Suit;
  brightness: number;
}

/**
 * Find pixels that match ClubWPT Gold suit colors
 */
function findColoredRegions(
  imageData: ImageData,
  width: number,
  height: number
): ColoredPixel[] {
  const pixels: ColoredPixel[] = [];
  const data = imageData.data;

  // Sample every few pixels for performance
  const step = 3;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const brightness = (r + g + b) / 3;

      // Check each suit color
      const suit = identifySuitFromColor(r, g, b);
      if (suit) {
        pixels.push({ x, y, suit, brightness });
      }
    }
  }

  return pixels;
}

/**
 * Identify suit based on RGB color
 */
function identifySuitFromColor(r: number, g: number, b: number): Suit | null {
  // Blue = Diamonds
  if (b > 150 && b > r + 50 && b > g) {
    return 'd';
  }

  // Green = Clubs
  if (g > 120 && g > r + 30 && g > b + 30) {
    return 'c';
  }

  // Red = Hearts
  if (r > 150 && r > g + 50 && r > b + 50) {
    return 'h';
  }

  // Black = Spades (need to check it's on a card, not just dark background)
  // Only count as spade if surrounded by lighter pixels (card background)
  // This is tricky - skip for now as black is ambiguous

  return null;
}

interface CardRegion {
  suit: Suit;
  bounds: { x: number; y: number; width: number; height: number };
  confidence: number;
  pixelCount: number;
}

/**
 * Group colored pixels into card regions
 */
function groupIntoCards(
  pixels: ColoredPixel[],
  _width: number,
  _height: number
): CardRegion[] {
  if (pixels.length === 0) return [];

  // Simple clustering - group pixels within certain distance
  const clusters: ColoredPixel[][] = [];
  const used = new Set<number>();
  const clusterDistance = 50; // pixels within this distance belong to same card

  for (let i = 0; i < pixels.length; i++) {
    if (used.has(i)) continue;

    const cluster: ColoredPixel[] = [pixels[i]];
    used.add(i);

    // Find all pixels close to this cluster
    for (let j = i + 1; j < pixels.length; j++) {
      if (used.has(j)) continue;

      // Check if pixel j is close to any pixel in cluster
      for (const cp of cluster) {
        const dist = Math.sqrt(
          Math.pow(pixels[j].x - cp.x, 2) +
          Math.pow(pixels[j].y - cp.y, 2)
        );
        if (dist < clusterDistance && pixels[j].suit === cp.suit) {
          cluster.push(pixels[j]);
          used.add(j);
          break;
        }
      }
    }

    if (cluster.length >= 5) { // Minimum pixels to be a card
      clusters.push(cluster);
    }
  }

  // Convert clusters to card regions
  return clusters.map(cluster => {
    const xs = cluster.map(p => p.x);
    const ys = cluster.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Most common suit in cluster
    const suitCounts: Record<string, number> = {};
    for (const p of cluster) {
      suitCounts[p.suit] = (suitCounts[p.suit] || 0) + 1;
    }
    const suit = Object.entries(suitCounts)
      .sort((a, b) => b[1] - a[1])[0][0] as Suit;

    return {
      suit,
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      },
      confidence: Math.min(cluster.length / 20 * 100, 90),
      pixelCount: cluster.length
    };
  });
}

/**
 * Group detected cards by their position on the table
 */
function groupCardsByPosition(
  cards: DetectedCard[],
  imageWidth: number,
  imageHeight: number,
  numPlayers: number
): { playerCards: DetectedCard[][]; boardCards: DetectedCard[] } {
  const playerCards: DetectedCard[][] = Array.from({ length: numPlayers }, () => []);
  const boardCards: DetectedCard[] = [];

  // Sort cards by vertical position
  const sortedCards = [...cards].sort((a, b) => a.bounds.y - b.bounds.y);

  // ClubWPT Gold layout:
  // - Board cards are in the center (roughly 35-50% from top)
  // - Hero cards are at bottom left (70%+ from top, left side)
  // - Villain cards are on the right side

  const boardTop = imageHeight * 0.30;
  const boardBottom = imageHeight * 0.55;
  const heroBottom = imageHeight * 0.60;

  for (const card of sortedCards) {
    const centerY = card.bounds.y + card.bounds.height / 2;
    const centerX = card.bounds.x + card.bounds.width / 2;

    if (centerY >= boardTop && centerY <= boardBottom && centerX > imageWidth * 0.25 && centerX < imageWidth * 0.75) {
      // Board card (center of table)
      boardCards.push(card);
    } else if (centerY >= heroBottom) {
      // Player card - determine which player based on horizontal position
      if (centerX < imageWidth * 0.4) {
        // Hero (left side)
        playerCards[0].push(card);
      } else if (centerX > imageWidth * 0.6) {
        // Villain (right side)
        if (numPlayers > 1) {
          playerCards[1].push(card);
        }
      }
    }
  }

  // Sort board cards left to right
  boardCards.sort((a, b) => a.bounds.x - b.bounds.x);

  // Sort each player's cards left to right
  for (const hand of playerCards) {
    hand.sort((a, b) => a.bounds.x - b.bounds.x);
  }

  return { playerCards, boardCards };
}

/**
 * Draw detection results on a canvas for debugging
 */
export function drawDetectionResults(
  canvas: HTMLCanvasElement,
  imageData: string,
  result: DetectionResult
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // Draw boxes around detected cards with suit colors
    const suitColors: Record<Suit, string> = {
      'd': '#0088ff', // Blue for diamonds
      'c': '#00cc00', // Green for clubs
      'h': '#ff0000', // Red for hearts
      's': '#333333'  // Dark gray for spades
    };

    ctx.lineWidth = 3;

    for (const playerHand of result.playerCards) {
      for (const card of playerHand) {
        ctx.strokeStyle = suitColors[card.card.suit];
        ctx.strokeRect(
          card.bounds.x,
          card.bounds.y,
          card.bounds.width,
          card.bounds.height
        );
        // Label
        ctx.fillStyle = suitColors[card.card.suit];
        ctx.font = '14px Arial';
        ctx.fillText(
          `${card.card.rank}${card.card.suit}`,
          card.bounds.x,
          card.bounds.y - 5
        );
      }
    }

    ctx.strokeStyle = '#ffff00';
    for (const card of result.boardCards) {
      ctx.strokeStyle = suitColors[card.card.suit];
      ctx.strokeRect(
        card.bounds.x,
        card.bounds.y,
        card.bounds.width,
        card.bounds.height
      );
    }
  };

  img.src = imageData;
}
