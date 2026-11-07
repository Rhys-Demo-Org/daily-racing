# B10 · Track: Hay Loop

Date: 2026-11-07 · mode: backlog · backlog: B10

## Summary

Add a third registered track, `src/content/tracks/hay-loop.json` ("Hay Loop", 3 laps, width 11), as pure JSON using only the existing prop kinds. It is a long dirt ribbon shaped like the S6 thumbnail: a straight start, a wavy S-bend, and a tight teardrop hairpin loop at the far end whose legs don't cross. The back straight has one ramp. Hay bale rows line the inside of the hairpin, tyre stacks its outside, and cone trees fill the infield. The bot laps it in about 52 s. Its file name sorts after `bends` and `dust-bowl`, so Bramble Bends stays first on the menu and Hay Loop follows Dust Bowl in the NEXT RACE order. No sim, bot, render or UI code changes.

## Acceptance criteria

- **AC1**: The track registry includes a track with id "hay-loop", name "Hay Loop", 3 laps and width at least 11, which passes track validation. Bramble Bends is still first in the registry. The next track after "dust-bowl" is "hay-loop", and the next after "hay-loop" wraps back to "bends".
- **AC2**: Hay Loop's built layout is 1000–1400 units long. Somewhere on the dense centreline the heading turns at least 150° in one direction within 50 units of lap distance (the hairpin). Elsewhere, a turn of at least 40° one way is followed within 120 units by a turn of at least 40° the other way (the S-bend).
- **AC3**: Hay Loop's ribbon never overlaps itself: any two layout centreline points more than 60 units apart along the lap are at least width + 2 units apart in the world. The track has exactly one ramp, with its lip between 35% and 65% of the lap (the back straight).
- **AC4**: On Hay Loop, a single bot finishes all 3 laps for each test seed 1, 2, 3, 42 and 1234. The median of those 15 lap times is between 48 and 56 seconds. On every one of those runs the car's centre is never on grass, its footprint never touches a prop, and it is never stuck (slow for the bot's stuck threshold).
- **AC5**: Six-car bot races on Hay Loop with seeds 1–5 all finish, with every car's 3 laps done within 5 minutes of sim time and no car ever stuck.
- **AC6**: Around Hay Loop's hairpin (the 150° turn from AC2), the layout has at least 6 hay bales on the inside of the turn and at least 6 tyre stacks on the outside, each centred within 5 units of the track edge. No prop's centre is closer to the centreline than half the width + 1.
- **AC7**: At least 8 of Hay Loop's cone trees lie in the infield, inside the closed centreline loop and off the ribbon. The race scene built from Hay Loop's layout lists hay-bale, tyre-stack and cone-tree props and its one ramp in its prop cells, with per-kind counts equal to the layout's.

## What you'll see

A new third track, Hay Loop. It's a long dirt course with a wavy S-bend and a tight hairpin loop at the far end, ringed by hay bales on the inside and tyre stacks on the outside. Cone trees fill the middle and there's a jump on the back straight. A lap takes the AI cars a little under a minute.

## How to play-test

1. Open the preview on your phone and press RACE (this is Bramble Bends).
2. Finish the race, then press NEXT RACE on the results screen (this is Dust Bowl).
3. Finish that race and press NEXT RACE again: the results and track name should now say Hay Loop.
4. Drive a lap: check for the S-bend, the jump on the back straight, and the tight hairpin loop with hay bales on its inside and tyre stacks on its outside.
5. Check that cone trees fill the middle of the track, that the minimap shows the whole loop, and that all six cars finish 3 laps.

## Expected files

- `src/content/tracks/hay-loop.json`
- `tests/content/hay-loop.test.ts`
- `tests/content/hay-loop-bot.test.ts`
- `tests/render/hay-loop-scene.test.ts`

## Plan audit

Verdict: **approve** (round 1)

The draft is a JSON-only third track that matches B10's scope and the S6 thumbnail, with no feasible way for it to self-overlap. Every criterion can be tested through the exported registry, trackLayout, the bot race helpers or the race scene's prop cells, and each fails on main because the track doesn't exist yet. Adding the track breaks no existing test (Bramble Bends stays first, and the wrap and every-track bot tests still hold), no open PR touches these files, and the playtest steps are concrete.

- minor · testability: Existing every-track tests will also run on Hay Loop. In tests/sim/bot.test.ts, each 2-bot lap must fall between 0.9× and 1.5× of length/25 s for seeds 1, 2, 3, 42 and 1234. In tests/game/six-car-race.test.ts, a seed-7 six-car race must finish within 5 minutes with five distinct AI finish ticks. The draft doesn't mention them, and a slow hairpin could push 2-bot laps past 1.5× the ideal lap time. Fix: Builder: run the full suite, not just the new files. Keep the layout around 1150–1350 units so a 48–56 s median also sits inside bot.test's 0.9–1.5× ideal bounds, and make the hairpin wide enough that two bots don't stall in it.
- minor · scope: The backlog calls Hay Loop 'a second track', but bends and dust-bowl are already registered. The draft rightly treats it as the third track, after dust-bowl in file-name order. The S6 thumbnail's end loop looks as if it crosses itself, and the flat sim can't do that. The draft's teardrop hairpin with legs that don't cross is the right reading. Fix: No change needed. Builder: keep the teardrop shape and keep AC3's non-overlap check.
- minor · testability: AC4 and AC5 add 25 single-bot laps and five six-car races to the test run, on top of the every-track suites that now include Hay Loop. That adds a lot of test time. Fix: Builder: share one run per seed across AC4's checks (laps, grass, props, stuck) rather than re-simulating per assertion.

Backlog change requests for the owner:

- B10's scope says 'A second track'; it is the third registered track (after bends and dust-bowl). Reword it to 'A new track'.
