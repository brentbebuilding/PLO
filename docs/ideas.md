# Ideas, not yet built

Kept here so they aren't lost between sessions. Roughly in the order they'd be
worth doing.

## Say what each hand actually is

Under each hand: "Straight, Q-high", "Two pair, aces and tens". The evaluator
already works this out in order to compare hands — it just throws the answer
away and keeps the comparison. Reading four cards against a board and working
out the made hand is the thing a person currently does in their head on every
imported screenshot.

Cheap. The categories and kickers are already packed into the integer the
evaluator returns; it only needs unpacking into words.

## Pot odds

Two inputs — the pot, and the bet being faced — and a line saying the equity
needed against the equity held. That turns "what was my equity" into "was that
call right", which is the question actually being asked when a hand is being
reviewed after the fact.

Cheap, and independent of everything else.

## Outs

On the turn, the cards that win it: "any ten — 4 cards, 10%". On the flop, the
cards that make the user favourite.

This falls out of work already being done. The enumeration walks every run-out
and counts wins; it just doesn't record *which* card produced them. Keeping a
tally per card costs one array.

## A link that restores the hand

Encode the table state in the URL, so a spot can be bookmarked or sent to
someone, plus a short list of recent hands to flick back through. Turns the
tool into something a study set accumulates in rather than a one-shot
calculator.

Cheap. The state is six hands, five board cards and the dead row — under 30
cards, which packs into a short string.

## Equity against a range

"How does this hand do against any two broadway cards" rather than against one
specific holding. This is how solvers frame the question and it is the most
valuable thing on this list for studying — but it is a real project: range
syntax, an editor to build ranges in, and an enumeration that grows with the
size of the range rather than being fixed at one hand each. Worth doing only
once the small things above are done.

# Known gap

The user's own cards at their seat, fanned, cannot be read when the hands panel
doesn't show them. The rank sits in each card's top-left corner, which is
exactly the part the fan covers with the next card. Six approaches were tried;
an exhaustive search over roughly 22,000 crops per card ceilings at two of four.
Template matching is rigid pixel correlation, and recognising a clipped glyph
needs learned priors instead. A vision API call would do it; that was offered
and deliberately parked, and those hands are typed in by hand instead.
