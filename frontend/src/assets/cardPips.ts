import { Suit } from '../types';

/**
 * Suit pip outlines, traced from a public-domain deck.
 *
 * Source: Byron Knoll's "Vector Playing Cards", released into the public
 * domain. See CARDS-LICENSE.md in this directory for provenance.
 *
 * These replace the Unicode glyphs the cards used to be drawn with. A font
 * glyph is at the mercy of whatever the reader's system ships: on Windows the
 * pips are thin and cramped, on Android some of them arrive as emoji, and none
 * of them line up with each other. Real outlines render identically everywhere
 * and stay crisp at the sizes the deck rail uses.
 *
 * Each pip carries its own viewBox — a square centred on the shape's bounds —
 * so the four sit at consistent visual weight without any per-suit fudging.
 */
interface Pip {
  /** Path data, in the coordinate space of `viewBox`. */
  d: string;
  viewBox: string;
}

export const SUIT_PIPS: Record<Suit, Pip> = {
  s: {
    viewBox: '-10.5 -10.5 21 21',
    d: 'M7.989,3.103C7.747,-0.954 0.242,-8.59 0,-10.5C-0.242,-8.591 -7.747,-0.955 -7.989,3.103C-8.158,5.971 -6.294,7.16 -4.599,7.16C-2.764,7.138 -1.248,4.359 -0.726,3.819C-0.484,4.535 -2.329,10.501 -2.905,10.501L2.906,10.501C2.33,10.501 0.485,4.535 0.727,3.819C1.184,4.315 2.524,7.077 4.601,7.16C6.295,7.159 8.158,5.971 7.989,3.103Z',
  },
  h: {
    viewBox: '-9 -9 18 18',
    d: 'M3.676,-9C0.433,-9 0,-5.523 0,-5.523C0,-5.523 -0.433,-9 -3.676,-9C-5.946,-9 -8,-7.441 -8,-4.5C-8,-0.614 -1.421,3.294 0,9C1.352,3.299 8,-0.614 8,-4.5C8,-7.441 5.946,-9 3.676,-9Z',
  },
  d: {
    viewBox: '-10.5 -10.5 21 21',
    d: 'M3.243,-4.725C1.126,-7.589 0,-10.5 0,-10.5C0,-10.5 -1.126,-7.589 -3.243,-4.725C-5.361,-1.862 -8,0 -8,0C-8,0 -5.361,1.861 -3.243,4.726C-1.126,7.589 0,10.5 0,10.5C0,10.5 1.126,7.589 3.243,4.726C5.361,1.861 8,0 8,0C8,0 5.361,-1.862 3.243,-4.725Z',
  },
  c: {
    viewBox: '38.632 14.062 19 19',
    d: 'M50.291,22.698C50.291,22.698 52.666,20.798 52.666,18.164C52.666,16.622 51.297,14.062 48.132,14.062C44.967,14.062 43.598,16.623 43.598,18.164C43.598,20.798 45.973,22.698 45.973,22.698C43.335,20.643 38.632,22.046 38.632,26.153C38.632,28.209 40.312,30.471 42.95,30.471C46.115,30.471 47.484,27.016 47.484,27.016C47.484,27.016 47.886,30.954 45.541,33.062L50.723,33.062C48.378,30.955 48.78,27.016 48.78,27.016C48.78,27.016 50.149,30.471 53.314,30.471C55.953,30.471 57.632,28.208 57.632,26.153C57.632,22.046 52.929,20.643 50.291,22.698Z',
  },
};

/**
 * The four-colour deck, matching the poker client the screenshots come from.
 *
 * Same card, same colour, whether the user is looking at the table or at us.
 */
export const SUIT_COLORS: Record<Suit, string> = {
  s: '#14181d',
  h: '#c62430',
  d: '#1f5fd0',
  c: '#177a3f',
};

export default SUIT_PIPS;
