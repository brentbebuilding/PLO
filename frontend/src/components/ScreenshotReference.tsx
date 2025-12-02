import { useCallback, useState } from 'react';
import { Upload, X, Image, MousePointer, Info, Zap, Loader2, Settings } from 'lucide-react';
import { Card, Rank, Suit } from '../types';
import { RANKS, SUITS, SUIT_SYMBOLS } from '../utils/cards';

interface DetectionResult {
  playerCards: Card[][];
  boardCards: Card[];
}

interface ScreenshotReferenceProps {
  onCardsDetected?: (result: DetectionResult) => void;
  numPlayers?: number;
}

type SelectionMode = 'hero' | 'villain' | 'board' | null;

// Parse card string like "Ad Qc Jc 7s" into Card objects
const parseCardString = (input: string): Card[] => {
  const cards: Card[] = [];
  const validRanks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
  const validSuits = ['d', 'c', 'h', 's'];

  const tokens = input.trim().toUpperCase().split(/\s+/);

  for (const token of tokens) {
    if (token.length >= 2) {
      let rank = token[0];
      let suit = token[1].toLowerCase();

      if (token.startsWith('10')) {
        rank = 'T';
        suit = token[2]?.toLowerCase() || '';
      }

      if (validRanks.includes(rank) && validSuits.includes(suit)) {
        cards.push({ rank: rank as Rank, suit: suit as Suit });
      }
    }
  }

  return cards;
};

// Get API URL from localStorage or use default
const DEFAULT_API_URL = 'https://plo-vision.brentloies.workers.dev';

const getApiUrl = (): string => {
  return localStorage.getItem('plo_vision_api_url') || DEFAULT_API_URL;
};

const setApiUrl = (url: string): void => {
  localStorage.setItem('plo_vision_api_url', url);
};

