/**
 * Cloudflare Worker for PLO Card Detection using Roboflow Vision API
 *
 * Analyzes poker screenshots and returns detected cards.
 * Uses Roboflow's hosted inference for playing card detection.
 */

interface Env {
  ROBOFLOW_API_KEY: string;
  GEMINI_API_KEY?: string; // Optional fallback
}

interface CardDetectionRequest {
  image: string; // base64 encoded image
}

interface DetectedCards {
  hero: string;
  villain: string;
  board: string;
  analysis?: string;
}

interface RoboflowPrediction {
  x: number;
  y: number;
  width: number;
  height: number;
  class: string;
  confidence: number;
}

interface RoboflowResponse {
  predictions: RoboflowPrediction[];
  image: {
    width: number;
    height: number;
  };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    try {
      const body = await request.json() as CardDetectionRequest;

      if (!body.image) {
        return new Response(JSON.stringify({ error: 'No image provided' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // Call Roboflow Vision API
      const cards = await detectCardsWithRoboflow(body.image, env.ROBOFLOW_API_KEY);

      return new Response(JSON.stringify(cards), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({
        error: error instanceof Error ? error.message : 'Detection failed'
      }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  },
};

/**
 * Normalize card class name from Roboflow to standard notation
 * Handles various formats like "Ah", "ace-hearts", "A-h", "ace_of_hearts", etc.
 */
function normalizeCardClass(className: string): string {
  // Already in standard format (e.g., "Ah", "Ks", "Td")
  if (/^[AKQJT2-9][hdcs]$/i.test(className)) {
    const rank = className[0].toUpperCase();
    const suit = className[1].toLowerCase();
    return `${rank === '1' ? 'T' : rank}${suit}`;
  }

  // Handle "10" as rank
  if (/^10[hdcs]$/i.test(className)) {
    return `T${className[2].toLowerCase()}`;
  }

  // Parse longer formats like "ace-hearts", "king_of_spades", etc.
  const normalized = className.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+of\s+/g, ' ');

  const rankMap: Record<string, string> = {
    'ace': 'A', 'king': 'K', 'queen': 'Q', 'jack': 'J', 'ten': 'T', '10': 'T',
    'nine': '9', '9': '9', 'eight': '8', '8': '8', 'seven': '7', '7': '7',
    'six': '6', '6': '6', 'five': '5', '5': '5', 'four': '4', '4': '4',
    'three': '3', '3': '3', 'two': '2', '2': '2',
    'a': 'A', 'k': 'K', 'q': 'Q', 'j': 'J', 't': 'T'
  };

  const suitMap: Record<string, string> = {
    'hearts': 'h', 'heart': 'h', 'h': 'h',
    'diamonds': 'd', 'diamond': 'd', 'd': 'd',
    'clubs': 'c', 'club': 'c', 'c': 'c',
    'spades': 's', 'spade': 's', 's': 's'
  };

  let rank = '';
  let suit = '';

  for (const [key, value] of Object.entries(rankMap)) {
    if (normalized.includes(key)) {
      rank = value;
      break;
    }
  }

  for (const [key, value] of Object.entries(suitMap)) {
    if (normalized.includes(key)) {
      suit = value;
      break;
    }
  }

  if (rank && suit) {
    return `${rank}${suit}`;
  }

  // Return original if we can't parse it
  return className;
}

/**
 * Categorize detected cards into hero, villain, and board based on Y position
 * Hero cards are at the bottom, board in the middle, villain at the top
 */
function categorizeCardsByPosition(
  predictions: RoboflowPrediction[],
  imageHeight: number
): DetectedCards {
  // Filter by confidence threshold
  const confidentPredictions = predictions.filter(p => p.confidence > 0.5);

  if (confidentPredictions.length === 0) {
    return { hero: '', villain: '', board: '', analysis: 'No cards detected with sufficient confidence' };
  }

  // Sort by Y position (top to bottom)
  const sorted = [...confidentPredictions].sort((a, b) => a.y - b.y);

  // Determine zones based on image height
  // Top third = villain, middle third = board, bottom third = hero
  const topThreshold = imageHeight * 0.35;
  const bottomThreshold = imageHeight * 0.65;

  // Sort cards within each group by X position (left to right)
  const sortByX = (cards: RoboflowPrediction[]) =>
    cards.sort((a, b) => a.x - b.x).map(p => normalizeCardClass(p.class));

  const villainSorted = sortByX(sorted.filter(p => p.y < topThreshold));
  const boardSorted = sortByX(sorted.filter(p => p.y >= topThreshold && p.y <= bottomThreshold));
  const heroSorted = sortByX(sorted.filter(p => p.y > bottomThreshold));

  return {
    hero: heroSorted.join(' '),
    villain: villainSorted.join(' '),
    board: boardSorted.join(' '),
    analysis: `Detected ${confidentPredictions.length} cards via Roboflow`
  };
}

async function detectCardsWithRoboflow(base64Image: string, apiKey: string): Promise<DetectedCards> {
  // Remove data URL prefix if present
  const imageData = base64Image.replace(/^data:image\/\w+;base64,/, '');

  // Roboflow serverless inference endpoint (from Roboflow dashboard)
  const ROBOFLOW_URL = 'https://serverless.roboflow.com/playing-cards-pquad-t4ks2/1';
  const ROBOFLOW_KEY = apiKey || '5rpPWbm9rQNydbi4VDgn';

  // Send base64 image in request body
  const response = await fetch(
    `${ROBOFLOW_URL}?api_key=${ROBOFLOW_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: imageData,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Roboflow API error: ${error}`);
  }

  const result = await response.json() as RoboflowResponse;

  if (!result.predictions || result.predictions.length === 0) {
    return {
      hero: '',
      villain: '',
      board: '',
      analysis: 'No cards detected in image'
    };
  }

  // Categorize cards by their position in the image
  const imageHeight = result.image?.height || 1080;
  return categorizeCardsByPosition(result.predictions, imageHeight);
}
