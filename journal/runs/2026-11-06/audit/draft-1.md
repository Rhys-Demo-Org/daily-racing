# B07 · Best-lap persistence and new-best chip

Date: 2026-11-06 · mode: backlog · backlog: B07

## Summary

Each track's best lap is saved in localStorage under `racer.bestLap.<trackId>` (ms). Every access is wrapped in try/catch, so the game works when storage throws. The game gives the stored best to the race UI at race start, and the UI saves laps that beat it. The HUD BEST chip shows the lower of the stored best and this race's laps, or dashes. A new-best lap slides a mustard "NEW BEST" chip out from under TIME (UI_RULES §7: slide 200ms, snap easing). It hides 3 s of race time later. The results chip reads "NEW BEST LAP" after a new best, otherwise "BEST LAP". A new screen stage shows both states from fixed data. A race UI without a track id saves nothing.

## Acceptance criteria

- **AC1**: localStorage holds `racer.bestLap.dust-bowl` = "41020". Starting a Dust Bowl race (render layer stubbed, happy-dom) shows "0:41.02" in the HUD BEST chip before any lap is completed. On main it shows "–:––.––".
- **AC2**: With no stored best, or a stored best slower than the player's lap, finishing that lap sets `racer.bestLap.<trackId>` to its time in ms (ticks × 1000 / 60). The HUD BEST chip shows it as m:ss.cc, and the next race on that track starts with it in the chip. Other tracks' stored values are left alone.
- **AC3**: localStorage holds a best faster than any lap the player drives (e.g. `racer.bestLap.dust-bowl` = "1000"). After the player finishes laps, the stored value is still "1000", the HUD BEST chip still reads "0:01.00" and no NEW BEST chip has appeared.
- **AC4**: A lap that sets a new best shows a HUD chip reading "NEW BEST" (case-insensitive) in the top-right stack under TIME. It isn't shown before that lap, or after a lap that doesn't beat the best. It hides 180 ticks (3 s) of race time after the lap ends, and when a new race starts.
- **AC5**: On the results screen, the mustard best-lap chip reads "NEW BEST LAP" (case-insensitive) when a lap in this race set a new stored best. Otherwise it reads "BEST LAP" without "NEW". Either way it shows this race's best lap time.
- **AC6**: With localStorage getItem and setItem throwing, and separately with reading window.localStorage itself throwing, a race can be started and driven to the finish with no error. The HUD BEST chip shows this race's best lap and the results screen opens.
- **AC7**: If the stored `racer.bestLap.<trackId>` value isn't a positive finite number (e.g. "abc", "-5", "0"), it counts as no best. The HUD BEST chip reads "–:––.––" at the start, and the first finished lap is saved and shows the NEW BEST chip.
- **AC8**: The screen stage registry has a stage showing the race HUD mid-race with the NEW BEST chip visible. It also has one showing the results screen with a "NEW BEST LAP" chip. Both render without error in happy-dom.

## What you'll see

The yellow BEST chip under the race timer now remembers your best lap on each track, even after you reload the page. When you beat it, a yellow "NEW BEST" tab slides out under the timer for about three seconds, and the results screen's chip says "NEW BEST LAP".

## How to play-test

1. Open the preview on your phone and tap RACE.
2. Before your first lap, the BEST chip under the timer shows dashes.
3. Finish your first lap. A yellow NEW BEST tab should slide out under the timer, the BEST chip should show that lap time, and after about three seconds the tab slides back.
4. Drive a slower lap on purpose: the BEST chip shouldn't change and no NEW BEST tab should appear.
5. Finish the race. If you set a best this race, the results chip should say NEW BEST LAP.
6. Reload the page and race the same track again. The BEST chip should already show your saved best before you complete a lap.
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
