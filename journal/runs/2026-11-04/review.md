## Review

Reviewers: R1 ok, R2 ok, R3 ok, R4 ok, R5 ok.
6 findings, 5 verified, 1 dropped; 4 fixes kept after the gates.

### R3-1 · minor · dropped

`src/ui/layout.ts`:9: `DESKTOP_MIN` and `DESKTOP_QUERY` are new exports that nothing imports. Only `layout.ts` uses them, so they are dead public surface that the next night may take for a shared API.

Verifier (none): Exporting two well-named, documented constants that are not imported elsewhere is harmless and a style preference. Nothing behaves wrongly, and the spec asked for the threshold to be computed in one place, which is what layout.ts does.

### R3-2 · minor · verified

`src/ui/components.css`:243: The new `.ui-keycap` rule in the same file re-declares what `.ui-panel` and `.ui-panel--cream` already provide (ink outline, radius, HUD shadow, cream background with ink text). The legend could compose those existing classes the way every other HUD widget does.

Verifier (trace): The five declarations duplicate the existing .ui-panel and .ui-panel--cream classes exactly, and composing those classes is the established pattern. The fix is safe because the primary modifier comes later in the cascade and still wins.

Fix: fixed in `2c3fa68fd7d3`. Removed the duplicated keycap styling by reusing the existing panel classes. In src/ui/keycap-legend.ts, key() now gives each keycap the classes 'ui-panel ui-panel--cream ui-keycap', the same way hud.ts builds 'ui-panel ui-panel--mustard ui-hud-best'. In src/ui/components.css, I deleted the five declarations from .ui-keycap that .ui-panel and .ui-panel--cream already set (border, border-radius, box-shadow, background, color) and updated its comment. .ui-keycap--primary has the same specificity and comes later in the file, so the GAS key is still rally-red with a cream glyph. The legend sits outside .ui-hud, so the desktop rule `.ui-hud.is-desktop .ui-panel` (4px outline) doesn't reach the keycaps, and their computed style is unchanged. This is a duplication finding, so behaviour is meant to stay the same. The new guard test therefore passes both before and after the change. I checked that it does catch a regression: with the panel classes taken off the keycaps (the CSS already reduced), it fails. It renders the hud--first-lap stage at 1440×900 in Chromium and checks that the four cream keycaps compute the same border, radius, shadow, background and colour as the token variables (--outline-default, --color-ink, --radius-rect, --shadow-hud, --color-cream), and that GAS computes the rally-red/cream pair. pnpm typecheck passes and pnpm test passes (82 files, 612 tests). The 1440×900 first-lap screenshot shows the legend looking as it did before. Tests: `tests/ui/keycap-style.test.ts`. Kept: the gates pass with it.

### R4-1 · minor · verified

`src/ui/components.css`:19: The keycaps only ever show on desktop, but they get the phone's 3px outline. UI_RULES §3 asks for 4px outlines on desktop, and so does the spec ('4 px ink outlines'). Every other desktop HUD outline in this diff uses --desktop-outline: the HUD panels, PAUSE and the legend panel itself. The keycaps are the one exception.

Verifier (test): UI_RULES §3 says outlines are 4px on desktop, and §5 and the spec ask for 4px outlines on desktop. Keycaps render only in desktop mode and are 36px tall, so neither the 2px nor the 3px tier applies. They measure 3px.

Fix: not-fixed. The finding is real. In the hud--first-lap stage at 1440×900, every keycap renders with a 3px border. I confirmed this with a new red test, then added `.ui-keys .ui-keycap { border-width: var(--desktop-outline); }` to keycap-legend.css, and the new test went green. But an existing test, tests/ui/keycap-style.test.ts (from an earlier finding, R3-2), checks that keycaps on that same 1440×900 desktop stage use exactly `var(--outline-default)`, which is 3px. With the fix in place that test fails (612 passed, 1 failed). Tests are append-only, so I'm not allowed to change it. That means the fix can't pass the gates, and the two requirements can't both hold under the rules. I reverted everything: the CSS change and my new test file. The tree is back as it was, and pnpm test passes all 82 files. The owner needs to decide which is right: UI_RULES §3 (4px on desktop) or the R3-2 test (3px). If §3 wins, that test needs to be retired before this fix can land.

### R5-1 · minor · verified

`tests/ui/desktop-hud.test.ts`:471: The spec summary says the minimap and PAUSE are drawn at ×1.45 on desktop, but no test measures either size. Deleting the desktop size rules for both leaves every new test passing.

