import { Card } from '../types';
import { PlayingCard } from './PlayingCard';

/**
 * Where each hand sits around the felt, as percentages of the table box.
 *
 * The user is always at the top, so their cards read first. The remaining five
 * are placed around the oval the way a real table seats them.
 */
export const SEAT_POSITIONS = [
  { top: '2%', left: '50%', transform: 'translateX(-50%)' },   // hero, top centre
  { top: '24%', left: '84%', transform: 'translateX(-50%)' },  // upper right
  { top: '58%', left: '84%', transform: 'translateX(-50%)' },  // lower right
  { top: '78%', left: '50%', transform: 'translateX(-50%)' },  // bottom centre
  { top: '58%', left: '16%', transform: 'translateX(-50%)' },  // lower left
  { top: '24%', left: '16%', transform: 'translateX(-50%)' },  // upper left
];

/** Seats low on the felt get their readout above the cards, not below. */
const READOUT_ABOVE = [false, false, false, true, true, false];

export const SEAT_COUNT = SEAT_POSITIONS.length;
export const CARDS_PER_SEAT = 4;
export const BOARD_SIZE = 5;

export interface SlotRef {
  /** A seat index, 'board', or 'dead'. */
  group: number | 'board' | 'dead';
  index: number;
}

export function sameSlot(a: SlotRef | null, b: SlotRef): boolean {
  return a !== null && a.group === b.group && a.index === b.index;
}

interface CardSlotProps {
  card: Card | null;
  selected: boolean;
  size?: 'normal' | 'small';
  onClick: () => void;
}

/**
 * One card position.
 *
 * Sized from CSS variables rather than fixed classes so the whole table can be
 * driven off whichever of width or height is the tighter constraint. Empty
 * slots show a face-down back, as on a real table.
 */
export const CardSlot: React.FC<CardSlotProps> = ({ card, selected, size = 'normal', onClick }) => {
  const w = size === 'small' ? 'var(--seat-card-w)' : 'var(--board-card-w)';
  return (
    <button
      onClick={onClick}
      style={{ width: w, height: `calc(${w} * 1.4)` }}
      className={`rounded border-2 flex flex-col items-center justify-center leading-none shrink-0 overflow-hidden transition-all ${
        card
          ? 'border-white'
          : 'bg-rose-900/70 border-rose-200/70 text-rose-300/50'
      } ${
        selected
          ? 'ring-2 ring-yellow-300 border-yellow-300 scale-105'
          : 'hover:brightness-125'
      }`}
    >
      {card ? (
        <PlayingCard card={card} width={w} />
      ) : (
        <span style={{ fontSize: `calc(${w} * 0.5)` }}>✦</span>
      )}
    </button>
  );
};

/** Win and tie for one seat, shown beneath that seat's cards. */
export interface SeatEquity {
  win: number;
  tie: number;
}

interface PokerTableProps {
  seats: (Card | null)[][];
  board: (Card | null)[];
  selected: SlotRef | null;
  onSelect: (slot: SlotRef) => void;
  /** Indexed by seat; absent entries simply show nothing. */
  equity?: (SeatEquity | null)[];
}

export const PokerTable: React.FC<PokerTableProps> = ({
  seats,
  board,
  selected,
  onSelect,
  equity,
}) => (
  <div
    className="relative mx-auto"
    style={{
      // Fit whichever dimension runs out first, so a short window doesn't
      // push the dead cards off the bottom.
      aspectRatio: '16 / 10',
      width: 'min(100%, calc(var(--table-h) * 1.6))',
      maxHeight: '100%',
    }}
  >
    {/* Felt. Deliberately unbranded. */}
    <div className="absolute inset-[8%] rounded-[50%] bg-gradient-to-b from-emerald-800 to-emerald-900 border-[max(6px,0.9vmin)] border-neutral-900 shadow-2xl" />
    <div className="absolute inset-[10%] rounded-[50%] border border-emerald-700/40" />

    {/* Community cards, centred. */}
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex" style={{ gap: 'calc(var(--board-card-w) * 0.12)' }}>
      {board.map((card, i) => (
        <CardSlot
          key={i}
          card={card}
          selected={sameSlot(selected, { group: 'board', index: i })}
          onClick={() => onSelect({ group: 'board', index: i })}
        />
      ))}
    </div>

    {seats.map((hand, seatIndex) => (
      <div
        key={seatIndex}
        className="absolute flex"
        style={{ ...SEAT_POSITIONS[seatIndex], gap: 'calc(var(--seat-card-w) * 0.1)' }}
      >
        {hand.map((card, cardIndex) => (
          <CardSlot
            key={cardIndex}
            card={card}
            size="small"
            selected={sameSlot(selected, { group: seatIndex, index: cardIndex })}
            onClick={() => onSelect({ group: seatIndex, index: cardIndex })}
          />
        ))}
        {seatIndex === 0 && (
          <span
            style={{ fontSize: 'calc(var(--seat-card-w) * 0.34)' }}
            className="absolute -top-4 left-1/2 -translate-x-1/2 font-medium text-emerald-300 whitespace-nowrap"
          >
            You
          </span>
        )}

        {equity?.[seatIndex] && (
          <div
            style={{ fontSize: 'calc(var(--seat-card-w) * 0.36)' }}
            className={`absolute left-1/2 -translate-x-1/2 bg-neutral-900/90 px-2 py-0.5 rounded text-center whitespace-nowrap leading-tight ${
              READOUT_ABOVE[seatIndex] ? 'bottom-full mb-1' : 'top-full mt-1'
            }`}
          >
            <div>
              <span className="text-red-400">Win: </span>
              <span className="text-white font-medium">
                {equity[seatIndex]!.win.toFixed(2)}%
              </span>
            </div>
            <div>
              <span className="text-red-400">Tie: </span>
              <span className="text-white font-medium">
                {equity[seatIndex]!.tie.toFixed(2)}%
              </span>
            </div>
          </div>
        )}
      </div>
    ))}
  </div>
);

export default PokerTable;
