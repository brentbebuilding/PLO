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
has to be positioned or configured first — the board locates itself and
everything else is measured against it, so a screenshot taken at any window
size reads the same.

**Street by street.** A replay screenshot shows the finished board, which says
nothing about how the hand actually ran. Alongside the final number your equity
is shown as it stood preflop, on the flop and on the turn.

**Dead cards.** Fourteen slots for cards known to be out of the deck — folded
hands, cards exposed by a misdeal — which are removed from the enumeration
rather than left live.

**Six seats**, four hole cards each, win and tie shown under every hand. Cards
can be typed in by hand too, from the deck along the top, when there is no
screenshot to read.

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

## How the screenshot is read

Tuned to the ClubWPT Gold client. Roughly:

1. **Find the cards.** Card faces are solid colour blocks — blue diamonds,
   green clubs, dark red hearts, grey spades — so every pixel is labelled with
   the nearest suit colour and connected components are taken. Matching is on
   chromaticity and saturation rather than brightness, which is what lets a
   card the client has greyed out still match a sample taken from a bright one.

2. **Find the board.** The community cards are the only face-up group that is
   evenly spaced and unoccluded, so they can be found without calibration.
   Everything downstream is expressed relative to them rather than to the
   image, which is what makes a read survive a different window size.

3. **Group the hands** and discard the rows that are face down. A player who
   folded still gets a panel row, holding four card backs — card-shaped,
   card-sized, and a grey that reads as a spade. They are caught by the fact
   that the four are the same picture, which no real hand can be.

4. **Read the ranks** by template matching the glyph in each card's corner.

5. **Work out which hand is yours.** Your avatar is looked for at your own seat,
   bottom-centre. When it is covered — the client stamps an ALL-IN disc across
   it, on exactly the hands worth reviewing — the answer is triangulated
   instead: the hands panel lists players in seating order, so recognising any
   one player at any one seat pins down where the whole list sits on the table.
   Which seats are occupied is solved for rather than assumed, since tables are
   not always full.

Where both methods reach an answer they agree, across every screenshot tested.
When neither is confident, no hand is claimed to be yours and the seat is left
empty to be filled in by hand — a wrong hand quietly produces a wrong equity,
a missing one is obvious.

### Known gap

Your own cards at your seat, drawn fanned, cannot be read when the hands panel
does not show them. The rank sits in each card's top-left corner, which is
exactly the part the fan covers with the next card. Those hands are typed in.

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
