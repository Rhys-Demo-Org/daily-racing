# Review: B01 · Pause screen (PR #9)

This is the independent post-build audit of the overnight build (attempt 1). The owner had already play-tested it and found that it plays well.

## Spec audit

| AC | Implemented | AC test proves it |
|---|---|---|
| AC1 Pause button in `.ui-hud__tr`, toggles overlay | yes | yes. It drives the real game and fails on main. |
| AC2 hatch, "Paused", "LAP x/3 · m:ss.cc", 0:00.00 in countdown, stripe | yes | yes. It checks the header against the HUD's own TIME text. |
| AC3 three buttons in order, classes, Resume focused | yes | yes |
| AC4 Esc pauses, frames change nothing (countdown too), Esc again resumes, no-op on menu | yes | yes |
| AC5 resume restores the exact state, first frame steps ≤ 1 tick | yes | yes. Both resume paths are covered. |
| AC6 resume wakes resting touch controls | yes | yes. It checks the UI unit and the running game. |
| AC7 Restart: same track, fresh countdown, overlay hidden | yes | yes |
| AC8 Quit: menu, start screen shown, race layer and overlay hidden | yes | yes |

The scope lines are all met. Determinism holds: pausing never touches the sim or the driver's `step()`/`play()`, and G3 replays are unchanged. Layering is correct: the UI only receives `HudState`/`RaceView`, and there are no env sniffing, colour, font or px literals, and no materials.

## Findings and fixes

| # | Sev | Where | Finding | Done |
|---|---|---|---|---|
| 1 | med | `src/ui/hud.ts:76` | PAUSE sat **left** of TIME. Mockup S1–S2 and UI_RULES §5 put it in the outer corner, right of TIME/BEST. | Moved it after the TIME/BEST column. Test added. |
| 2 | med | `src/game.ts` (touchZones) | Touch controls stayed hit-testable under the pause overlay, so a tap on the hatch over GAS/steer pressed that control. The press showed under the hatch and could still be held when the race resumed. | Zones are empty while paused. Test added. |
| 3 | low | `src/game.ts` (frame/startLoop) | While paused, the rAF loop kept running every frame doing nothing, which costs battery on mobile. The driver's `resume()` could also restart the loop while paused. | Pause now calls `stopLoop()` and resume calls `startLoop()`. `startLoop` already resets `lastFrame`/`accumulator`, so the hand-rolled reset was removed, and `startLoop` refuses to start while paused. Test added. |
| 4 | low | `src/game.ts` (resize) | Resizing clears the WebGL canvas, and with nothing drawing while paused the scene went blank behind the hatch. | The resize handler re-renders when paused. Test added. |
| 5 | low | `src/game.ts` (keydown) | Esc was a second, ad-hoc `window` keydown listener in `game.ts`, outside `src/input` and never removed. | Moved into `src/input/keyboard.ts` (`PAUSE_KEY`, `onPause` option, ignores repeat and modifiers, removed by `destroy()`). `game.ts` passes `onPause` to `createInput`. Test added. |
| 6 | low | `src/ui/pause-screen.ts:7` | The pause screen imported `hatch()` from `finish-panel.ts`, a sibling screen. | Moved `hatch()` into `src/ui/dom.ts` next to `overlay()`. Both screens import it from there. |
| 7 | nit | `src/ui/race-ui.ts:37` | `createHud(root, { onPause: () => opts.onPause?.() })` wrapped the callback for no reason. | Changed to `createHud(root, opts)`. |
| 8 | nit | `src/ui/screens.css` | The stripe band repeated `width: auto` three times and had a redundant `border-right: 0`. | Collapsed to one rule plus `flex: 4` / `flex: 2`. |
| 9 | nit | `src/game.ts` `setPaused` | The guard included `!race`, which is unreachable once `mode === 'race'`, and the doc comment was vague. | Simplified the guard and documented the loop behaviour. |

New tests are in `tests/game/pause-review.test.ts`, 5 tests. All 5 fail on the unreviewed PR code and pass now. The existing AC tests are untouched and still pass.

## Not fixed (owner to decide)

- **HUD visibility under the pause card.** Mockup S4 shows no HUD or touch controls under the hatch. The build leaves them drawn under it, and the hatch lets them show through. UI_RULES doesn't say, so this is left as built.
- **Focus ring on Resume.** S4 draws the mustard focus ring on RESUME. It shows when pausing with Esc, but browsers hide `:focus-visible` after a mouse or touch click on the HUD button. Forcing it would need a non-`:focus-visible` rule, which UI_RULES doesn't cover.
- **Auto-pause when the tab is hidden.** This is not in the spec. Returning to a backgrounded tab still catches up up to 5 ticks, as it does on main.
- **Resume button size.** Resume uses `ui-button--primary`, as AC3 requires, so it renders at title size (32px) while the other two use button size (22px). In S4 the three look closer in size.
- **G11 size budget.** The PR now touches 12 src files plus 2 test files, which is over the builder's 12-file budget. G11 isn't in the thin gate suite, and the budget binds the nightly builder, not this review.

## LOC (src/, vs main)

- Before review: 9 files, +230 / −17.
- After review: 12 files, +268 / −41. The net growth is +14 lines: about 8 for the input move, 8 for the resize, zones and loop fixes, and −2 for the cleanups. The 17-line `hatch()` move is a relocation, not new code.
- Tests: `tests/game/pause.test.ts` is unchanged at 232 lines. `tests/game/pause-review.test.ts` is new, at 129 lines.

## Gates

On the original PR head (`7b0a1ea`) and on the review commit alone, G1, G2 and G3 pass but G8 fails. The branch was cut from `f830338`, before PR #8 (live-mode harness) merged, so main's newer protected files all show as "differs from main's manifest". After merging `origin/main` into the branch, all four gates pass: G1 396/396 tests, G2 dust-bowl 42.53 s (+0.0%), G3 5/5 replays, G8 pass.
