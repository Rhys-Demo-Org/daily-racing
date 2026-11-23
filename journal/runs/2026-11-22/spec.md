# Maintenance · One RaceView per sim tick, shared button type CSS, stale docs fixed

Date: 2026-11-22 · mode: maintenance · backlog: none

## Summary

The game stops rebuilding the RaceView on rendered frames where no sim tick ran (any display above 60 Hz). The view is cached on the Race and cleared after each tick. Duplicated CSS is merged: the button type and transition block shared by .ui-button and .ui-tc, the BEST/NEW BEST tuck-under, and selectors split across two rules. I checked every move against the cascade: specificity is the same and nothing in between sets those properties. The rest is comment, CLAUDE.md and `export`-keyword changes that leave the runtime alone. The sim, the render geometry, the stages and the tests are untouched, so replays, bot laps, scene graphs and stage DOM stay identical.

## Cleanup items

Apply exactly these items from the cleanup list, nothing else. Behaviour must not change.

### C028 · performance · performance · worth medium · ~6 lines

- Files: `src/game.ts` (line 190)
- Claim:
  > draw() calls raceView(r.world) on every rendered frame, but the world only changes in tick(). Each call allocates a distances array, the positions() order array with its sort and forEach closures and result array, and per racer a RacerView with `lapTicks.slice()`. Frames that ran no tick (any display above 60 Hz) and frames that ran several ticks still pay for it.
- Evidence:
  > src/game.ts:190 `ui.sync(raceView(r.world), r.curr);` runs in draw(), which frame() calls on every animation frame (game.ts:207) whether or not a tick ran. src/sim/world.ts:128-134: `world.racers.map(...)`, `positions(...)`, `world.racers.map((r, i) => racerView(...))`. src/sim/race.ts:96-112 shows map, sort with a closure, `new Array().fill`, and forEach. race.ts:121 has `lapTicks: r.lapTicks.slice()`. perf.json (bends): `sort ((native))` 968 B/frame and `map ((native))` 924 B/frame. Note: game.ts is also in open PRs #25 and #26.
- Suggested fix:
  > Add `view: RaceView | null` to the Race record. Set it to null in tick() after stepWorld and in startRace, and in draw() use `ui.sync((r.view ??= raceView(r.world)), r.curr)`. raceView is a pure function of the world, so the UI receives identical values. Apply after #25 and #26 land, since both touch game.ts.
