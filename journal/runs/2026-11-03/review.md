## Review

Reviewers: R1 ok, R2 ok, R3 ok, R4 ok, R5 ok.
6 findings, 3 verified, 3 dropped; 3 fixes kept after the gates.

### R1-1 · major · verified

`src/ui/results.css`:94: Play-test step 6 ('Tap RETRY, then NEXT RACE') fails on the phone viewport. A six-car race now always shows a 6-row results table. At 844×390, the project's reference frame, the centred results column overflows: RETRY and NEXT RACE are pushed below the bottom edge and the track title is clipped at the top. The layer can't scroll (body has overflow: hidden and touch-action: none), so the owner can't tap the buttons. Before B04, player races had only 2 rows.

Verifier (trace): Before B04 a player race had 2 rows and fitted. Now every player race has 6 rows, so on the 844×390 phone viewport RETRY and NEXT RACE sit off-screen and spec play-test step 6 can't be done.

Fix: fixed in `47eee6369cf7`. The finding was real. At 844×390 the six-row results screen put the 'Bramble Bends' title at y=-7 and RETRY / NEXT RACE at y=384–436. I rearranged the results layout to match the S5 mockup, using tokens only.
- src/ui/results-screen.ts: the triple stripe is now a direct child of the screen. The left column holds the label, track title, placing roundel and best-lap chip. The right column (`ui-results__side`) holds the results table with the RETRY / NEXT RACE actions under it.
- src/ui/results.css: the stripe is now an edge-to-edge 4:2:1 band in the 12px top inset (absolutely positioned, height s3, built like the pause card's band). The right column is right-aligned with gap s4. Gaps between rows go from s2 to s1, and rows use type-button-size instead of hud-l, as in the mockup.
Six rows plus the buttons now fit within 390px. The screenshots at 844×390 (win and podium) and 1440×900 look right next to the mockup. No behaviour, roles or DOM hooks used by tests changed.
New test tests/ui/results-fit-phone.test.ts builds the harness screens bundle and renders the results--podium stage (six racers) in Chromium at 844×390. It checks that the stripes, title, all header and data rows, and both buttons are inside the viewport. It failed before the fix (title top -6.9, buttons bottom 435.9) and passes after. pnpm typecheck passes and pnpm test passes (76 files, 599 tests). Tests: `tests/ui/results-fit-phone.test.ts`. Kept: the gates pass with it.

### R2-1 · major · dropped

`src/ui/results.css`:71: With six cars every race started from RACE/RETRY/NEXT RACE ends on a 6-row results screen that does not fit the 844×390 phone viewport. The content needs about 491px in a 357px box, is centred so it is clipped at both ends, and the page cannot scroll. RETRY and NEXT RACE start at y≈385 of 390, a sliver of about 5px, and pause is disabled after the finish, so a phone player cannot leave the results screen.

Verifier (none): duplicate of R1-1

### R2-2 · minor · verified

`src/game.ts`:237: startRace() sets menuTrack before raceDrivers() can throw on an invalid carCount. A rejected call therefore still switches the track that the RACE button and the next startRace() use, and that GameState.trackId reports.

Verifier (test): A rejected start still changes the menu track. The car-count throw point is new in this diff, and moving the assignment after raceDrivers/createWorld fixes it.

Fix: fixed in `699fd4091c2b`. In src/game.ts startRace(), I moved `menuTrack = track;` from straight after getTrack() to below the raceDrivers(...), createWorld(...) and carViews(...) calls, just before `race = {`. Now a call that raceDrivers rejects (carCount 7, 0, 2.5) throws before any menu state changes. state().trackId, the RACE button and the next default startRace() all keep the previous menu track. Valid starts behave exactly as before because the assignment still happens before anything reads menuTrack. New test tests/game/start-race-invalid-count.test.ts is the verifier's test plus a check that mode stays 'menu'. It failed before the fix (expected 'dust-bowl' to be 'bends') and passes after it. pnpm typecheck is clean and pnpm test passes: 77 files, 600 tests. Tests: `tests/game/start-race-invalid-count.test.ts`. Kept: the gates pass with it.

### R2-3 · minor · dropped

`src/game.ts`:139: The start screen subtitle is built once at createGame from the initial menuTrack, but menuTrack changes on every startRace (NEXT RACE moves to the next track). After NEXT RACE → QUIT TO MENU the start screen still shows the old track name and lap count while RACE starts the new track. This predates B04, but sits in the createStartScreen options literal whose onRace line this diff edits.

Verifier (none): The reviewer says it predates B04. The stale start-screen subtitle exists on main too and is outside this spec's scope.

### R3-1 · minor · verified

`tests/game/six-car-race.test.ts`:31: The diff adds two near-identical copies of `playerInputs(trackId, seed)`, one in each new test file. Both also re-implement `botsFor` (one bot per car), which already exists in tests/sim/helpers.ts:62.

Verifier (trace): Two copies of the same helper were added in new test files, and the existing botsFor helper already does the bot-mapping part.

Fix: fixed in `ea713b8ba790`. Removed the duplicated playerInputs helpers. tests/game/six-car-race.test.ts and tests/game/six-car-grid.test.ts are both new in tonight's diff, so editing them is allowed. Added a new tests/game/helpers.ts that exports twinPlayerInputs(trackId, seed, carCount, maxTicks). It is built on the existing botsFor from tests/sim/helpers.ts, so neither file maps createBot inline any more. It runs the same loop as before (bot inputs for car 0 of a twin world, stepped until car 0 finishes or maxTicks is reached) and keeps the grid file's check that car 0 finished. Both files now call it, with FIVE_MINUTES in the race test and TEN_MINUTES (the old 60*60*10) in the grid test. Their local copies and the unused imports (createBot, stepWorld, CarInput, getTrack) are gone. The one change in behaviour is that the race test now also checks the twin's car 0 finished, which its AC5 test already requires, so no outcome changes. No src/ changes. pnpm typecheck passes, and pnpm test passes: 77 files and 600 tests, including all 10 six-car tests. This is a duplication fix, so there is no red/green test. ESLint couldn't be run in the sandbox because it isn't installed locally and there's no network. Kept: the gates pass with it.

### R5-1 · major · dropped

`src/game.ts`:82: The spec requires the cached scene to be rebuilt when the driver list changes, not only when the track changes. No test covers this. Every game test mocks createRaceScene with a stub that ignores its liveries argument, so reverting the cache key to track-only passes every test, even though the real scene would then have only 2 car meshes for a 6-car race.

Verifier (none): This is a test-coverage gap, not a defect. The behaviour is correct on this branch, so no failing test can reproduce it.
