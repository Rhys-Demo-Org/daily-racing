# B13 · Rivals use pickups

Date: 2026-11-17 · mode: backlog · backlog: B13

## Summary

On Dust Bowl every car follows the player's pickup rules, with its own armed flag and boost. A car driving through a present box while unarmed takes it for everyone (300-tick respawn; ties go to the lower car index). Firing `action` while armed boosts that car alone for 90 ticks. Each racer view carries its own `armed` and `boostTicks`. AI bots (car 1 and up) fire from world state only: armed, on dirt, on the ground, no ramp approach or tight corner ahead. While boosting they keep the throttle on. Unarmed bots may drift slightly toward a box just ahead, but never in corners or ramp approaches. createBot(world, 0) never fires or drifts and drives as today. Tracks without pickups are unchanged, and there are no new visuals.

## Acceptance criteria

- **AC1**: In a six-car Dust Bowl race (any fixed seed, 1–5 driven by createBot, car 0 by createBot(world,0)), within one full race at least one AI car (index ≥1) shows `armed: true` in its racer view, on the same tick a box it is within 2.5 units of turns from present to absent in RaceView.pickups.
- **AC2**: In that race, at least one AI car's racer view shows boostTicks 90 then counts down by 1 per tick to 0. During each AI boost that car's speed exceeds 25 on some tick and never exceeds 32. Car 0's boostTicks stays 0 and none of createBot(world,0)'s inputs ever carry action: true.
- **AC3**: On Dust Bowl, a test-driven car 1 whose input carries action: true while its racer view is armed gets armed: false and boostTicks 90 on that tick. Car 0's armed and boostTicks are unaffected. On Bramble Bends and Hay Loop, giving AI cars action: true every tick leaves car and race views identical to the same race without it.
- **AC4**: Across a six-car Dust Bowl bot race, any car that turns from unarmed to armed was within 2.5 units of a box that was present the tick before and is absent now. A box taken by any car (including an AI) stays absent for exactly 300 ticks, and no car becomes armed from it in that time.
- **AC5**: In a six-car Dust Bowl bot race, an armed AI car within 2.5 units of a present box leaves it present on the next tick and stays armed (no stacking), and this case occurs at least once.
- **AC6**: A six-car Dust Bowl race recorded with createReplay (all six cars' inputs, with at least one AI boost fired) reproduces the live run's final car views exactly through runReplay. Running the same seed and player inputs twice gives identical race views on every tick.
- **AC7**: In a six-car Dust Bowl race driven entirely by bots with AI pickups active, all six cars finish all 3 laps within 3 × 60 × 90 race ticks, and every AI car fired at least once or never got armed.

## What you'll see

On Dust Bowl the rival cars now drive through the mustard boxes too: a box vanishes when a rival takes it, and that rival shoots ahead on a later straight. A box a rival grabbed is missing when you get there until it reappears about five seconds later. Bramble Bends and Hay Loop race exactly as before.

## How to play-test

1. Open the preview on your phone and pick Dust Bowl on the track select screen, then tap RACE.
2. Hang back behind the pack after GO and watch the first row of three mustard boxes just after the start line: some vanish as rivals drive through them.
3. Keep watching the rivals on the long straights: one that took a box suddenly pulls away for about a second and a half.
4. Drive toward a row where a rival just took a box: that box stays gone when you reach it, and your Boost button stays unlit if it was the only one you crossed.
5. Finish the race and check that all six cars finish and the results screen shows as usual.
6. Race Bramble Bends once and check that it plays as before, with no boxes and no boosting rivals.

## Expected files

- `src/sim/pickups.ts`
- `src/sim/world.ts`
- `src/sim/bot.ts`
- `src/sim/car.ts`
- `src/sim/types.ts`
- `tests/sim/rival-pickups.test.ts`
- `tests/sim/rival-boost.test.ts`
- `tests/sim/rival-pickup-replay.test.ts`
