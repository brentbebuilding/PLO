import { useCallback, useState } from 'react';
import { Upload, X, Image as ImageIcon, Loader2, Wand2, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, Rank, Suit } from '../types';
import { RANKS, SUITS, SUIT_SYMBOLS } from '../utils/cards';
import { detectCards } from '../utils/cardDetection';
import { loadSlots, loadSuitSamples, loadTemplates } from '../utils/glyphTemplates';
import CardCalibration from './CardCalibration';

interface DetectionResult {
  playerCards: Card[][];
  boardCards: Card[];
}

interface ScreenshotReferenceProps {
  onCardsDetected?: (result: DetectionResult) => void;
  numPlayers?: number;
}

/** A slot in the review strip. Null means the detector declined to read it. */
interface Slot {
  card: Card | null;
}

interface Reading {
  board: Slot[];
  hands: Slot[][];
  message?: string;
  preflop: boolean;
}

/** Which card the user is currently replacing. */
interface EditTarget {
  group: 'board' | number;
  index: number;
}

export const ScreenshotReference: React.FC<ScreenshotReferenceProps> = ({
  onCardsDetected,
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTeach, setShowTeach] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      setPreview(e.target?.result as string);
      setReading(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) handleFile(file);
          break;
        }
      }
    },
    [handleFile]
  );

  /** Push the current reading up to the calculator, skipping unread slots. */
  const publish = (next: Reading) => {
    const solid = (slots: Slot[]) =>
      slots.filter((s): s is { card: Card } => s.card !== null).map(s => s.card);

    const hands = next.hands.map(solid).filter(h => h.length > 0);
    onCardsDetected?.({ playerCards: hands, boardCards: solid(next.board) });
  };

  const read = async () => {
    if (!preview) return;
    setIsReading(true);
    setError(null);

    try {
      const result = await detectCards(
        preview,
        loadSlots(),
        loadTemplates(),
        loadSuitSamples()
      );

      // Keep unread slots as holes rather than dropping them, so the gaps stay
      // visible and clickable instead of silently shrinking the hand.
      const bySlot = (role: string, count: number): Slot[] =>
        Array.from({ length: count }, (_, i) => {
          const hit = result.readings.find(r => r.role === role && r.index === i);
          return { card: hit?.card ?? null };
        });

      const boardCount = result.readings.filter(r => r.role === 'board').length;
      const opponentCount = result.readings.filter(r => r.role === 'opponent').length;

      const hands: Slot[][] = [];
      const hero = bySlot('hero', result.readings.filter(r => r.role === 'hero').length);
      if (hero.length > 0) hands.push(hero);
      for (let seat = 0; seat * 4 < opponentCount; seat++) {
        const seatSlots = Array.from({ length: 4 }, (_, i) => {
          const hit = result.readings.find(
            r => r.role === 'opponent' && r.index === seat * 4 + i
          );
          return { card: hit?.card ?? null };
        });
        if (seatSlots.some(s => s.card !== null)) hands.push(seatSlots);
      }

      const next: Reading = {
        board: bySlot('board', boardCount),
        hands,
        message: result.message,
        preflop: boardCount === 0,
      };

      setReading(next);
      publish(next);
      if (!result.success) setError(result.message ?? 'Nothing could be read.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that screenshot.');
    } finally {
      setIsReading(false);
    }
  };

  /** Replace one card from the picker. */
  const applyEdit = (card: Card) => {
    if (!reading || !editing) return;
    const next: Reading = {
      ...reading,
      board: [...reading.board],
      hands: reading.hands.map(h => [...h]),
    };

    if (editing.group === 'board') next.board[editing.index] = { card };
    else next.hands[editing.group][editing.index] = { card };

    setReading(next);
    publish(next);
    setEditing(null);
  };

  const clear = () => {
    setPreview(null);
    setReading(null);
    setError(null);
  };

  const usedCards = reading
    ? [...reading.board, ...reading.hands.flat()]
        .map(s => s.card)
        .filter((c): c is Card => c !== null)
    : [];

  return (
    <div className="bg-gray-800/30 rounded-xl p-4">
      <h3 className="text-white font-medium flex items-center gap-2 mb-3">
        <ImageIcon size={18} />
        Read cards from a screenshot
      </h3>

      {!preview ? (
        <div
          className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-gray-500 transition-colors"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
          }}
          onPaste={handlePaste}
          onClick={() => document.getElementById('screenshot-input')?.click()}
          tabIndex={0}
        >
          <Upload className="mx-auto text-gray-400 mb-2" size={26} />
          <p className="text-gray-300 text-sm">
            Drop a screenshot, paste it, or click to choose a file
          </p>
          <p className="text-gray-500 text-xs mt-1">
            Runs in your browser — nothing is uploaded anywhere
          </p>
          <input
            id="screenshot-input"
            type="file"
            accept="image/*"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="hidden"
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <img
              src={preview}
              alt="Screenshot"
              className="w-full rounded-lg max-h-56 object-contain bg-gray-900"
            />
            <button
              onClick={clear}
              className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5"
              title="Remove"
            >
              <X size={15} />
            </button>
          </div>

          <button
            onClick={read}
            disabled={isReading}
            className={`w-full py-2.5 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
              isReading
                ? 'bg-green-700 text-white cursor-wait'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isReading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Reading…
              </>
            ) : (
              <>
                <Wand2 size={18} />
                Read cards
              </>
            )}
          </button>

          {error && (
            <div className="text-red-300 text-sm bg-red-900/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {reading && (
            <div className="space-y-3">
              {reading.preflop ? (
                <div className="text-gray-400 text-xs">
                  No community cards dealt — preflop.
                </div>
              ) : (
                <CardRow
                  label="Board"
                  slots={reading.board}
                  onPick={i => setEditing({ group: 'board', index: i })}
                />
              )}

              {reading.hands.map((hand, seat) => (
                <CardRow
                  key={seat}
                  label={seat === 0 ? 'Your hand' : `Opponent ${seat}`}
                  slots={hand}
                  onPick={i => setEditing({ group: seat, index: i })}
                />
              ))}

              {reading.hands.length === 0 && !reading.preflop && (
                <div className="text-gray-500 text-xs">
                  No hands found. Type them in below, or click the board cards to fix them.
                </div>
              )}

              <p className="text-gray-500 text-xs">
                Click any card to change it. A{' '}
                <span className="font-mono text-gray-400">?</span> means it could not be
                read with confidence — it is never guessed.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tucked away: only needed if the client's card art ever changes. */}
      <div className="mt-4 pt-3 border-t border-gray-700/60">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-gray-500 hover:text-gray-300 text-xs flex items-center gap-1"
        >
          {showAdvanced ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          Advanced
        </button>
        {showAdvanced && (
          <div className="mt-2">
            {showTeach ? (
              <CardCalibration onClose={() => setShowTeach(false)} onDone={() => setShowTeach(false)} />
            ) : (
              <div className="text-gray-500 text-xs space-y-2">
                <p>
                  Card shapes are built in, so there is nothing to set up. If the poker
                  client ever changes its card art and reads start failing, you can teach
                  it the new ones.
                </p>
                <button
                  onClick={() => setShowTeach(true)}
                  className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                >
                  Teach card shapes
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <CardPicker
          usedCards={usedCards}
          onPick={applyEdit}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

/** One labelled row of card chips. */
const CardRow: React.FC<{
  label: string;
  slots: Slot[];
  onPick: (index: number) => void;
}> = ({ label, slots, onPick }) => (
  <div className="flex items-center gap-2 flex-wrap">
    <span className="text-gray-400 text-xs w-20 shrink-0">{label}</span>
    {slots.map((slot, i) => (
      <button
        key={i}
        onClick={() => onPick(i)}
        className={`px-2 py-1 rounded font-mono text-sm min-w-[2.4rem] transition-shadow hover:ring-2 hover:ring-yellow-400 ${
          slot.card ? chipClass(slot.card.suit) : 'bg-gray-700 text-gray-500'
        }`}
      >
        {slot.card ? `${displayRank(slot.card.rank)}${SUIT_SYMBOLS[slot.card.suit]}` : '?'}
      </button>
    ))}
  </div>
);

const CardPicker: React.FC<{
  usedCards: Card[];
  onPick: (card: Card) => void;
  onClose: () => void;
}> = ({ usedCards, onPick, onClose }) => {
  const isUsed = (rank: Rank, suit: Suit) =>
    usedCards.some(c => c.rank === rank && c.suit === suit);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl p-4 max-w-sm w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-white font-medium">Pick a card</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-2">
          {SUITS.map(suit => (
            <div key={suit} className="flex items-center gap-1">
              <span className={`text-xl w-6 ${suitTextClass(suit)}`}>
                {SUIT_SYMBOLS[suit]}
              </span>
              <div className="flex flex-wrap gap-1">
                {RANKS.map(rank => {
                  const used = isUsed(rank, suit);
                  return (
                    <button
                      key={`${rank}${suit}`}
                      onClick={() => !used && onPick({ rank, suit })}
                      disabled={used}
                      className={`w-8 h-10 rounded text-sm font-medium ${
                        used
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : `bg-white hover:bg-gray-100 ${suitTextClass(suit)}`
                      }`}
                    >
                      {displayRank(rank)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

function displayRank(rank: Rank): string {
  return rank === 'T' ? '10' : rank;
}

/** Chip colours follow the client's four-colour deck. */
function chipClass(suit: Suit): string {
  return {
    h: 'bg-red-900 text-red-200',
    d: 'bg-blue-900 text-blue-200',
    c: 'bg-green-900 text-green-200',
    s: 'bg-gray-600 text-white',
  }[suit];
}

function suitTextClass(suit: Suit): string {
  return {
    h: 'text-red-600',
    d: 'text-blue-600',
    c: 'text-green-600',
    s: 'text-gray-900',
  }[suit];
}

export default ScreenshotReference;
