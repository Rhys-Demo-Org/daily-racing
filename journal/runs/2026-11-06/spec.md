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

## Plan audit

Verdict: **approve** (round 2)

The draft covers all of B07's scope and done_when. Every visual decision is backed by UI_RULES §7 and board 05 ("New best: chip slides out from under the timer (200ms), holds 2s, slides back. The timer itself never animates"), the existing BEST chip style, and the S5 "NEW BEST LAP" chip. The criteria are observable through localStorage, the HUD/results DOM and the stage registry, and the overlap with open PRs is a small textual one, not a behavioural one. Only minor notes are left for the builder.

- minor · testability: AC1, AC2 and AC7 refer to 'the exported best-lap key', which pushes the tests to import a helper from src/ui/best-laps.ts. Tests are append-only, so that would pin an internal module path and export name. The storage key itself (`racer.bestLap.<trackId>`) is the real public contract: it holds players' saved bests, and B08/B11 read it. Fix: In the tests, write the literal key string `racer.bestLap.dust-bowl` (and other tracks) directly into localStorage instead of importing a key-builder function. Keep the helper in src/ui/best-laps.ts for game code only.
- minor · testability: Existing tests/ui/race-ui.test.ts asserts that a frame which changes nothing makes no DOM mutation. The new chip's tick-based show/hide must keep that true. Fix: Cache the chip's visible state, as the HUD's field() helper does for text, and only write the DOM when it flips. Update the hidden/visibility state from raceTick in sync(), never every frame.
- minor · design: The NEW BEST chip is a new HUD widget in the top-right timer stack. It has to follow the same token-based outline and type rules as the BEST chip so that B05's desktop layout (#24, open) styles it the same way. The draft's statement that 'B05's desktop scaling covers the chip' can't be checked tonight. Fix: Build the chip from the existing `.ui-panel.ui-panel--mustard` component and the same CSS variables (outline, label size, radius) as `.ui-hud-best`, with no new size literals. Use only transform (slide token, snap easing) plus visibility, and cut under prefers-reduced-motion. Don't depend on anything in B05.
- minor · visible: Play-test steps 2–3 assume nothing is stored yet (dashes before the first lap, NEW BEST on the first lap). On a second session the owner will see a stored best instead. Fix: Word step 2 as 'the first time you race a track, the BEST chip shows dashes', and note that a first lap only triggers NEW BEST when it beats the stored time.

Overlap with open PRs: #23 (game.ts): it changes draw() and the driver-step loop to add camera framing. B07 only adds a trackId field to the existing `ui.reset(..., { trackName, carNumbers, driverNames })` info object (game.ts ~line 253). Different lines, unrelated behaviour. #25 (game.ts): gamepad polling in the input path, which B07 doesn't touch. Again different lines and behaviour. #24 (hud.ts/hud.css): B05 adds desktop scaling and layout switching. B07 adds one child to `.ui-hud__timer`, one show/hide method and a CSS block for the chip. Whichever merges second gets a small textual rebase but no behaviour change. B07 doesn't need B05: on main the chip is phone-sized like the rest of the HUD. Safe to build now.
