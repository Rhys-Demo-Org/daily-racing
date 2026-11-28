# Design request · B14 track select (2026-11-28)

Two points UI_RULES §12 leaves open. The build follows §12 as written and changes nothing else.

## 1 · Five cards can't fit unscrolled at 844×390

B14's done_when says "4 and 5 cards fit unscrolled at 844×390". With the current S6 layout (title
panel one third of the width, select padding space.s5 on the left and the 48px safe inset on the
right, 8px gap) the card row is about 491px wide. Five cards at the 96px minimum need
5 × 96 + 4 × 8 = 512px, so under §12 five cards scroll, the fifth peeking in at the edge.
Four cards still fit (about 117px each).

I left the S6 padding, gap and panel width alone. Owner's choice:
- change done_when to "4 cards fit unscrolled", or
- specify an S6 layout change (e.g. narrower title panel or a smaller gap) that lets five fit.

## 2 · The BEST line at 96px

The BEST line is `white-space: nowrap` at label size (13px, 0.12em tracking). At 96px the plate's
content box is 72px wide (4px outline each side, 8px padding):

- `BEST –:––.––` is about 77px: it uses 5px of the plate's right padding and isn't clipped.
- `BEST 0:40.37` (any stored time) is about 86px: its last digit is clipped by the card edge.
  The `track-select--many-cards` stage shows this on its first card at 844×390.

I kept the existing BEST styling (no new size, wrap or truncation rule). Options: let BEST wrap
under its time, drop the word "BEST" below a certain width, or reduce the plate's side padding at the
minimum width.

Related: at 22px the word "BRAMBLE" is 74px wide, 2px wider than the 72px content box. It uses the
plate's padding and stays inside the card, so it isn't clipped. Any longer single-word name would be.
