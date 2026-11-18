## Review

Reviewers: R1 ok, R2 ok, R3 ok, R4 ok, R5 ok.
5 findings, 3 verified, 2 dropped; 3 fixes kept after the gates.

### R2-1 · minor · verified

`src/ui/start-screen.ts`:101: show() and select() re-read each card's lock but never move the selection off a card that has just become locked. `pick()` returns early for a locked id without touching `selected`, so the menu can end up with a card that is both aria-disabled and aria-checked, and RACE starts that locked track. This breaks the invariant that a locked card is never checked.

Verifier (test): Reproduced. A card that is locked again stays checked, and RACE would start the locked track. That breaks the plan audit's rule that a locked card is never checked. The fix is small: re-validate the selection in show().

Fix: fixed in `4ba491c28332`. Fixed in `src/ui/start-screen.ts`. The menu could leave a card selected after that card became locked again. Now `show()` re-reads the locks and best laps through `refresh()`, then checks the current selection. If the selected card is now locked, the selection moves to the first unlocked card using the existing `pick()`. Pine Ridge is then no longer aria-checked, and RACE no longer starts a locked track. The check is in `show()` and not in `refresh()`, because `refresh()` first runs before `selected` is set. I also updated the `tracks` option comment to say "first unlocked".

New test: `tests/ui/relocked-selection.test.ts` (the verifier's test). It failed before the fix (aria-checked was 'true') and passes after. `pnpm typecheck` passes.

`pnpm test` did not pass cleanly. Two full runs each failed a few Chromium browser tests: 4 on the first run and 6 on the second, and the failing set changed between runs (desktop-hud, hud-motion, keycap, results-fit-phone, track-card-press). All 10 passed when I re-ran them on their own, so they look like load-related flakes. I couldn't check them on the code without my change, because the working tree isn't a git repository. The other 845 tests passed on both runs. Tests: `tests/ui/relocked-selection.test.ts`. Kept: the gates pass with it.

### R3-1 · minor · dropped

`src/content/tracks.ts`:34: The new exports `finishedKey` and `hasFinished` are not imported anywhere. Only tracks.ts uses them, as the key builder for `hasFinished`/`saveFinished` and as the default reader for `isTrackLocked`. That adds two public helpers to the content module's surface that nothing outside it uses.

Verifier (none): This is not duplication, and there is no behavioural defect. The spec asks tracks.ts to provide a reader/writer for racer.finished.<id>, and whether these helpers are exported is a style preference.

### R4-1 · minor · dropped

`src/ui/title.css`:95: With four cards on the 844×390 phone, the track names no longer fit on one line. Two-word names break mid-name ('DUST / BOWL', 'BRAMBLE / BENDS'), while 'PINE RIDGE' and 'HAY LOOP' stay on one line. So the plates in the row have uneven name blocks, unlike S6, where every name is one line above its BEST line.

Verifier (none): The S6 mockup shows three cards with short names, not four. No UI_RULES rule requires one-line names. The suggested nowrap would clip the names and fail AC10's scrollWidth ≤ clientWidth check, so the fix would break the spec.

### R5-1 · major · verified

`src/game.ts`:199: No test checks that only car 0's finish saves racer.finished.<id>. If the save fired on any racer's finish, a bot crossing the line on Hay Loop would unlock Pine Ridge, and every test would still pass. The spec says "A player finish saves the key", and AC6 says "When car 0 finishes".

Verifier (trace): There is a real coverage gap for behaviour the spec states outright (AC6: 'When car 0 finishes'; 'A player finish saves the key'). No test pins that a bot's finish does not unlock Pine Ridge.

Fix: fixed in `0b57dc6071f2`. The finding was about a missing test, so I added one and left src/ alone. The game already saves the key only when car 0 finishes (src/game.ts:199), but no test checked that. New file tests/game/pine-ridge-player-only.test.ts starts a two-car Hay Loop race with seed 3. It steps the game with no player input (game.step uses NO_INPUT) until racer 1, the bot, has a finishTick, giving up after 10800 ticks. It then asserts that car 0 has not finished, that localStorage has no racer.finished.hay-loop, and that after game.showMenu() the Pine Ridge radio is still aria-disabled with its "Locked" padlock. Red/green: with the verifier's mutation applied temporarily (`racers.some((x) => x.finishTick != null)`), the test fails with "expected '1' to be null". With the real code restored (byte-identical, checked with cmp), it passes. pnpm typecheck is clean and pnpm test passes: 147 files, 854 tests. Tests: `tests/game/pine-ridge-player-only.test.ts`. Kept: the gates pass with it.

### R5-2 · minor · verified

`src/ui/start-screen.ts`:362: No test covers select() re-reading the lock. That is the path where the menu comes back after a race on a track that unlocked after the menu last showed. If the re-read were removed, quitting to the menu after racing Pine Ridge would leave it unselected, and RACE would start a different track. The tests would still pass.

Verifier (trace): There is a real coverage gap. Nothing tests that select() re-reads the lock when the menu returns to a track that unlocked after the last menu show.

Fix: fixed in `b0f4e2ff1c54`. This finding was about a missing test, so I added one test and changed no code. The new file is tests/game/pine-ridge-menu-return.test.ts. It starts with empty storage, finishes a race on Hay Loop and then on Dust Bowl, and clicks NEXT RACE, which starts forest-ridge. Then it presses Escape, clicks QUIT TO MENU, checks that the selected card is Pine Ridge, and clicks RACE to check that forest-ridge starts. This goes through select('forest-ridge') on a card the menu still marks locked because the menu hasn't shown since the unlock. Red/green: I deleted the re-read in select() (`if (card) card.setLocked(locked(trackId));`, start-screen.ts:112) and the test failed with "expected 'Bramble BendsBEST –:––.––' to contain 'Pine Ridge'". With the line put back it passes. The repo has no git here, so I restored the line by hand and checked it. pnpm typecheck passes, and pnpm test passes: 149 files, 856 tests. Tests: `tests/game/pine-ridge-menu-return.test.ts`. Kept: the gates pass with it.

### Judge fix round

Fix: not-fixed. The judge's finding is a wrong line number in review.md, not a fault in the code. In src/ui/start-screen.ts (116 lines), select() re-reads the lock at line 112 (`if (card) card.setLocked(locked(trackId));`), so the behaviour the R5-2 fix describes is there and correct. Only the reference "start-screen.ts:362" in the review text is stale. review.md isn't in this workspace (journal/runs/2026-11-18/ is empty), and this fixer may only touch src/** and new tests/** files, so I can't correct the citation. Changing src just to move the line would be churn unrelated to any defect. I changed nothing and added no test because there's no behaviour bug to show red/green. The fix is to change the R5-2 citation in review.md to src/ui/start-screen.ts:112.
