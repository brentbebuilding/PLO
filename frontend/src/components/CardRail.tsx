import { Card, Rank, Suit } from '../types';
import { PlayingCard } from './PlayingCard';

/**
 * The full deck, laid out as four rows of thirteen.
 *
 * The faces themselves carry the four-colour scheme the poker client uses, so
 * a card here looks like the same card on the table.
 */
const RAIL_RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const RAIL_SUITS: Suit[] = ['s', 'h', 'd', 'c'];

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
    <div className="bg-black/30 rounded-lg p-1.5 inline-block">
      {/* Two suits per row while there is room; they wrap to their own rows
          when there isn't, rather than forcing the page wider. */}
      {[0, 1].map(pairIndex => (
        <div key={pairIndex} className="flex flex-wrap gap-1.5 mb-1 last:mb-0">
          {RAIL_SUITS.slice(pairIndex * 2, pairIndex * 2 + 2).map(suit => (
            <div key={suit} className="flex gap-px">
              {RAIL_RANKS.map(rank => {
                const taken = isUsed(rank, suit);
                return (
                  <button
                    key={`${rank}${suit}`}
                    onClick={() => !taken && !disabled && onPick({ rank, suit })}
                    disabled={taken || disabled}
                    title={taken ? 'Already in play' : undefined}
                    style={{
                      width: 'var(--rail-card-w)',
                      height: 'calc(var(--rail-card-w) * 2.1)',
                    }}
                    className={`rounded-sm border border-black/40 overflow-hidden transition-opacity ${
                      taken
                        ? 'opacity-30 cursor-not-allowed'
                        : disabled
                        ? 'opacity-60 cursor-default'
                        : 'hover:ring-2 hover:ring-yellow-300 cursor-pointer'
                    }`}
                  >
                    <PlayingCard card={{ rank, suit }} width="var(--rail-card-w)" compact />
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
