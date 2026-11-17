# B13 · Rivals use pickups

Date: 2026-11-17 · mode: backlog · backlog: B13

## Summary

On Dust Bowl each car has its own armed flag and boost under the player's rules. A box is taken by the lower index on ties and respawns after 300 ticks. Firing boosts only that car for 90 ticks. stepCars with three arguments still means no car boosted. AI bots (car 1+) fire from world state only: armed, on dirt, grounded, and no tight turn or ramp within ~48 units plus braking distance from 32. While boosting they brake for corners as today. Unarmed bots may nudge toward a nearby box, but never in corners or ramp approaches. createBot(world, 0) is unchanged. Fix stale comments in types.ts, pickups.ts and world.ts. These existing tests must still pass: dust-bowl-tight, bot, positions, pickups, boost, pickup-replay, pause-action-latch.

## Acceptance criteria

- **AC1**: In a six-car Dust Bowl race with every car i driven by createBot(world, i) and a fixed seed, at least one AI car (index ≥ 1) turns its racer view's `armed` from false to true. On that same tick, a box within 2.5 units of that car turns from present to absent in RaceView.pickups.
- **AC2**: In that race, at least one AI car's racer view shows boostTicks 90 on the tick its input carried `action: true` while armed. Its `armed` turns false and boostTicks counts down by 1 per tick to 0. During every AI boost that car's speed exceeds 25 on some tick and never exceeds 32. createBot(world, 0)'s inputs never carry `action: true`, and car 0's boostTicks stays 0.
- **AC3**: On Dust Bowl, the test drives car 1 itself and adds `action: true` on one tick while car 1's racer view shows armed. On that tick car 1 shows armed false and boostTicks 90. Car 0's armed and boostTicks match the same race without car 1's action on every tick.
- **AC4**: In a six-car Dust Bowl race, find a box taken by an AI car: an AI car turned armed within 2.5 units of it. That box stays absent for exactly 300 ticks, then is present again. Car 0 is held unarmed and its test inputs steer it to pass within 2.5 units of that box while it is still absent. Car 0 stays unarmed and the box stays absent on those ticks.
- **AC5**: In a six-car Dust Bowl bot race, at least once an armed AI car is within 2.5 units of a present box while no unarmed car is within 2.5 units of it. On every such tick the box is still present on the next tick and that AI car is still armed.
- **AC6**: Record a six-car Dust Bowl race with createReplay: all six cars' inputs, including at least one AI input carrying `action: true` that produced a boost. runReplay reproduces the live run's final car views exactly. Running the same seed with the same player inputs twice gives identical RaceViews on every tick.
- **AC7**: In six-car Dust Bowl races driven entirely by bots on seeds 1–5, all six cars finish 3 laps within 16200 race ticks. Every race has at least one AI boost, and every AI car that became armed before starting its last lap fired a boost before finishing.
- **AC8**: On Bramble Bends and Hay Loop, the AI bots' inputs in six-car races never carry `action: true` and racer views have no `armed` or `boostTicks` keys. On Dust Bowl, the same bots' inputs carry `action: true` at least once.

## What you'll see

On Dust Bowl the rival cars now drive through the mustard boxes too. A box vanishes when a rival takes it, and that rival later surges ahead on a straight for about a second and a half. A box a rival grabbed is missing when you get there until it reappears about five seconds later. Bramble Bends and Hay Loop race exactly as before.

## How to play-test

1. Open the preview on your phone, pick Dust Bowl on the track select screen and tap RACE.
2. After GO, hang back behind the pack and watch the first row of mustard boxes: some vanish as rivals drive through them.
3. Watch the rivals on the long straights: one that took a box suddenly pulls away from the others, then slows down safely before the next corner.
4. Drive through the spot where a rival just took a box. It stays gone and your Boost button stays unlit, unless you also crossed another box that was still there.
5. Finish the race and check that all six cars finish and the results screen shows as usual.
6. Race Bramble Bends once and check that it plays as before, with no boxes and no rivals surging.

## Expected files

- `src/sim/pickups.ts`
- `src/sim/world.ts`
- `src/sim/bot.ts`
- `src/sim/car.ts`
- `src/sim/types.ts`
- `tests/sim/rival-pickups.test.ts`
- `tests/sim/rival-boost.test.ts`
- `tests/sim/rival-pickup-block.test.ts`
- `tests/sim/rival-pickup-replay.test.ts`
- `tests/sim/rival-pickups-finish.test.ts`
