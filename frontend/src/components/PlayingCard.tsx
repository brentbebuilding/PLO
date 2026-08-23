import { Card, Suit } from '../types';
import { SUIT_COLORS, SUIT_PIPS } from '../assets/cardPips';

/**
 * One card face.
 *
 * Solid suit-coloured ground with a white edge: a small corner index at the
 * top left — rank over pip, the way a real card is indexed — and the rank
 * again, large, filling the lower half. Not a French-suited face with a pip
 * layout and court art. The rank is what gets read at a glance, so it gets the
 * room; the colour carries the suit.
 *
 * Everything scales off `width`, which is passed in as a CSS length (usually
 * one of the --*-card-w variables), so a single face serves the rail, the
 * seats, and the board.
 */
interface PipProps {
  suit: Suit;
  size: string;
  style?: React.CSSProperties;
}

export const SuitPip: React.FC<PipProps> = ({ suit, size, style }) => {
  const pip = SUIT_PIPS[suit];
  return (
    <svg
      viewBox={pip.viewBox}
      // Sized through CSS rather than the width/height attributes: those are
      // presentation attributes and don't accept calc(), which every caller
      // here passes.
      style={{ display: 'block', fill: 'currentColor', width: size, height: size, ...style }}
      aria-hidden="true"
    >
      <path d={pip.d} />
    </svg>
  );
};

const FONT = 'ui-sans-serif, system-ui, -apple-system, Arial, sans-serif';

interface PlayingCardProps {
  card: Card;
  /** CSS length; the height and every glyph inside are derived from it. */
  width: string;
  /**
   * Deck-rail cards are drawn barely 20px wide, where a corner index and a
   * large rank would both be illegible. Those stack a single pip over a single
   * rank instead.
   */
  compact?: boolean;
}

export const PlayingCard: React.FC<PlayingCardProps> = ({ card, width, compact }) => {
  const label = card.rank === 'T' ? '10' : card.rank;
  const narrow = card.rank === 'T';

  if (compact) {
    return (
      <span
        className="flex flex-col items-center justify-center w-full h-full leading-none select-none text-white"
        style={{ background: SUIT_COLORS[card.suit] }}
      >
        <SuitPip suit={card.suit} size={`calc(${width} * 0.4)`} />
        <span
          className="font-bold tracking-tight"
          style={{
            fontSize: `calc(${width} * ${narrow ? 0.44 : 0.56})`,
            marginTop: `calc(${width} * 0.06)`,
            fontFamily: FONT,
          }}
        >
          {label}
        </span>
      </span>
    );
  }

  return (
    <span
      className="relative block w-full h-full leading-none select-none text-white"
      style={{ background: SUIT_COLORS[card.suit] }}
    >
      <span
        className="absolute flex flex-col items-center font-bold tracking-tight"
        style={{
          top: `calc(${width} * 0.04)`,
          left: `calc(${width} * 0.07)`,
          fontSize: `calc(${width} * ${narrow ? 0.2 : 0.26})`,
          fontFamily: FONT,
        }}
      >
        {label}
        <SuitPip
          suit={card.suit}
          size={`calc(${width} * 0.22)`}
          style={{ marginTop: `calc(${width} * 0.03)` }}
        />
      </span>
      <span
        className="absolute inset-x-0 text-center font-bold tracking-tighter"
        style={{
          // Held clear of the bottom edge so the descender on a J or Q isn't
          // clipped by the card.
          bottom: `calc(${width} * 0.07)`,
          fontSize: `calc(${width} * ${narrow ? 0.56 : 0.72})`,
          fontFamily: FONT,
        }}
      >
        {label}
      </span>
    </span>
  );
};

export default PlayingCard;
