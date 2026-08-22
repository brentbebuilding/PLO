import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from './types';
import { calculateEquity, SimulationResult } from './utils/equity';
import { detectCards } from './utils/cardDetection';
import { loadSlots, loadSuitSamples, loadTemplates } from './utils/glyphTemplates';
import CardRail from './components/CardRail';
import PokerTable, {
  BOARD_SIZE,
  CARDS_PER_SEAT,
  SEAT_COUNT,
  CardSlot,
  SeatEquity,
  SlotRef,
  sameSlot,
} from './components/PokerTable';
import { Github, Loader2, RefreshCw, Upload } from 'lucide-react';

const DEAD_CARD_SLOTS = 14;

type Stage = 'preflop' | 'flop' | 'turn' | 'river';

interface DisplayResult {
  playerIndex: number;
  cards: string[];
  winPercentage: number;
  tiePercentage: number;
  equity: number;
}

const emptySeats = () =>
  Array.from({ length: SEAT_COUNT }, () =>
    Array.from({ length: CARDS_PER_SEAT }, () => null as Card | null)
  );

function App() {
  const [seats, setSeats] = useState<(Card | null)[][]>(emptySeats);
  const [board, setBoard] = useState<(Card | null)[]>(() =>
    Array.from({ length: BOARD_SIZE }, () => null)
  );
  const [dead, setDead] = useState<(Card | null)[]>(() =>
    Array.from({ length: DEAD_CARD_SLOTS }, () => null)
  );

  const [selected, setSelected] = useState<SlotRef | null>({ group: 0, index: 0 });
  const [equity, setEquity] = useState<{ players: DisplayResult[]; stage: Stage } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);

  const usedCards = useMemo(
    () =>
      [...seats.flat(), ...board, ...dead].filter((c): c is Card => c !== null),
    [seats, board, dead]
  );

  const seatEquity = useMemo(() => {
    const out: (SeatEquity | null)[] = Array.from({ length: SEAT_COUNT }, () => null);
    equity?.players.forEach(p => {
      out[p.playerIndex] = { win: p.winPercentage, tie: p.tiePercentage };
    });
    return out;
  }, [equity]);

  const stage: Stage = useMemo(() => {
    const n = board.filter(Boolean).length;
    if (n === 0) return 'preflop';
    if (n <= 3) return 'flop';
    if (n === 4) return 'turn';
    return 'river';
  }, [board]);

  /** Recalculate whenever the cards change. */
  useEffect(() => {
    const complete = seats.filter(hand => hand.every(c => c !== null)) as Card[][];
    if (complete.length < 2) {
      setEquity(null);
      return;
    }

    const timer = setTimeout(() => {
      try {
        const result: SimulationResult = calculateEquity(
          complete,
          board.filter((c): c is Card => c !== null),
          10000
        );
        // Map back to seat numbers so the labels match the table.
        const seatOf = seats
          .map((hand, i) => (hand.every(c => c !== null) ? i : -1))
          .filter(i => i >= 0);
        setEquity({
          stage: result.stage as Stage,
          players: result.players.map((p, i) => ({
            playerIndex: seatOf[i],
            cards: p.cards,
            winPercentage: p.winPercentage,
            tiePercentage: p.tiePercentage,
            equity: p.equity,
          })),
        });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not calculate equity');
      }
    }, 10);
    return () => clearTimeout(timer);
  }, [seats, board]);

  /** Place a card into the selected slot, then step to the next one. */
  const placeCard = (card: Card) => {
    if (!selected) return;

    if (selected.group === 'board') {
      setBoard(prev => prev.map((c, i) => (i === selected.index ? card : c)));
    } else if (selected.group === 'dead') {
      setDead(prev => prev.map((c, i) => (i === selected.index ? card : c)));
    } else {
      const seat = selected.group;
      setSeats(prev =>
        prev.map((hand, s) =>
          s === seat ? hand.map((c, i) => (i === selected.index ? card : c)) : hand
        )
      );
    }
    setSelected(advance(selected));
  };

  /** Clear the selected slot rather than replacing it. */
  const clearSlot = () => {
    if (!selected) return;
    if (selected.group === 'board') {
      setBoard(prev => prev.map((c, i) => (i === selected.index ? null : c)));
    } else if (selected.group === 'dead') {
      setDead(prev => prev.map((c, i) => (i === selected.index ? null : c)));
    } else {
      const seat = selected.group;
      setSeats(prev =>
        prev.map((hand, s) =>
          s === seat ? hand.map((c, i) => (i === selected.index ? null : c)) : hand
        )
      );
    }
  };

  const newHand = () => {
    setSeats(emptySeats());
    setBoard(Array.from({ length: BOARD_SIZE }, () => null));
    setDead(Array.from({ length: DEAD_CARD_SLOTS }, () => null));
    setSelected({ group: 0, index: 0 });
    setEquity(null);
    setScreenshot(null);
    setReadNote(null);
    setError(null);
  };

  /** Read a dropped screenshot into the table. */
  const readScreenshot = useCallback(async (src: string) => {
    setScreenshot(src);
    setIsReading(true);
    setReadNote(null);
    setError(null);

    try {
      const result = await detectCards(src, loadSlots(), loadTemplates(), loadSuitSamples());

      const nextSeats = emptySeats();
      // The user always takes the top seat, whichever hand was theirs.
      result.hero.slice(0, CARDS_PER_SEAT).forEach((c, i) => (nextSeats[0][i] = c));
      result.villains.slice(0, SEAT_COUNT - 1).forEach((hand, v) => {
        hand.slice(0, CARDS_PER_SEAT).forEach((c, i) => (nextSeats[v + 1][i] = c));
      });

      const nextBoard: (Card | null)[] = Array.from({ length: BOARD_SIZE }, () => null);
      result.board.slice(0, BOARD_SIZE).forEach((c, i) => (nextBoard[i] = c));

      setSeats(nextSeats);
      setBoard(nextBoard);
      setReadNote(result.message ?? null);
      if (!result.success) setError(result.message ?? 'Nothing could be read.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that screenshot.');
    } finally {
      setIsReading(false);
    }
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = e => readScreenshot(e.target?.result as string);
      reader.readAsDataURL(file);
    },
    [readScreenshot]
  );

  // Paste anywhere on the page drops a screenshot in.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      for (const item of e.clipboardData?.items ?? []) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) handleFile(file);
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleFile]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="px-6 py-3 flex items-center justify-between border-b border-neutral-800">
        <h1 className="text-xl font-bold">Omaha Odds Calculator</h1>
        <div className="flex items-center gap-3 text-sm text-neutral-400">
          <span className="hidden sm:inline">Pot Limit Omaha equity, in your browser</span>
          <a
            href="https://github.com/brentbebuilding/PLO"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-500 hover:text-white"
          >
            <Github size={18} />
          </a>
        </div>
      </header>

      <main className="bg-[#4a1414] px-4 py-4">
        <div className="max-w-6xl mx-auto">
          {/* Deck and screenshot controls */}
          <div className="flex flex-wrap gap-4 items-start justify-between mb-4">
            <CardRail used={usedCards} onPick={placeCard} disabled={!selected} />

            <div className="flex flex-col gap-2 min-w-[220px] flex-1 max-w-xs">
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
                }}
                onClick={() => document.getElementById('shot-input')?.click()}
                className="border-2 border-dashed border-neutral-500 hover:border-neutral-300 rounded-lg p-3 text-center cursor-pointer bg-black/20 transition-colors"
              >
                {isReading ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-neutral-300 py-2">
                    <Loader2 size={16} className="animate-spin" />
                    Reading…
                  </div>
                ) : screenshot ? (
                  <img
                    src={screenshot}
                    alt="Screenshot"
                    className="max-h-20 mx-auto rounded object-contain"
                  />
                ) : (
                  <>
                    <Upload className="mx-auto text-neutral-400 mb-1" size={18} />
                    <div className="text-xs text-neutral-300">
                      Drop a screenshot here
                    </div>
                    <div className="text-[11px] text-neutral-500">or paste it anywhere</div>
                  </>
                )}
                <input
                  id="shot-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={newHand}
                  className="flex-1 px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-sm font-medium flex items-center justify-center gap-2"
                >
                  <RefreshCw size={14} />
                  New Hand
                </button>
                <button
                  onClick={clearSlot}
                  disabled={!selected}
                  className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-sm"
                  title="Empty the selected slot"
                >
                  Clear
                </button>
              </div>

              {readNote && !error && (
                <div className="text-[11px] text-neutral-400">{readNote}</div>
              )}
              {error && (
                <div className="text-[11px] text-red-300 bg-red-950/50 rounded px-2 py-1">
                  {error}
                </div>
              )}

              {equity && (
                <div className="text-[11px] text-neutral-400">
                  10,000 simulations · {stage}
                </div>
              )}
            </div>
          </div>

          <PokerTable
            seats={seats}
            board={board}
            selected={selected}
            onSelect={setSelected}
            equity={seatEquity}
          />

          <div className="mt-4">
            <h2 className="text-sm font-semibold mb-2">Dead Cards</h2>
            <div className="flex gap-1.5 flex-wrap">
              {dead.map((card, i) => (
                <CardSlot
                  key={i}
                  card={card}
                  size="small"
                  selected={sameSlot(selected, { group: 'dead', index: i })}
                  onClick={() => setSelected({ group: 'dead', index: i })}
                />
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="px-6 py-3 text-center text-neutral-600 text-xs">
        Runs entirely in your browser · nothing is uploaded · VERSION 5.0
      </footer>
    </div>
  );
}

/** Step to the next slot, so a hand can be entered without re-clicking. */
function advance(slot: SlotRef): SlotRef {
  if (slot.group === 'board') {
    return { group: 'board', index: Math.min(slot.index + 1, BOARD_SIZE - 1) };
  }
  if (slot.group === 'dead') {
    return { group: 'dead', index: Math.min(slot.index + 1, DEAD_CARD_SLOTS - 1) };
  }
  if (slot.index + 1 < CARDS_PER_SEAT) {
    return { group: slot.group, index: slot.index + 1 };
  }
  // End of a hand: move to the board after the user's own, else the next seat.
  if (slot.group === 0) return { group: 'board', index: 0 };
  return { group: Math.min(slot.group + 1, SEAT_COUNT - 1), index: 0 };
}

export default App;
