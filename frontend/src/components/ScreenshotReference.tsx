import { useCallback, useState } from 'react';
import { Upload, X, Image, MousePointer, Info } from 'lucide-react';
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

export const ScreenshotReference: React.FC<ScreenshotReferenceProps> = ({
  onCardsDetected,
  numPlayers: _numPlayers = 2,
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const [showCardPicker, setShowCardPicker] = useState(false);
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
        </h3>
        <span className="text-gray-400 text-sm">
          {isExpanded ? '(collapse)' : '(expand)'}
        </span>
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

              {/* Selection mode buttons */}
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

              {/* Instructions */}
              <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-800/50 p-2 rounded">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                  1. Click Hero/Villain/Board button
                  2. Click on screenshot
                  3. Pick the card you see
                </span>
              </div>

              {/* Show collected cards */}
              {(collectedCards.hero.length > 0 || collectedCards.villain.length > 0 || collectedCards.board.length > 0) && (
                <div className="text-xs text-gray-400 space-y-1">
                  {collectedCards.hero.length > 0 && (
                    <div>Hero: {collectedCards.hero.map(c => `${c.rank}${c.suit}`).join(' ')}</div>
                  )}
                  {collectedCards.villain.length > 0 && (
                    <div>Villain: {collectedCards.villain.map(c => `${c.rank}${c.suit}`).join(' ')}</div>
                  )}
                  {collectedCards.board.length > 0 && (
                    <div>Board: {collectedCards.board.map(c => `${c.rank}${c.suit}`).join(' ')}</div>
                  )}
                </div>
              )}
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
                Then click to identify each card
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
