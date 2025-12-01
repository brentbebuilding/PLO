import React from 'react';
import { Card as CardType } from '../types';
import { Card } from './Card';

interface BoardProps {
  cards: (CardType | null)[];
  onCardClick: (cardIndex: number) => void;
  stage: 'preflop' | 'flop' | 'turn' | 'river';
}

export const Board: React.FC<BoardProps> = ({ cards, onCardClick, stage }) => {
  const getStageInfo = () => {
    switch (stage) {
      case 'preflop':
        return { label: 'Preflop', activeCount: 0 };
      case 'flop':
        return { label: 'Flop', activeCount: 3 };
      case 'turn':
        return { label: 'Turn', activeCount: 4 };
      case 'river':
        return { label: 'River', activeCount: 5 };
    }
  };

  const { label, activeCount } = getStageInfo();

  return (
    <div className="bg-poker-felt/60 rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white font-medium">Community Cards</h3>
        <span className="text-sm text-gray-400 bg-gray-800/50 px-3 py-1 rounded-full">
          {label}
        </span>
      </div>

      <div className="flex justify-center gap-3">
        {[0, 1, 2, 3, 4].map((idx) => {
          const isActive = idx < activeCount || cards[idx] !== null;
          const showPlaceholder = stage !== 'preflop' || idx < 3;

          return (
            <div key={idx} className="relative">
              {showPlaceholder ? (
                <Card
                  card={cards[idx] || null}
                  onClick={() => onCardClick(idx)}
                  placeholder={true}
                  size="lg"
                  disabled={!isActive && stage === 'preflop'}
                />
              ) : (
                <div className="w-20 h-28 rounded-lg border-2 border-dashed border-gray-600 opacity-30" />
              )}
              {idx === 2 && (
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-500">
                  Flop
                </div>
              )}
              {idx === 3 && (
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-500">
                  Turn
                </div>
              )}
              {idx === 4 && (
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-500">
                  River
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Board;
