## Review

Reviewers: R1 ok, R2 ok, R3 ok, R4 ok, R5 ok.
8 findings, 6 verified, 2 dropped; 6 fixes kept after the gates.

### R2-1 · major · verified

`src/game.ts`:111: enterRace arms the 330 ms overlay-removal timer (via playScreenChange) before the synchronous game.startRace(). startRace builds the world and the Three.js scene and renders the first frame (shader compile), and the CSS sweep cannot start until that work ends. On a slow phone the chequer band is therefore cut short, or removed before it is ever painted (first RACE of a session, NEXT RACE onto another track).

Verifier (test): The removal timer starts before the blocking race start, so slow start work shortens the visible chequer sweep or removes it entirely. Calling playScreenChange after startRace fixes it, and AC8 still holds.

Fix: fixed in `5f25ddf19807`. In src/game.ts enterRace, swapped the order of the two calls. It now runs game.startRace({ trackId, carCount: PLAYER_CAR_COUNT }) first and playScreenChange(root, 'chequer') second, and the doc comment says why. The overlay's 330 ms removal timer used to start before the synchronous world and scene build, so a slow build could cut the chequer sweep short or remove it before it was ever painted. Now the timer only starts once startRace returns, which gives the band its full wipe. The state still changes at once and the overlay lands in the same painted frame, so AC8 behaviour is unchanged. RETRY, NEXT RACE and RACE all go through enterRace, and direct startRace calls still get no overlay. New test tests/game/chequer-after-slow-start.test.ts is the verifier's repro: a mocked createRaceScene advances fake timers by 300 ms, then the test clicks RACE, advances 250 ms and expects the chequer element to still be there. It failed before the fix and passes after. pnpm typecheck is clean and pnpm test passes (109 files, 733 tests). Tests: `tests/game/chequer-after-slow-start.test.ts`. Kept: the gates pass with it.

### R2-2 · minor · verified

`src/ui/start-screen.ts`:56: The track radiogroup's keydown handler moves the selection and calls preventDefault() for every ArrowLeft/Right/Up/Down, including with Alt, Ctrl or Meta held. src/input/keyboard.ts:41 deliberately ignores those events so browser shortcuts (Alt+Left, Cmd+Left = Back; Cmd+Up/Down = scroll) keep working; here they are swallowed and change the track instead.

Verifier (test): Arrow keys with Alt, Ctrl or Meta are swallowed (preventDefault) and change the track, which blocks browser shortcuts such as Alt+Left for Back. The game's own keyboard input deliberately leaves these alone.

Fix: fixed in `b4e54ef35205`. The track radiogroup's keydown handler in src/ui/start-screen.ts now starts with `if (e.altKey || e.ctrlKey || e.metaKey) return;`, the same guard src/input/keyboard.ts uses. Arrow keys pressed with Alt, Ctrl or Meta are browser shortcuts (Alt+Left for Back, Cmd+Up/Down to scroll), so they no longer change the track and preventDefault is no longer called on them. Plain arrow keys still move the selection. I added tests/ui/track-select-modifier-keys.test.ts: the verifier's test plus a check that a plain ArrowRight still selects the next card and is prevented. It failed before the fix and passes after it. pnpm typecheck is clean and pnpm test passes (110 files, 734 tests). Tests: `tests/ui/track-select-modifier-keys.test.ts`. Kept: the gates pass with it.

### R2-3 · minor · verified

`src/ui/stages/screen-change.stage.ts`:10: The screen-change--stripes stage builds the real start screen without a bestLaps store, so its cards read the browser's real localStorage. A Stage must be deterministic (stage.ts:11), and start.stage.ts and raceStage (which only passes a trackId together with an in-memory store) avoid real storage.

Verifier (test): stage.ts says a stage must be deterministic, but this stage's output depends on real browser storage. start.stage.ts avoids that by passing memoryBestLaps.

Fix: fixed in `4f6607b549f8`. The finding was real. In src/ui/stages/screen-change.stage.ts, the stripes stage now passes `bestLaps: memoryBestLaps()` (an empty in-memory store) to createStartScreen, so it no longer falls back to the real localStorage. Every card now reads "BEST –:––.––" whatever is in browser storage. That matches what the screenshot already showed, so the rendered output and the baselines stay the same. Before the fix, the new test failed: Bramble Bends read "BEST 0:40.37" once racer.bestLap.bends was set. After the fix it passes. pnpm typecheck is clean, and pnpm test passes: 111 files, 735 tests. Tests: `tests/ui/screen-change-stage-bests.test.ts`. Kept: the gates pass with it.

### R3-1 · minor · verified

`src/ui/title.css`:93: The new `.ui-start__label` rule copies the existing `.ui-pause__title` rule in screens.css line for line. clones.md flags it (screens.css:83 = title.css:93).

Verifier (trace): The new CSS block copies an existing rule line for line, and that rule does the same job (title type style). A shared selector would remove the copy.

Fix: fixed in `2441d8687c4c`. I removed the duplicated `.ui-start__label` block from src/ui/title.css and added its selector to the existing title-type rule in src/ui/screens.css, which is now `.ui-pause__title, .ui-start__label { … }`. The title type style is now defined in one place. start-screen.ts already imports screens.css, and no other rule targets `.ui-start__label`, so the SELECT TRACK heading gets exactly the same declarations as before and its behaviour and look are unchanged. Because this is a duplication finding, I added no new test. pnpm typecheck passes, and pnpm test passes: 111 files, 735 tests. Kept: the gates pass with it.

