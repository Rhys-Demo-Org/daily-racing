# B14 · Track select: many cards and the locked-card shake

Date: 2026-11-28 · mode: backlog · backlog: B14

## Summary

The S6 card row follows UI_RULES §12. Cards share one width and shrink together, down to 96px. Below that the row scrolls sideways at 96px with no scrollbar, a snap point per card, the next card peeking in, and RACE fixed outside it. Existing four-card and desktop tests pass unchanged. A locked card never lifts or sinks. A tap, a click, or Enter/Space while focused (preventDefault) plays one 250ms Web Animation with snap easing: translateX 0, +4, −4, +4, 0px, no fill, cancelling any running shake. Selection doesn't change, and reduced motion means no shake. A new stage shows eight cards, one locked. The builder writes journal/runs/2026-11-28/design-request.md for the owner on two open points: five cards can't fit at 844×390, and how BEST behaves at 96px.

## Acceptance criteria

- **AC1**: In Chromium at 844×390 (touch), the new stage 'track-select--many-cards' renders 8 radios with no page errors. Their row's scroll container has scrollWidth > clientWidth, x-axis scroll-snap-type and scrollbar-width 'none'. Each radio is 96px wide (±0.5px) with a scroll-snap-align other than 'none'. At scrollLeft 0, the first radio not fully inside the row is partly visible in it (peek).
- **AC2**: In 'track-select--many-cards' at 844×390, scrolling the card row to its end (scrollLeft = scrollWidth − clientWidth) leaves RACE's bounding box identical (±0.5px) to where it was at scroll 0 and fully inside the viewport. The last radio is then fully visible in the row, and the document itself never scrolls sideways (documentElement scrollWidth ≤ 844).
- **AC3**: In 'start--menu', clicking (1440×900) or tapping (844×390) the locked Pine Ridge radio starts one animation on it: 250ms, easing cubic-bezier(0.2, 0.9, 0.3, 1), keyframes translateX 0, 4px, −4px, 4px, 0. Sampled x offsets take both signs within ±4px, y stays 0, and once done it is at identity with no animations left. aria-checked is unchanged.
- **AC4**: In 'start--menu', with focus on the locked Pine Ridge radio, pressing Enter, and separately Space, each starts the same 250ms shake on it. The aria-checked radio stays the same, focus stays on Pine Ridge, and neither window.scrollY nor the card row's scrollLeft changes.
- **AC5**: In 'start--menu', activating the locked Pine Ridge radio three times within 100ms, by click or Enter, never leaves more than one running animation on it. Once the last shake finishes, its computed transform is identity.
- **AC6**: With the page emulating prefers-reduced-motion: reduce, clicking the locked Pine Ridge radio in 'start--menu', or pressing Enter or Space on it while it has focus, starts no animation on it (getAnimations() is empty). Its computed transform stays identity and the aria-checked radio doesn't change.
- **AC7**: In 'track-select--many-cards' at 1440×900 (mouse), the locked radio's computed transform stays identity and its box-shadow keeps its at-rest value when hovered (transitions settled) and while the mouse is held down on it before release. Releasing the mouse starts the shake, which ends at identity. Hovering an unlocked radio in the same stage gives it a negative translate offset.

## What you'll see

Tap the locked Pine Ridge card and it gives a quick little side-to-side shake, and the track you'd picked stays picked. If there are more tracks than fit, the card row scrolls sideways with the next card peeking in, and the RACE button stays put.

## How to play-test

1. Open the PR preview on your phone, held sideways.
2. On the track select screen, tap the locked Pine Ridge card (the dark one with the padlock). It should shake left and right briefly and settle back, and the mustard card shouldn't change.
3. Tap it several times fast. It should keep shaking cleanly, without drifting or getting stuck off-centre.
4. Press and hold on Pine Ridge. Unlike the other cards it shouldn't sink while you hold it.
5. Turn on Reduce Motion in your phone's accessibility settings, reload, and tap Pine Ridge again. It should stay still and nothing should change.
6. Check that the four cards still fit side by side and every name reads in full.
7. Open the screenshots attached to the PR and find the eight-card track select. The row should end with a card partly showing at the edge, and RACE should be in its usual spot.

## Expected files

- `src/ui/start-screen.ts`
- `src/ui/track-card.ts`
- `src/ui/title.css`
- `src/ui/screen-change.ts`
- `src/ui/stages/track-select.stage.ts`
- `tests/ui/track-select-many-cards.test.ts`
- `tests/ui/locked-card-shake.test.ts`
- `tests/ui/locked-card-rest.test.ts`
