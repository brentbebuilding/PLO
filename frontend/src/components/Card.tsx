import React from 'react';
import { Card as CardType } from '../types';
import { formatCardDisplay, getSuitColor } from '../utils/cards';

interface CardProps {
  card: CardType | null;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  placeholder?: boolean;
}

const sizeClasses = {
  sm: 'w-10 h-14 text-sm',
  md: 'w-14 h-20 text-base',
  lg: 'w-20 h-28 text-xl',
};

export const Card: React.FC<CardProps> = ({
  card,
  onClick,
  selected = false,
  disabled = false,
  size = 'md',
  placeholder = false,
}) => {
  if (!card && !placeholder) {
    return null;
  }

  if (!card && placeholder) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`
          ${sizeClasses[size]}
          rounded-lg border-2 border-dashed border-gray-400
          bg-gray-100 hover:bg-gray-200
          flex items-center justify-center
          cursor-pointer transition-all
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <span className="text-gray-400">+</span>
      </button>
    );
  }

  const { rank, suit } = formatCardDisplay(card!);
  const colorClass = getSuitColor(card!.suit);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${sizeClasses[size]}
        rounded-lg bg-white shadow-md
        flex flex-col items-center justify-center
        cursor-pointer transition-all
        hover:shadow-lg hover:-translate-y-1
        ${selected ? 'ring-2 ring-yellow-400 ring-offset-2' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <span className={`font-bold ${colorClass}`}>{rank}</span>
      <span className={`${colorClass} ${size === 'sm' ? 'text-lg' : 'text-2xl'}`}>
        {suit}
      </span>
    </button>
  );
};

export default Card;