### R3-2 · minor · dropped

`src/ui/stages/start.stage.ts`:14: `stageTrackCards()` copies the game's TrackCardView mapping from game.ts:148 and hard-codes `8` where game.ts uses the `MINIMAP_STRIDE` constant. If the stride changes, the stage screenshots stop matching what the game shows, even though the doc comment says it builds the cards "as the game passes it".

Verifier (none): This is a one-line fixture expression, not a copy of an existing helper. Stages build their own fixed data by convention, and stage.ts already hard-codes the stride 8. Dropped as a style preference.

### R4-1 · minor · verified

`src/ui/title.css`:611: Track cards have no pressed state. Board 05 #7 (Cards & menus) says 'Select: press-sink, then fill cuts to mustard and it settles at rest', and UI_RULES §10 requires a pressed state for every new element. The card's hover lift also isn't inside `@media (hover: hover)` the way `.ui-button`'s is, so on touch screens a tapped card stays lifted with the 6px shadow.

Verifier (trace): The new track card element has no pressed state, which UI_RULES §10 requires, and its hover lift is not limited to hover-capable devices the way the existing button component is.

Fix: fixed in `fc86829f5446`. I changed only src/ui/title.css. The track card now has a pressed state that copies .ui-button's. `.ui-track-card:active` moves the card by var(--ui-sink-button), sets box-shadow to var(--ui-shadow-pressed) and uses var(--duration-press). That is the UI_RULES §10 rule "Pressed = sink onto a 1px shadow" and the press-sink in board 05 #7. I split the old `:focus-visible, :hover` lift rule. `:focus-visible` keeps the 2px lift and 6px shadow as before. The hover lift now sits in `@media (hover: hover) { .ui-track-card:hover:not(:active) }`, as .ui-button's does, so a tapped card on a touch screen no longer stays raised. I also updated the comment above the rule. Every value is an existing token or variable, with no literals. The new test, tests/ui/track-card-press.test.ts, builds the harness, opens the real start--menu stage in Chromium and finds the card by its radio role and track name. At 1440×900 it holds the mouse down on the card and expects a positive translate and a smaller shadow than at rest. At 844×390 with touch it taps the card, waits until :active has cleared while :hover is still stuck, and expects the card to be back at rest. Without the fix both tests failed, with the card at -2px and a 6px shadow. With the fix both pass. `pnpm typecheck` is clean and `pnpm test` passed: 112 files, 737 tests. The resting menu screenshot is unchanged. Tests: `tests/ui/track-card-press.test.ts`. Kept: the gates pass with it.

### R4-2 · minor · verified

`src/ui/title.css`:480: The new S6 menu has no desktop sizing. UI_RULES §5 says 'Desktop: same layout at ×1.45, 32px margins, 4px outlines', but at 1440×900 the heading, cards, SELECT TRACK label, RACE button and outlines stay at mobile token sizes and the 48px safe margins.

Verifier (trace): The newly built S6 screen ignores the explicit desktop scaling rule in UI_RULES §5. The 1440×900 screenshot shows it at phone sizes with most of the panel empty.

Fix: fixed in `7b5ffb6514ae`. The S6 menu now uses the desktop layout from UI_RULES §5, the same way the HUD does. In src/ui/start-screen.ts, createStartScreen calls the existing watchDesktop from layout.ts and toggles `is-desktop` on the start overlay element. src/ui/title.css gets new `.ui-start.is-desktop` rules, all from tokens:
- --type-display-size-desktop on the h1 (96px)
- --type-title-size-desktop on SELECT TRACK and RACE (48px)
- --type-button-size-desktop on card names and --type-label-size-desktop on BEST
- --desktop-outline (4px) on the cards, card plates, RACE and the brand panel's divider
- --desktop-margin (32px) padding on both panels instead of the 48px safe insets
- --desktop-scale applied to card width, gaps, plate padding, the stripes, the title car, and RACE's height, padding and icon

The phone view is unchanged: the 844×390 screenshot matches the one before the fix. At 1440×900 the screenshot now shows the scaled layout. The new test, tests/ui/desktop-start-screen.test.ts, renders the start--menu stage in Chromium through harness/screens/browser.ts, as desktop-hud.test.ts does. It checks that the phone keeps 56/32/32/22px type and 3px outlines, and that desktop gets 96/48/48/28px type, 4px outlines, cards more than 1.4× wider, and 32px margins. It failed before the fix (the heading was 56px, not 96px) and passes after. pnpm typecheck passes and pnpm test passes (113 files, 738 tests). Tests: `tests/ui/desktop-start-screen.test.ts`. Kept: the gates pass with it.

### R5-1 · minor · dropped

`src/game.ts`:303: No test covers the line in showMenu() that re-selects the last raced track, `startScreen.select(menuTrack.id)`. The only test of selection after QUIT TO MENU (AC4) picks Hay Loop by clicking its card and races Hay Loop. The card is already selected, so the line changes nothing in that test, and deleting it passes every test.

Verifier (none): This is a test-coverage gap, not a defect. The code behaves correctly and there is nothing to fix in the branch.