Verifier (trace): The spec's summary feature (minimap and PAUSE at ×1.45) is implemented in hud.css:170-180, but no test measures it, so a regression would go unnoticed. A new test comparing desktop and phone boxes would pass on the current code.

Fix: fixed in `3c3656e826ec`. This was a gap in test coverage, so I added a test and left the code alone. The new file tests/ui/desktop-hud-scale.test.ts (named AC1) uses the same Chromium harness as desktop-hud.test.ts. It renders the hud--mid-race stage twice, once at 1440×900 without touch and once at 844×390 with touch. In each it measures the bounding boxes of .ui-hud-map and .ui-hud-pause. It then checks that each box's desktop width and height equal the phone value × tokens.desktop.scale (imported from @tokens), within ±1px, and that the phone boxes aren't empty. The test passes on the current code. I tried both mutations the reviewer named and it fails on each: without the desktop PAUSE size rule it is off by 21.6px, and without the desktop minimap size rule by 46.8px. I restored hud.css byte-for-byte afterwards. I didn't touch any src/ file or existing test. pnpm typecheck passes, and pnpm test passes (83 files, 613 tests). I couldn't run eslint because it isn't installed in this environment. Tests: `tests/ui/desktop-hud-scale.test.ts`. Kept: the gates pass with it.

### R5-2 · minor · verified

`tests/ui/keycap-legend.test.ts`:623: AC4 only checks that each of the four arrow keycaps contains some `<svg>`. It doesn't check which arrow is on which key, or that GAS uses the rally-red primary keycap from the spec. Arrows that are swapped or pointing the wrong way, or a cream GAS key, all pass.

Verifier (trace): The right arrow-to-key mapping and the rally-red GAS key are spec requirements that no test pins down, so swapped arrows (a user-visible bug) would pass. The current code is correct, so a new test asserting them would pass.

Fix: fixed in `245d4f4401d8`. The finding is about a weak test. The legend code is already correct, so nothing in src/ changed. I added one new test file, tests/ui/keycap-legend-keys.test.ts. It sets up a desktop matchMedia (fine pointer, 1440×900), resets and syncs the race UI on lap 1, finds the "Keyboard controls" group, and groups its keycaps by label. For STEER, GAS and BRAKE it compares each keycap's SVG polygon `points` with those of a fresh icon('key-left'/'key-right'), icon('key-up') and icon('key-down'), in that order. It also checks that only the GAS keycap has `ui-keycap--primary`, the class that gives it the rally-red background in components.css; the steer, brake and ESC keycaps don't. Red/green: I applied each of the reviewer's three mutations to src/ui/keycap-legend.ts in turn: steer arrows swapped, the up arrow on BRAKE, and the primary flag removed from GAS. The new test failed every time. After restoring the file (checked byte-for-byte with cmp) it passes. pnpm typecheck is clean and pnpm test passes: 84 files, 614 tests. Tests: `tests/ui/keycap-legend-keys.test.ts`. Kept: the gates pass with it.

### R5-3 · minor · verified

`tests/ui/keycap-legend.test.ts`:560: The spec says the mode updates live on resize, but no test checks that the keycap legend follows a resize. The happy-dom matchMedia stub never fires 'change', and the browser AC6 test opens a fresh page per viewport. The legend can ignore resize changes and every test still passes.

Verifier (trace): No test checks that the legend's live response to a resize works, even though the spec requires live mode updates. A browser test that resizes the first-lap stage would pass on the current code and catch the regression.

Fix: fixed in `8c552458d453`. This finding was about test strength: nothing checked that the keycap legend responds to a resize. The game code already handles it correctly, so I left src/ unchanged and only added a new browser test, tests/ui/keycap-legend-resize.test.ts. The test builds the screens harness and renders the 'hud--first-lap' stage in Chromium at 1440×900 with no touch. It checks that the "Keyboard controls" group is visible. It then resizes the page to 1000×700 and polls until the group is hidden, resizes back to 1440×900 and polls until it is visible again, then shrinks the page once more and checks the group hides. Finally it opens a fresh page at 1000×700, checks the legend is hidden, grows the page to 1440×900 and polls until the legend appears. Red/green: I temporarily applied the reviewer's mutation, replacing the watchDesktop call in src/ui/keycap-legend.ts with a one-off matchMedia(DESKTOP_QUERY).matches read. The new test failed: the legend stayed visible after the resize to 1000×700. I then restored the original file and confirmed it is byte-identical; the test passes against the current code. pnpm typecheck is clean and pnpm test passes (85 files, 615 tests). Tests: `tests/ui/keycap-legend-resize.test.ts`. Kept: the gates pass with it.
