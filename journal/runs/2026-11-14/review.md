## Review

Reviewers: R1 ok, R2 ok, R3 ok, R4 ok, R5 ok.
12 findings, 8 verified, 4 dropped; 7 fixes kept after the gates.

### R1-1 · major · verified

`src/ui/race-ui.ts`:106: A race reset doesn't replay the entry if it happens before GO. If the owner pauses during the countdown and taps RESTART RACE, `reset()` calls `enter(true)` while `entering` is still true. The early return means `is-entering` is never removed and re-added, so the CSS animations don't restart and the panels and controls don't slide in for the new race. The spec says 'A race reset slides HUD panels and touch slots in'.

Verifier (test): A reset during the countdown never touches the entry classes, so the restarted race gets no slide-in. That breaks the spec's 'A race reset slides HUD panels and touch slots in'.

Fix: fixed in `e3c95b479f75`. Fixed: a race reset during the countdown (pause, then RESTART RACE) now replays the slide-in entry. Before, `reset()` called `enter(true)` while the entry flag was still set, so the guards in `race-ui.ts` and `hud.ts` made it do nothing and the panels never slid in for the new race.

Changes:
- `src/ui/race-ui.ts` `enter()`: the guard now only skips repeat `enter(false)` calls (`if (!on && !entering) return`), so every `enter(true)` from `reset()` goes through to the HUD and touch layers.
- New `restartClass(el, className, on)` in `src/ui/dom.ts`: removes the class and, when `on` is true, reads `offsetWidth` to force a style flush before adding the class back, so the CSS animation starts over.
- `src/ui/hud.ts` `enter()`: drops its own `entering` guard and flag and uses `restartClass`.
- `src/ui/touch-controls.ts` `enter()`: uses `restartClass` instead of `classList.toggle`.

At GO, `enter(false)` still removes the class once, so a resume never replays the entry. Nothing changes for a first reset or a reset after GO.

New test: `tests/ui/hud-entry-restart.test.ts`, the verifier's test with one extra check that the touch layer ends with `is-entering`. With the old guard put back, it fails with "HUD entry restarted: expected 0 to be greater than 0". With the fix, it passes. `pnpm typecheck` is clean and `pnpm test` passes: 108 files, 733 tests. I didn't run the screenshot capture, because the slide-in only shows as motion and a still screenshot can't show it restarting. Tests: `tests/ui/hud-entry-restart.test.ts`. Kept: the gates pass with it.

### R2-1 · major · verified

`src/ui/touch-controls.ts`:129: Touch hit zones are cached from getBoundingClientRect(), which now includes the race-entry slide transform. A pointerdown shortly after reset() (roughly the first 0.3-0.5 s) caches mid-slide positions (GAS and BRAKE still ~50vh below their rest spot), and nothing re-measures until GO. Presses on the controls in their final place then miss for the rest of the countdown, and a finger held on GAS through GO never registers.

Verifier (test): Zones cached mid-slide stay stale until GO, so presses on the controls where they are drawn miss during the countdown.

Fix: fixed in `df7234b8bf84`. In src/ui/touch-controls.ts, createTouchControls now keeps an `entering` flag that enter(on) sets. zones() no longer caches while the flag is true: `entering ? measure() : (cache ??= measure())`. While the slots slide in, every hit test reads the slots' current position, so a touch in the first part of the countdown can't leave a mid-slide GAS/BRAKE zone cached. enter(false) at GO clears the flag and invalidates the cache as before, so caching starts again from the settled layout. Nothing else changes: no visuals, no physics, and the cache works as before outside the entry. Added tests/ui/touch-zones-entry-slide.test.ts, the verifier's test with the helpers import adjusted. It fails without the fix ('expected 520 to be 325') and passes with it. pnpm typecheck passes, and pnpm test passes 109 files, 734 tests. Tests: `tests/ui/touch-zones-entry-slide.test.ts`. Kept: the gates pass with it.

