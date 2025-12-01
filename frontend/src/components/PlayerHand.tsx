import React from 'react';
import { Card as CardType } from '../types';
import { Card } from './Card';

interface PlayerHandProps {
  playerIndex: number;
  cards: (CardType | null)[];
  equity?: number;
  winPercentage?: number;
  tiePercentage?: number;
  onCardClick: (cardIndex: number) => void;
  isHero?: boolean;
}

export const PlayerHand: React.FC<PlayerHandProps> = ({
  playerIndex,
  cards,
  equity,
  winPercentage,
  tiePercentage,
  onCardClick,
  isHero = false,
}) => {
  const hasAllCards = cards.every((c) => c !== null);

  return (
    <div
      className={`
        p-4 rounded-xl
        ${isHero ? 'bg-blue-900/40 border-2 border-blue-400' : 'bg-gray-900/40'}
      `}
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-white font-medium">
          {isHero ? 'Hero' : `Player ${playerIndex + 1}`}
        </h3>
        {equity !== undefined && hasAllCards && (
          <div className="text-right">
            <span className="text-2xl font-bold text-white">
              {equity.toFixed(1)}%
            </span>
            <div className="text-xs text-gray-400">
              Win: {winPercentage?.toFixed(1)}% | Tie: {tiePercentage?.toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {[0, 1, 2, 3].map((idx) => (
          <Card
            key={idx}
            card={cards[idx] || null}
            onClick={() => onCardClick(idx)}
            placeholder={true}
            size="md"
          />
        ))}
      </div>

      {/* Equity bar visualization */}
      {equity !== undefined && hasAllCards && (
        <div className="mt-3">
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                isHero ? 'bg-blue-500' : 'bg-green-500'
              }`}
              style={{ width: `${equity}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerHand;