- Seen 3× (first 2026-11-08, last 2026-11-22)
- History:
  > 2026-11-08: skipped: touches files of open PR #26, #25, #23
  > 2026-11-15: not chosen by the plan audit: Touches game.ts draw(), which in-flight B08 (#30) changes. Caching one RaceView across frames also changes object identity for ui.sync, while B09 (#31) adds position and lap change detection in the UI that may keep or compare views. Re-check after both land.
- Why tonight (plan audit): Real: draw() (game.ts:202) calls raceView(r.world) every animation frame, but the world only changes in tick(); src/driver never touches it. raceView is pure, and its consumers (race-ui.sync, countdownFraming, scene.update, results.update) only read it, with no identity checks. Add `view: RaceView | null` to Race: null in startRace's record and after carViews in tick(), and `const view = (r.view ??= raceView(r.world))` in draw(). Values are identical. Performance item, about +3 lines.

### C014 · ui · duplication · worth medium · ~20 lines

- Files: `src/ui/components.css`, `src/ui/touch-controls.css` (line 122)
- Claim:
  > The button type and press-transition block (font-family, font-size, font-weight, font-style, line-height, text-transform, transition) is copied word for word in .ui-button and .ui-tc. clones.md flags it.
- Evidence:
  > src/ui/components.css:122-131 (.ui-button) and src/ui/touch-controls.css:47-56 (.ui-tc) both read:
  >   font-family: var(--type-button-font);
  >   font-size: var(--type-button-size);
  >   font-weight: var(--type-button-weight);
  >   font-style: var(--type-button-style);
  >   line-height: 1;
  >   text-transform: uppercase;
  >   …
  >   transition:
  >     transform var(--duration-release) var(--ease-snap),
  >     box-shadow var(--duration-release) var(--ease-snap);
  > clones.md: `src/ui/components.css:122` = `src/ui/touch-controls.css:47`.
- Suggested fix:
  > In components.css, move these declarations into a grouped rule `.ui-button, .ui-tc { … }` placed where they are now, before .ui-button--primary. Delete them from .ui-tc in touch-controls.css. Every later override (.ui-button--primary, .ui-tc--gas, .ui-tc.is-resting `transition: none`, the :active and is-pressed transition-duration) has equal or higher specificity and comes later, so computed styles don't change. touch-controls.ts already imports components.css before touch-controls.css. Note that open PR #24 also edits components.css.
- Seen 3× (first 2026-11-08, last 2026-11-22)
- History:
  > 2026-11-08: skipped: touches files of open PR #24
  > 2026-11-15: not chosen by the plan audit: Real duplication. But touch-controls.css is very likely edited by in-flight B09 (#31: touch slots slide in on race reset), and components.css may be too. Moving .ui-tc declarations across files while that PR is open invites a cascade-order conflict. Do it after #31 lan…
- Why tonight (plan audit): Verified: components.css:122-131 and touch-controls.css:54-63 repeat the button type and transition word for word. Group them as `.ui-button, .ui-tc {…}` right after .ui-button (cursor stays on .ui-button) and delete them from .ui-tc. components.css loads first, nothing else targets the touch buttons, and every later .ui-tc override has equal or higher specificity and comes later, so computed styles are unchanged. Net about −8 lines. The old blocker, #31, has merged.

### C034 · ui · duplication · worth low · ~8 lines

- Files: `src/ui/hud.css` (line 197)
- Claim:
  > The NEW BEST chip repeats the BEST chip's tuck-under declarations word for word. That is padding, no top outline, square top corners and line-height 1, matching the comment 'styled like BEST'.
- Evidence:
  > src/ui/hud.css:117-125 `.ui-hud-best { … padding: var(--space-s1) var(--space-s2); border-top: 0; border-radius: 0 0 var(--radius-rect) var(--radius-rect); line-height: 1; }`
  > src/ui/hud.css:196-200 `.ui-hud-new-best { padding: var(--space-s1) var(--space-s2); border-top: 0; border-radius: 0 0 var(--radius-rect) var(--radius-rect); line-height: 1; …`
- Suggested fix:
  > Move the four shared declarations into a grouped rule `.ui-hud-best, .ui-hud-new-best { … }` at the .ui-hud-best position. Keep display/align-items/gap on .ui-hud-best, and visibility/transform on .ui-hud-new-best. Both selectors are single classes with unchanged specificity. They come after .ui-panel (components.css is imported first) and before the .is-desktop overrides, so the cascade order is preserved and computed styles stay the same.
- Seen 2× (first 2026-11-15, last 2026-11-22)
- History:
  > 2026-11-15: not chosen by the plan audit: hud.css is certainly edited by in-flight B09 (#31: Pos/Lap stamps, slide-in entry). Regrouping the BEST/NEW BEST chip rules now risks a cascade conflict. Do it after #31 lands.
- Why tonight (plan audit): hud.css:117-125 and :196-200 repeat padding, border-top: 0, border-radius and line-height for BEST and NEW BEST. Use a grouped `.ui-hud-best, .ui-hud-new-best` rule at the .ui-hud-best position and keep the rest in each own rule. Between the old and new positions, only higher-specificity .is-desktop rules match these chips, so computed styles are unchanged. Net about −3 lines. #31 has merged.

### C049 · ui · simplify · worth low · ~14 lines

- Files: `src/ui/title.css`, `src/ui/hud.css` (line 120)
- Claim:
  > Several selectors are split across two rules in the same file. title.css has two `.ui-track-card:focus-visible` rules a few lines apart. hud.css repeats `.ui-hud__timer`, `.ui-hud-best` and `.ui-hud-pos__n` as later second rules. Readers editing the first rule miss the second.
- Evidence:
  > src/ui/title.css:120-123 `.ui-track-card:focus-visible { outline: …; outline-offset: …; }` and :127-130 `.ui-track-card:focus-visible { transform: translate(var(--ui-card-lift), var(--ui-card-lift)); box-shadow: var(--shadow-overlay); }`. The only rule between them is :124 `.ui-track-card[aria-checked='true']:focus-visible`, which has higher specificity and sets only outline-color.
  > src/ui/hud.css:31 `.ui-hud__timer {display…}` and :189 `.ui-hud__timer { isolation: isolate; }`; :117 `.ui-hud-best {…}` and :192 `.ui-hud-best { position: relative; z-index: 1; }`; :57 `.ui-hud-pos__n {font-size; color}` and :234 `.ui-hud-pos__n { display: block; }`. No rule in between sets isolation, position, z-index or display on these elements.
- Suggested fix:
  > Move the declarations of each second rule into the first rule for the same selector and delete the second rule. In hud.css, keep the comment at :185-188 above the .ui-hud-new-best block. No property is set twice and no intervening rule sets these properties, so computed styles are unchanged. In hud.css this can go together with C034.
- Seen 1× (first 2026-11-22, last 2026-11-22)
- Why tonight (plan audit): Verified split rules. In hud.css, fold :189 (timer isolation) into :31, :192 (best position/z-index) into the single-selector .ui-hud-best rule after C034, and :234 (pos__n display) into :57. In title.css, fold the second .ui-track-card:focus-visible (:127) into :120. Only :124 sits between those two (higher specificity, outline-color only). No equal-specificity rule in between sets these properties, so computed styles are unchanged. Keep the :185-188 comment. Net about −9 lines.

### C035 · ui · docs (CLAUDE.md, comments) · worth low · ~8 lines

- Files: `src/ui/components.css`, `src/ui/screens.css` (line 52)
- Claim:
  > Several CSS comments still name the dead finish panel as the user of shared components and leave out the live pause and results screens. A feature night reading them would look in finish-panel.ts (see C012).
- Evidence:
  > src/ui/components.css:52 `/* Display heading: italic 900 caps (start title, FINISHED). */` — live users are start-screen.ts:23 and results-screen.ts:57; 'Finished' is only in finish-panel.ts:33. components.css:63 `(LAP, TIME, finish stats)`. components.css:77 `/* Big overlay (finish card, countdown roundel)` — live users are countdown.ts:83 and pause-screen.ts:32. screens.css:1 `/* Start screen, finish panel and the shared full-screen menu ground. */` while most of the file is the pause card (:83-136) and the stripe used by start, pause and results.
- Suggested fix:
  > Comment-only edits: components.css:52 → '(start title, results track name)', :63 → '(LAP, TIME, results rows)', :77 → '(pause card, countdown roundel)', screens.css:1 → 'Start and pause screens, the triple stripe and the shared full-screen menu ground.' Leave the .ui-finish__* block's own comment for the owner's C012 removal.
- Seen 2× (first 2026-11-15, last 2026-11-22)
- History:
  > 2026-11-15: not chosen by the plan audit: Real, but in-flight B08 (#30) rewrites the start screen and its CSS (screens.css, shared components), which would make these comments stale again or conflict. Fix them after #30 lands.
- Why tonight (plan audit): Comment-only, verified stale. components.css:52 names FINISHED (only dead finish-panel.ts uses it; live users are the start title and the results track name). :63 says 'finish stats'. :77 says 'finish card' (live users are the pause card and the countdown roundel). screens.css:1 lists the finish panel. Reword as suggested. For screens.css:1 use 'Pause card, the triple stripe and the full-screen menu ground (results).' No style change.

### C050 · ui · docs (CLAUDE.md, comments) · worth low · ~4 lines

- Files: `src/ui/results.css`, `src/ui/screens.css` (line 1)
- Claim:
  > Since B08, two stylesheet header comments contradict the code. results.css says the navy menu ground is shared with the start screen, but the S6 start screen is dirt and lives in title.css. screens.css:1 still lists the dead finish panel and leaves out the results ground it holds.
- Evidence:
  > src/ui/results.css:1-2 `/* Results screen (S5). Tokens only. The navy menu ground is shared with the start screen (screens.css); …`. In fact src/ui/screens.css:9 says `/* Full-screen menus (results) on a solid navy ground. The start screen (S6) is in title.css. */`, and src/ui/title.css:7 has `.ui-start { … background: var(--color-dirt); }`. screens.css:1 reads `/* Finish panel, pause card, the triple stripe and the shared full-screen menu ground. */`, while the file's live content is .ui-screen, the .ui-results ground, the stripe and the pause card. Only .ui-finish__* (:43-62, dead, C012) is finish panel.
- Suggested fix:
  > Comment-only edits. results.css:1-2 → `/* Results screen (S5). Tokens only. Its navy ground is in screens.css; rows and the roundel use .ui-value type. */`. This adds to C035, whose screens.css:1 wording should also mention the results ground.
- Seen 1× (first 2026-11-22, last 2026-11-22)
- Why tonight (plan audit): Comment-only: results.css:1-2 says the navy ground is shared with the start screen, but S6 is dirt in title.css (screens.css:9 already says so). Change it to 'Its navy ground is in screens.css; rows and the roundel use .ui-value type.' Coordinate with C035, which rewrites screens.css:1 once.

### C048 · ui · dead code · worth low · ~10 lines

- Files: `src/ui/layout.ts`, `src/ui/track-card.ts`, `src/ui/screen-change.ts`, `src/input/keyboard.ts`, `src/input/gamepad.ts` (line 9)
- Claim:
  > Ten UI/input exports are used only inside their own module: no other src file, test, harness or gates file imports them. The modules therefore look like they have a wider API than they do, as C007 found for render.
- Evidence:
  > A grep over the repo (excluding node_modules, journal and spikes) finds each name only in its defining file:
  > - src/ui/layout.ts:9 `export const DESKTOP_MIN` and :17 `export const DESKTOP_QUERY` (used only at :17 and :21)
  > - src/ui/track-card.ts:25 `export function outlinePath` (used only at :39)
  > - src/ui/screen-change.ts:14 `export const SCREEN_CHANGE_MS` (used only at :53)
  > - src/input/keyboard.ts:7 `export const KEY_MAP`, :21 `ACTION_KEY` and :27 `PAUSE_KEY` (used only at :51-86)
  > - src/input/gamepad.ts:7 `PAD_BUTTON`, :10 `STICK_DEAD_ZONE` and :26 `stickSteer` (used only at :28-61)
  > By contrast, hitTest, GO_HIDE_TICKS, GO_GONE_MS and GO_GLIDE_SECONDS are imported by tests and must stay exported.
- Suggested fix:
  > Drop the `export` keyword from those ten declarations and change nothing else. bestLapKey (best-laps.ts:6) is also only used locally, but its doc says B08/B11 reuse the key, so leave it. Skip outlinePath if the fitOutline finding is taken, since it reworks that function anyway.
- Seen 1× (first 2026-11-22, last 2026-11-22)
- Why tonight (plan audit): Verified by repo-wide grep (src, tests, harness, guardrails): DESKTOP_MIN, DESKTOP_QUERY, outlinePath, SCREEN_CHANGE_MS, KEY_MAP, ACTION_KEY, PAUSE_KEY, PAD_BUTTON, STICK_DEAD_ZONE and stickSteer appear only in their own files. Drop just the `export` keyword. The tsconfig has no declaration emit, so the emitted JS is unchanged. Nothing gates build through these names.

### C053 · seams · docs (CLAUDE.md, comments) · worth medium · ~4 lines

- Files: `CLAUDE.md`, `src/ui/types.ts` (line 1)
- Claim:
  > CLAUDE.md says the UI receives view models from `src/ui/types.ts`, but the game passes the UI the sim's own view types (`RaceView`, `CarView` from src/sim/types.ts). `HudState` in ui/types.ts is built inside race-ui.ts, not by the game loop, so the ui/types.ts header is also wrong. A feature night adding a HUD field would go looking for a game-side builder that doesn't exist.
- Evidence:
  > CLAUDE.md (How the game fits together): "the UI receives view models (`src/ui/types.ts`), never the sim." src/ui/types.ts:1 "// View models the UI renders. Built by the game loop from sim views; the UI never reads the sim." In fact src/game.ts:207 `ui.sync(view, r.curr);` with `const view = raceView(r.world)` (:202), and src/ui/race-ui.ts:44 `sync(view: RaceView, cars: readonly CarView[]): void;`, where RaceView/CarView come from '../sim/types.ts' (race-ui.ts:5). HudState is created and kept by race-ui itself: race-ui.ts:73 `let state: HudState | null = null;`. game.ts never imports src/ui/types.ts. Its only importers are hud.ts:11, race-ui.ts:14, start-screen.ts:13, track-card.ts:7 and start.stage.ts:7.
- Suggested fix:
  > Docs only. CLAUDE.md: "…the UI receives the sim's view types (`RaceView`, `CarView` from `src/sim/types.ts`), never the World; race-ui builds its own view models (`src/ui/types.ts`) from them." src/ui/types.ts:1: "View models the UI renders, built by race-ui.ts (and the game, for track cards) from sim views; the UI never reads the World."
- Seen 1× (first 2026-11-22, last 2026-11-22)
- Why tonight (plan audit): Today is Sunday, so CLAUDE.md may change. Verified: CLAUDE.md:33 says the UI receives view models from src/ui/types.ts, and types.ts:1 says the game loop builds them. In fact game.ts passes the sim's RaceView/CarView to ui.sync (race-ui.ts:44), and race-ui builds HudState itself (race-ui.ts:73, 122). Apply the suggested wording. It keeps the owner's intent (the UI never reads the World) and points the next HUD feature at race-ui. Docs only.

## Acceptance criteria

None (maintenance: behaviour must not change).

## What you'll see

Nothing should look or feel different. Tonight's changes are internal: the game stops rebuilding race data on frames where the simulation didn't step, some duplicated CSS is merged, and some comments and docs are corrected. Buttons, touch controls, the HUD, track cards and every screen should look and animate exactly as yesterday.

## How to play-test

1. Race a full lap on the phone: POS, LAP, TIME, BEST and the minimap update as before, and the countdown and GO! clear at the same moment.
2. Press and release GAS, BRAKE and the steer pads: same font, the same sink when pressed, the same rest fade and wake pop as before.
3. Set a new best lap: the NEW BEST chip slides down from under BEST, holds and slides back, with the same corners and padding.
4. Pause and resume a race: the pause card's buttons look and press as before.
5. On the start screen, tap and focus the track cards: the lift and focus ring look the same.
6. Finish a race: the results screen shows and fills in as before; RETRY and NEXT RACE work.
7. On desktop, if handy: arrow keys, Space, Esc and a gamepad still work, and the HUD switches to the desktop layout when the window is large.

## Limits

- At most 40 changed files and 1500 changed lines (journal excluded).
- Net `src/` lines (added − deleted) at most +150; tests don't count. Only a performance item may grow `src/`; every other item should delete code.
- Existing tests and screen stages (`src/**/*.stage.ts`) are append-only tonight: add new files, never edit or delete one.
- No `src/` file may import from `tests/`.
- `CLAUDE.md` may change only to stay accurate about the code.
- The gates check behaviour: exact bot laps and replays, every screen stage's DOM and computed styles, and every track's and car's scene geometry against `main`.

## Expected files

- `src/game.ts`
- `src/ui/components.css`
- `src/ui/touch-controls.css`
- `src/ui/hud.css`
- `src/ui/title.css`
- `src/ui/screens.css`
- `src/ui/results.css`
- `src/ui/layout.ts`
- `src/ui/track-card.ts`
- `src/ui/screen-change.ts`
- `src/input/keyboard.ts`
- `src/input/gamepad.ts`
- `CLAUDE.md`
- `src/ui/types.ts`

## Plan audit

Chose C028, C014, C034, C049, C035, C050, C048, C053.

Not chosen tonight (they stay on the list):

- C023: Real (nine deep imports, countdown.ts:5 included, and props.ts takes three constants the barrel doesn't export). But it re-points import paths across nine files plus the barrel for zero net lines, which is churn under the delete-only rule. It is better done together with a render/UI feature night that touches these imports anyway.
- C026: The race-ui line is already fixed (CLAUDE.md:39). What's left rewrites the owner's stated conventions (which folders register content, and the planned cars/features layout). That is the owner's call, not an unattended refactor's.
- C031: Same 844×390 literals as C041. Reading the token needs new imports and a constant, so src/ grows a little for a non-performance item, against tonight's delete-only rule.
- C041: Real rule violation (raw 844/390 in src/render). But the fix adds a tokens import, an exported constant and imports in three render files: net src/ growth for a non-performance item. Pair it with a render feature night.
- C047: The two copies don't share arithmetic: the HUD clamps w/d with 1e-6 and uses the clamped extent in ox/oz, while the card uses `|| 1` only in the scale term and the raw extent in ox/oz. A shared helper needs guard parameters or a wrapper to stay bit-identical, which saves little. track-card.ts is also very likely edited by draft #36 (B11 locked card), and its diff isn't available to check.
- C055: Needs an edit to src/ui/stages/start.stage.ts, and screen stages are append-only tonight.
- C025: Without C055 (blocked: it needs a stage edit) it would leave the bare 8 in start.stage.ts. A new helper replacing MINIMAP_STRIDE is net about zero lines. Do C025 and C055 together when stages may change.
- C004: Adds a helper and an import to src/sim to replace five one-line expressions on hot sim paths. src/ grows for no performance gain, and the risk isn't worth it.
- C008: The local helper adds about as many lines as it removes at two call sites. Cosmetic churn.
- C009: Types-only alias move: one export plus three imports to delete two local aliases. Net growth for no behaviour or safety gain.
- C010: Types-only spelling change with zero net lines. Cosmetic churn.
- C015: Grouping would keep computed styles the same, but it moves results-screen stripe rules into screens.css, coupling two stylesheets to save about four lines. Low value. Leave it for a night that works on the stripes anyway.
- C033: Moving msToTicks into format.ts needs a new import in countdown.ts: net about zero lines, for two copies of a one-line expression. Low value.
- C045: Real (all seven names appear only in their own files), but tonight's eight-item limit is full, and render exports matter less than the UI/input ones in C048. Safe to take next week.
- C046: Types-only: adds an interface to deduplicate one inline type used twice. Net about zero lines, cosmetic.
- C054: Real but trivial: one `export` keyword on stage-only fixture code that never ships. Tonight's eight-item limit is full. Safe to take next week.

Skipped (they touch files of open PRs):

- C043: open PR #35
- C044: open PR #35
- C056: open PR #35
