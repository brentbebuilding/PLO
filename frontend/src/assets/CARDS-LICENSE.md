# Card artwork provenance

The suit pip outlines in `cardPips.ts` are derived from:

**Vector Playing Cards** by Byron Knoll
Originally published at <http://code.google.com/p/vector-playing-cards/>
(Google Code has since shut down; the deck is mirrored at
<https://github.com/hayeah/playing-cards-assets> under `svg-cards/`, whose
README records the same public-domain status.)

**Licence: public domain.** The author released the deck into the public
domain, which places no conditions on use, modification, or redistribution,
commercial or otherwise. No attribution is required — this file exists so the
provenance is on the record, not because the licence demands it.

## What was taken

Only the four suit pip outlines, lifted from the `2_of_*` cards where each pip
appears as a single clean path. They were converted to absolute coordinates and
given a square viewBox centred on each shape's bounds.

Nothing else from the deck ships here. The court cards in the original are
traced artwork — `queen_of_hearts.svg` alone is 622 KB, and the full set runs to
roughly 7 MB. At the sizes this app draws cards (the deck rail is 17–30 px
wide) that detail is invisible anyway, so the card faces are drawn as
large-index faces: white ground, big coloured rank, pip beneath.

## Deliberately not used

Card graphics from cardplayer.com, or from any other poker site, are not used
here. The four-colour scheme is a widely used convention and is reproduced
independently; the artwork itself is our own drawing over public-domain pips.
