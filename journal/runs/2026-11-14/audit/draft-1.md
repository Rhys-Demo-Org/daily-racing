# B09 · HUD event motion

Date: 2026-11-14 · mode: backlog · backlog: B09

## Summary

The race HUD moves on events (UI_RULES §7, board 05 #3 and #9), using only transform, box-shadow, clip-path and visibility, with timings and easings from the motion tokens. When the player's position changes, the POS panel bumps to ×1.12 (`is-bump`, stamp, 160 ms) and its digit rolls up 42 px (`is-roll`, snap, 120 ms). When a new lap starts, the LAP panel stamps from 1.18 to 1 with its shadow going 6→3 px (`is-stamp`, stamp, 160 ms). At each race start the HUD panels slide in from their own edge (`is-entering`, slide 200 ms, snap, 40 ms stagger): the top corners slide down and the touch controls slide up. The touch wake pop and shadow retraction already exist and stay as they are. With prefers-reduced-motion, every one of these moves is cut and only the press sink remains.

## Acceptance criteria

- **AC1**: When a race UI syncs a RaceView where the player's position changes (e.g. 3 → 2, and 2 → 3), the HUD panel labelled Pos gains the class is-bump and its position digit gains is-roll in the same sync. A sync where the position is unchanged adds neither, and the first sync after a race reset adds neither.
- **AC2**: When the player's lap number goes up (lap 1 → 2 → 3), the HUD panel labelled Lap gains the class is-stamp in that sync. Syncs on the same lap and the first sync after a reset don't add it.
- **AC3**: is-bump, is-roll and is-stamp are removed once ceil(160 × 60 / 1000) = 10 race ticks have passed since the event, so a later position change or lap re-adds them. A race reset clears them at once.
- **AC4**: Each race reset (start, RETRY, RESTART RACE) puts is-entering on the HUD layer and the touch-controls layer. Resuming from pause does not add it.
- **AC5**: In Chromium with no reduced-motion preference, a stage in each event state computes these: the Pos panel's animation is 160 ms with the stamp easing; its digit's is 120 ms with the snap easing; the Lap panel's is 160 ms with the stamp easing; and the entering HUD panels' are 200 ms with the snap easing, each next panel delayed 40 ms more.
- **AC6**: In Chromium with reduced motion set to reduce, the Pos panel, its digit, the Lap panel and the entering HUD panels and touch controls compute no animation (animation-name none), while a pressed touch control is still sunk (non-identity transform).

## What you'll see

At race start, the top-corner HUD panels slide down into place and the touch controls slide up from the bottom, one after another. During the race, the position box gives a small bump and its number rolls up whenever you pass a car or get passed, and the lap box stamps down when a new lap starts.

## How to play-test

1. Open the preview on your phone in landscape and tap RACE.
2. As the countdown begins, watch the top-left and top-right panels slide down and the steering, gas and brake controls slide up.
3. Overtake a car or let one pass you, and watch the position box bump with its number rolling up.
4. Cross the start line to finish lap 1, and check the lap box stamps down as it shows 2/3.
5. Tap a control after the controls have gone hollow, and check that it still pops back as before.
6. Optional: turn on Reduce Motion in your phone's accessibility settings, start a race, and check that nothing slides, bumps or stamps, while pressed controls still sink.

## Expected files

- `src/ui/hud.ts`
- `src/ui/hud.css`
- `src/ui/race-ui.ts`
- `src/ui/touch-controls.ts`
- `src/ui/touch-controls.css`
- `src/ui/stages/hud-motion.stage.ts`
- `src/ui/stages/stage.ts`
- `tests/ui/hud-motion.test.ts`
- `tests/ui/hud-motion-browser.test.ts`