### R2-2 · minor · dropped

`src/ui/race-ui.ts`:107: enter() returns early while `entering` is already true, and `entering` is only cleared at GO. A reset() during the countdown (pause -> RESTART RACE) therefore never replays the entry: is-entering is already set, so the HUD panels and touch slots don't slide in for the restarted race. This contradicts the spec's 'A race reset slides HUD panels and touch slots in from their own edge'.

Verifier (none): duplicate of R1-1

### R3-1 · minor · dropped

`tests/ui/hud-motion.ts`:69: The new `stage()` helper copies `renderStage` from harness/screens/browser.ts (open STAGES_PAGE, then `__stages.render(n)` in page.evaluate). The only extra is setting reduced motion, which other tests already do by calling `emulateMedia` after `renderStage`. The copy also skips `__settle` and the font wait that every other stage test gets.

Verifier (none): The two helpers do different jobs (settle vs no settle, media emulated before render). This is a four-line test-plumbing overlap, and changing it could alter what the AC tests observe. That is a style preference, not a defect.

### R3-2 · minor · verified

`src/ui/hud.ts`:197: `hud.enter()` has its own `entering` flag and early return, but its only caller is race-ui's `enter()`, which already returns early on the same check (race-ui.ts:107). So the HUD's guard can never fire and its state duplicates race-ui's. `classList.toggle(cls, on)` is idempotent in any case.

Verifier (trace): Duplicated state and guard: the HUD's own entering flag does the same job as race-ui's flag, which already guards its only caller.

Fix: not-fixed. The finding no longer applies to the current code, so I changed nothing. src/ui/hud.ts has no `let entering` flag and no early-return guard any more. Its `enter(on)` is just `restartClass(element, 'is-entering', on);` (hud.ts:195-197), which is the same shape as touch-controls' `enter`. The only `entering` state left is in race-ui.ts:93, which guards the single caller, and in touch-controls.ts:99, where it is used by `zones()`, so it isn't a duplicate. The duplicated state and dead guard the reviewer describes were already removed, apparently by the earlier R1-1 restart fix that the verifier mentions. There is no duplication or dead code left to delete, so there is no change and no test.

### R4-1 · major · dropped

`src/ui/touch-controls.ts`:134: The race entry moves the touch slots with a transform. zones() measures them with getBoundingClientRect and caches the result until enter(false) at GO. A touch during the roughly 560 ms slide caches the shifted rects, so for the rest of the countdown presses on GAS, BRAKE or the steer pads miss. A thumb held on GAS through GO also gives no throttle.

Verifier (none): duplicate of R2-1

### R4-2 · minor · dropped

`src/ui/race-ui.ts`:229: Restarting from the pause screen during the countdown doesn't replay the race entry. `entering` is still true because GO never came, so the reset() for the new race does nothing to the entry. The spec says a race reset slides the HUD panels and touch slots in.

Verifier (none): duplicate of R1-1

### R4-3 · minor · verified

`src/ui/hud.css`:240: The POS bump applies the stamp easing to both halves of its keyframes. The panel overshoots on the way up and again on the way down, dipping below its rest size. UI_RULES §7 and board 05 allow one overshoot at most and use the stamp easing for landings only.

Verifier (trace): The bump overshoots twice and the second dips the panel below its rest size, which breaks the one-overshoot and landings-only stamp rule.

Fix: fixed in `94893e68d6af`. The finding is real. The Pos bump keyframes (`50% { scale(1.12) }` with implicit 0% and 100% at rest) ran the stamp easing twice. In Chromium the panel overshot to about ×1.13 on the way up and dipped below rest on the way down. The new test measured a peak of 1.12959 before the fix.

The suggested fix (a per-keyframe animation-timing-function of var(--ease-snap)) could not be used, for two reasons:
1. Chromium ignores var() in a keyframe's timing function. getKeyframes() still reported the stamp curve on every keyframe.
2. The existing tests/ui/source-rules.test.ts only allows transform, box-shadow, clip-path and visibility inside @keyframes.

