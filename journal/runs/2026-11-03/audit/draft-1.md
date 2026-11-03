# B04 · Six-car grid

Date: 2026-11-03 · mode: backlog · backlog: B04

## Summary

Races started by the player (RACE on the start screen, then RETRY, RESTART RACE and NEXT RACE) have six cars: YOU plus the five roster AI drivers, in roster order, each driven by its own seeded bot. They start in the existing staggered two-column grid behind the start line, so the sim, its grid code and existing replays stay as they are. `startRace` gets an optional car count (1–6). Leaving it out still gives the old two-car race, because existing append-only game tests and the protected driver depend on that. The game's cached scene has to be rebuilt whenever the driver list changes, not only when the track changes. POS then reads x/6, and the minimap shows six dots in body colours with the player's rally-red dot drawn last.

## Acceptance criteria

- **AC1**: Pressing RACE on the start screen starts a race whose game state has 6 cars and 6 racers. On every registered track and seeds 1–20, a six-car race's grid has every car on dirt, every pair of cars at least 4 units apart, and every car behind the start line along the start heading. Each car is further back than the one before it.
- **AC2**: In a six-car race the HUD POS readout shows a denominator of 6 (e.g. "1/6" before GO).
- **AC3**: In a six-car race the minimap has exactly 6 car dots: one each in rally-red, mustard, navy, teal, cream and grass. The rally-red player dot is the last dot drawn and has a larger radius than the other five.
- **AC4**: In a six-car race where the player holds no input, each of cars 1–5 has moved more than 20 units from its grid slot 5 seconds after GO, so all five AI cars are driving.
- **AC5**: On every registered track, play a six-car race with the player's inputs taken from a bot driving car 0 of a six-car twin world on the same seed, then keep stepping. All 6 racers get a finish tick within 5 minutes of sim time. The results table has 6 rows naming YOU · #1, KOSKI · #7, BRUNO · #23, DEL RIO · #4, MAGS · #9 and OTTO · #12 in sim position order.
- **AC6**: In the AC5 races the five AI cars' finish ticks are pairwise distinct (seeded line and pace spread them out). Running the same track and seed again reproduces exactly the same finish ticks.
- **AC7**: From a six-car race, RETRY on the results screen, RESTART RACE on the pause screen and NEXT RACE each start a new race with 6 cars and a POS denominator of 6.

## What you'll see

Races now start with six cars instead of two: your red car at the front of a staggered grid, with yellow, navy, teal, cream and green cars lined up behind. The position readout says out of 6, and the small map in the corner shows six coloured dots, with your red dot on top.

## How to play-test

1. Open the preview on your phone and tap RACE.
2. Before GO, check there are five cars lined up behind you in two staggered columns, none overlapping.
3. Look at the top-left: the position should read something like 1/6, and the minimap should show six dots in six different colours, with your red dot on top.
4. Drive a lap: the other cars should spread out rather than run in one tight line.
5. Finish the race and check the results table lists six drivers: YOU, KOSKI, BRUNO, DEL RIO, MAGS and OTTO.
6. Tap RETRY, then NEXT RACE, and check both new races also start with six cars.

## Expected files

- `src/game.ts`
- `src/content/drivers.ts`
- `src/start-screen.ts`
- `tests/game/six-car-grid.test.ts`
- `tests/game/six-car-race.test.ts`
