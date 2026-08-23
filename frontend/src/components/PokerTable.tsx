import { Card } from '../types';
import { PlayingCard } from './PlayingCard';

/**
 * Where each hand sits around the felt, as percentages of the table box.
 *
 * The user is always at the top, so their cards read first. The remaining five
 * are placed around the oval the way a real table seats them.
 */
export const SEAT_POSITIONS = [
  { top: '1%', left: '50%', transform: 'translateX(-50%)' },   // hero, top centre
  { top: '21%', left: '82%', transform: 'translateX(-50%)' },  // upper right
  { top: '59%', left: '82%', transform: 'translateX(-50%)' },  // lower right
  { top: '68%', left: '50%', transform: 'translateX(-50%)' },  // bottom centre
  { top: '59%', left: '18%', transform: 'translateX(-50%)' },  // lower left
  { top: '21%', left: '18%', transform: 'translateX(-50%)' },  // upper left
];

/**
 * The same ring on a phone, spread down rather than across.
 *
 * A hand is four cards wide and a phone is not, so a side seat and the board
 * cannot be kept apart sideways — at 390px there is simply not enough felt
 * between them. They are kept apart vertically instead: the felt is close to
 * square rather than a long oval, which gives each row of the ring a band of
 * its own. A side hand may then reach across the board's column, but never
 * across the board itself, so nothing is covered.
 */
const COMPACT_SEAT_POSITIONS = [
  { top: '0%', left: '50%', transform: 'translateX(-50%)' },   // hero, top centre
  { top: '22%', left: '82%', transform: 'translateX(-50%)' },  // upper right
  { top: '60%', left: '82%', transform: 'translateX(-50%)' },  // lower right
  { top: '80%', left: '50%', transform: 'translateX(-50%)' },  // bottom centre
  { top: '60%', left: '18%', transform: 'translateX(-50%)' },  // lower left
  { top: '22%', left: '18%', transform: 'translateX(-50%)' },  // upper left
];

/*
 * Every seat's readout sits below its cards.
 *
 * Half of them used to sit above instead, pointing away from the middle of
 * the felt, because the two seats down each side would otherwise walk a
 * readout below the upper hand into one above the lower hand. That is a
 * spacing problem and it is fixed by spacing: the seats are further apart
 * down the felt now, and the bottom-centre seat sits high enough that its
 * readout stays on the table. Reading a column of hands where the number is
 * sometimes above and sometimes below is worse than either.
 */

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
  /** 'normal' is the board, 'small' a seat, 'dead' the row along the bottom. */
  size?: 'normal' | 'small' | 'dead';
  onClick: () => void;
}

const SLOT_WIDTH = {
  normal: 'var(--board-card-w)',
  small: 'var(--seat-card-w)',
  dead: 'var(--dead-card-w)',
};

/**
 * One card position.
 *
 * Sized from CSS variables rather than fixed classes so the whole table can be
 * driven off whichever of width or height is the tighter constraint. Empty
 * slots show a face-down back, as on a real table.
 */
export const CardSlot: React.FC<CardSlotProps> = ({ card, selected, size = 'normal', onClick }) => {
  const w = SLOT_WIDTH[size];
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
  /** Phone layout: a near-square felt with the ring spread down it. */
  compact?: boolean;
}

export const PokerTable: React.FC<PokerTableProps> = ({
  seats,
  board,
  selected,
  onSelect,
  equity,
  compact,
}) => (
  <div
    className="relative mx-auto"
    style={{
      // Out wide, a long oval: the seats are what constrain card size, they
      // have to clear the board without running off the felt, and height is
      // the scarce dimension in a browser window so buying that clearance
      // sideways is nearly free. On a phone the opposite holds — there is no
      // width to spare and the page can run on downwards — so the felt is
      // nearly square and the ring spreads down instead.
      aspectRatio: compact ? '23 / 20' : '21 / 10',
      width: compact
        ? 'min(100%, calc(var(--table-h) * 1.15))'
        : 'min(100%, calc(var(--table-h) * 2.1))',
      maxHeight: '100%',
    }}
  >
    {/* Felt. Deliberately unbranded. */}
    <div
      className={`absolute rounded-[50%] bg-gradient-to-b from-emerald-800 to-emerald-900 border-[max(6px,0.9vmin)] border-neutral-900 shadow-2xl ${
        // Less rail on a phone, where the hands reach further out.
        compact ? 'inset-[2%]' : 'inset-[8%]'
      }`}
    />
    <div
      className={`absolute rounded-[50%] border border-emerald-700/40 ${
        compact ? 'inset-[4%]' : 'inset-[10%]'
      }`}
    />

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
        style={{
          ...(compact ? COMPACT_SEAT_POSITIONS : SEAT_POSITIONS)[seatIndex],
          gap: 'calc(var(--seat-card-w) * 0.1)',
        }}
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
            style={{
              fontSize: 'calc(var(--seat-card-w) * 0.3)',
              // Clear of the cards by its own height, whatever that scales to.
              bottom: 'calc(100% + var(--seat-card-w) * 0.08)',
            }}
            className="absolute left-1/2 -translate-x-1/2 font-medium text-emerald-300 whitespace-nowrap"
          >
            You
          </span>
        )}

        {equity?.[seatIndex] && (
          <div
            style={{
              fontSize: `calc(var(--seat-card-w) * ${compact ? 0.3 : 0.36})`,
            }}
            className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-neutral-900/90 px-2 py-0.5 rounded text-center whitespace-nowrap leading-tight"
          >
            {compact ? (
              // Just the number on a phone. Two labelled lines is 30px of
              // height the felt hasn't got once every readout hangs below its
              // hand, and one labelled line is wide enough to reach the board.
              // A tie is nearly always zero, so it only appears when it isn't.
              <span className="text-white font-medium">
                {equity[seatIndex]!.win.toFixed(2)}%
                {equity[seatIndex]!.tie > 0 && (
                  <span className="text-red-400">
                    {' / '}
                    {equity[seatIndex]!.tie.toFixed(2)}%
                  </span>
                )}
              </span>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}
      </div>
    ))}
  </div>
);

export default PokerTable;