Instead, in src/ui/hud.css, ui-hud-bump and ui-hud-bump-again are now landings, the same shape as the lap stamp: `from { transform: scale(var(--ui-hud-bump)); }`. The panel starts at ×1.12 and lands at rest on the stamp easing, so it overshoots only once, on the landing (UI_RULES §7). Trade-off: the panel now jumps straight to ×1.12 instead of growing into it. The element rule is unchanged (0.16s, stamp), so AC1 still holds, and only tokens are used.

New test tests/ui/hud-motion-bump-overshoot.test.ts renders the overtake stage in Chromium, pauses the Pos panel's animation and samples its scale every 2 ms. It checks that the peak is ×1.12, never more, and that the scale leaves [1, 1.12] at most once. It failed before the fix (1.1296) and passes after. pnpm typecheck is clean; pnpm test passes (112 files, 741 tests). Tests: `tests/ui/hud-motion-bump-overshoot.test.ts`. Kept: the gates pass with it.

### R5-1 · major · verified

`src/ui/race-ui.ts`:201: Nothing checks that the bump, roll and stamp classes stay on for the whole move. Every 'animating' stage syncs on the event tick itself (since = 0), and every 'done' stage syncs at since = 10. So shrinking EVENT_TICKS still passes, even though in the game the class would come off on the next frame and cut the 160 ms bump after one tick.

Verifier (trace): Nothing tests that the motion classes stay on for the whole move. A shortened window survives every test, while the game syncs every frame.

Fix: fixed in `009037d312d9`. The finding was real: every existing HUD-motion stage synced either on the event tick (since = 0) or at since = 10, so if EVENT_TICKS were shortened to 1, every test would still pass. In the game, though, the bump, roll and stamp would then come off on the next frame. Product code is unchanged; the fix pins the 10-tick window with tests.

Changes:
- In src/ui/stages/hud-motion.stage.ts I added an `everyTick(from, to, racers)` helper that syncs once per tick, like the game does. I also added two stages: 'overtake-late' (the overtake, then syncs at 1202–1210, so since = 9) and 'new-lap-late' (the new lap, then syncs at 2423–2431). I updated the header comment to match.
- The new test file tests/ui/hud-motion-window.test.ts checks in Chromium that the Pos panel and its digit (overtake-late) and the Lap panel (new-lap-late) still compute a non-none animation at since = 9. Together with the existing AC4 check at since = 10, the window is pinned to exactly 10 ticks.

Red/green: I temporarily set `const EVENT_TICKS = 1;` and both new tests failed, then restored the original line and both passed. Before this change the tests would also fail because the stages didn't exist. pnpm typecheck is clean and pnpm test passes all 738 tests in 110 files. Tests: `tests/ui/hud-motion-window.test.ts`. Kept: the gates pass with it.

### R5-2 · major · verified

`src/ui/race-ui.ts`:140: No test covers resetting `synced` in reset(). Every stage builds a fresh createRaceUi, where `synced` already starts false. game.ts, though, creates one race UI and calls ui.reset() for every race. Deleting the reset makes the second race's first sync count as an overtake and a new lap, so Pos bumps and Lap stamps during the countdown, and all tests still pass.

Verifier (trace): Resetting the baseline across races, the path the real game uses, has no test. Deleting it survives every test.

