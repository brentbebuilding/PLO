import { Card, Suit } from '../types';
import { SUIT_COLORS, SUIT_PIPS } from '../assets/cardPips';

/**
 * One card face.
 *
 * Solid suit-coloured ground, big white rank, pip tucked underneath — not a
 * French-suited face with a pip layout and court art. The deck rail draws
 * cards 17–30 px wide, where a traditional corner index lands at around four
 * pixels tall and stops being readable. The rank and the colour are the only
 * things anyone needs off a card here, so the rank gets most of the face and
 * the colour carries the suit.
 *
 * Everything scales off `width`, which is passed in as a CSS length (usually
 * one of the --*-card-w variables), so a single face serves the rail, the
 * seats, and the board.
 */
interface PipProps {
  suit: Suit;
  size: string;
  /** Space above the pip, as a CSS length. */
  gap?: string;
}

export const SuitPip: React.FC<PipProps> = ({ suit, size, gap }) => {
  const pip = SUIT_PIPS[suit];
  return (
    <svg
      viewBox={pip.viewBox}
      width={size}
      height={size}
      style={{ display: 'block', fill: 'currentColor', marginTop: gap }}
      aria-hidden="true"
    >
      <path d={pip.d} />
    </svg>
  );
};

interface PlayingCardProps {
  card: Card;
  /** CSS length; the height and every glyph inside are derived from it. */
  width: string;
}

export const PlayingCard: React.FC<PlayingCardProps> = ({ card, width }) => {
  const label = card.rank === 'T' ? '10' : card.rank;
  return (
    <span
      className="flex flex-col items-center justify-center w-full h-full leading-none select-none text-white"
      style={{ background: SUIT_COLORS[card.suit] }}
    >
      <span
        className="font-bold tracking-tighter"
        style={{
          // "10" is twice as wide as every other rank, so it gets its own size
          // rather than being allowed to touch the card edges.
          fontSize: `calc(${width} * ${card.rank === 'T' ? 0.59 : 0.76})`,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Arial, sans-serif',
        }}
      >
        {label}
      </span>
      {/* The gap keeps the descender on a J or Q off the top of the pip. */}
      <SuitPip suit={card.suit} size={`calc(${width} * 0.28)`} gap={`calc(${width} * 0.1)`} />
    </span>
  );
};

export default PlayingCard;