export const ScreenshotReference: React.FC<ScreenshotReferenceProps> = ({
  onCardsDetected,
  numPlayers: _numPlayers = 2,
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiUrl, setApiUrlState] = useState(getApiUrl());
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [detectionResult, setDetectionResult] = useState<{
    hero: string;
    villain: string;
    board: string;
    analysis?: string;
  } | null>(null);
  const [collectedCards, setCollectedCards] = useState<{
    hero: Card[];
    villain: Card[];
    board: Card[];
  }>({ hero: [], villain: [], board: [] });

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setPreview(imageData);
      setCollectedCards({ hero: [], villain: [], board: [] });
      setDetectionResult(null);
      setDetectionError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) handleFile(file);
        break;
      }
    }
  }, [handleFile]);

  const clearPreview = () => {
    setPreview(null);
    setCollectedCards({ hero: [], villain: [], board: [] });
    setSelectionMode(null);
    setDetectionResult(null);
    setDetectionError(null);
  };

  const handleImageClick = () => {
    if (selectionMode) {
      setShowCardPicker(true);
    }
  };

  const handleCardPick = (card: Card) => {
    if (!selectionMode) return;

    const newCollectedCards = { ...collectedCards };

    if (selectionMode === 'hero' && collectedCards.hero.length < 4) {
      newCollectedCards.hero = [...collectedCards.hero, card];
    } else if (selectionMode === 'villain' && collectedCards.villain.length < 4) {
      newCollectedCards.villain = [...collectedCards.villain, card];
    } else if (selectionMode === 'board' && collectedCards.board.length < 5) {
      newCollectedCards.board = [...collectedCards.board, card];
    }

    setCollectedCards(newCollectedCards);
    setShowCardPicker(false);

    // Auto-send to parent when we have enough cards
    const playerCards: Card[][] = [newCollectedCards.hero];
    if (newCollectedCards.villain.length > 0) {
      playerCards.push(newCollectedCards.villain);
    }

    onCardsDetected?.({
      playerCards,
      boardCards: newCollectedCards.board,
    });
  };

  // Auto-detect cards using Claude Vision API
  const handleAutoDetect = async () => {
    if (!preview || !apiUrl) {
      if (!apiUrl) {
        setShowSettings(true);
        setDetectionError('Please configure the Vision API URL first');
      }
      return;
    }

    setIsDetecting(true);
    setDetectionError(null);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: preview }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Detection failed');
      }

      const result = await response.json();
      setDetectionResult(result);

      // Parse and apply the detected cards
      const heroCards = parseCardString(result.hero || '');
      const villainCards = parseCardString(result.villain || '');
      const boardCardsDetected = parseCardString(result.board || '');

      // Update collected cards state
      setCollectedCards({
        hero: heroCards,
        villain: villainCards,
        board: boardCardsDetected,
      });

      // Send to parent
      const playerCards: Card[][] = [heroCards];
      if (villainCards.length > 0) {
        playerCards.push(villainCards);
      }

      onCardsDetected?.({
        playerCards,
        boardCards: boardCardsDetected,
      });

    } catch (error) {
      setDetectionError(error instanceof Error ? error.message : 'Detection failed');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSaveApiUrl = (url: string) => {
    setApiUrl(url);
    setApiUrlState(url);
    setShowSettings(false);
  };

  const isCardUsed = (rank: Rank, suit: Suit): boolean => {
    const allCards = [...collectedCards.hero, ...collectedCards.villain, ...collectedCards.board];
    return allCards.some(c => c.rank === rank && c.suit === suit);
  };

  const getSuitColor = (suit: Suit): string => {
    return suit === 'h' || suit === 'd' ? 'text-red-600' : 'text-gray-900';
  };

  const getCardCount = (mode: SelectionMode): string => {
    if (mode === 'hero') return `${collectedCards.hero.length}/4`;
    if (mode === 'villain') return `${collectedCards.villain.length}/4`;
    if (mode === 'board') return `${collectedCards.board.length}/5`;
    return '';
  };

  return (
    <div className="bg-gray-800/30 rounded-xl p-4">
      <div
        className="flex justify-between items-center cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-white font-medium flex items-center gap-2">
          <Image size={18} />
          Screenshot Helper
          {apiUrl && <span className="text-green-400 text-xs">(AI enabled)</span>}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSettings(true);
            }}
            className="text-gray-400 hover:text-white p-1"
            title="Settings"
          >
            <Settings size={16} />
          </button>
          <span className="text-gray-400 text-sm">
            {isExpanded ? '(collapse)' : '(expand)'}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4">
          {preview ? (
            <div className="space-y-3">
              {/* Screenshot with click overlay */}
              <div
                className={`relative cursor-${selectionMode ? 'crosshair' : 'default'}`}
                onClick={handleImageClick}
              >
                <img
                  src={preview}
                  alt="Screenshot"
                  className={`w-full rounded-lg max-h-64 object-contain bg-gray-900 ${
                    selectionMode ? 'ring-2 ring-blue-500' : ''
                  }`}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearPreview();
                  }}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <X size={16} />
                </button>
                {selectionMode && (
                  <div className="absolute inset-0 bg-blue-500/10 rounded-lg flex items-center justify-center">
                    <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm">
                      Click to add {selectionMode} card
                    </span>
                  </div>
                )}
              </div>

              {/* Auto-detect button */}
              <button
                onClick={handleAutoDetect}
                disabled={isDetecting || !apiUrl}
                className={`w-full py-2 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                  isDetecting
                    ? 'bg-purple-700 text-white cursor-wait'
                    : apiUrl
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isDetecting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Detecting cards...
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    Auto-Detect Cards (AI)
                  </>
                )}
              </button>

              {/* Detection error */}
              {detectionError && (
                <div className="text-red-400 text-sm bg-red-900/30 rounded p-2">
                  {detectionError}
                </div>
              )}

              {/* Detection result */}
              {detectionResult && (
                <div className="bg-green-900/30 rounded p-2 text-sm space-y-1">
                  <div className="text-green-400 font-medium">Detected:</div>
                  {detectionResult.hero && (
                    <div className="text-gray-300">Hero: <span className="text-white font-mono">{detectionResult.hero}</span></div>
                  )}
                  {detectionResult.villain && (
                    <div className="text-gray-300">Villain: <span className="text-white font-mono">{detectionResult.villain}</span></div>
                  )}
                  {detectionResult.board && (
                    <div className="text-gray-300">Board: <span className="text-white font-mono">{detectionResult.board}</span></div>
                  )}
                  {detectionResult.analysis && (
                    <div className="text-gray-400 text-xs mt-2">{detectionResult.analysis}</div>
                  )}
                </div>
              )}

              {/* Manual selection mode buttons */}
              <div className="border-t border-gray-700 pt-3">
                <div className="text-gray-400 text-xs mb-2">Or manually select cards:</div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectionMode(selectionMode === 'hero' ? null : 'hero')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      selectionMode === 'hero'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <MousePointer size={14} className="inline mr-1" />
                    Hero {getCardCount('hero')}
                  </button>
                  <button
                    onClick={() => setSelectionMode(selectionMode === 'villain' ? null : 'villain')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      selectionMode === 'villain'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <MousePointer size={14} className="inline mr-1" />
                    Villain {getCardCount('villain')}
                  </button>
                  <button
                    onClick={() => setSelectionMode(selectionMode === 'board' ? null : 'board')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      selectionMode === 'board'
                        ? 'bg-yellow-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <MousePointer size={14} className="inline mr-1" />
                    Board {getCardCount('board')}
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-800/50 p-2 rounded">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                  Click "Auto-Detect" to identify cards with AI, or manually click Hero/Villain/Board then click on screenshot to pick cards.
                </span>
              </div>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-gray-500 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onPaste={handlePaste}
              onClick={() => document.getElementById('screenshot-input')?.click()}
              tabIndex={0}
            >
              <Upload className="mx-auto text-gray-400 mb-2" size={24} />
              <p className="text-gray-300 text-sm">
                Drop screenshot, paste (Ctrl+V), or click to upload
              </p>
              <p className="text-gray-500 text-xs mt-1">
                {apiUrl ? 'AI will auto-detect cards' : 'Configure Vision API in settings for auto-detection'}
              </p>
              <input
                id="screenshot-input"
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
            </div>
          )}
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-4 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-medium">Vision API Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1">
                  Vision API URL
                </label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrlState(e.target.value)}
                  placeholder="https://your-worker.your-subdomain.workers.dev"
                  className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="text-gray-400 text-xs space-y-2">
                <p>To enable AI card detection:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Deploy the Cloudflare Worker from /worker folder</li>
                  <li>Set your Anthropic API key as a secret</li>
                  <li>Paste the worker URL above</li>
                </ol>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveApiUrl(apiUrl)}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Card Picker Modal */}
      {showCardPicker && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-4 max-w-sm w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-medium">
                Select {selectionMode} card
              </h3>
              <button
                onClick={() => setShowCardPicker(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-2">
              {SUITS.map((suit) => (
                <div key={suit} className="flex items-center gap-1">
                  <span className={`text-xl w-6 ${getSuitColor(suit)}`}>
                    {SUIT_SYMBOLS[suit]}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {RANKS.map((rank) => {
                      const isUsed = isCardUsed(rank, suit);
                      return (
                        <button
                          key={`${rank}${suit}`}
                          onClick={() => !isUsed && handleCardPick({ rank, suit })}
                          disabled={isUsed}
                          className={`w-8 h-10 rounded text-sm font-medium transition-colors ${
                            isUsed
                              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                              : `bg-white hover:bg-gray-100 ${getSuitColor(suit)}`
                          }`}
                        >
                          {rank === 'T' ? '10' : rank}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreenshotReference;
