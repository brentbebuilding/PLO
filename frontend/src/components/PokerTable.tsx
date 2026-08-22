import { Card, Suit } from '../types';

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

const SUIT_STYLE: Record<Suit, string> = {
  s: 'bg-neutral-900 border-neutral-600',
  h: 'bg-red-800 border-red-600',
  d: 'bg-blue-800 border-blue-600',
  c: 'bg-green-800 border-green-600',
};

const SUIT_PIP: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

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

/** One card position. Empty slots show a face-down back, as on a real table. */
export const CardSlot: React.FC<CardSlotProps> = ({ card, selected, size = 'normal', onClick }) => {
  const dims = size === 'small' ? 'w-9 h-12' : 'w-11 h-16';
  return (
    <button
      onClick={onClick}
      className={`${dims} rounded border-2 flex flex-col items-center justify-center leading-none shrink-0 transition-all ${
        card
          ? `${SUIT_STYLE[card.suit]} text-white`
          : 'bg-rose-900/70 border-rose-950 text-rose-700/60'
      } ${
        selected
          ? 'ring-2 ring-yellow-300 border-yellow-300 scale-105'
          : 'hover:brightness-125'
      }`}
    >
      {card ? (
        <>
          <span className={size === 'small' ? 'text-[10px]' : 'text-xs'}>
            {SUIT_PIP[card.suit]}
          </span>
          <span className={size === 'small' ? 'text-xs font-semibold' : 'text-base font-semibold'}>
            {card.rank === 'T' ? '10' : card.rank}
          </span>
        </>
      ) : (
        <span className={size === 'small' ? 'text-base' : 'text-lg'}>✦</span>
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
  <div className="relative w-full" style={{ aspectRatio: '16 / 10' }}>
    {/* Felt. Deliberately unbranded. */}
    <div className="absolute inset-[8%] rounded-[50%] bg-gradient-to-b from-emerald-800 to-emerald-900 border-[14px] border-neutral-900 shadow-2xl" />
    <div className="absolute inset-[10%] rounded-[50%] border border-emerald-700/40" />

    {/* Community cards, centred. */}
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1.5">
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
        className="absolute flex gap-1"
        style={SEAT_POSITIONS[seatIndex]}
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
          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-medium text-emerald-300 whitespace-nowrap">
            You
          </span>
        )}

        {equity?.[seatIndex] && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 bg-neutral-900/90 px-3 py-1 rounded text-center whitespace-nowrap leading-tight ${
              READOUT_ABOVE[seatIndex] ? 'bottom-full mb-1' : 'top-full mt-1'
            }`}
          >
            <div className="text-[13px]">
              <span className="text-red-400">Win: </span>
              <span className="text-white font-medium">
                {equity[seatIndex]!.win.toFixed(2)}%
              </span>
            </div>
            <div className="text-[13px]">
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
