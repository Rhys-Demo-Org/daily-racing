# B09 · HUD event motion

Date: 2026-11-07 · mode: backlog · backlog: B09

## Summary

The race HUD moves on events, following UI_RULES §7 and board 05. A position change rolls the digit up and bumps the POS panel to ×1.12. A new lap stamps the LAP panel (×1.18→1, shadow 6→3px). At race start (new race or retry, not resume), the top HUD panels slide down from the top edge and the touch controls slide up, 200 ms snap, 40 ms apart. Each move is a class added for its token duration and then removed, so it can play again. Only transform, box-shadow, clip-path and visibility animate. Under reduced motion only the press sink remains. The existing touch wake pop and resting retract stay as they are. The POS colour cut and the new-best slide (B07) are not part of tonight.

## Acceptance criteria

- **AC1**: After the race UI has shown one frame, a frame where the player's position changes (e.g. 3→2) gives the POS digit a roll class (translateY with release 120 ms and snap easing) and the POS panel a bump class (scale 1.12 with stamp 160 ms and stamp easing). Both classes go after their durations. The first frame after a reset and frames with the same position add neither.
- **AC2**: A frame where the player's lap number goes up (e.g. LAP 1/3 → 2/3) gives the LAP panel a stamp class whose CSS animation scales 1.18→1 and its box-shadow from 6px to 3px, using the stamp duration (160 ms) and stamp easing. The class goes after 160 ms. The first frame after reset and frames with the same lap add no stamp class.
- **AC3**: A second position or lap change after the earlier move has ended adds that move's class again, so it plays again. While racing, a position or lap change never adds a motion class to the TIME panel or the BEST chip.
- **AC4**: Starting a race (reset of the race UI, including retry) gives each top HUD panel (POS, LAP, map, TIME with BEST, PAUSE) a slide-in class. Its animation translates down from above the top edge, using the slide duration (200 ms), snap easing and delays in 40 ms stagger steps. The class goes after the animation. Resuming from pause adds none.
- **AC5**: Starting a race gives the touch controls (Steer left, Steer right, Accelerate, Brake or reverse) a slide-in class that translates them up from below the bottom edge. It uses the slide duration (200 ms) and snap easing with 40 ms stagger steps, and the class goes after the animation. Resuming from pause adds none.
- **AC6**: Each new motion rule (roll, bump, lap stamp, HUD slide-in, touch slide-in) gets its duration and easing only from motion token variables. Its keyframes touch only transform, box-shadow, clip-path or visibility.
- **AC7**: Inside the prefers-reduced-motion: reduce media query, each new motion class (roll, bump, lap stamp, HUD slide-in, touch slide-in) has its animation cut to none. The touch-control pressed sink and the button :active sink are not overridden there, so the press sink remains.

## What you'll see

When a race starts, the top HUD panels slide down into their corners and the touch buttons slide up, one after another. When you pass a car or get passed, the position number rolls and its panel briefly pops bigger. When you start a new lap, the LAP panel stamps down into place.

## How to play-test

1. Open the preview on your phone in landscape and tap RACE.
2. Watch the corners as the countdown appears: POS, LAP, the map, TIME and PAUSE should slide down from the top, and the steer, GAS and BRAKE buttons slide up from the bottom, one after another.
3. Drive and overtake a car (or let one pass you). The big position number should roll and its navy panel should pop slightly larger, then settle.
4. Finish a lap. The LAP panel should stamp in from a little larger with a deeper shadow. The TIME panel should never move while you race.
5. Pause and resume. The HUD should not slide in again.
6. Optional: turn on Reduce Motion in your phone settings and race again. Nothing should slide, roll or pop, but buttons should still sink when pressed.

## Expected files

- `src/ui/hud.ts`
- `src/ui/hud.css`
- `src/ui/race-ui.ts`
- `src/ui/touch-controls.ts`
- `src/ui/touch-controls.css`
- `src/ui/components.css`
- `tests/ui/hud-event-motion.test.ts`
- `tests/ui/hud-slide-in.test.ts`
- `tests/ui/hud-motion-reduced.test.ts`
