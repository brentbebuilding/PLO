# PLO Odds Calculator

Exact Pot Limit Omaha equity, from a screenshot of the hand.

Drop in a screenshot of a hand replay and it reads the board, reads every hand
the client revealed, works out which one is yours, and gives each player's
equity — exactly, not sampled. Everything runs in the browser; no screenshot
ever leaves the machine.

**[Open it](https://brentbebuilding.github.io/PLO/)**

## What it does

**Exact equity.** Every possible run-out of the remaining board is counted, so
the same spot always returns the same number, to the last decimal. Nothing is
sampled and nothing drifts between runs.

**Reads a screenshot.** Drag a hand-replay screenshot onto the page. The board
and every revealed hand are filled in, including which seat is yours. Nothing
has to be positioned or configured first, and a screenshot taken at any window
size reads the same. Built against the ClubWPT Gold client.

Anything it cannot read confidently is left blank rather than guessed at, to be
filled in from the deck along the top — a wrong card quietly produces a wrong
equity, a missing one is obvious.

**Street by street.** A replay screenshot shows the finished board, which says
nothing about how the hand actually ran. Alongside the final number your equity
is shown as it stood preflop, on the flop and on the turn.

**Dead cards.** Fourteen slots for cards known to be out of the deck — folded
hands, cards exposed by a misdeal — which are removed from the enumeration
rather than left live.

**Six seats**, four hole cards each, win and tie shown under every hand. A spot
can equally be built by hand, with no screenshot involved.

Laid out for a phone as well as a desktop window.

## How the equity is worked out

Omaha's own rule is what makes exhaustive counting affordable. A player must
use exactly two hole cards and exactly three board cards, so the board only ever
reaches a hand through its three-card subsets. Every
(player, hole-pair, board-triple) combination is scored once up front — well
under 200,000 hand evaluations even in the worst case — after which each
run-out is ten table lookups per player instead of sixty hand evaluations.

That turns the heaviest case, two players preflop, from roughly 130 million
hand evaluations into about 160,000 plus a tight scan over 1,086,008 boards.
Hands are compared as packed integers, and straights are a single lookup on a
13-bit rank mask.

## Tech

React 18, TypeScript, Vite, Tailwind. No backend, no dependencies at runtime
beyond React itself. Deployed to GitHub Pages by GitHub Actions on push.

## Running it locally

Node 18 or newer.

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build    # typechecks, then builds to frontend/dist
npm run lint
```

## PLO, briefly

Each player is dealt four hole cards and must make their best five-card hand
from **exactly two** of them and **exactly three** board cards. No more, no
fewer — four hearts in the hole is not a flush. That constraint is why Omaha
equities are so much less obvious than Hold'em ones, and why a calculator earns
its keep.

## Licence

MIT.

The suit pips are derived from Byron Knoll's public-domain Vector Playing
Cards; see [`frontend/src/assets/CARDS-LICENSE.md`](frontend/src/assets/CARDS-LICENSE.md)
for the provenance. Card faces are drawn here rather than taken from any poker
site.
