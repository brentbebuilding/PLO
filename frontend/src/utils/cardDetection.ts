/**
 * Card Detection from Poker Screenshots
 *
 * Analyzes poker screenshots to detect and identify playing cards.
 * Uses color analysis and pattern matching.
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

interface CardRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  imageData: ImageData;
}

/**
 * Main detection function - analyzes an image and returns detected cards
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
        const result = analyzePokerTable(ctx, canvas.width, canvas.height, numPlayers);
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
 * Analyze the poker table image to find cards
 */
function analyzePokerTable(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  numPlayers: number
): DetectionResult {
  // Find all card-like regions in the image
  const cardRegions = findCardRegions(ctx, width, height);

  if (cardRegions.length === 0) {
    return {
      success: false,
      playerCards: [],
      boardCards: [],
      message: 'No cards detected. Try a clearer screenshot.'
    };
  }

  // Identify each card
  const identifiedCards: DetectedCard[] = [];
  for (const region of cardRegions) {
    const card = identifyCard(region);
    if (card) {
      identifiedCards.push(card);
    }
  }

  // Group cards by position (board vs players)
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
    message: `Detected ${identifiedCards.length} cards`
  };
}

/**
 * Find rectangular regions that look like playing cards
 */
function findCardRegions(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): CardRegion[] {
  const regions: CardRegion[] = [];
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Scan for white/light colored rectangular regions
  const gridSize = 20; // Scan in grid pattern for efficiency
  const visited = new Set<string>();

  for (let y = 0; y < height; y += gridSize) {
    for (let x = 0; x < width; x += gridSize) {
      const key = `${Math.floor(x / gridSize)},${Math.floor(y / gridSize)}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Check if this pixel is light colored (potential card background)
      if (isLightColor(r, g, b)) {
        // Try to expand this into a card region
        const region = expandCardRegion(ctx, x, y, width, height);
        if (region && isValidCardRegion(region)) {
          regions.push(region);
          // Mark surrounding area as visited
          markVisited(visited, region, gridSize);
        }
      }
    }
  }

  return regions;
}

/**
 * Check if a color is light (potential card background)
 */
function isLightColor(r: number, g: number, b: number): boolean {
  const brightness = (r + g + b) / 3;
  return brightness > 180 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30;
}

/**
 * Expand from a seed point to find card boundaries
 */
function expandCardRegion(
  ctx: CanvasRenderingContext2D,
  seedX: number,
  seedY: number,
  imgWidth: number,
  imgHeight: number
): CardRegion | null {
  // Expected card dimensions (will vary by screenshot resolution)
  const minWidth = 30;
  const maxWidth = 150;
  const minHeight = 40;
  const maxHeight = 200;

  // Find boundaries by scanning outward
  let left = seedX;
  let right = seedX;
  let top = seedY;
  let bottom = seedY;

  const imageData = ctx.getImageData(0, 0, imgWidth, imgHeight);
  const data = imageData.data;

  // Expand left
  while (left > 0 && isCardPixel(data, left - 1, seedY, imgWidth)) {
    left--;
    if (seedX - left > maxWidth / 2) break;
  }

  // Expand right
  while (right < imgWidth - 1 && isCardPixel(data, right + 1, seedY, imgWidth)) {
    right++;
    if (right - seedX > maxWidth / 2) break;
  }

  // Expand up
  while (top > 0 && isCardPixel(data, seedX, top - 1, imgWidth)) {
    top--;
    if (seedY - top > maxHeight / 2) break;
  }

  // Expand down
  while (bottom < imgHeight - 1 && isCardPixel(data, seedX, bottom + 1, imgWidth)) {
    bottom++;
    if (bottom - seedY > maxHeight / 2) break;
  }

  const width = right - left;
  const height = bottom - top;

  if (width < minWidth || width > maxWidth || height < minHeight || height > maxHeight) {
    return null;
  }

  return {
    x: left,
    y: top,
    width,
    height,
    imageData: ctx.getImageData(left, top, width, height)
  };
}

/**
 * Check if a pixel belongs to a card (light colored)
 */
function isCardPixel(data: Uint8ClampedArray, x: number, y: number, width: number): boolean {
  const idx = (y * width + x) * 4;
  return isLightColor(data[idx], data[idx + 1], data[idx + 2]);
}

/**
 * Validate that a region looks like a card (aspect ratio check)
 */
function isValidCardRegion(region: CardRegion): boolean {
  const aspectRatio = region.width / region.height;
  // Cards are typically taller than wide, aspect ratio around 0.6-0.8
  return aspectRatio > 0.5 && aspectRatio < 0.9;
}

/**
 * Mark grid cells as visited
 */
function markVisited(visited: Set<string>, region: CardRegion, gridSize: number): void {
  const startX = Math.floor(region.x / gridSize);
  const endX = Math.floor((region.x + region.width) / gridSize);
  const startY = Math.floor(region.y / gridSize);
  const endY = Math.floor((region.y + region.height) / gridSize);

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      visited.add(`${x},${y}`);
    }
  }
}

/**
 * Identify the rank and suit of a card from its image region
 */
function identifyCard(region: CardRegion): DetectedCard | null {
  const { imageData, x, y, width, height } = region;
  const data = imageData.data;

  // Analyze the top-left corner for rank/suit (that's where they appear on cards)
  const cornerWidth = Math.floor(width * 0.4);
  const cornerHeight = Math.floor(height * 0.35);

  // Count red vs black pixels to determine suit color
  let redPixels = 0;
  let blackPixels = 0;
  let totalColoredPixels = 0;

  for (let cy = 0; cy < cornerHeight; cy++) {
    for (let cx = 0; cx < cornerWidth; cx++) {
      const idx = (cy * width + cx) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Skip light/white pixels
      if (isLightColor(r, g, b)) continue;

      totalColoredPixels++;

      // Check if red (hearts/diamonds)
      if (r > 150 && g < 100 && b < 100) {
        redPixels++;
      }
      // Check if black (clubs/spades)
      else if (r < 80 && g < 80 && b < 80) {
        blackPixels++;
      }
    }
  }

  if (totalColoredPixels < 20) {
    return null; // Not enough data to identify
  }

  // Determine suit based on color
  const isRed = redPixels > blackPixels;

  // For now, default to hearts/spades (most common)
  // More sophisticated detection could analyze shapes
  const suit: Suit = isRed ? 'h' : 's';

  // Rank detection is harder - would need OCR or template matching
  // For now, return a placeholder that user can correct
  const rank: Rank = 'A'; // Placeholder

  const confidence = Math.min(
    (Math.max(redPixels, blackPixels) / totalColoredPixels) * 100,
    80
  );

  return {
    card: { rank, suit },
    confidence,
    bounds: { x, y, width, height }
  };
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

  // Cards in the middle third vertically are likely board cards
  const middleStart = imageHeight * 0.3;
  const middleEnd = imageHeight * 0.5;

  // Cards in the bottom third are likely player cards
  const bottomStart = imageHeight * 0.6;

  for (const card of sortedCards) {
    const centerY = card.bounds.y + card.bounds.height / 2;
    const centerX = card.bounds.x + card.bounds.width / 2;

    if (centerY >= middleStart && centerY <= middleEnd) {
      // Board card
      boardCards.push(card);
    } else if (centerY >= bottomStart) {
      // Player card - assign to player based on horizontal position
      const playerIndex = Math.floor((centerX / imageWidth) * numPlayers);
      const clampedIndex = Math.max(0, Math.min(numPlayers - 1, playerIndex));
      playerCards[clampedIndex].push(card);
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

    // Draw boxes around detected cards
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;

    for (const playerHand of result.playerCards) {
      for (const card of playerHand) {
        ctx.strokeRect(
          card.bounds.x,
          card.bounds.y,
          card.bounds.width,
          card.bounds.height
        );
      }
    }

    ctx.strokeStyle = '#ffff00';
    for (const card of result.boardCards) {
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
