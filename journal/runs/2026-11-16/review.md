## Review

Reviewers: R1 ok, R2 ok, R3 ok, R4 ok, R5 ok.
10 findings, 7 verified, 3 dropped; 7 fixes kept after the gates.

### R2-1 · major · verified

`src/input/keyboard.ts`:52: Space is now preventDefault-ed (keydown and keyup) on window for the whole page lifetime, including the start, pause and results screens. Those screens focus a native button and rely on Space/Enter to activate it, so Space no longer activates RACE, RESUME or NEXT RACE on any track.

Verifier (test): A browser activates a focused button on Space through the keydown/keyup default action. That default is now cancelled on every screen, so Space no longer presses RACE, RESUME or NEXT RACE. On main, Space was not handled at all.

Fix: fixed in `db7e9f8d81bf`. Changed src/input/keyboard.ts onDown. A Space keydown whose target is inside a button, link or form field (new INTERACTIVE selector) is now left alone when Space isn't already held: no preventDefault and no action latch. The browser's own Space activation of the focused RACE, RESUME or NEXT RACE button works again. onUp is unchanged. It only prevents a keyup whose keydown was handled, so this ignored keydown leaves its keyup alone too. A Space held from the race into a newly shown overlay is still latched, so its keyup is still prevented and can't click NEXT RACE by accident. Space anywhere else (body/window, e.g. during a race) still calls preventDefault and fires the power-up as before, so the AC7 tests, replays and sim are unaffected. New test tests/input/space-on-button.test.ts covers two cases: (1) the verifier's game-level repro, Space keydown and keyup on the focused start-screen RACE button are not defaultPrevented; (2) createKeyboard(window) doesn't report actionPressed for Space on a button but still does, with preventDefault, for Space on body. Both failed before the fix and pass after it. pnpm typecheck is clean and pnpm test passes: 111 files, 745 tests. Tests: `tests/input/space-on-button.test.ts`. Kept: the gates pass with it.

### R2-2 · minor · verified

`src/game.ts`:171: A Space tap made while the race is paused stays latched and fires the boost on the first tick after resume. Only the pause branch of setPaused resets the input; the resume branch doesn't, and the Space listener is live while paused.

Verifier (test): A Space press made on the pause screen fires the boost right after resume. Resetting the input on resume fixes it.

Fix: fixed in `6aabd927666e`. In src/game.ts, the resume branch of setPaused now calls input.reset() before ui.resume() and startLoop(), as the pause branch already does. Before this, a Space keydown on the pause card set the keyboard's actionTapped latch. Resuming never cleared it, so the first input.read() after resume returned action: true and fired an armed player's boost. Resetting on resume clears every latch and key pressed while paused. The sim, physics and replays are unchanged. Added tests/game/pause-action-latch.test.ts, the verifier's test. It arms car 0 on Dust Bowl, then sends Esc, Space down/up and Esc, runs 3 frames and expects boostTicks 0 and armed still true. It failed before the fix (boostTicks 88) and passes after. pnpm typecheck passes, and pnpm test passes (114 files, 750 tests). Tests: `tests/game/pause-action-latch.test.ts`. Kept: the gates pass with it.

### R2-3 · minor · dropped

`src/sim/replay.ts`:98: decodeInputs defines `action` with Object.defineProperty as a non-enumerable property. Decoded frames therefore don't deep-equal the inputs that were encoded, and `action` is lost by spread, Object.keys, JSON.stringify and structuredClone. Any consumer that copies decoded frames silently drops every fired boost, and the replay diverges. This conflicts with AC6 ('encode->decode gives action: true back').

Verifier (none): No code in the repo spreads, serialises or clones decoded frames, so the claimed divergence is hypothetical. The non-enumerable property meets AC6 while keeping the existing append-only test replay.test.ts:63 passing, and the proposed API change goes beyond the spec.

### R2-4 · minor · verified

`src/ui/keycap-legend.ts`:64: setPowerUp(true) calls panel.insertBefore(powerUp, pause) unconditionally. race-ui.ts calls it on every sync, so on a pickup track the already-placed SPACE · POWER-UP item is removed and re-inserted every animation frame. This breaks the 'a frame where nothing changed touches no DOM' invariant that race-ui.ts documents and that tests/ui/race-ui.test.ts:63 enforces for non-pickup views.

