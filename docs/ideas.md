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

## Collect screenshots that read wrongly

Every misread so far has been fixed by someone sending the picture over. A way
for anyone to hand one in would keep that going without it having to come
through me. Three routes, none of them a page that writes to the repo directly
— that needs a write token in the page's JavaScript, where anyone can read it
and GitHub's secret scanning will revoke it anyway:

- **A prefilled GitHub issue.** A button opens a new issue on the repo; they
  drag the screenshot into the body and GitHub hosts it. Nothing to build, no
  secret, no abuse surface. Costs the submitter a free GitHub account, and the
  issue is public.
- **A small relay** — a Cloudflare Worker on the free tier holding the token
  server-side and committing into `submissions/`. No account needed from them,
  files land exactly where wanted, but it is a service to keep alive and it
  needs a size cap and a rate limit or the repo fills with junk.
- **A form service** (Tally, Formspree). No account, no code, but the images
  sit with a third party and free tiers are tight on attachment size.

Whichever route: the app could prefill the report with what the reader actually
detected, the version and the image size, so the misread arrives next to the
picture. And screenshots carry live player handles — public and permanent by
the issue route — which is worth saying on the form, given every handle on the
help page's example is pixelated for exactly that reason.

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
