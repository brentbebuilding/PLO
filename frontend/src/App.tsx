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

  const isNarrow = useIsNarrow();

  const [selected, setSelected] = useState<SlotRef | null>({ group: 0, index: 0 });
  const [equity, setEquity] = useState<
    { players: DisplayResult[]; stage: Stage; boards: number } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  /** The user's equity at each street the board has already passed. */
  const [history, setHistory] = useState<{ street: string; equity: number }[]>([]);

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
      setHistory([]);
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
        // How the user's equity stood at each earlier street. A screenshot
        // arrives with the whole board already dealt, so this is the only way
        // to see how the hand actually ran — the number under their cards is
        // the finished article and says nothing about how it got there.
        const heroAt = seatOf.indexOf(0);
        if (heroAt < 0) {
          setHistory([]);
        } else {
          const dealt = board.filter((c): c is Card => c !== null);
          const past: { street: string; equity: number }[] = [];
          for (const [street, count] of [
            ['Preflop', 0],
            ['Flop', 3],
            ['Turn', 4],
          ] as [string, number][]) {
            if (count >= dealt.length) continue;
            const at = calculateEquity(
              complete,
              dealt.slice(0, count),
              dead.filter((c): c is Card => c !== null)
            );
            past.push({ street, equity: at.players[heroAt].equity });
          }
          setHistory(past);
        }

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
    setHistory([]);
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
      className={`h-screen flex flex-col bg-neutral-950 text-white ${
        // The wide layout shrinks with the window until it reaches the width
        // the phone layout would take over at, then holds its size and lets
        // the page overflow rather than degrading any further.
        isNarrow ? 'overflow-hidden' : 'overflow-x-auto overflow-y-hidden'
      }`}
      style={
        ({
          minWidth: isNarrow ? undefined : '500px',
          ...(isNarrow
          ? {
              // Solved from what has to fit across rather than guessed. The
              // binding constraint is that a side hand must not reach the
              // hero's, which caps a seat card at 0.072 of the felt's width.
              // The deck rail is thirteen cards with a pixel between.
              '--rail-card-w': 'clamp(15px, calc((100vw - 48px) / 13), 30px)',
              '--rail-card-h': 'calc(var(--rail-card-w) * 1.26)',
              // Capped by the felt too, which on a phone is the page width or
              // 1.15x the height left over, whichever is smaller. The chrome
              // above and below runs to 415px there, the deck being four rows.
              '--seat-card-w':
                'clamp(20px, min(calc((100vw - 24px) * 0.072), calc((100vh - 415px) * 0.0828)), 34px)',
              '--board-card-w':
                'clamp(24px, min(calc((100vw - 24px) * 0.083), calc((100vh - 415px) * 0.0955)), 40px)',
              '--dead-card-w': 'clamp(16px, 5.5vw, 28px)',
            }
          : {
              // Card sizes track whichever of width or height is tighter, so
              // the table, deck and dead cards all stay inside one viewport.
              // The deck stays at full size until it would run into the
              // dropzone beside it, and only then gives ground. What is left
              // for it is the content width — the page less its padding, and
              // no wider than the column caps it — less the 240px the dropzone
              // takes and the 12px between them, less 42px of the deck's own
              // padding and the gaps between its cards. Twenty-six cards share
              // what remains. Full size holds down to about a 1100px window.
              '--rail-card-w':
                'clamp(14px, calc((min(100vw - 24px, 1152px) - 294px) / 26), 30px)',
              '--rail-card-h': 'calc(var(--rail-card-w) * 1.4)',
              // Hands are drawn at the same size as the board. The cap comes
              // from the one thing that has to hold: a side hand reaches 2.2
              // card widths towards the middle and the board 2.74, so 4.94 of
              // them have to fit in the 32% of the felt between a side seat
              // and its centre. At the widest the table gets — 1152px, where
              // max-w-6xl stops it — that allows 74px.
              // The felt is as wide as the page allows or 2.1x the height left
              // over, whichever is smaller, so the cap comes off both. The
              // height left over is the window less the 300px of header, deck,
              // dead row and footer above and below it — a figure worth relying
              // on only because that band is now a fixed height. Sizing from
              // the window alone is what let a short one shrink the felt while
              // the cards stayed put and ran through the board.
              '--board-card-w':
                'clamp(22px, min(calc((100vw - 24px) * 0.060), calc((100vh - 300px) * 0.126)), 72px)',
              '--seat-card-w': 'var(--board-card-w)',
              // The dead row is reference, not the thing being read, so it
              // keeps its own size rather than growing with the table.
              '--dead-card-w': 'clamp(16px, min(1.8vw, 2.9vh), 28px)',
            }),
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

      <main className="bg-[#4a1414] px-3 py-2 flex-1 min-h-0 flex flex-col">
        <div className="max-w-6xl w-full mx-auto flex-1 min-h-0 flex flex-col gap-2">
          {/* Deck and screenshot controls */}
          {/* No wrapping out wide. Letting these fold put the dropzone
              underneath the deck, which is the rearranging that made things
              move; they shrink instead, and everything stays where it was. */}
          <div
            className={`flex gap-3 items-start justify-between shrink-0 ${
              isNarrow ? 'flex-wrap' : 'flex-nowrap'
            }`}
          >
            <div className="flex flex-col gap-1 min-w-0">
              <CardRail
                used={usedCards}
                onPick={placeCard}
                disabled={!selected}
                compact={isNarrow}
              />

              {/* Reserves its line whether or not there is a hand to describe,
                  so arriving at one doesn't resize the table under it. */}
              <div className="h-4 flex items-baseline gap-3 text-[11px] leading-none">
                {history.length > 0 && (
                  <>
                    <span className="text-emerald-300 font-medium">Your equity</span>
                    {history.map(({ street, equity: value }) => (
                      <span key={street} className="text-neutral-400 whitespace-nowrap">
                        {street}{' '}
                        <span className="text-white font-medium">{value.toFixed(2)}%</span>
                      </span>
                    ))}
                  </>
                )}
              </div>
            </div>

            <div
              className={`flex flex-col gap-1.5 ${
                isNarrow ? 'w-full' : 'min-w-[150px] flex-1 max-w-[240px]'
              }`}
            >
              {/* Side by side on a phone. Stacked they cost 60px of height
                  that the table needs more than they do. */}
              <div className={isNarrow ? 'flex gap-2 items-stretch' : 'contents'}>
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
                }}
                onClick={() => document.getElementById('shot-input')?.click()}
                style={{ height: isNarrow ? '3.5rem' : '4.75rem' }}
                className={`border-2 border-dashed border-neutral-500 hover:border-neutral-300 rounded-lg p-2 text-center cursor-pointer bg-black/20 transition-colors flex flex-col items-center justify-center overflow-hidden ${
                  isNarrow ? 'flex-1 min-w-0' : ''
                }`}
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
                className={`px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-medium flex items-center justify-center gap-1.5 ${
                  isNarrow ? 'shrink-0 whitespace-nowrap' : 'w-full'
                }`}
              >
                <RefreshCw size={13} />
                New Hand
              </button>
              </div>

              {/* Kept at a fixed height whether or not there is anything to
                  say. The table is sized from the height left over below this
                  column, so a line appearing here used to shrink the felt and
                  move every seat on it. */}
              <div
                className="flex flex-col gap-1 overflow-hidden"
                style={{ height: isNarrow ? '2.25rem' : '2.75rem' }}
              >
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
          </div>

          <div className="flex-1 min-h-0 flex items-center justify-center">
            <PokerTable
              seats={seats}
              board={board}
              selected={selected}
              onSelect={selectSlot}
              equity={seatEquity}
              compact={isNarrow}
            />
          </div>

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
        Runs entirely in your browser · nothing is uploaded · VERSION 8.8
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
  // End of a hand. Typing a spot in goes: your hand, the opponent you are up
  // against, then the board — so the user's seat runs on to the one on their
  // right rather than skipping ahead to the community cards.
  if (slot.group === 0) return { group: 1, index: 0 };
  if (slot.group === 1) return { group: 'board', index: 0 };
  return { group: Math.min(slot.group + 1, SEAT_COUNT - 1), index: 0 };
}

export default App;
