import React from 'react';
import { Card as CardType, Suit } from '../types';
import { Card } from './Card';
import { RANKS, SUITS, SUIT_SYMBOLS, isCardInArray } from '../utils/cards';

interface CardSelectorProps {
  onSelect: (card: CardType) => void;
  usedCards: (CardType | null)[];
  isOpen: boolean;
  onClose: () => void;
}

export const CardSelector: React.FC<CardSelectorProps> = ({
  onSelect,
  usedCards,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const getSuitColor = (suit: Suit): string => {
    return suit === 'h' || suit === 'd' ? 'text-red-600' : 'text-gray-900';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">Select a Card</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4">
          {SUITS.map((suit) => (
            <div key={suit} className="flex items-center gap-2">
              <span className={`text-2xl w-8 ${getSuitColor(suit)}`}>
                {SUIT_SYMBOLS[suit]}
              </span>
              <div className="flex flex-wrap gap-1">
                {RANKS.map((rank) => {
                  const card: CardType = { rank, suit };
                  const isUsed = isCardInArray(card, usedCards);

                  return (
                    <button
                      key={`${rank}${suit}`}
                      onClick={() => {
                        if (!isUsed) {
                          onSelect(card);
                          onClose();
                        }
                      }}
                      disabled={isUsed}
                      className={`
                        w-10 h-12 rounded border
                        flex flex-col items-center justify-center
                        text-sm font-medium
                        transition-all
                        ${isUsed
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : `bg-white hover:bg-gray-50 hover:shadow ${getSuitColor(suit)}`
                        }
                      `}
                    >
                      <span>{rank === 'T' ? '10' : rank}</span>
                      <span className="text-xs">{SUIT_SYMBOLS[suit]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t">
          <button
            onClick={onClose}
            className="w-full py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CardSelector;
