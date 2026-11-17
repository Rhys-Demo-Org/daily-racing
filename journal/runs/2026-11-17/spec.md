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

## Plan audit

Verdict: **approve** (round 2)

The draft covers B13's scope and done_when with no scope drift, no new visuals, no overlap with open PRs and no retired modules. Its criteria are observable through RaceView, carViews, createBot and runReplay. createBot is the exported sim API the backlog item itself names, so the harness lint is advisory only. The remaining issues are minor builder notes: fragile wording in AC3 and AC4, a longer list of Dust Bowl tests to keep green, and bot speed targets while boosting.

- minor · testability: AC3 says car 0's armed and boostTicks match the race without car 1's action on every tick. Once car 1 has fired it is unarmed, so it can take a later box that car 0 would have taken (in the run without the action, car 1 stays armed and leaves boxes). A boosted car 1 can also bump car 0. Either way the comparison can fail for reasons unrelated to 'firing boosts only that car'. Fix: Compare car 0 over the 90-tick boost window only. Alternatively, choose a seed or scenario where car 0 is clear of car 1 and of any box during the window. Keep the core assertion: on the fire tick, car 1 shows boostTicks 90 and armed false, and car 0's boostTicks stays 0.
- minor · testability: In AC4, 'Car 0 is held unarmed' is vague: on its way to the target box, car 0 could drive through another present box and become armed, which would make the check meaningless. Fix: Before the check, assert that car 0 is unarmed on every tick it is within 2.5 units of the absent box. Steer car 0 so it reaches that box without passing within 2.5 units of any present box, or pick a seed where its path avoids them.
- minor · other: The draft's list of existing tests that must still pass leaves out several that run multi-car Dust Bowl races, where bots now take boxes: sim tests bot (two-bot laps must stay above 0.9 × length/25), replay, race and determinism; push-out and car-contact (both call stepCars with three arguments); and game tests results-drivers, pause-results, best-lap-*, new-best-chip, screen-change and six-car-race. Fix: The builder should run the full suite and treat every Dust Bowl test as a regression check. Bot changes must not push a two-bot Dust Bowl lap below 0.9 × ideal, and car 0 (pickups.test AC2 and pause-action-latch) must still be first to its first box.
- minor · other: Today a bot's target speed is capped at pace × the dirt top speed of 25, and it only presses the throttle when below target. A boosting bot would therefore never go above 25, and AC2 and AC7 could not pass. Fix: While a bot's car has boostTicks > 0, raise its target to min(corner limit, BOOST_TOP_SPEED) and keep the same braking check against the corner limit.
- minor · testability: Half of AC8 (no armed or boostTicks keys on Bramble Bends and Hay Loop) already passes on main. Only the Dust Bowl action half is new tonight. That is acceptable, because the combined test still fails on main. Fix: Keep AC8 as one test, so it fails on main through its Dust Bowl action assertion.
