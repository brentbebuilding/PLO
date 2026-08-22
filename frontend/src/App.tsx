import { useState, useEffect } from 'react';
import { Card as CardType, Rank, Suit } from './types';
import {
  PlayerHand,
  Board,
  CardSelector,
  EquityDisplay,
  ScreenshotReference,
} from './components';
import { calculateEquity, SimulationResult } from './utils/equity';
import { Plus, Minus, RefreshCw, Trash2, Github, Type } from 'lucide-react';

type Stage = 'preflop' | 'flop' | 'turn' | 'river';

interface SelectionTarget {
  type: 'player' | 'board';
  playerIndex?: number;
  cardIndex: number;
}

// Convert SimulationResult to EquityDisplay format
interface DisplayResult {
  player_index: number;
  cards: string[];
  win_percentage: number;
  tie_percentage: number;
  equity: number;
}

function App() {
  // State
  const [numPlayers, setNumPlayers] = useState(2);
  const [playerCards, setPlayerCards] = useState<(CardType | null)[][]>([
    [null, null, null, null],
    [null, null, null, null],
  ]);
  const [boardCards, setBoardCards] = useState<(CardType | null)[]>([
    null,
    null,
    null,
    null,
    null,
  ]);
  const [stage, setStage] = useState<Stage>('preflop');
  const [equityResult, setEquityResult] = useState<{
    players: DisplayResult[];
    stage: string;
    simulations_run: number;
  } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectionTarget, setSelectionTarget] = useState<SelectionTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quickInput, setQuickInput] = useState({ hero: '', villain: '', board: '' });
  const [showQuickInput, setShowQuickInput] = useState(false);

  // Parse card string like "Ad Qc Jc 7s" into Card objects
  const parseCardString = (input: string): CardType[] => {
    const cards: CardType[] = [];
    const validRanks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
    const validSuits = ['d', 'c', 'h', 's'];

    // Remove extra spaces and split
    const tokens = input.trim().toUpperCase().split(/\s+/);

    for (const token of tokens) {
      if (token.length >= 2) {
        let rank = token[0];
        let suit = token[1].toLowerCase();

        // Handle "10" as "T"
        if (token.startsWith('10')) {
          rank = 'T';
          suit = token[2]?.toLowerCase() || '';
        }

        if (validRanks.includes(rank) && validSuits.includes(suit)) {
          cards.push({ rank: rank as Rank, suit: suit as Suit });
        }
      }
    }

    return cards;
  };

  // Apply quick input cards
  const applyQuickInput = () => {
    const heroCards = parseCardString(quickInput.hero);
    const villainCards = parseCardString(quickInput.villain);
    const boardCardsInput = parseCardString(quickInput.board);

    // Update hero cards
    if (heroCards.length > 0) {
      const newPlayerCards = [...playerCards];
      heroCards.forEach((card, idx) => {
        if (idx < 4) {
          newPlayerCards[0][idx] = card;
        }
      });
      setPlayerCards(newPlayerCards);
    }

    // Update villain cards
    if (villainCards.length > 0 && numPlayers >= 2) {
      const newPlayerCards = [...playerCards];
      villainCards.forEach((card, idx) => {
        if (idx < 4) {
          newPlayerCards[1][idx] = card;
        }
      });
      setPlayerCards(newPlayerCards);
    }

    // Update board cards
    if (boardCardsInput.length > 0) {
      const newBoardCards = [...boardCards];
      boardCardsInput.forEach((card, idx) => {
        if (idx < 5) {
          newBoardCards[idx] = card;
        }
      });
      setBoardCards(newBoardCards);
    }

    // Clear inputs after applying
    setQuickInput({ hero: '', villain: '', board: '' });
  };

  // Get all used cards
  const usedCards: (CardType | null)[] = [
    ...playerCards.flat(),
    ...boardCards,
  ];

  // Determine stage from board cards
  useEffect(() => {
    const boardCount = boardCards.filter((c) => c !== null).length;
    if (boardCount === 0) setStage('preflop');
    else if (boardCount <= 3) setStage('flop');
    else if (boardCount === 4) setStage('turn');
    else setStage('river');
  }, [boardCards]);

  // Auto-calculate equity when cards change
  useEffect(() => {
    const canCalculate = playerCards.every((hand) =>
      hand.every((card) => card !== null)
    );

    if (canCalculate) {
      handleCalculate();
    } else {
      setEquityResult(null);
    }
  }, [playerCards, boardCards]);

  // Add/remove players
  const addPlayer = () => {
    if (numPlayers < 6) {
      setNumPlayers(numPlayers + 1);
      setPlayerCards([...playerCards, [null, null, null, null]]);
    }
  };

  const removePlayer = () => {
    if (numPlayers > 2) {
      setNumPlayers(numPlayers - 1);
      setPlayerCards(playerCards.slice(0, -1));
    }
  };

  // Handle card selection
  const openCardSelector = (target: SelectionTarget) => {
    setSelectionTarget(target);
    setSelectorOpen(true);
  };

  const handleCardSelect = (card: CardType) => {
    if (!selectionTarget) return;

    if (selectionTarget.type === 'player' && selectionTarget.playerIndex !== undefined) {
      const newPlayerCards = [...playerCards];
      newPlayerCards[selectionTarget.playerIndex] = [
        ...newPlayerCards[selectionTarget.playerIndex],
      ];
      newPlayerCards[selectionTarget.playerIndex][selectionTarget.cardIndex] = card;
      setPlayerCards(newPlayerCards);
    } else if (selectionTarget.type === 'board') {
      const newBoardCards = [...boardCards];
      newBoardCards[selectionTarget.cardIndex] = card;
      setBoardCards(newBoardCards);
    }

    setSelectionTarget(null);
  };

  // Calculate equity (now runs locally in the browser)
  const handleCalculate = async () => {
    setError(null);
    setIsCalculating(true);

    try {
      const validPlayers = playerCards.filter((hand) =>
        hand.every((c) => c !== null)
      ) as CardType[][];

      if (validPlayers.length < 2) {
        setError('Need at least 2 players with complete hands');
        setIsCalculating(false);
        return;
      }

      const board = boardCards.filter((c) => c !== null) as CardType[];

      // Run calculation in a setTimeout to allow UI to update
      await new Promise(resolve => setTimeout(resolve, 10));

      const result: SimulationResult = calculateEquity(validPlayers, board, 10000);

      // Convert to display format
      setEquityResult({
        stage: result.stage,
        simulations_run: result.simulationsRun,
        players: result.players.map(p => ({
          player_index: p.playerIndex,
          cards: p.cards,
          win_percentage: p.winPercentage,
          tie_percentage: p.tiePercentage,
          equity: p.equity,
        })),
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to calculate equity';
      setError(errorMessage);
    } finally {
      setIsCalculating(false);
    }
  };

  // Clear all
  const handleClear = () => {
    setPlayerCards(Array(numPlayers).fill(null).map(() => [null, null, null, null]));
    setBoardCards([null, null, null, null, null]);
    setEquityResult(null);
    setError(null);
  };

  // Handle cards detected from screenshot
  const handleCardsDetected = (result: { playerCards: CardType[][]; boardCards: CardType[] }) => {
    // A showdown can reveal more hands than there are seats configured, so grow
    // to fit rather than silently dropping the extras.
    const MAX_PLAYERS = 6;
    const detectedCount = Math.min(result.playerCards.length, MAX_PLAYERS);
    const seatCount = Math.max(numPlayers, detectedCount);

    const newPlayerCards = Array.from({ length: seatCount }, (_, i) =>
      playerCards[i] ? [...playerCards[i]] : [null, null, null, null]
    );

    result.playerCards.slice(0, MAX_PLAYERS).forEach((hand, playerIdx) => {
      hand.forEach((card, cardIdx) => {
        if (cardIdx < 4) {
          newPlayerCards[playerIdx][cardIdx] = card;
        }
      });
    });

    if (seatCount !== numPlayers) {
      setNumPlayers(seatCount);
    }
    setPlayerCards(newPlayerCards);

    // Update board cards with detected cards
    const newBoardCards = [...boardCards];
    result.boardCards.forEach((card, idx) => {
      if (idx < 5) {
        newBoardCards[idx] = card;
      }
    });
    setBoardCards(newBoardCards);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-poker-felt to-gray-900">
      {/* Header */}
      <header className="bg-black/30 border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">
            PLO Odds Calculator
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm hidden sm:inline">
              Pot Limit Omaha Equity Calculator
            </span>
            <a
              href="https://github.com/brentbebuilding/PLO"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
              title="View on GitHub"
            >
              <Github size={20} />
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column - Players and Board */}
          <div className="lg:col-span-2 space-y-6">
            {/* Screenshot Reference */}
            <ScreenshotReference
              numPlayers={numPlayers}
              onCardsDetected={handleCardsDetected}
            />

            {/* Quick Text Input */}
            <div className="bg-gray-800/50 rounded-xl p-4">
              <button
                onClick={() => setShowQuickInput(!showQuickInput)}
                className="flex items-center gap-2 text-white font-medium w-full"
              >
                <Type size={18} />
                Quick Card Entry
                <span className="text-gray-400 text-sm ml-2">
                  {showQuickInput ? '(click to hide)' : '(type cards like "Ad Qc Jc 7s")'}
                </span>
              </button>

              {showQuickInput && (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-gray-400 text-sm mb-1">Hero (4 cards)</label>
                      <input
                        type="text"
                        value={quickInput.hero}
                        onChange={(e) => setQuickInput({ ...quickInput, hero: e.target.value })}
                        placeholder="Ad Qc Jc 7s"
                        className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-sm mb-1">Villain (4 cards)</label>
                      <input
                        type="text"
                        value={quickInput.villain}
                        onChange={(e) => setQuickInput({ ...quickInput, villain: e.target.value })}
                        placeholder="As Ks Ts 9c"
                        className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-sm mb-1">Board (0-5 cards)</label>
                      <input
                        type="text"
                        value={quickInput.board}
                        onChange={(e) => setQuickInput({ ...quickInput, board: e.target.value })}
                        placeholder="6s 7s 6c 3d Qs"
                        className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-gray-500 text-xs">
                      Format: Rank + Suit (A=Ace, K=King, Q=Queen, J=Jack, T=10, d=♦, c=♣, h=♥, s=♠)
                    </p>
                    <button
                      onClick={applyQuickInput}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                    >
                      Apply Cards
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Player controls */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-white">
                Players ({numPlayers})
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={removePlayer}
                  disabled={numPlayers <= 2}
                  className="p-2 rounded-lg bg-gray-700 text-white disabled:opacity-50 hover:bg-gray-600"
                  title="Remove player"
                >
                  <Minus size={16} />
                </button>
                <button
                  onClick={addPlayer}
                  disabled={numPlayers >= 6}
                  className="p-2 rounded-lg bg-gray-700 text-white disabled:opacity-50 hover:bg-gray-600"
                  title="Add player"
                >
                  <Plus size={16} />
                </button>
                <button
                  onClick={handleClear}
                  className="p-2 rounded-lg bg-red-700 text-white hover:bg-red-600 ml-2"
                  title="Clear all cards"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* Player hands */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {playerCards.map((cards, playerIdx) => (
                <PlayerHand
                  key={playerIdx}
                  playerIndex={playerIdx}
                  cards={cards}
                  equity={equityResult?.players[playerIdx]?.equity}
                  winPercentage={equityResult?.players[playerIdx]?.win_percentage}
                  tiePercentage={equityResult?.players[playerIdx]?.tie_percentage}
                  onCardClick={(cardIdx) =>
                    openCardSelector({
                      type: 'player',
                      playerIndex: playerIdx,
                      cardIndex: cardIdx,
                    })
                  }
                  isHero={playerIdx === 0}
                />
              ))}
            </div>

            {/* Board */}
            <Board
              cards={boardCards}
              onCardClick={(cardIdx) =>
                openCardSelector({ type: 'board', cardIndex: cardIdx })
              }
              stage={stage}
            />

            {/* Calculate button */}
            <button
              onClick={handleCalculate}
              disabled={isCalculating}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {isCalculating ? (
                <>
                  <RefreshCw className="animate-spin" size={20} />
                  Calculating...
                </>
              ) : (
                <>
                  <RefreshCw size={20} />
                  Calculate Equity
                </>
              )}
            </button>

            {/* Error display */}
            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
          </div>

          {/* Right column - Results */}
          <div className="space-y-6">
            {equityResult ? (
              <EquityDisplay
                results={equityResult.players}
                stage={equityResult.stage}
                simulations={equityResult.simulations_run}
              />
            ) : (
              <div className="bg-gray-800/30 rounded-xl p-6 text-center">
                <p className="text-gray-400">
                  Select cards for all players to calculate equity
                </p>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-gray-800/30 rounded-xl p-6">
              <h3 className="text-white font-medium mb-3">How to use</h3>
              <ol className="text-gray-400 text-sm space-y-2 list-decimal list-inside">
                <li>Click on card slots to select cards for each player</li>
                <li>Each player needs 4 hole cards (PLO)</li>
                <li>Add community cards for flop/turn/river</li>
                <li>Equity updates automatically as you add cards</li>
              </ol>
            </div>

            {/* PLO Rules */}
            <div className="bg-gray-800/30 rounded-xl p-6">
              <h3 className="text-white font-medium mb-3">PLO Rules</h3>
              <p className="text-gray-400 text-sm">
                In Pot Limit Omaha, each player receives 4 hole cards and must
                use exactly 2 of them combined with exactly 3 community cards
                to make the best 5-card hand.
              </p>
            </div>

            {/* Tech info */}
            <div className="bg-gray-800/30 rounded-xl p-6">
              <h3 className="text-white font-medium mb-3">About</h3>
              <p className="text-gray-400 text-sm">
                This calculator runs entirely in your browser using Monte Carlo
                simulation with 10,000 iterations. No data is sent to any server.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-black/30 border-t border-gray-800 px-6 py-4 mt-8">
        <div className="max-w-6xl mx-auto text-center text-gray-500 text-sm">
          PLO Odds Calculator - Built with React & TypeScript
        </div>
        {/* Build marker — confirms at a glance which deploy is live. */}
        <div className="max-w-6xl mx-auto text-center mt-2">
          <span className="inline-block px-3 py-1 rounded-full bg-green-600 text-white text-base font-bold">
            VERSION 4.0
          </span>
        </div>
      </footer>

      {/* Card Selector Modal */}
      <CardSelector
        isOpen={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={handleCardSelect}
        usedCards={usedCards}
      />
    </div>
  );
}

export default App;