Verifier (test): On pickup tracks every frame removes and re-inserts the POWER-UP node, which breaks the 'unchanged frame touches no DOM' contract that race-ui.test.ts enforces for other tracks.

Fix: fixed in `5e5a5113626a`. Fixed. In src/ui/keycap-legend.ts, setPowerUp now tracks its state in a `powerUpOn` flag and returns early when the value hasn't changed. This is the same pattern setFirstLap already uses. Before the fix, race-ui's per-frame `legend.setPowerUp(view.pickups !== undefined)` ran `panel.insertBefore(powerUp, pause)` on every sync, which removed and re-inserted the SPACE · POWER-UP item every frame on pickup tracks. Now an unchanged frame touches no DOM. Visible behaviour is the same: the item is still inserted before PAUSE when pickups appear and removed when they don't. New test tests/ui/power-up-legend-idle.test.ts: (1) the verifier's MutationObserver test. It failed before the fix with two childList records on `ui-keys__panel` and passes after. (2) A check that the legend still reads STEER, GAS, BRAKE, POWER-UP, PAUSE after repeated pickup syncs and drops POWER-UP after a reset to a view without pickups. pnpm typecheck is clean and pnpm test passes (115 files, 752 tests). Tests: `tests/ui/power-up-legend-idle.test.ts`. Kept: the gates pass with it.

### R3-1 · minor · verified

`src/ui/stages/pickups.stage.ts`:11: The pickups stage copies `raceStage`'s view building to add `pickups`. It calls `raceStage`, which builds a RaceView and syncs once. Then it calls `stageTrack()` again, rebuilds the same cars with `carOnTrack` and syncs a second view that differs only by `pickups`. `RaceStageOptions` (src/ui/stages/stage.ts:86) has no `pickups` field, so the copy was needed.

Verifier (trace): The stage re-implements raceStage's view and car building only to add `pickups`. An optional pickups option on RaceStageOptions does the same job without the copy or the double sync.

Fix: fixed in `f2f3a3ca2e43`. Added an optional `pickups?: boolean[]` to RaceStageOptions (src/ui/stages/stage.ts). raceStage spreads `...(o.pickups && { pickups: o.pickups })` into the RaceView it syncs, so views without the option are unchanged. src/ui/stages/pickups.stage.ts now makes one call, raceStage(root, { ..., at: AT, pickups: [true, false, true] }). It no longer calls stageTrack() a second time, rebuilds cars with carOnTrack, or syncs a second copied view, and the unused stageTrack/carOnTrack imports are gone. The stage now renders in one sync with no in-between state lacking the POWER-UP keycap, and its final screen is the same as before. New test tests/ui/race-stage-pickups.test.ts: on a desktop pointer, raceStage with `pickups` shows the legend STEER, GAS, BRAKE, POWER-UP, PAUSE, and without the option STEER, GAS, BRAKE, PAUSE. It failed before the fix (raceStage dropped pickups) and passes after. pnpm typecheck is clean and pnpm test passes (116 files, 753 tests). Tests: `tests/ui/race-stage-pickups.test.ts`. Kept: the gates pass with it.

### R4-1 · minor · dropped

`src/ui/keycap-legend.ts`:64: On pickup tracks, setPowerUp(true) runs panel.insertBefore(powerUp, pause) on every frame, even when the node is already in place. So every race-UI sync on Dust Bowl removes and re-inserts a DOM node. That breaks race-ui.ts's documented contract that a frame where nothing changed touches no DOM.

Verifier (none): duplicate of R2-4

### R5-1 · major · verified

`src/sim/world.ts`:152: AC2's 'AI racer views always show armed false' is never tested while the player is actually armed, so leaking the player's armed/boostTicks into every racer view survives all tests.

Verifier (trace): AC2's 'AI racer views always show armed false' is never checked in the one situation where it can fail, so leaking the player's state into AI views would pass every test.

