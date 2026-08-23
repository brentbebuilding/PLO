import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import SeatStack from './components/SeatStack';
import useIsNarrow from './hooks/useIsNarrow';
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

  const tableAreaRef = useRef<HTMLDivElement>(null);
  const [tableHeight, setTableHeight] = useState(400);
  const isNarrow = useIsNarrow();

  const [selected, setSelected] = useState<SlotRef | null>({ group: 0, index: 0 });
  const [equity, setEquity] = useState<
    { players: DisplayResult[]; stage: Stage; boards: number } | null
  >(null);
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
          dead.filter((c): c is Card => c !== null)
        );
        // Map back to seat numbers so the labels match the table.
        const seatOf = seats
          .map((hand, i) => (hand.every(c => c !== null) ? i : -1))
          .filter(i => i >= 0);
        setEquity({
          stage: result.stage as Stage,
          boards: result.boardsEvaluated,
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
  }, [seats, board, dead]);

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

  /**
   * Select a slot, emptying it on the way.
   *
   * Clicking a card you can see is a request to change it, so the card is
   * returned to the deck and the slot left waiting — one click to undo, one to
   * replace, instead of selecting and then hunting for a clear button.
   */
  const selectSlot = (slot: SlotRef) => {
    if (slot.group === 'board') {
      setBoard(prev => prev.map((c, i) => (i === slot.index ? null : c)));
    } else if (slot.group === 'dead') {
      setDead(prev => prev.map((c, i) => (i === slot.index ? null : c)));
    } else {
      const seat = slot.group;
      setSeats(prev =>
        prev.map((hand, s) =>
          s === seat ? hand.map((c, i) => (i === slot.index ? null : c)) : hand
        )
      );
    }
    setSelected(slot);
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

      // Land on the first gap the read left behind. Hands the client didn't
      // show get typed in, so putting the cursor there saves hunting for it.
      setSelected(firstEmptySlot(nextSeats, nextBoard));
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

  // The table fills whatever height is left once everything else is placed.
  useEffect(() => {
    const el = tableAreaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) setTableHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
    // Re-runs when the layout switches: the element the observer needs only
    // exists in the wide layout, so rotating a phone into landscape has to
    // attach it rather than leave the table sized from a stale measurement.
  }, [isNarrow]);

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
    <div
      className={`flex flex-col bg-neutral-950 text-white ${
        // Wide screens fit everything in one viewport and must not scroll, or
        // the table drifts out of view. A phone cannot, so it scrolls.
        isNarrow ? 'min-h-screen' : 'h-screen overflow-hidden'
      }`}
      style={
        (isNarrow
          ? {
              // Solved from what has to fit across, not guessed as a share of
              // the width: the board is five cards plus four gaps of a tenth
              // of a card, so 5.5 card widths, and the deck rail is thirteen
              // with a pixel between. The page runs on downwards, so height
              // never enters into it.
              '--rail-card-w': 'clamp(15px, calc((100vw - 48px) / 13), 30px)',
              '--seat-card-w': 'clamp(28px, calc((100vw - 44px) / 5.5), 68px)',
              '--board-card-w': 'clamp(28px, calc((100vw - 44px) / 5.5), 72px)',
              '--dead-card-w': 'clamp(16px, 5.5vw, 28px)',
            }
          : {
              // Card sizes track whichever of width or height is tighter, so
              // the table, deck and dead cards all stay inside one viewport.
              '--rail-card-w': 'clamp(17px, min(1.9vw, 3.1vh), 30px)',
              '--seat-card-w': 'clamp(30px, min(4.0vw, 6.4vh), 64px)',
              '--board-card-w': 'clamp(34px, min(4.8vw, 7.6vh), 78px)',
              // The dead row is reference, not the thing being read, so it
              // keeps its own size rather than growing with the table.
              '--dead-card-w': 'clamp(16px, min(1.8vw, 2.9vh), 28px)',
            }) as React.CSSProperties
      }
    >
      <header className="px-4 py-2 flex items-center justify-between border-b border-neutral-800 shrink-0">
        <h1 className="text-lg font-bold">Omaha Odds Calculator</h1>
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="hidden md:inline">Pot Limit Omaha equity, in your browser</span>
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

      <main className={`bg-[#4a1414] px-3 py-2 flex flex-col ${isNarrow ? '' : 'flex-1 min-h-0'}`}>
        <div className={`max-w-6xl w-full mx-auto flex flex-col gap-2 ${isNarrow ? '' : 'flex-1 min-h-0'}`}>
          {/* Deck and screenshot controls */}
          <div className="flex flex-wrap gap-3 items-start justify-between shrink-0">
            <CardRail used={usedCards} onPick={placeCard} disabled={!selected} />

            <div className="flex flex-col gap-1.5 min-w-[180px] flex-1 max-w-[240px]">
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
                }}
                onClick={() => document.getElementById('shot-input')?.click()}
                className="border-2 border-dashed border-neutral-500 hover:border-neutral-300 rounded-lg p-2 text-center cursor-pointer bg-black/20 transition-colors"
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
                    className="max-h-14 mx-auto rounded object-contain"
                  />
                ) : (
                  <>
                    <Upload className="mx-auto text-neutral-400 mb-0.5" size={16} />
                    <div className="text-[11px] text-neutral-300">Drop a screenshot here</div>
                    <div className="text-[10px] text-neutral-500">or paste it anywhere</div>
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

              <button
                onClick={newHand}
                className="w-full px-2 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-medium flex items-center justify-center gap-1.5"
              >
                <RefreshCw size={13} />
                New Hand
              </button>

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
                  exact · {equity.boards.toLocaleString()}{' '}
                  {equity.boards === 1 ? 'board' : 'boards'} · {stage}
                </div>
              )}
            </div>
          </div>

          {isNarrow ? (
            <SeatStack
              seats={seats}
              board={board}
              selected={selected}
              onSelect={selectSlot}
              equity={seatEquity}
            />
          ) : (
            <div
              ref={tableAreaRef}
              className="flex-1 min-h-0 flex items-center justify-center"
              style={{ '--table-h': `${tableHeight}px` } as React.CSSProperties}
            >
              <PokerTable
                seats={seats}
                board={board}
                selected={selected}
                onSelect={selectSlot}
                equity={seatEquity}
              />
            </div>
          )}

          <div className="shrink-0">
            <h2 className="text-xs font-semibold mb-1">Dead Cards</h2>
            <div className="flex flex-wrap" style={{ gap: 'calc(var(--dead-card-w) * 0.14)' }}>
              {dead.map((card, i) => (
                <CardSlot
                  key={i}
                  card={card}
                  size="dead"
                  selected={sameSlot(selected, { group: 'dead', index: i })}
                  onClick={() => selectSlot({ group: 'dead', index: i })}
                />
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="px-4 py-1 text-center text-neutral-600 text-[10px] shrink-0">
        Runs entirely in your browser · nothing is uploaded · VERSION 7.6
      </footer>
    </div>
  );
}

/**
 * First slot a read left unfilled, scanning the user's seat, then the board,
 * then the other seats. Falls back to the user's first card when nothing is
 * missing, which is also the right place to start on an empty table.
 */
function firstEmptySlot(seats: (Card | null)[][], board: (Card | null)[]): SlotRef {
  const heroGap = seats[0]?.findIndex(c => c === null) ?? -1;
  if (heroGap >= 0 && seats[0].some(c => c !== null)) return { group: 0, index: heroGap };

  const boardGap = board.findIndex(c => c === null);
  if (boardGap >= 0 && board.some(c => c !== null)) return { group: 'board', index: boardGap };

  for (let seat = 1; seat < seats.length; seat++) {
    if (!seats[seat].some(c => c !== null)) continue;
    const gap = seats[seat].findIndex(c => c === null);
    if (gap >= 0) return { group: seat, index: gap };
  }

  if (heroGap >= 0) return { group: 0, index: heroGap };
  return { group: 0, index: 0 };
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
