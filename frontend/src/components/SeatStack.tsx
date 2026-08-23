import { Card } from '../types';
import { CardSlot, SeatEquity, SlotRef, sameSlot } from './PokerTable';

/**
 * The table as a list, for screens too narrow to seat anyone around an oval.
 *
 * At phone width the felt is about 390px across. Six hands of four cards plus
 * five community cards cannot be arranged around that without the seats
 * landing on top of the board and each other, so on those screens the ring is
 * abandoned rather than shrunk: your hand, then the board, then the opponents,
 * each on its own line. Nothing overlaps because nothing is positioned.
 */
interface SeatStackProps {
  seats: (Card | null)[][];
  board: (Card | null)[];
  selected: SlotRef | null;
  onSelect: (slot: SlotRef) => void;
  equity?: (SeatEquity | null)[];
}

const Equity: React.FC<{ value?: SeatEquity | null }> = ({ value }) =>
  value ? (
    <span className="text-[11px] leading-tight text-right whitespace-nowrap">
      <span className="text-red-400">Win </span>
      <span className="font-medium">{value.win.toFixed(2)}%</span>
      {value.tie > 0 && (
        <>
          <span className="text-red-400"> · Tie </span>
          <span className="font-medium">{value.tie.toFixed(2)}%</span>
        </>
      )}
    </span>
  ) : null;

const Section: React.FC<{
  title: string;
  accent?: boolean;
  equity?: SeatEquity | null;
  children: React.ReactNode;
}> = ({ title, accent, equity, children }) => (
  <div className="rounded-lg bg-black/25 px-2 py-1.5">
    <div className="flex items-baseline justify-between gap-2 mb-1">
      <h2
        className={`text-xs font-semibold ${accent ? 'text-emerald-300' : 'text-neutral-300'}`}
      >
        {title}
      </h2>
      <Equity value={equity} />
    </div>
    <div className="flex" style={{ gap: 'calc(var(--seat-card-w) * 0.1)' }}>
      {children}
    </div>
  </div>
);

/**
 * The opponents worth showing: every one holding cards, plus a single empty
 * seat to put the next hand in.
 *
 * Five empty four-card seats is 360px of nothing to scroll past on a phone,
 * and hands rarely go to showdown five-handed. The seat holding the selection
 * always stays visible, so a card can't be waiting in a row that isn't drawn.
 */
function visibleOpponents(
  seats: (Card | null)[][],
  selected: SlotRef | null
): (Card | null)[][] {
  const opponents = seats.slice(1);
  let last = -1;
  opponents.forEach((hand, i) => {
    if (hand.some(card => card !== null)) last = i;
  });
  if (typeof selected?.group === 'number' && selected.group - 1 > last) {
    last = selected.group - 1;
  }
  return opponents.slice(0, Math.min(opponents.length, last + 2));
}

export const SeatStack: React.FC<SeatStackProps> = ({
  seats,
  board,
  selected,
  onSelect,
  equity,
}) => (
  <div className="flex flex-col gap-1.5">
    <Section title="You" accent equity={equity?.[0]}>
      {seats[0].map((card, i) => (
        <CardSlot
          key={i}
          card={card}
          size="small"
          selected={sameSlot(selected, { group: 0, index: i })}
          onClick={() => onSelect({ group: 0, index: i })}
        />
      ))}
    </Section>

    <Section title="Board">
      {board.map((card, i) => (
        <CardSlot
          key={i}
          card={card}
          selected={sameSlot(selected, { group: 'board', index: i })}
          onClick={() => onSelect({ group: 'board', index: i })}
        />
      ))}
    </Section>

    {visibleOpponents(seats, selected).map((hand, offset) => {
      const seatIndex = offset + 1;
      return (
        <Section
          key={seatIndex}
          title={`Opponent ${seatIndex}`}
          equity={equity?.[seatIndex]}
        >
          {hand.map((card, i) => (
            <CardSlot
              key={i}
              card={card}
              size="small"
              selected={sameSlot(selected, { group: seatIndex, index: i })}
              onClick={() => onSelect({ group: seatIndex, index: i })}
            />
          ))}
        </Section>
      );
    })}
  </div>
);

export default SeatStack;
