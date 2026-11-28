# B14 · Track select: many cards and the locked-card shake

Date: 2026-11-28 · mode: backlog · backlog: B14

## Summary

The S6 card row follows UI_RULES §12. Cards share one width and shrink together to fit, down to 96px (2 × space.s7). Names wrap to two lines and are never clipped or cut with an ellipsis. Below 96px the row scrolls sideways with no scrollbar, a snap point per card and the next card peeking in, while RACE stays fixed outside the scroller. Desktop cards must stay over 1.4× their phone width, as the existing desktop test expects. A locked card never lifts or sinks. A tap, a click, or Enter/Space while focused shakes it: transform only, ±4px, 3 swings in 250ms with snap easing, ending at rest. The selection doesn't change, and reduced motion means no shake. A new stage file adds five-card and eight-card menus (one card locked) from fixed data. The existing start stages stay as they are.

## Acceptance criteria

- **AC1**: In Chromium at 844×390 (touch), the new stage 'track-select--five-cards' shows 5 radios of equal width (±0.5px), each ≥96px, all inside the viewport, with the row unscrolled (scrollWidth ≤ clientWidth). No card overlaps RACE, and no card's name or BEST text is clipped (scrollWidth ≤ clientWidth, right edge inside its card).
- **AC2**: In Chromium at 844×390, the 4-card 'start--menu' stage's cards have equal width (±0.5px), each ≥96px. Every card name's computed text-overflow is not 'ellipsis', and no name is clipped (scrollWidth ≤ clientWidth). The new 'track-select--five-cards' stage renders without page errors.
- **AC3**: In Chromium at 844×390, in the new stage 'track-select--many-cards' (8 radios), the radios' scrolling ancestor has scrollWidth > clientWidth, scroll-snap-type on the x axis and scrollbar-width 'none'. Every radio is 96px wide (±0.5px) with a non-'none' scroll-snap-align. At scroll 0, the first card not fully inside the row is still partly visible in it (peek).
- **AC4**: In 'track-select--many-cards' at 844×390, scrolling the card row to its far end (scrollLeft = scrollWidth − clientWidth) leaves RACE's bounding box exactly where it was at scroll 0 and fully inside the viewport. The last card is then fully visible.
- **AC5**: In 'start--menu' (Pine Ridge locked), at 1440×900 (click) and 844×390 (tap), activating the locked Pine Ridge radio starts a transform-only animation on it: 250ms, easing cubic-bezier(.2,.9,.3,1). Sampled x offset takes both signs, never exceeds 4px, y offset 0, identity when finished. The same radio stays aria-checked; Pine Ridge stays 'false'.
- **AC6**: In the 'start--menu' stage, focusing the locked Pine Ridge radio and pressing Enter, and separately Space, each starts the same transform-only 250ms shake on that radio. The aria-checked radio stays the same, and focus stays on Pine Ridge.
- **AC7**: With the page emulating prefers-reduced-motion: reduce, clicking the locked Pine Ridge radio in 'start--menu', or pressing Enter on it while focused, starts no animation on it. Its computed transform stays 'none' (or identity), and the selected radio doesn't change.
- **AC8**: In 'track-select--many-cards' at 1440×900 (mouse), hovering the locked radio, then holding the mouse down on it (sampled before release, with transitions finished), leaves its computed transform at identity and its box-shadow offset at rest both times. Hovering an unlocked radio in the same stage lifts it (negative offset).

## What you'll see

On the track select screen, tapping the locked Pine Ridge card makes it give a quick little side-to-side shake, and the card you'd picked stays picked. The card row now shrinks to fit more tracks, and once there are too many it scrolls sideways with the next card peeking in, while the RACE button stays put.

## How to play-test

1. Open the PR preview on your phone, held sideways.
2. On the track select screen, tap the locked Pine Ridge card (the dark one with the padlock). It should shake left and right briefly and settle back. The highlighted (mustard) card shouldn't change.
3. Press and hold on Pine Ridge: it shouldn't sink or lift the way the other cards do.
4. Turn on Reduce Motion in your phone's accessibility settings, reload, and tap Pine Ridge again: it should stay still and nothing should change.
5. Check that all four card names read in full, wrapping onto two lines if needed, with nothing cut off.
6. To see the five-card and many-card rows, open the screenshots attached to the PR (the track-select stages). In the many-card one the row ends with a card half showing at the edge, and RACE sits in the same spot.

## Expected files

- `src/ui/start-screen.ts`
- `src/ui/track-card.ts`
- `src/ui/title.css`
- `src/ui/screen-change.ts`
- `src/ui/stages/track-select.stage.ts`
- `tests/ui/track-select-many-cards.test.ts`
- `tests/ui/locked-card-shake.test.ts`
- `tests/ui/locked-card-rest.test.ts`