Fix: fixed in `49c684458914`. This was a gap in the tests, not a bug in the game code: world.ts already gives only car 0 the armed/boostTicks values, but no test checked the AI racer views while the player was armed or boosting. So I changed no src code and added one new test, tests/sim/pickup-ai-views.test.ts. It runs Dust Bowl with 3 cars, all driven by their bots. Once the player has been armed for at least 30 ticks, it fires action once. On every tick it checks that racers.slice(1) all have armed === false and boostTicks === 0. It also checks that the boost was fired and that at least one tick had racers[0].armed true and one had racers[0].boostTicks > 0. Red/green: it passes on the current code. With world.ts:152 changed to `r.armed = p.armed` it fails ('tick 260: expected true to be false'). With :153 changed to `r.boostTicks = p.boostTicks` it fails ('tick 290: expected 90 to be +0'). I put world.ts back after each mutation and confirmed with diff that it is unchanged. pnpm typecheck passes and pnpm test passes (112 files, 746 tests). Tests: `tests/sim/pickup-ai-views.test.ts`. Kept: the gates pass with it.

### R5-2 · major · verified

`src/sim/track.ts`:382: The AC1 layout test accepts any point within |lateral|+1.5 of the centreline sample, so a layout that drops the lateral offset (all three boxes of a row stacked on the centreline) passes.

Verifier (trace): AC1's 'one world {x,z} per pickup' is not pinned down. Collapsed or mirrored lateral offsets would pass every test.

Fix: fixed in `0cdf9bf8e9c7`. The finding is about weak tests, not a code bug. The lateral offset in `src/sim/track.ts` is already correct: (cos h, sin h)·lateral points right of the driving direction (sin h, −cos h), the same convention as propRows' 'right' side. So I changed nothing in `src/`.

I added one new test file, `tests/sim/pickup-lateral.test.ts`, that pins the offset down using only the public sim API (`validateTrack`, `trackLayout`):
- On validated copies of Dust Bowl and Bramble Bends, it adds pickups at at=0.5 with lateral +3 and −3, plus one with lateral 0. It checks:
  - the two side boxes are 6 ± 0.05 apart;
  - their midpoint is within 1.5 of the centreline;
  - the +3 box is 3 from the midpoint, on the right of the centreline direction (taken from neighbouring centre samples, dot with (−dz, dx) > 2.9) and nearly perpendicular to it;
  - the lateral-0 box sits on the centreline.
- On Dust Bowl's own data, it checks that boxes in the same row are |Δlateral| apart (3.5 / 7).

Red/green: the mutation that drops the lateral offset (`{x: p.x, z: p.z}`) fails all 3 tests. The one that flips its sign fails the 2 side-checking tests. With the real code all 3 pass. `pnpm typecheck` is clean and `pnpm test` passes: 113 files, 749 tests. Tests: `tests/sim/pickup-lateral.test.ts`. Kept: the gates pass with it.

### R5-3 · minor · dropped

`src/ui/touch-controls.css`:35: No test checks AC8's 'sitting above GAS'. Removing or breaking the action slot's position rule leaves every test passing.

Verifier (none): The layout is correct today. It is purely visual, the screenshots and the registered stage cover it, and CLAUDE.md asks visual features only for a test that proves the element exists. A coverage nicety, not a defect.

### R5-4 · minor · verified

`src/ui/touch-controls.ts`:41: The AC8 'lightning icon' assertion only checks that some SVG polygon exists, so swapping the bolt for any other icon passes.

Verifier (trace): AC8 explicitly requires the lightning icon, and the test that claims to check it accepts any icon.

Fix: fixed in `f5a47fe75bce`. The finding is about how strong the test is, not about the code. touch-controls.ts already draws icon('bolt'), but the existing AC8 test only checks that the button has some `svg polygon`, and every icon has one. I left src/ unchanged and added tests/ui/action-button-icon.test.ts. It syncs a pickup RaceView into the race UI (unarmed, then armed), finds the button by its accessible name "Boost", and checks that its SVG polygons are exactly ['14,2 4,14 11,14 9,22 20,9 13,9'], the lightning bolt's points. Red/green: with the verifier's mutation applied (icon('bolt') → icon('play') at touch-controls.ts:41) the new test fails. After putting the line back it passes. pnpm typecheck passes, and pnpm test passes (117 files, 754 tests). Tests: `tests/ui/action-button-icon.test.ts`. Kept: the gates pass with it.
