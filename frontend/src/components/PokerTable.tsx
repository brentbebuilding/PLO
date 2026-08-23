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
 * The same ring on a phone, where a hand is stacked two by two.
 *
 * A hand laid out in a line is four cards wide, and at phone width there is
 * not enough felt between a side seat and the board to hold that — the two
 * ran into each other. Folding the hand into a square halves how far it
 * reaches towards the middle, which buys the clearance without shrinking the
 * cards to the point of being hard to read or to tap.
 */
const COMPACT_SEAT_POSITIONS = [
  { top: '0%', left: '50%', transform: 'translateX(-50%)' },   // hero, top centre
  { top: '12%', left: '84%', transform: 'translateX(-50%)' },  // upper right
  { top: '50%', left: '84%', transform: 'translateX(-50%)' },  // lower right
  { top: '62%', left: '50%', transform: 'translateX(-50%)' },  // bottom centre
  { top: '50%', left: '16%', transform: 'translateX(-50%)' },  // lower left
  { top: '12%', left: '16%', transform: 'translateX(-50%)' },  // upper left
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
  /** Phone layout: a rounder felt, seats pushed out, hands stacked two by two. */
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
      // A wide oval, both because a real table is one and because the seats
      // are what constrain card size: they have to clear the board without
      // running off the felt. Height is the scarce dimension in a browser
      // window, so buying that clearance sideways is nearly free.
      // A phone has width to spare only downwards, so the felt is rounder
      // there and the seats sit further apart around it.
      aspectRatio: compact ? '13 / 10' : '21 / 10',
      width: compact
        ? 'min(100%, calc(var(--table-h) * 1.3))'
        : 'min(100%, calc(var(--table-h) * 2.1))',
      maxHeight: '100%',
    }}
  >
    {/* Felt. Deliberately unbranded. */}
    <div
      className={`absolute rounded-[50%] bg-gradient-to-b from-emerald-800 to-emerald-900 border-[max(6px,0.9vmin)] border-neutral-900 shadow-2xl ${
        // Less rail on a phone, so the stacked hands sit on green.
        compact ? 'inset-[4%]' : 'inset-[8%]'
      }`}
    />
    <div
      className={`absolute rounded-[50%] border border-emerald-700/40 ${
        compact ? 'inset-[6%]' : 'inset-[10%]'
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
        className={`absolute flex ${
          // Wrapping is only wanted on a phone. Out wide, a seat sitting at
          // 82% has barely any room to its right, and an auto-width flex box
          // takes that as the line length and folds a four-card hand in half.
          compact ? 'flex-wrap justify-center' : ''
        }`}
        style={{
          ...(compact ? COMPACT_SEAT_POSITIONS : SEAT_POSITIONS)[seatIndex],
          gap: 'calc(var(--seat-card-w) * 0.1)',
          // Exactly two cards wide, so a four-card hand folds into a square.
          width: compact ? 'calc(var(--seat-card-w) * 2.1)' : undefined,
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