Fix: fixed in `ef4b8e914eb4`. The finding is real, and it is a gap in the tests, not a bug: race-ui.ts already has `synced = false;` in reset(), but no test failed if that line was deleted. I left game code alone and added the missing coverage. In src/ui/stages/hud-motion.stage.ts I added a stage, 'second-race'. It uses one race UI the way game.ts does. Race 1 runs the overtake to P2 and then a new lap to 2/3. Then the stage calls ui.reset() on the same UI, and race 2's first sync is already racing at P4 on lap 2/3 (raceTick 600, so the entry slide has ended at GO). The new test, tests/ui/hud-motion-second-race.test.ts, renders that stage in Chromium at 844×390. It checks that Pos reads 4 and Lap reads 2/3, and that the Pos panel, its digit and the Lap panel all compute animation-name none. Red/green: with `synced = false;` removed from reset(), the test fails (ui-hud-bump, ui-hud-roll and ui-hud-stamp all play). With the line restored, it passes. pnpm typecheck is clean, and pnpm test passes all 111 files and 740 tests. Tests: `tests/ui/hud-motion-second-race.test.ts`. Kept: the gates pass with it.

### R5-3 · minor · verified

`src/ui/hud.ts`:140: No test covers restarting the move when a second event lands inside the window (the `is-again` copy-keyframes path the plan audit asked for). Removing it leaves every test passing, but a quick second overtake would no longer re-bump.

Verifier (trace): The restart path the plan audit asked for has no test, and removing it leaves every test passing.

Fix: fixed in `04f12f0db49c`. Test-strength gap; no game behaviour changed. I added the stage 'overtake-twice' to src/ui/stages/hud-motion.stage.ts. It runs race(root, ...OVERTAKE, racing(1205, field(1))), so P3→P2 at tick 1201 is followed by P2→P1 at tick 1205, inside the first move's 10-tick window. I also updated the file's header comment to list it. The new test tests/ui/hud-motion-restart.test.ts renders 'overtake' and 'overtake-twice' in Chromium at 844×390. It checks that the second stage reads Pos 1, and that the Pos panel (0.16s stamp) and its digit (0.12s snap) still animate. It also checks that both run a different animation-name than after the first overtake, which proves the bump and roll restart. Red/green: with the mutation from the finding (deleting the is-again toggle at hud.ts:52), the test fails with "expected 'ui-hud-bump' not to be 'ui-hud-bump'". With hud.ts restored, it passes. pnpm typecheck is clean and pnpm test passes (113 files, 743 tests). Tests: `tests/ui/hud-motion-restart.test.ts`. Kept: the gates pass with it.

### R5-4 · minor · verified

`src/ui/hud.css`:104: Nothing tests the slide direction (top panels down from above, touch slots up from below; spec summary 'from their own edge', audit note on board 05 #9). Flipping either translate sign passes every test.

Verifier (trace): The slide direction the plan audit called out (top panels down, controls up) has no test, so reversing it passes every test.

Fix: fixed in `febdc8b39062`. This was a gap in the tests, not a bug in the game, so I added a test and left `src/` unchanged. The new file is `tests/ui/hud-motion-entry-direction.test.ts`. It renders the hud-motion 'entry' stage in Chromium at 844×390 and goes through each element that slides in at race start (Pos, Lap, Track map, Time, Pause, then Steer left, Steer right, Brake or reverse, Accelerate). For each one it takes the element or its nearest animated wrapper and reads the first keyframe of its animation through `getAnimations()` and `getKeyframes()`. It applies that keyframe's transform to a separate test element and reads back the vertical offset in pixels. The five HUD panels must start above their place (offset below 0) and the four touch controls below theirs (offset above 0), as board 05 #9 asks.

Red then green: with the HUD keyframe flipped to `translateY(50vh)` in `src/ui/hud.css`, the test fails ("Pos: expected 195 to be less than 0"). With the touch keyframe flipped to `translateY(-50vh)` in `src/ui/touch-controls.css`, it fails ("Steer left: expected -195 to be greater than 0"). On the real code it passes. Both mutations were undone by hand because git isn't available in the sandbox, and grep confirms the two lines are back to the original values. `pnpm typecheck` passes and `pnpm test` passes (114 files, 744 tests). I couldn't run eslint on the new file because there is no `eslint` command in the sandbox. Tests: `tests/ui/hud-motion-entry-direction.test.ts`. Kept: the gates pass with it.
