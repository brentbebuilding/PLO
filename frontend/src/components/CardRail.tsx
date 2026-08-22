import { Card, Rank, Suit } from '../types';

/**
 * The full deck, laid out as four colour-coded rows.
 *
 * Colours follow the four-colour deck the poker client uses, so a card here
 * looks like the same card on the table.
 */
const RAIL_RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const RAIL_SUITS: Suit[] = ['s', 'h', 'd', 'c'];

const SUIT_STYLE: Record<Suit, string> = {
  s: 'bg-neutral-900 border-neutral-700',
  h: 'bg-red-800 border-red-700',
  d: 'bg-blue-800 border-blue-700',
  c: 'bg-green-800 border-green-700',
};

const SUIT_PIP: Record<Suit, string> = {
  s: '♠',
  h: '♥',
  d: '♦',
  c: '♣',
};

interface CardRailProps {
  /** Cards already placed somewhere, drawn as unavailable. */
  used: Card[];
  /** Null when nothing is selected, in which case the rail is inert. */
  onPick: (card: Card) => void;
  disabled?: boolean;
}

export const CardRail: React.FC<CardRailProps> = ({ used, onPick, disabled }) => {
  const isUsed = (rank: Rank, suit: Suit) =>
    used.some(c => c.rank === rank && c.suit === suit);

  return (
    <div className="bg-black/30 rounded-lg p-2 inline-block">
      {[0, 1].map(pairIndex => (
        <div key={pairIndex} className="flex gap-2 mb-1 last:mb-0">
          {RAIL_SUITS.slice(pairIndex * 2, pairIndex * 2 + 2).map(suit => (
            <div key={suit} className="flex gap-0.5">
              {RAIL_RANKS.map(rank => {
                const taken = isUsed(rank, suit);
                return (
                  <button
                    key={`${rank}${suit}`}
                    onClick={() => !taken && !disabled && onPick({ rank, suit })}
                    disabled={taken || disabled}
                    title={taken ? 'Already in play' : undefined}
                    className={`w-8 h-11 rounded border text-white flex flex-col items-center justify-center leading-none transition-opacity ${
                      SUIT_STYLE[suit]
                    } ${
                      taken
                        ? 'opacity-25 cursor-not-allowed'
                        : disabled
                        ? 'opacity-60 cursor-default'
                        : 'hover:brightness-125 cursor-pointer'
                    }`}
                  >
                    <span className="text-[11px]">{SUIT_PIP[suit]}</span>
                    <span className="text-sm font-semibold">
                      {rank === 'T' ? '10' : rank}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default CardRail;
