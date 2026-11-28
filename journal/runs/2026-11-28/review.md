## Review

Reviewers: R1 ok, R2 ok, R3 ok, R4 ok, R5 ok.
7 findings, 2 verified, 5 dropped; 2 fixes kept after the gates.

### R2-1 · major · verified

`src/ui/start-screen.ts`:49: The row only scrolls a card into view when a click or arrow key picks it (pick(id, true)). select() and show(), which game.showMenu() uses to restore the selection on every return to the menu, go through pick(id, false) and never scroll. In a row that scrolls, the checked (mustard) card can then sit outside the row's visible area, and RACE still starts it.

Verifier (test): On a sideways phone under 720px wide, the four-card row scrolls. After returning to the menu the checked card sits fully outside the row's visible area, and RACE still starts it.

Fix: fixed in `d8729f128969`. The bug was real. Before this change, the checked card was only scrolled into the row when a click or arrow key picked it (pick(id, true)). game.showMenu() calls select(id) and then show(), which both went through pick(id, false), and neither scrolled. So in a row that scrolls, the checked (mustard) card could end up outside the visible part of the row. Fix: one line in StartScreen.show() in src/ui/start-screen.ts. After screen.show(), it now calls `cards.find((c) => c.id === selected)?.element.scrollIntoView({ block: 'nearest', inline: 'nearest' })`. It has to run after the overlay is visible because scrolling does nothing while the overlay is hidden. With 'nearest' it does nothing when the card is already in view, and it doesn't scroll the page (the test checks scrollY stays 0). I added the verifier's repro as tests/ui/checked-card-in-row.test.ts: game build, 600×360 touch, Hay Loop finished, startRace pine-ridge then showMenu. It asserts the checked card is Pine Ridge, the row scrolls, the page hasn't scrolled, and the card sits inside the row. It failed before the fix (card right edge 724 > row right edge 564.5) and passes after. pnpm typecheck is clean and pnpm test passes (158 files, 873 tests). I didn't take screenshots: this changes scroll position, not how anything looks, and the tests check it. Tests: `tests/ui/checked-card-in-row.test.ts`. Kept: the gates pass with it.

### R3-1 · minor · dropped

`tests/ui/locked-card-shake.test.ts`:311: All three new browser test files paste the same build-serve-launch beforeAll/afterAll block (about 18 lines each). The existing export `setup()` in tests/ui/hud-motion.ts already does exactly this and is used by eight hud-motion-*.test.ts files.

Verifier (none): The new files follow the repo's dominant convention for browser tests. This is test-code style, not a defect.

### R4-1 · minor · dropped

`src/ui/title.css`:192: At the new 96px card minimum, the BEST line (white-space: nowrap inside a card with overflow: hidden) is clipped, so a stored time loses its last digit. In 'track-select--many-cards' at 844×390 the selected Bramble Bends card reads 'BEST 0:40.3' instead of 'BEST 0:40.37'. That breaks the m:ss.cc time format (UI_RULES §4) for anyone with five or more tracks.

Verifier (none): The clipping is the behaviour the plan audit requires (no new BEST rule), and the spec already flags it for the owner. The only proposed fix is a journal note that I can't check from this tree, so there is no code defect to fix.

### R4-2 · minor · verified

`src/ui/title.css`:100: The card row's negative margin (-12px on every side) pushes the scroll container's clip edge 12px into the right safe-area inset. The peeking card is drawn up to 36px from the screen edge, inside the 48px / env(safe-area-inset-right) inset that UI_RULES §5 keeps clear. On a notched phone, part of the peeking card can sit under the notch.

Verifier (test): The peeking card is painted 12px into the right safe-area inset that UI_RULES §5 keeps clear (max(48px, env)), past RACE's right edge. The branch introduced this.

Fix: fixed in `0881a470ca16`. src/ui/title.css: `.ui-start__cards` used to have a -12px margin on every side. Its right margin is now 0 (`margin: calc(var(--space-s3) * -1) 0 calc(var(--space-s3) * -1) calc(var(--space-s3) * -1)`), so the scroll box's clip edge stops at the content edge, in line with RACE, and no longer reaches into the right safe inset (§5: max(48px, env)). The padding is unchanged, so the last card's shadow and focus ring still have room at the end of the scroll. The left, top and bottom still extend 12px for the shadow, the lift and the focus ring. I updated the CSS comment to match. New test tests/ui/card-row-safe-inset.test.ts renders 'track-select--many-cards' in Chromium at 844×390 (touch) and 1440×900. It checks that no card is visible past RACE's right edge, and on the phone not past 844−48. Before the fix it failed at both sizes (808 on the phone, 1420 vs 1408.5 on desktop). After the fix it passes. pnpm typecheck passes and pnpm test passes (159 files, 875 tests). In the screenshots the eight-card peek now clips at x≈796, aligned with RACE, and the four-card start--menu still fits with shadows visible. Tests: `tests/ui/card-row-safe-inset.test.ts`. Kept: the gates pass with it.

### R5-1 · major · dropped

`src/ui/start-screen.ts`:52: The new `scrollIntoView` in `pick()` has no test. It is the only thing that brings an arrow-selected card into view once the row scrolls, and it is supposed to do that without moving the page. Deleting the line, or swapping `block: 'nearest'` for `block: 'start'`, leaves every test passing.

Verifier (test): Coverage-only finding. The behaviour is correct on this branch, so no test fails because of a problem.

### R5-2 · major · dropped

`src/ui/track-card.ts`:76: Nothing tests that unlocked cards behave as before, meaning no shake and no swallowed Enter/Space. Dropping the `!locked ||` guard makes Enter/Space shake an unlocked card and call preventDefault on it, and the tests stay green. Making click shake every card survives too.

Verifier (test): Coverage-only finding. Unlocked cards behave correctly (no shake, no preventDefault).

### R5-3 · minor · dropped

`src/ui/track-card.ts`:78: The spec says Enter/Space on a locked card calls preventDefault, but no test checks that. AC4 compares scrollY and scrollLeft, and neither moves on this layout whether or not the default is prevented, so deleting `e.preventDefault()` survives.

Verifier (test): Coverage-only finding. preventDefault on locked Enter/Space works as the spec requires.
