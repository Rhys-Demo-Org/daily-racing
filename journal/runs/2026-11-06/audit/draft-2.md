# B07 · Best-lap persistence and new-best chip

Date: 2026-11-06 · mode: backlog · backlog: B07

## Summary

Each track's best lap (ms) is saved in localStorage under `racer.bestLap.<trackId>`, built by one exported function in src/ui/best-laps.ts that B08/B11 will reuse. All storage access is in try/catch. The HUD BEST chip shows the lower of stored and this race's laps, or "–:––.––". A new best shows a mustard "NEW BEST" chip styled like the BEST chip (no top outline, square top corners), tucked under it. It slides down via transform (slide 200 ms, snap), holds 2 s, slides back, and just cuts under reduced motion. TIME never moves. The results chip reads "NEW BEST LAP". A race UI with no track id saves nothing. hud.ts only gains one element in the timer stack and one show/hide method, so B05's desktop scaling covers the chip.

## Acceptance criteria

- **AC1**: With localStorage holding the exported best-lap key for 'dust-bowl' = "41020", starting a Dust Bowl race (render stubbed, happy-dom) shows "0:41.02" in the HUD BEST chip before any lap is completed (main shows "–:––.––").
- **AC2**: With no stored best, or a stored best slower than the player's lap, finishing that lap stores its time in ms (ticks × 1000 / 60) under the exported key for that track, the HUD BEST chip shows it as m:ss.cc, and the next race on that track starts with it in the chip. Other tracks' stored values are unchanged.
- **AC3**: With a stored best faster than any lap the player drives (e.g. "1000" for dust-bowl), after the player finishes laps the stored value is still "1000", the HUD BEST chip reads "0:01.00", and no visible HUD element with text "NEW BEST" has appeared.
- **AC4**: A lap setting a new best makes a HUD element with text "NEW BEST" (case-insensitive) visible. It is not visible before that lap or after a non-best lap. With slide = tokens motion durationMs.slide, it is still visible at lapEnd + ceil((slide+2000)×60/1000) − 1 ticks. It is hidden by lapEnd + ceil((2×slide+2000)×60/1000) ticks and when a new race starts. The test computes these values from tokens.
- **AC5**: On the results screen, the mustard best-lap chip reads "NEW BEST LAP" (case-insensitive) when a lap in this race set a new stored best. Otherwise it reads "BEST LAP" without "NEW". Either way it shows this race's best lap time.
- **AC6**: With localStorage getItem/setItem throwing, and separately with reading window.localStorage itself throwing, a race can be started and driven to the finish with no error thrown. The HUD BEST chip shows this race's best lap and the results screen opens.
- **AC7**: A stored value under the exported key that isn't a positive finite number ("abc", "-5", "0") counts as no best. The HUD BEST chip reads "–:––.––" at start, and the first finished lap is saved and makes the "NEW BEST" chip visible.
- **AC8**: The screen stage registry contains a stage rendering the race HUD with the "NEW BEST" chip visible, and a stage rendering the results screen with a "NEW BEST LAP" chip. Both render without error in happy-dom.

## What you'll see

The yellow BEST chip under the race timer now remembers your best lap on each track, even after you reload the page. When you beat it, a yellow NEW BEST tab slides down from under the BEST chip for about two seconds, then slides back. The results screen's chip then says NEW BEST LAP.

## How to play-test

1. Open the preview on your phone and tap RACE.
2. Before your first lap, the BEST chip under the timer shows dashes.
3. Finish your first lap. A yellow NEW BEST tab should slide out under the BEST chip, which now shows that lap time. After about two seconds the tab slides back. The timer itself shouldn't move.
4. Drive a slower lap on purpose. The BEST chip shouldn't change and no NEW BEST tab should appear.
5. Finish the race. If you set a best during it, the results chip should say NEW BEST LAP.
6. Reload the page and race the same track again. The BEST chip should show your saved best before you finish a lap.
7. Try a private or incognito tab too. The game should still play normally.

## Expected files

- `src/ui/best-laps.ts`
- `src/game.ts`
- `src/ui/race-ui.ts`
- `src/ui/hud.ts`
- `src/ui/hud.css`
- `src/ui/types.ts`
- `src/ui/results-screen.ts`
- `src/ui/results.css`
- `src/ui/stages/stage.ts`
- `src/ui/stages/new-best.stage.ts`
- `tests/game/best-lap-persistence.test.ts`
- `tests/game/best-lap-storage-blocked.test.ts`
- `tests/ui/new-best-chip.test.ts`
- `tests/ui/new-best-stage.test.ts`
