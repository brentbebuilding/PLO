/**
 * Cloudflare Worker for PLO Card Detection using Claude Vision API
 *
 * Analyzes poker screenshots and returns detected cards.
 */

interface Env {
  ANTHROPIC_API_KEY: string;
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

      // Call Claude Vision API
      const cards = await detectCardsWithClaude(body.image, env.ANTHROPIC_API_KEY);

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

async function detectCardsWithClaude(base64Image: string, apiKey: string): Promise<DetectedCards> {
  // Remove data URL prefix if present
  const imageData = base64Image.replace(/^data:image\/\w+;base64,/, '');

  // Determine media type
  let mediaType = 'image/png';
  if (base64Image.startsWith('data:image/jpeg')) {
    mediaType = 'image/jpeg';
  } else if (base64Image.startsWith('data:image/webp')) {
    mediaType = 'image/webp';
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageData,
              },
            },
            {
              type: 'text',
              text: `Analyze this ClubWPT Gold poker screenshot and identify all visible cards.

ClubWPT Gold uses these colors for suits:
- BLUE = Diamonds (d)
- GREEN = Clubs (c)
- RED = Hearts (h)
- BLACK = Spades (s)

Return ONLY a JSON object in this exact format (no other text):
{
  "hero": "Ad Qc Jc 7s",
  "villain": "As Ks Ts 9c",
  "board": "6s 7s 6c 3d Qs",
  "analysis": "Brief description of the hand"
}

Rules:
- Use standard notation: A=Ace, K=King, Q=Queen, J=Jack, T=10, 9-2
- Suits: d=diamonds, c=clubs, h=hearts, s=spades
- Hero is usually bottom-left player (often has dealer button or is the main player)
- Villain is the other active player (not folded)
- Board is the community cards in the center
- Leave empty string "" if cards not visible
- Only include players who have visible cards (not folded)`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const result = await response.json() as {
    content: Array<{ type: string; text?: string }>;
  };

  // Extract the text response
  const textContent = result.content.find(c => c.type === 'text');
  if (!textContent || !textContent.text) {
    throw new Error('No response from Claude');
  }

  // Parse the JSON from Claude's response
  try {
    // Try to extract JSON from the response (Claude might add extra text)
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as DetectedCards;
    }
    throw new Error('No JSON found in response');
  } catch {
    // If parsing fails, return the raw text as analysis
    return {
      hero: '',
      villain: '',
      board: '',
      analysis: textContent.text,
    };
  }
}
