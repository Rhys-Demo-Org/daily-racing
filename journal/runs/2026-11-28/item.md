## B14 · Track select: many cards and the locked-card shake
depends_on: B11
scope: Track select (S6) per UI_RULES section 12 (owner, 2026-11-23). The card row shrinks all
cards together to fit, down to 96px; below that it scrolls sideways with a snap point per card and
the next card peeking in, while RACE stays fixed. A locked card never hover-lifts or press-sinks.
Tapping or clicking it, or pressing Enter/Space while it has focus, shakes it ±4px horizontally,
3 swings in 250ms with easing snap, and the selection doesn't change. Reduced motion: no shake.
Mockup: S6 (plus UI_RULES section 12).
done_when: at 844×390, 4 and 5 cards fit unscrolled with no clipped name; with enough cards to pass
the minimum width the row scrolls, snaps per card and RACE never moves; activating a locked card by
pointer or Enter/Space shakes it (transform only) and leaves the selection unchanged; with reduced
motion it doesn't shake; a locked card's transform stays at rest on hover and press.
