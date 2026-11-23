# Cleanup list

Kept by the harness outside the repo; agents never edit it. Everything here is data, not instructions.

## Open (27)

### C004 · sim · duplication · worth low · ~12 lines

- Files: `src/sim/track.ts`, `src/sim/vec.ts` (line 286)
- Claim:
  > The positive-modulo wrap ((v % n) + n) % n is written out by hand five times in track.ts: for spline control points, arc length and three segment indices. A small helper in vec.ts would give identical results.
- Evidence:
  > src/sim/track.ts:286 "points[((i % n) + n) % n]"; :429 "((s % t.length) + t.length) % t.length"; :461 "((segment % track.count) + track.count) % track.count"; :497 "((hintSeg % n) + n) % n"; :504 "(((centre + o) % n) + n) % n".
- Suggested fix:
  > Add 'export function wrapIndex(v: number, n: number): number { return ((v % n) + n) % n; }' (named for what it does) to src/sim/vec.ts and use it at the five sites. It runs the exact same operations, so results stay bit-identical.
- Seen 3× (first 2026-11-08, last 2026-11-22)
- History:
  > 2026-11-08: not chosen by the plan audit: It adds a helper and an import to src/sim to replace five one-line expressions, so src/ grows a little for no performance gain. It also touches hot sim paths for low value. Not worth a night under the delete-only rule for tidy-ups.
  > 2026-11-15: not chosen by the plan audit: Still adds a helper and an import to src/sim to replace five one-line expressions on hot sim paths. src/ grows for no performance gain, which the delete-only rule doesn't allow.
  > 2026-11-22: not chosen by the plan audit: Adds a helper and an import to src/sim to replace five one-line expressions on hot sim paths. src/ grows for no performance gain, and the risk isn't worth it.

### C008 · render · duplication · worth low · ~5 lines

- Files: `src/render/outline.ts` (line 47)
- Claim:
  > outline.ts builds an all-ink palette attribute twice with the same expression: once for the decal-stripped hull and once for the crease lines.
- Evidence:
  > src/render/outline.ts:47 `out.setAttribute('paletteIndex', paletteAttribute(new Uint8Array(count).fill(paletteIndex('ink'))));`
  > src/render/outline.ts:57 `crease.setAttribute('paletteIndex', paletteAttribute(new Uint8Array(n).fill(paletteIndex('ink'))));`
- Suggested fix:
  > Add a local `const inkAttribute = (count: number): BufferAttribute => paletteAttribute(new Uint8Array(count).fill(paletteIndex('ink')));` in outline.ts and call it at both sites. The bytes come out identical.
- Seen 3× (first 2026-11-08, last 2026-11-22)
- History:
  > 2026-11-08: not chosen by the plan audit: The local helper adds about as many lines as it saves (net ≥0) across two call sites. That is cosmetic churn, not a deletion.
  > 2026-11-15: not chosen by the plan audit: The local helper adds about as many lines as it removes at two call sites. Cosmetic churn.
  > 2026-11-22: not chosen by the plan audit: The local helper adds about as many lines as it removes at two call sites. Cosmetic churn.

### C009 · render · duplication · worth low · ~8 lines

- Files: `src/render/props.ts`, `src/render/track.ts`, `src/render/scene.ts` (line 12)
- Claim:
  > The 2D point type `[number, number]` is declared privately in two render modules and spelled out by hand a third time in scene.ts, even though shadow outlines pass from props.ts through scene.ts into track.ts.
- Evidence:
  > src/render/props.ts:12 `type Pt = [number, number];`
  > src/render/track.ts:29 `type Pt = [number, number];`
  > src/render/scene.ts:87 `const shadowOutlines: [number, number][][] = [];` (filled by placeShadow, which returns props' Pt[], and passed to buildGroundChunks, which takes track's `readonly Pt[][]`)
- Suggested fix:
  > Export one `type Pt2 = [number, number]` (e.g. next to `Vec3` in geometry.ts), import it in props.ts, track.ts and scene.ts, and delete the two local aliases. This is a types-only change.
- Seen 3× (first 2026-11-08, last 2026-11-22)
- History:
  > 2026-11-08: skipped: touches files of open PR #23
  > 2026-11-15: not chosen by the plan audit: Types-only alias move: one export plus three imports to delete two local aliases. Net growth for no behaviour or safety gain.
  > 2026-11-22: not chosen by the plan audit: Types-only alias move: one export plus three imports to delete two local aliases. Net growth for no behaviour or safety gain.

### C010 · render · simplify · worth low · ~4 lines

- Files: `src/render/car.ts` (line 68)
- Claim:
  > car.ts writes its geometry return type as `ReturnType<MeshBuilder['build']>` three times. That type is just `BufferGeometry`, which the other render modules name directly.
- Evidence:
  > src/render/car.ts:68 `export function buildCarGeometry(l: CarLivery): ReturnType<MeshBuilder['build']> {`
  > src/render/car.ts:129 `export function buildRoundelGeometry(number: number): ReturnType<MeshBuilder['build']> {`
  > src/render/car.ts:169 `export function buildMarkerGeometry(): ReturnType<MeshBuilder['build']> {`
  > geometry.ts:140 declares `build(): BufferGeometry`; track.ts:58 and outline.ts use `BufferGeometry` directly.
- Suggested fix:
  > Add `type BufferGeometry` to the existing `three` import in car.ts (line 9) and use it in the three signatures. This is a types-only change.
- Seen 3× (first 2026-11-08, last 2026-11-22)
- History:
  > 2026-11-08: not chosen by the plan audit: A types-only rename with zero net lines. Cosmetic churn.
  > 2026-11-15: not chosen by the plan audit: Types-only spelling change with zero net lines. Cosmetic churn.
  > 2026-11-22: not chosen by the plan audit: Types-only spelling change with zero net lines. Cosmetic churn.

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

### C015 · ui · duplication · worth low · ~16 lines

- Files: `src/ui/screens.css`, `src/ui/results.css` (line 115)
- Claim:
  > The full-width 4:2:1 stripe band (flex 1/4/2, width auto, height s3) is written twice, once for the pause card and once for the results screen. Only border-width differs.
- Evidence:
  > src/ui/screens.css:115-126:
  > .ui-pause__stripes .ui-stripe { flex: 1; width: auto; height: var(--space-s3); border-width: var(--outline-default) 0; }
  > .ui-pause__stripes .ui-stripe--red { flex: 4; }
  > .ui-pause__stripes .ui-stripe--mustard { flex: 2; }
  > 
  > src/ui/results.css:28-39:
  > .ui-results > .ui-stripes .ui-stripe { flex: 1; width: auto; height: var(--space-s3); border-width: 0 0 var(--outline-default); }
  > .ui-results > .ui-stripes .ui-stripe--red { flex: 4; }
  > .ui-results > .ui-stripes .ui-stripe--mustard { flex: 2; }
  > (results.css:20 even says "4:2:1 like the pause card's")
- Suggested fix:
  > In screens.css, group the shared declarations: `.ui-pause__stripes .ui-stripe, .ui-results > .ui-stripes .ui-stripe { flex: 1; width: auto; height: var(--space-s3); }`, do the same for the --red (flex 4) and --mustard (flex 2) rules, and keep the two border-width declarations in their own rules. Each selector in a group keeps its own specificity, and no other rule sets flex, width or height on these elements, so computed styles stay the same.
- Seen 3× (first 2026-11-08, last 2026-11-22)
- History:
  > 2026-11-08: not chosen by the plan audit: Grouping the selectors would keep computed styles the same (specificity is unchanged). But it moves results-screen layout into screens.css, coupling two stylesheets for a few lines saved. Low value. Leave it for a night that touches the stripe styles anyway.
  > 2026-11-15: not chosen by the plan audit: Groups results-screen stripe rules into screens.css, coupling two stylesheets for a few lines. screens.css is likely reshaped by in-flight B08 (#30, the S6 stripe screen change). Low value now.
  > 2026-11-22: not chosen by the plan audit: Grouping would keep computed styles the same, but it moves results-screen stripe rules into screens.css, coupling two stylesheets to save about four lines. Low value. Leave it for a night that works on the stripes anyway.

### C023 · seams · consistency · worth medium · ~18 lines

- Files: `src/sim/index.ts`, `src/render/props.ts`, `src/render/scene.ts`, `src/render/track.ts`, `src/ui/race-ui.ts`, `src/ui/format.ts`, `src/ui/results-screen.ts`, `src/input/index.ts` (line 5)
- Claim:
  > CLAUDE.md and the sim barrel both say other layers import the sim only through src/sim/index.ts, but 8 imports in render, UI and input go straight to sim/types.ts or sim/track.ts. render/props.ts imports three constants that the barrel doesn't export at all, so the next feature night will copy the deep-import pattern.
- Evidence:
  > src/sim/index.ts:1 "Render, UI, input and driver code import only from here." CLAUDE.md: "import the sim only via `src/sim/index.ts`". Deep imports: src/render/props.ts:9 `import { HAY_BALE_LENGTH, HAY_BALE_WIDTH, TYRE_STACK_RADIUS } from '../sim/track.ts'` (not exported by index.ts:5, which only has `trackLayout, validateTrack`); src/render/props.ts:8, src/render/scene.ts:16, src/render/track.ts:5, src/ui/race-ui.ts:5, src/ui/format.ts:2, src/ui/results-screen.ts:7, src/input/index.ts:3 all `from '../sim/types.ts'`. Meanwhile src/render/car.ts:11 and src/render/dust.ts:11 already use '../sim/index.ts'.
- Suggested fix:
  > Add `HAY_BALE_LENGTH, HAY_BALE_WIDTH, TYRE_STACK_RADIUS` to the `./track.ts` re-export in src/sim/index.ts:5. Then point those 8 import lines at '../sim/index.ts'. types.ts is already `export *`, so the names are identical. Type-only, no runtime change. race-ui.ts, results-screen.ts (PR #26) and input/index.ts (PR #25) are in open PRs, so do those after the PRs land.
- Seen 3× (first 2026-11-08, last 2026-11-22)
- History:
  > 2026-11-08: skipped: touches files of open PR #26, #25, #23
  > 2026-11-15: not chosen by the plan audit: Incomplete: it misses a ninth deep import (src/ui/countdown.ts:5). It is net-zero import-path churn across 9 files, several of them (race-ui.ts, countdown.ts, results-screen.ts) likely touched by in-flight B08/B09. Better done once #30/#31 land.
  > 2026-11-22: not chosen by the plan audit: Real (nine deep imports, countdown.ts:5 included, and props.ts takes three constants the barrel doesn't export). But it re-points import paths across nine files plus the barrel for zero net lines, which is churn under the delete-only rule. It is better done together wi…

### C025 · seams · duplication · worth low · ~8 lines

- Files: `src/ui/stages/stage.ts`, `src/game.ts`, `src/ui/race-ui.ts` (line 71)
- Claim:
  > The stage fixture hard-codes the game's minimap stride as a bare `8`, and its comment says "as in the game". If MINIMAP_STRIDE in game.ts changes, the staged HUD silently stops matching the real one.
- Evidence:
  > src/game.ts:30 `const MINIMAP_STRIDE = 8;` and src/game.ts:251 `world.track.layout.centre.filter((_, i) => i % MINIMAP_STRIDE === 0)`. src/ui/stages/stage.ts:66 `(every 8th centreline point, as in the game)` and :71 `outline: centre.filter((_, i) => i % 8 === 0)`.
- Suggested fix:
  > Move the stride into the UI as an exported helper, e.g. `minimapOutline(centre)` next to the minimap code (a UI module both files already import from, such as src/ui/race-ui.ts). Call it from game.ts:251 and stage.ts:71 and delete MINIMAP_STRIDE from game.ts. game.ts is in open PRs #25/#26, so do this after they land.
- Seen 3× (first 2026-11-08, last 2026-11-22)
- History:
  > 2026-11-08: skipped: touches files of open PR #26, #25, #23
  > 2026-11-15: not chosen by the plan audit: Needs a new exported helper plus edits to game.ts, race-ui.ts and the stage fixture, all likely in in-flight B08/B09. Net lines about zero. Wait until #30/#31 land.
  > 2026-11-22: not chosen by the plan audit: Without C055 (blocked: it needs a stage edit) it would leave the bare 8 in start.stage.ts. A new helper replacing MINIMAP_STRIDE is net about zero lines. Do C025 and C055 together when stages may change.

### C026 · seams · docs (CLAUDE.md, comments) · worth medium · ~6 lines

- Files: `CLAUDE.md`
- Claim:
  > Three CLAUDE.md statements about the seams don't match the code: race-ui's job (it drives results and pause screens, not the finish panel), registration by folder (cars and screens don't register by folder), and the content layout (there are no cars or features folders).
- Evidence:
  > CLAUDE.md: "`src/ui/race-ui.ts` turns each frame's `RaceView` into HUD, countdown and finish-panel updates." vs src/ui/race-ui.ts:1 "(HUD, countdown, touch controls, results and pause screens)": it imports createResultsScreen/createPauseScreen and never finish-panel.ts. CLAUDE.md: "tracks, cars and screens register by being in their folder (`import.meta.glob`)" vs cars being a hand-edited `ROSTER` array (src/content/drivers.ts:12), and screens imported directly (src/game.ts:24-25). The only globs are src/content/tracks.ts:6 and src/ui/stages/registry.ts:6. Layout: "src/content  tracks (src/content/tracks/*.json), cars, features" vs src/content containing only tracks/, tracks.ts and drivers.ts.
- Suggested fix:
  > Change the race-ui line to "…into HUD, countdown, results-screen and pause-screen updates". Change the registration line to "tracks and screen stages register by being in their folder…", and note that the driver roster (liveries) is data in src/content/drivers.ts. Change the layout line to "tracks (src/content/tracks/*.json), driver roster (drivers.ts)".
- Seen 3× (first 2026-11-08, last 2026-11-22)
- History:
  > 2026-11-08: not chosen by the plan audit: It overlaps C013 (chosen) on the race-ui line. Its other edits rewrite the owner's conventions: what registers by folder, and the planned cars/features content layout. Whether to drop or keep those as intent is the owner's call, not an unattended refactor's.
  > 2026-11-15: not chosen by the plan audit: The race-ui line it targets is already fixed in CLAUDE.md. The rest rewrites the owner's stated conventions (what registers by folder, the planned cars/features layout). That is the owner's call, not an unattended refactor's.
  > 2026-11-22: not chosen by the plan audit: The race-ui line is already fixed (CLAUDE.md:39). What's left rewrites the owner's stated conventions (which folders register content, and the planned cars/features layout). That is the owner's call, not an unattended refactor's.

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

### C031 · render · consistency · worth medium · ~18 lines

- Files: `src/render/scene.ts`, `src/render/camera.ts`, `src/render/materials/index.ts` (line 140)
- Claim:
  > The render layer writes the 844×390 reference frame by hand 9 times across three files, though the token `tokens.safeArea.frame` holds it and `src/ui/layout.ts` already reads it. This breaks the CLAUDE.md rule against raw pixel sizes in src/. A later feature night could copy the literal or change one copy and miss the others (for example the outline width's /844 divisor vs the initial resolution uniform).
- Evidence:
  > src/render/scene.ts:140-141 `let viewW = 844; let viewH = 390;`
  > src/render/scene.ts:213-214 `new Vector2(844, 390); applyViewport(initial.x || 844, initial.y || 390);`
  > src/render/camera.ts:85 `export function createCameraRig(width = 844, height = 390): CameraRig {`
  > src/render/materials/index.ts:147 `const resolution = { value: new Vector2(844, 390) };`
  > src/render/materials/index.ts:173 `widthPx.value = (OUTLINE_PX_AT_844 * Math.max(1, bufferWidth)) / 844;`
  > The token already exists: guardrails/design/tokens.json:68 `"safeArea": { "frame": [844, 390], ... }`, and src/ui/layout.ts:6 reads it: `const [frameW, frameH] = tokens.safeArea.frame;`
- Suggested fix:
  > In each of the three files, import `tokens` from '@tokens' (car.ts already does this) and write `const [FRAME_W, FRAME_H] = tokens.safeArea.frame;`, or export it once from camera.ts and import it in scene.ts and materials. Then replace the 844/390 literals at the lines listed. The values are identical, so the camera, outline width and scene don't change.
- Seen 2× (first 2026-11-15, last 2026-11-22)
- History:
  > 2026-11-15: not chosen by the plan audit: Real rule violation (raw 844/390 in src/render). But reading the token needs new imports and a constant in three files, so src/ grows a few lines for a non-performance item, against tonight's delete-only rule. Pair it with a render feature night.
  > 2026-11-22: not chosen by the plan audit: Same 844×390 literals as C041. Reading the token needs new imports and a constant, so src/ grows a little for a non-performance item, against tonight's delete-only rule.

### C033 · ui · duplication · worth low · ~6 lines

- Files: `src/ui/format.ts`, `src/ui/race-ui.ts`, `src/ui/countdown.ts` (line 21)
- Claim:
  > Converting ms to whole sim ticks (rounded up) is written out twice: once as a private helper in race-ui.ts and once inline in countdown.ts. The inverse, `ticksToMs`, already lives in format.ts.
- Evidence:
  > src/ui/race-ui.ts:21 `const msToTicks = (ms: number): number => Math.ceil((ms * TICK_HZ) / 1000);`
  > src/ui/countdown.ts:17 `export const GO_GONE_TICKS = Math.ceil((GO_GONE_MS * TICK_HZ) / 1000);`
  > src/ui/format.ts:5 `export const ticksToMs = (ticks: number): number => (ticks * 1000) / TICK_HZ;`
- Suggested fix:
  > Export `msToTicks` from format.ts next to `ticksToMs`, with the same expression. Import it in race-ui.ts (delete the local copy) and use `msToTicks(GO_GONE_MS)` at countdown.ts:17. The arithmetic is the same, so the values are the same.
- Seen 2× (first 2026-11-15, last 2026-11-22)
- History:
  > 2026-11-15: not chosen by the plan audit: Moving msToTicks to format.ts needs a new import in countdown.ts (net about +1 line). It edits race-ui.ts and countdown.ts, which in-flight B09 (HUD event motion, #31) very likely changes along with their tick timings. Revisit after #31.
  > 2026-11-22: not chosen by the plan audit: Moving msToTicks into format.ts needs a new import in countdown.ts: net about zero lines, for two copies of a one-line expression. Low value.

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

### C041 · duplication · duplication · worth medium · ~14 lines

- Files: `src/render/scene.ts`, `src/render/camera.ts`, `src/render/materials/index.ts` (line 140)
- Claim:
  > The 844×390 reference frame is hard-coded as bare numbers 7 times across three render modules, though tokens.safeArea.frame already holds it and src/ui/layout.ts reads it from there. These are also raw pixel sizes in src/, which CLAUDE.md forbids, so the next render night is likely to copy the pattern.
- Evidence:
  > src/render/scene.ts:140 `let viewW = 844;` :141 `let viewH = 390;` :213 `new Vector2(844, 390)` :214 `applyViewport(initial.x || 844, initial.y || 390);`
  > src/render/camera.ts:85 `export function createCameraRig(width = 844, height = 390): CameraRig {`
  > src/render/materials/index.ts:147 `const resolution = { value: new Vector2(844, 390) };` :173 `widthPx.value = (OUTLINE_PX_AT_844 * Math.max(1, bufferWidth)) / 844;`
  > The single source: guardrails/generated/tokens.ts:219-222 `"safeArea": { "frame": [844, 390]`, read in src/ui/layout.ts:6 `const [frameW, frameH] = tokens.safeArea.frame;`. src/render/car.ts:10 already imports `tokens` from '@tokens', so render may use it.
- Suggested fix:
  > Read the frame from tokens once: export `export const [FRAME_W, FRAME_H] = tokens.safeArea.frame;` (or a `REFERENCE_FRAME` pair) from src/render/camera.ts, which gets a `tokens` import. Use it for createCameraRig's defaults, then import it in scene.ts (lines 140, 141, 213, 214) and materials/index.ts (lines 147, 173). The numbers are the same, so camera, outline width and scene stay bit-identical. Keep the OUTLINE_PX_AT_844 name and its comments as they are.
- Seen 2× (first 2026-11-15, last 2026-11-22)
- History:
  > 2026-11-15: not chosen by the plan audit: Duplicate of C031 (same 844×390 literals in the same three files). Rejected for the same net-growth reason.
  > 2026-11-22: not chosen by the plan audit: Real rule violation (raw 844/390 in src/render). But the fix adds a tokens import, an exported constant and imports in three render files: net src/ growth for a non-performance item. Pair it with a render feature night.

### C043 · performance · performance · worth low · ~14 lines

- Files: `src/game.ts`, `src/sim/world.ts` (line 184)
- Claim:
  > tick() replaces r.curr with a new array from carViews(r.world) on every sim tick: one `map` array plus one new CarView per car. Nothing keeps those views beyond the next tick. draw() copies them into r.drawn, ui.sync reads x/z only, and state() deep-copies. A two-buffer swap would remove all of these per-tick allocations.
- Evidence:
  > src/game.ts:183-184 `r.prev = r.curr; r.curr = carViews(r.world);`; src/sim/world.ts:121-123 `return world.cars.map((car) => carView(car, world.track));`; src/sim/car.ts:138-148 builds a new 9-field object per car. Readers: game.ts:189 interpolate (Object.assign into r.drawn), :193 ui.sync (race-ui.ts:139-146 copies x/z), :301 state() `race.curr.map((c) => ({ ...c }))`. perf.json: hay-loop carView (main:98) 780 B/frame; `map ((native))` 1127 B/frame bends, 1111 hay-loop.
- Suggested fix:
  > Add `carViewsInto(world, out: CarView[])` in src/sim/world.ts, which Object.assigns carView(car, track) into out[i], or writes the fields in place to avoid even the temporary. In startRace, create prev and curr as two distinct arrays (`views` and `views.map((v) => ({ ...v }))`). In tick(), swap them (`const t = r.prev; r.prev = r.curr; r.curr = t; carViewsInto(r.world, r.curr);`). The values are the same, so drawing and the UI are unchanged. game.ts is likely touched by open PR #30 (B08), so apply it after that lands.
- Seen 2× (first 2026-11-15, last 2026-11-22)
- History:
  > 2026-11-15: not chosen by the plan audit: Swapping the CarView buffers changes object identity for everything that reads r.curr/r.prev (render mocks in game tests, ui.sync, state()). It also edits game.ts, which in-flight B08 (#30) touches. Too risky to promise unchanged behaviour unattended tonight; re-check …
  > 2026-11-22: skipped: touches files of open PR #35

### C044 · sim · dead code · worth low · ~8 lines

- Files: `src/sim/pickups.ts`, `src/sim/car.ts` (line 10)
- Claim:
  > Four B12 tuning constants are exported but nothing in src/, tests/, harness/, guardrails/ or spikes/ imports them. Each is used only inside its own module, so the `export` keyword makes the sim's internal surface look wider than it is.
- Evidence:
  > src/sim/pickups.ts:10 `export const PICKUP_RADIUS = 2.5;` (used only at :48), :12 `export const PICKUP_RESPAWN_TICKS = 300;` (only :50), :14 `export const BOOST_TICKS = 90;` (only :38); src/sim/car.ts:40 `export const BOOST_TOP_SPEED = 32;` (only :42-43 in BOOSTED). A repo-wide grep for `\b(PICKUP_RADIUS|PICKUP_RESPAWN_TICKS|BOOST_TICKS|BOOST_TOP_SPEED)\b` outside node_modules finds only those lines plus the header comments pickups.ts:4-6 and car.ts:271. None of them is re-exported by src/sim/index.ts.
- Suggested fix:
  > Drop the `export` keyword from the four declarations and leave the values and comments alone. This changes only the module surface, not runtime values. Open PR #35 (B13) edits both pickups.ts and car.ts, and its new tests (tests/sim/rival-boost.test.ts, rival-helpers.ts) may import these constants. Apply this only after #35 lands, and only to the names that are still unimported after a fresh grep.
- Seen 1× (first 2026-11-22, last 2026-11-22)
- History:
  > 2026-11-22: skipped: touches files of open PR #35

### C045 · render · dead code · worth low · ~9 lines

- Files: `src/render/geometry.ts`, `src/render/outline.ts`, `src/render/car.ts`, `src/render/camera.ts`, `src/render/materials/index.ts`, `src/render/props.ts` (line 17)
- Claim:
  > Once C024 trimmed the barrel, seven render exports are only used inside their own files. Nothing in src/, tests/, harness/ or guardrails/ imports them: `Paint` and `ProfilePoint` (geometry.ts), `RenderRole` (outline.ts), `buildMarkerGeometry` (car.ts), `frameWidthFor` (camera.ts), `LIGHT_DIRECTION` and `TOON_STEPS` (materials/index.ts). props.ts writes out the `ProfilePoint` shape by hand rather than using it.
- Evidence:
  > src/render/geometry.ts:17 `export type Paint = ...`, :20 `export type ProfilePoint = readonly [number, number];`
  > src/render/outline.ts:21 `export type RenderRole = ...`
  > src/render/car.ts:169 `export function buildMarkerGeometry()` (only caller is car.ts:196)
  > src/render/camera.ts:38 `export function frameWidthFor` (callers are camera.ts:47 and :53)
  > src/render/materials/index.ts:23 `export const LIGHT_DIRECTION`, :26 `export const TOON_STEPS` (used at :44-47, :95-96, :153)
  > A repo-wide grep for these names, excluding node_modules, finds them only in their own files. tests/content/drivers.test.ts imports buildCarGeometry and buildRoundelGeometry, but not buildMarkerGeometry.
  > src/render/props.ts:48 `const profile: [number, number][] = [[0, 0]];` is a hand-written ProfilePoint list passed to b.lathe.
- Suggested fix:
  > Remove the `export` keyword from those seven declarations. If ProfilePoint should stay public, import it in props.ts and type line 48 as `const profile: ProfilePoint[]` instead. Both changes are types or visibility only, and the emitted geometry stays the same.
- Seen 1× (first 2026-11-22, last 2026-11-22)
- History:
  > 2026-11-22: not chosen by the plan audit: Real (all seven names appear only in their own files), but tonight's eight-item limit is full, and render exports matter less than the UI/input ones in C048. Safe to take next week.

### C046 · render · duplication · worth low · ~4 lines

- Files: `src/render/props.ts` (line 40)
- Claim:
  > props.ts spells out the same object type twice, once for every prop kind (`PROPS`) and once for the pickup box (`PICKUP`). scene.ts uses both the same way (`.add(new MeshBuilder()).build()` plus `.shadow`), so a change to one could miss the other.
- Evidence:
  > src/render/props.ts:40 `export const PROPS: Record<PropKind, { add(b: MeshBuilder): MeshBuilder; shadow: ShadowShape }> = {`
  > src/render/props.ts:115 `export const PICKUP: { add(b: MeshBuilder): MeshBuilder; shadow: ShadowShape } = {`
  > scene.ts:106 `PROPS[p.kind].add(new MeshBuilder()).build()` / :107 `PROPS[p.kind].shadow`; scene.ts:132 `PICKUP.add(new MeshBuilder()).build()` / :133 `PICKUP.shadow`
- Suggested fix:
  > Declare `interface PropModel { add(b: MeshBuilder): MeshBuilder; shadow: ShadowShape }` once next to ShadowShape in props.ts. Type the two constants as `Record<PropKind, PropModel>` and `PropModel`. This is a types-only change.
- Seen 1× (first 2026-11-22, last 2026-11-22)
- History:
  > 2026-11-22: not chosen by the plan audit: Types-only: adds an interface to deduplicate one inline type used twice. Net about zero lines, cosmetic.

### C047 · ui · duplication · worth medium · ~30 lines

- Files: `src/ui/hud.ts`, `src/ui/track-card.ts` (line 132)
- Claim:
  > The minimap and the track card each have their own copy of the code that fits a closed [x, z] outline into an SVG box. Both copies find the bounds, scale to fit with padding, centre the result, round to 0.1 units with a private `r1` and build an `M…L…Z` path. The next outline drawing (B11's locked card, or a results thumbnail) would make a third copy.
- Evidence:
  > src/ui/hud.ts:40 `const r1 = (v: number): number => Math.round(v * 10) / 10;` = src/ui/track-card.ts:22 `const r1 = (n: number): number => Math.round(n * 10) / 10;`.
  > hud.ts:135-146: `const xs = outline.map((p) => p[0]); const zs = outline.map((p) => p[1]); const minX = Math.min(...xs); … scale = Math.min((MAP_W - 2 * MAP_PAD) / w, (MAP_H - 2 * MAP_PAD) / d); ox = (MAP_W - w * scale) / 2 - minX * scale; oz = (MAP_H - d * scale) / 2 - minZ * scale; const pts = outline.map(([x, z]) => `${r1(x * scale + ox)} ${r1(z * scale + oz)}`); const path = pts.length ? `M${pts.join('L')}Z` : '';`
  > track-card.ts:26-33: `if (outline.length === 0) return ''; const xs = outline.map((p) => p[0]); const zs = …; const scale = Math.min((THUMB_W - THUMB_PAD * 2) / (maxX - minX || 1), (THUMB_H - THUMB_PAD * 2) / (maxZ - minZ || 1)); const ox = (THUMB_W - (maxX - minX) * scale) / 2 - minX * scale; … return `M${outline.map(([x, z]) => `${r1(x * scale + ox)} ${r1(z * scale + oz)}`).join('L')}Z`;`
  > The only difference is the guard for a zero-extent axis: `Math.max(…, 1e-6)` in the HUD and `|| 1` on the card.
- Suggested fix:
  > In track-card.ts, export `fitOutline(outline, w, h, pad, minExtent)`. It returns `{ scale, ox, oz, d }`, where d is the path string, and it takes the extent guard as a parameter so each caller keeps its exact arithmetic. The HUD passes its 1e-6 floor; the card keeps its own `|| 1` guard via a wrapper. Alternatively, put it in a small new src/ui/outline.ts with the single `r1`. Then rebuild() uses scale/ox/oz for the dots, and outlinePath becomes a one-line call. Real tracks give the same numbers and strings. Check open PR #36 (B11 locked card) first, since it likely edits track-card.ts.
- Seen 1× (first 2026-11-22, last 2026-11-22)
- History:
  > 2026-11-22: not chosen by the plan audit: The two copies don't share arithmetic: the HUD clamps w/d with 1e-6 and uses the clamped extent in ox/oz, while the card uses `|| 1` only in the scale term and the raw extent in ox/oz. A shared helper needs guard parameters or a wrapper to stay bit-identical, which sav…

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

### C050 · ui · docs (CLAUDE.md, comments) · worth low · ~4 lines

- Files: `src/ui/results.css`, `src/ui/screens.css` (line 1)
- Claim:
  > Since B08, two stylesheet header comments contradict the code. results.css says the navy menu ground is shared with the start screen, but the S6 start screen is dirt and lives in title.css. screens.css:1 still lists the dead finish panel and leaves out the results ground it holds.
- Evidence:
  > src/ui/results.css:1-2 `/* Results screen (S5). Tokens only. The navy menu ground is shared with the start screen (screens.css); …`. In fact src/ui/screens.css:9 says `/* Full-screen menus (results) on a solid navy ground. The start screen (S6) is in title.css. */`, and src/ui/title.css:7 has `.ui-start { … background: var(--color-dirt); }`. screens.css:1 reads `/* Finish panel, pause card, the triple stripe and the shared full-screen menu ground. */`, while the file's live content is .ui-screen, the .ui-results ground, the stripe and the pause card. Only .ui-finish__* (:43-62, dead, C012) is finish panel.
- Suggested fix:
  > Comment-only edits. results.css:1-2 → `/* Results screen (S5). Tokens only. Its navy ground is in screens.css; rows and the roundel use .ui-value type. */`. This adds to C035, whose screens.css:1 wording should also mention the results ground.
- Seen 1× (first 2026-11-22, last 2026-11-22)

### C053 · seams · docs (CLAUDE.md, comments) · worth medium · ~4 lines

- Files: `CLAUDE.md`, `src/ui/types.ts` (line 1)
- Claim:
  > CLAUDE.md says the UI receives view models from `src/ui/types.ts`, but the game passes the UI the sim's own view types (`RaceView`, `CarView` from src/sim/types.ts). `HudState` in ui/types.ts is built inside race-ui.ts, not by the game loop, so the ui/types.ts header is also wrong. A feature night adding a HUD field would go looking for a game-side builder that doesn't exist.
- Evidence:
  > CLAUDE.md (How the game fits together): "the UI receives view models (`src/ui/types.ts`), never the sim." src/ui/types.ts:1 "// View models the UI renders. Built by the game loop from sim views; the UI never reads the sim." In fact src/game.ts:207 `ui.sync(view, r.curr);` with `const view = raceView(r.world)` (:202), and src/ui/race-ui.ts:44 `sync(view: RaceView, cars: readonly CarView[]): void;`, where RaceView/CarView come from '../sim/types.ts' (race-ui.ts:5). HudState is created and kept by race-ui itself: race-ui.ts:73 `let state: HudState | null = null;`. game.ts never imports src/ui/types.ts. Its only importers are hud.ts:11, race-ui.ts:14, start-screen.ts:13, track-card.ts:7 and start.stage.ts:7.
- Suggested fix:
  > Docs only. CLAUDE.md: "…the UI receives the sim's view types (`RaceView`, `CarView` from `src/sim/types.ts`), never the World; race-ui builds its own view models (`src/ui/types.ts`) from them." src/ui/types.ts:1: "View models the UI renders, built by race-ui.ts (and the game, for track cards) from sim views; the UI never reads the World."
- Seen 1× (first 2026-11-22, last 2026-11-22)

### C054 · seams · dead code · worth low · ~1 lines

- Files: `src/ui/stages/stage.ts` (line 76)
- Claim:
  > `carOnTrack` in the stage fixtures is exported, but only stage.ts itself uses it. No stage, test or harness file imports it.
- Evidence:
  > src/ui/stages/stage.ts:76 `export function carOnTrack(centre: readonly [number, number][], at: number): CarView {`. Its only use is stage.ts:128 `o.at.map((a) => carOnTrack(centre, a)),`. A repo-wide grep (excluding node_modules) for `carOnTrack` finds only these two lines.
- Suggested fix:
  > Drop the `export` keyword on carOnTrack (stage.ts:76). Nothing else changes, and stages are never shipped.
- Seen 1× (first 2026-11-22, last 2026-11-22)
- History:
  > 2026-11-22: not chosen by the plan audit: Real but trivial: one `export` keyword on stage-only fixture code that never ships. Tonight's eight-item limit is full. Safe to take next week.

### C055 · duplication · duplication · worth medium · ~12 lines

- Files: `src/ui/stages/start.stage.ts`, `src/game.ts`, `src/ui/stages/stage.ts` (line 12)
- Claim:
  > The start-screen stage rebuilds the game's track-card list with a copy of the game's mapping, and writes the minimap stride as a bare 8. B08 added this copy after C025 was filed, so C025 now misses two of the four stride sites (game.ts:151 and start.stage.ts:12).
- Evidence:
  > src/game.ts:151 `tracks: TRACKS.map((t) => ({ id: t.id, name: t.name, outline: trackLayout(t).centre.filter((_, i) => i % MINIMAP_STRIDE === 0) })),`
  > src/ui/stages/start.stage.ts:12 `return TRACKS.map((t) => ({ id: t.id, name: t.name, outline: trackLayout(t).centre.filter((_, i) => i % 8 === 0) }));`
  > The other stride copies are src/game.ts:293 `world.track.layout.centre.filter((_, i) => i % MINIMAP_STRIDE === 0)` and src/ui/stages/stage.ts:72 `centre.filter((_, i) => i % 8 === 0)`. The constant is src/game.ts:33 `const MINIMAP_STRIDE = 8;`.
- Suggested fix:
  > Combine this with C025. Export `minimapOutline(centre)` (stride 8) from a UI module that game.ts and the stages already import, for example src/ui/track-card.ts. Add `trackCardViews(tracks)` next to it, returning `{ id, name, outline: minimapOutline(trackLayout(t).centre) }`. Call it from game.ts:151 and start.stage.ts:12, and use minimapOutline at game.ts:293 and stage.ts:72. Then delete MINIMAP_STRIDE. The values are the same, so the DOM is the same.
- Seen 1× (first 2026-11-22, last 2026-11-22)
- History:
  > 2026-11-22: not chosen by the plan audit: Needs an edit to src/ui/stages/start.stage.ts, and screen stages are append-only tonight.

### C056 · performance · performance · worth low · ~24 lines

- Files: `src/sim/track.ts`, `src/sim/car.ts` (line 491)
- Claim:
  > Every car makes a new TrackPos object on every sim tick. stepCars sets `car.pos = trackPosition(...)`, and trackPosition gets its result from nearestLocal→projectOnSegment, which returns a fresh object literal. When a car is off the track, nearestGlobal (called from trackPosition and from surfaceAt) allocates one or two more. The old car.pos is thrown away right after: nothing keeps a reference to it between ticks.
- Evidence:
  > src/sim/track.ts:491 `return { seg: i, s: ..., lateral, distance: Math.hypot(x - px, z - pz) };` (projectOnSegment, reached from nearestLocal:538 and nearestGlobal:505). src/sim/car.ts:290 `car.pos = trackPosition(track, car.x, car.z, car.pos);`, car.ts:291 surfaceAt → track.ts:566 `nearestGlobal(track, x, z).distance` (a TrackPos used for one field). Readers of car.pos all read it within the tick: world.ts:89/128/140 (`.s`), bot.ts:95-131 (`.seg`, `.s`, `.lateral`). No match in src/ for structuredClone or spreads of car/pos, and src/driver does not read pos. perf.json: the sim's other hot functions are allocation-free in source (scratch `hit`, `seg`, `ground`, `nearby`), so this is one of the few real per-tick allocation sites left on the stepCars path, at 6 cars × 60 Hz.
- Suggested fix:
  > Add an optional `out: TrackPos` parameter to projectOnSegment/nearestLocal/trackPosition, defaulting to a fresh object so the existing tests in tests/sim/track.test.ts:250-287 are unaffected. In trackPosition, write the local result into `prev` only after `prev.seg` has been read. Use one module scratch TrackPos for the global candidate and copy it into `out` only if it wins. In surfaceAt, use a scratch for the nearestGlobal distance check. Every number stays the same. Wait for in-flight PR #35, which also edits src/sim/car.ts.
- Seen 1× (first 2026-11-22, last 2026-11-22)
- History:
  > 2026-11-22: skipped: touches files of open PR #35


## Needs the owner (test pins internals) (13)

### C012 · ui · needs owner: test pins internals · worth high · ~90 lines

- Files: `src/ui/finish-panel.ts`, `src/ui/screens.css`, `tests/ui/screens.test.ts`, `tests/ui/no-inline-colour.test.ts` (line 25)
- Claim:
  > src/ui/finish-panel.ts is dead code: no file in src/ imports it since the results screen (B02) replaced it, and only two existing tests import createFinishPanel. Its CSS (.ui-finish__card, .ui-finish__stats, .ui-finish__stat in screens.css) is dead with it, because nothing else uses those classes.
- Evidence:
  > Grep for `finish-panel` in src/ finds nothing that imports it. Imports exist only in tests/ui/screens.test.ts:3 `import { createFinishPanel } from '../../src/ui/finish-panel.ts';` and tests/ui/no-inline-colour.test.ts:6 (the same import). race-ui.ts:10 uses createResultsScreen. The classes `ui-finish__card` (finish-panel.ts:31), `ui-finish__stats` (:34) and `ui-finish__stat` (:35-36) appear only in that file, so screens.css:62-81 (`.ui-finish__card {…} .ui-finish__stats {…} .ui-finish__stat {…}`) is dead CSS. The bare `ui-finish` class must stay: results-screen.ts:64 sets it, and tests/ui/results-screen.test.ts:34 and tests/ui/race-ui.test.ts:16 check it.
- Suggested fix:
  > Owner: delete src/ui/finish-panel.ts and the .ui-finish__* rules at screens.css:62-81. Retarget or delete the createFinishPanel cases in tests/ui/screens.test.ts and tests/ui/no-inline-colour.test.ts (no-inline-colour could render createResultsScreen instead). Keep the `ui-finish` class on the results overlay.
- Seen 1× (first 2026-11-08, last 2026-11-08)

### C017 · tests · needs owner: test pins internals · worth medium · ~4 lines

- Files: `src/ui/results-screen.ts`, `tests/ui/race-ui.test.ts`, `tests/ui/results-screen.test.ts` (line 64)
- Claim:
  > The results screen's root still carries the legacy `ui-finish` class only so that old finish-panel tests keep finding it. No CSS rule targets `.ui-finish` on its own. Tests should find the results screen by role or text, not by this leftover class.
- Evidence:
  > src/ui/results-screen.ts:64 `'ui-results ui-finish',`. In src, `ui-finish` otherwise appears only as `.ui-finish__*` in finish-panel.ts and screens.css:63-81. Pinned by tests/ui/race-ui.test.ts:16 `finish: () => q('.ui-finish')` (test title :47 'shows the finish panel once') and tests/ui/results-screen.test.ts:34 `expect(el.classList.contains('ui-finish')).toBe(true)`.
- Suggested fix:
  > Owner: make race-ui.test.ts look the screen up through `[role="table"][aria-label="Results"]` (or `.ui-results`) and drop the assertion at results-screen.test.ts:34. Then drop ` ui-finish` from results-screen.ts:64, together with the finish-panel removal.
- Seen 3× (first 2026-11-08, last 2026-11-22)

### C019 · tests · needs owner: test pins internals · worth medium · ~90 lines

- Files: `tests/game/pause.test.ts`, `tests/game/pause-review.test.ts`, `tests/game/pause-results.test.ts`, `tests/game/results-drivers.test.ts`, `tests/game/start-race-invalid-count.test.ts`, `tests/game/helpers.ts` (line 57)
- Claim:
  > Game tests copy the same harness again and again: a hand-driven requestAnimationFrame stub with runFrames, setup(), esc(), the render mock, and the 'bot drives car 0 of a twin world' input recorder. The recorder is already shared as twinPlayerInputs in tests/game/helpers.ts. The render mocks also still stub `playerLivery`, which game.ts no longer imports.
- Evidence:
  > runFrames is identical in pause.test.ts:41-48, pause-review.test.ts:39-46 and pause-results.test.ts:36-43, along with the rAF/cAF stubs at :27-30, :25-28 and :24-27. esc() is copied at pause.test.ts:57 and pause-results.test.ts:70. The twin-world recorders pause-results.test.ts:57-68 `winningInputs()` and results-drivers.test.ts:23-33 `playerInputs()` duplicate tests/game/helpers.ts:9-20 `twinPlayerInputs(trackId, seed, carCount, maxTicks)` (same loop, 2 cars, 60*60*10 ticks). Stale mock entries: `playerLivery: (n) => …` at pause.test.ts:14, pause-review.test.ts:13, pause-results.test.ts:12 and start-race-invalid-count.test.ts:10, while tests/content/drivers.test.ts:80 asserts game.ts does not mention playerLivery.
- Suggested fix:
  > Owner: move runFrames, the rAF stub install and esc() into tests/game/helpers.ts (or a new tests/game/frames.ts). Replace winningInputs/playerInputs with twinPlayerInputs(TRACK, SEED, 2, 36000), and drop the playerLivery mock lines. vi.mock must stay in each file because it is hoisted per module.
- Seen 3× (first 2026-11-08, last 2026-11-22)

### C020 · tests · needs owner: test pins internals · worth medium · ~35 lines

- Files: `tests/ui/race-ui.test.ts`, `tests/ui/results-screen.test.ts`, `tests/ui/results-review.test.ts`, `tests/ui/results-drivers.test.ts`, `tests/game/pause.test.ts`, `tests/ui/helpers.ts` (line 8)
- Claim:
  > The RacerView/RaceView/CarView fixture builders are copied word for word into five test files, while tests/ui/helpers.ts already holds the shared hudState/outline fixtures and tests/render/helpers.ts:21 has an equivalent carView(). If RacerView gains a required field, a feature night has to touch five append-only files it cannot edit.
- Evidence:
  > `const racer = (over: Partial<RacerView> = {}): RacerView => ({ lapsCompleted: 0, lap: 1, lapTicks: [], finishTick: null, position: 1, ...over });` appears in race-ui.test.ts:8, results-screen.test.ts:9, results-review.test.ts:9, results-drivers.test.ts:9 and pause.test.ts:68. `const finished = (racers) => ({ phase: 'finished', countdown: 0, raceTick: 8000, racers })` appears in results-screen.test.ts:10, results-review.test.ts:10 and results-drivers.test.ts:10. `const car = (x) => ({ x, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, slip: 0, surface: 'dirt', airborne: false })` appears in race-ui.test.ts:7, results-screen.test.ts:8 and pause.test.ts:67, and duplicates tests/render/helpers.ts:21-23 carView().
- Suggested fix:
  > Owner: export racerView(over), finishedView(racers) and carAt(x) from tests/ui/helpers.ts, reusing render/helpers carView for the latter. Then replace the local copies with imports.
- Seen 3× (first 2026-11-08, last 2026-11-22)

### C021 · tests · needs owner: test pins internals · worth medium · ~8 lines

- Files: `tests/content/drivers.test.ts`, `src/game.ts` (line 76)
- Claim:
  > drivers.test.ts AC5 reads src/game.ts as text and uses a regex to require one exact import statement. It pins how game.ts imports the roster, not what the game does. Any behaviour-preserving refactor of game.ts (splitting it, importing via a content index, aliasing) fails this test.
- Evidence:
  > tests/content/drivers.test.ts:76-80: `const game = readFileSync('src/game.ts', 'utf8'); expect(game).toMatch(/import \{[^}]*\braceDrivers\b[^}]*\} from '\.\/content\/drivers\.ts'/); expect(game).not.toMatch(/LIVERIES/); expect(game).not.toMatch(/\bbody:\s*'/); expect(game).not.toMatch(/playerLivery/);`. The behaviour it guards (game races use roster liveries) is already covered through the DOM by tests/game/results-drivers.test.ts:48-54 and tests/game/six-car-grid.test.ts.
- Suggested fix:
  > Owner: replace the source-text assertions with a behavioural one, such as the started game's state/RaceView driver names or the createRaceScene mock receiving raceDrivers(n) liveries. Or drop them, since results-drivers and six-car-grid already cover it.
- Seen 3× (first 2026-11-08, last 2026-11-22)

### C022 · tests · needs owner: test pins internals · worth low · ~25 lines

- Files: `tests/sim/ramp-pose.test.ts`, `tests/sim/ramp-lip-roll.test.ts`, `tests/sim/helpers.ts` (line 13)
- Claim:
  > The body-into-ground probe clipDepth(world, view) is implemented twice, with slightly different sampling (41 samples vs 81), in two sim tests. tests/sim/helpers.ts is the shared home for such geometry probes (propOverlap, circleOverlap and others).
- Evidence:
  > tests/sim/ramp-pose.test.ts:13-24 `function clipDepth(world: World, v: CarView): number { const fx = Math.sin(v.heading); const fz = -Math.cos(v.heading); … for (let i = 0; i < SAMPLES; i++) { const t = -1 + (2 * i) / (SAMPLES - 1); …groundAt(world.track, v.x + fx * along, v.z + fz * along).h - body` versus tests/sim/ramp-lip-roll.test.ts:16-26, the same body with `for (let i = 0; i <= 80; i++) { const t = -1 + i / 40;`. Both also redeclare `const HALF = CAR_LENGTH / 2` (:9 and :13).
- Suggested fix:
  > Owner: export clipDepth(world, view, samples = 81) from tests/sim/helpers.ts and import it in both files (ramp-pose passes 41).
- Seen 3× (first 2026-11-08, last 2026-11-22)

### C032 · ui · needs owner: test pins internals · worth medium · ~10 lines

- Files: `src/ui/countdown.ts`, `tests/render/countdown-framing.test.ts` (line 20)
- Claim:
  > `countdownOnScreen` and `countdownClearance` in countdown.ts are dead in src/. game.ts now passes `COUNTDOWN_HALF_WIDTH` and `countdownFraming(view)` to the scene. The only importer of these two functions is tests/render/countdown-framing.test.ts, so removing them needs the owner.
- Evidence:
  > src/ui/countdown.ts:20 `export function countdownOnScreen(view…)` and :47 `export const countdownClearance = (view…) => (countdownOnScreen(view) ? COUNTDOWN_HALF_WIDTH : 0);`. The src uses are src/game.ts:24 `import { COUNTDOWN_HALF_WIDTH, countdownFraming } from './ui/countdown.ts'`, :191 `r.scene.update(r.drawn, dt, COUNTDOWN_HALF_WIDTH, countdownFraming(view))` and :322 (same call). A grep over the repo finds `countdownOnScreen` and `countdownClearance` only in countdown.ts itself and in tests/render/countdown-framing.test.ts:15, :37, :54-56 and :75-76. The `countdownClearance: 5.5` in render/camera.ts:32 is an unrelated CAMERA field.
- Suggested fix:
  > Owner: retarget the countdown-framing.test.ts cases to `countdownFraming` / `COUNTDOWN_HALF_WIDTH`, or inline the predicate in the test. Then delete `countdownOnScreen` and `countdownClearance` (countdown.ts:19-22 and :46-47). GO_GONE_TICKS stays, because countdownFraming uses it.
- Seen 1× (first 2026-11-15, last 2026-11-15)

### C036 · tests · needs owner: test pins internals · worth medium · ~90 lines

- Files: `tests/content/hay-loop-tight.test.ts`, `tests/content/hay-loop-corners.test.ts`, `tests/content/hay-loop.test.ts` (line 23)
- Claim:
  > Three Hay Loop tests each copy the same centreline-analysis code: the wrapped `pt(i)`, segment `heading(i)` and lap length. Two of them also copy the CORNER_RADIUS/SPAN corner-run detector almost line for line. B11 (Pine Ridge, next in the backlog) will need the same analysis and can't import any of it, so it will make a fourth copy.
- Evidence:
  > tests/content/hay-loop-tight.test.ts:23-57 `function corners()` and tests/content/hay-loop-corners.test.ts:17-53 `lap()` + `corners()` both declare `const CORNER_RADIUS = 80; const SPAN = 5;` and contain the same lines: `const pt = (i: number): [number, number] => c[((i % n) + n) % n] as [number, number];`, `heading(i) = headingOf(bx - ax, bz - az)`, the `length += Math.hypot(...)` loop, `const curve = (i) => wrapAngle(heading(i + SPAN) - heading(i - SPAN)) / (2 * SPAN * step);`, `const way = ...`, `while (way(start) !== 0 && start < n) start++;` and the run loop. The only difference is that tight also tracks minRadius. tests/content/hay-loop.test.ts:12-21 `geometry()` repeats the pt/heading pair a third time.
- Suggested fix:
  > Owner: add a shared tests/content/centreline.ts with `centreline(trackId)` (returning n, pt, heading, step and length) and `cornerRuns(trackId, { radius, span })` (returning turn and minRadius per run). Import them in the three Hay Loop tests. A night can create that new file now so B11 imports it instead of copying, but changing the three existing files needs the owner.
- Seen 2× (first 2026-11-15, last 2026-11-22)

### C037 · tests · needs owner: test pins internals · worth low · ~30 lines

- Files: `tests/content/hay-loop-bales.test.ts`, `tests/sim/helpers.ts` (line 9)
- Claim:
  > hay-loop-bales.test.ts writes its own oriented-box corner function and SAT overlap test. tests/sim/helpers.ts already exports both as boxCorners and polygonOverlap, which the other prop-overlap tests use.
- Evidence:
  > tests/content/hay-loop-bales.test.ts:9-23 `function corners(b: Box)` builds the 4 corners from fx=sin h, fz=-cos h and HAY_BALE_LENGTH/2, HAY_BALE_WIDTH/2. :25-36 `function overlap(a, b)` is a hand-rolled separating-axis check. tests/sim/helpers.ts:291 `export function boxCorners(x, z, heading, halfLength, halfWidth)` (doc: 'Corners of an oriented box (hay bale)') and :261 `export function polygonOverlap(a, b)` ('Overlap depth of two convex polygons by the separating axis theorem').
- Suggested fix:
  > Owner: replace corners/overlap with `polygonOverlap(boxCorners(a.x, a.z, a.heading, HAY_BALE_LENGTH / 2, HAY_BALE_WIDTH / 2), boxCorners(b.x, …)) > 1e-6` imported from ../sim/helpers.ts.
- Seen 2× (first 2026-11-15, last 2026-11-22)

### C038 · tests · needs owner: test pins internals · worth low · ~40 lines

- Files: `tests/ui/new-best-chip.test.ts`, `tests/game/best-lap-persistence.test.ts`, `tests/game/best-lap-storage-blocked.test.ts`, `tests/game/helpers.ts` (line 27)
- Claim:
  > The three B07 best-lap tests copy their helpers. The m:ss.cc formatter `fmt` appears three times, `visibleNewBest` twice, and new-best-chip's `twinRace` repeats the loop of the shared twinPlayerInputs. All three also keep the stale `playerLivery` render mock. None of these files is among C019's six.
- Evidence:
  > fmt, identical body `const cs = Math.round(t / 10); return `${Math.floor(cs / 6000)}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${…}``, at tests/ui/new-best-chip.test.ts:42-45, tests/game/best-lap-persistence.test.ts:37-40 and tests/game/best-lap-storage-blocked.test.ts:29-32. tests/ui/results-screen.test.ts:4 already imports formatTime from src/ui/format.ts:14 instead. visibleNewBest is identical at new-best-chip.test.ts:85-93 and best-lap-persistence.test.ts:57-65. new-best-chip.test.ts:27-38 `twinRace()` repeats tests/game/helpers.ts:9-20 twinPlayerInputs line for line, adding only `lapTicks`. Stale mock `playerLivery: (n) => …` at new-best-chip.test.ts:14, best-lap-persistence.test.ts:13, best-lap-storage-blocked.test.ts:11 and gamepad-menu.test.ts:13.
- Suggested fix:
  > Owner: export `lapTime(ms)` (or reuse formatTime) and `visibleNewBest(root)` from tests/game/helpers.ts. Replace twinRace's loop with twinPlayerInputs(TRACK, SEED, 2, 36000) and read the lap ticks from a replayed world or the game. Drop the playerLivery mock lines in these files, together with C019's.
- Seen 2× (first 2026-11-15, last 2026-11-22)

### C039 · tests · needs owner: test pins internals · worth low · ~40 lines

- Files: `tests/ui/keycap-legend.test.ts`, `tests/ui/keycap-legend-keys.test.ts`, `tests/ui/keycap-legend-slide-state.test.ts` (line 19)
- Claim:
  > Three keycap-legend tests each write their own matchMedia stub. Two of them are the same media-query evaluator, one with the device fixed and one taking it as a parameter. No shared stub exists in tests/ui/helpers.ts, so the next desktop or reduced-motion UI test (B08/B09 are in flight) will copy it a fourth time.
- Evidence:
  > tests/ui/keycap-legend.test.ts:19-35 `function useDevice(d: Device)` and tests/ui/keycap-legend-keys.test.ts:11-27 `function useDesktop()` share the same body: `query.split(/\s+and\s+/).every((part) => { const m = /\(\s*([\w-]+)\s*:\s*([\w.]+?)(px)?\s*\)/.exec(part); … })`, then `vi.stubGlobal('matchMedia', (query) => { const list = new EventTarget() as MediaQueryList; Object.assign(list, { media: query, matches: …, onchange: null, addListener() {}, removeListener() {} }); return list; })`. keycap-legend-keys only fixes d = 1440×900 fine. tests/ui/keycap-legend-slide-state.test.ts:11-17 is a third stub with `matches: !query.includes('coarse')`.
- Suggested fix:
  > Owner: move `useDevice(d)` and a `DESKTOP` constant into a shared test helper and call `useDevice(DESKTOP)` from all three files. A night may create the helper as a new file (e.g. tests/ui/media.ts) so new tests import it, but changing the three existing files needs the owner.
- Seen 2× (first 2026-11-15, last 2026-11-22)

### C051 · tests · needs owner: test pins internals · worth medium · ~6 lines

- Files: `tests/sim/replay.test.ts`, `src/sim/replay.ts`, `tests/sim/pickup-replay.test.ts` (line 63)
- Claim:
  > The frozen-format test 'ignores the reserved action bit when decoding' still expects bit 2 to decode as nothing. To keep it passing, decodeInputs sets `action` as a non-enumerable property. Any spread, structuredClone or JSON.stringify of a decoded frame drops the action without a sound, which is a trap for the next night that copies or records replay inputs (for example B13 rival boosts).
- Evidence:
  > tests/sim/replay.test.ts:63-66 `it('ignores the reserved action bit when decoding', () => { const text = bytesToBase64(Uint8Array.from([0x00, 0b111])); expect(decodeInputs(text, 1, 1)).toEqual([[{ steer: 0, throttle: true, brake: true }]]); });`. Since B12, bit 2 is a live flag: src/sim/replay.ts:6 'bit2 action (fire the power-up…)' and :26 `const FLAG_ACTION = 4;`. The workaround is src/sim/replay.ts:96-98: `// Non-enumerable, so frames still deep-equal what pre-pickup decoders gave (bit 2 used to be ignored) while input.action reads true and stepWorld fires.` `if ((flags & FLAG_ACTION) !== 0) Object.defineProperty(input, 'action', { value: true, writable: true, configurable: true });`. It is the only defineProperty in src/. The behaviour is already pinned through the public value by tests/sim/pickup-replay.test.ts:21-34, which checks `decoded?.[0]?.action` is true and that 'action' is not in frames with bit 2 clear.
- Suggested fix:
  > Owner: change replay.test.ts:65 to expect `{ steer: 0, throttle: true, brake: true, action: true }` (or delete the case, since pickup-replay AC6 covers it). Then replace the defineProperty at replay.ts:96-98 with a plain `input.action = true` and drop the comment. stepWorld reads `input.action` the same way, so replays and bot laps don't change.
- Seen 1× (first 2026-11-22, last 2026-11-22)

### C052 · tests · needs owner: test pins internals · worth medium · ~170 lines

- Files: `tests/ui/keycap-style.test.ts`, `tests/ui/track-card-press.test.ts`, `tests/ui/results-fit-phone.test.ts`, `tests/ui/keycap-legend-resize.test.ts`, `tests/ui/desktop-start-screen.test.ts`, `tests/ui/desktop-hud-scale.test.ts`, `tests/ui/countdown-clear-browser.test.ts`, `tests/ui/keycap-legend-slide.test.ts`, `tests/ui/desktop-hud.test.ts`, `tests/game/best-lap-e2e.test.ts`, `tests/ui/hud-motion.ts` (line 27)
- Claim:
  > Ten browser test files each copy the same ~17-line beforeAll/afterAll harness: mkdtemp, a vite build of harness/screens, serve, launch Chromium, then close and rm. tests/ui/hud-motion.ts already exports exactly this as a generic `setup()`, but its name and comment tie it to B09, so the next browser-test night will make an eleventh copy. Every file, and each of the 8 hud-motion files, also runs its own full vite build: about 18 builds per `pnpm test`.
- Evidence:
  > tests/ui/keycap-style.test.ts:27-38 `beforeAll(async () => { dist = mkdtempSync(join(tmpdir(), 'keycap-style-')); await build({ configFile: 'harness/screens/vite.config.ts', logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } }); ({ origin, server } = await serve(dist)); browser = await launch(); }, 120_000); afterAll(async () => { await browser?.close(); server?.close(); rmSync(dist, { recursive: true, force: true }); });`, and the same in tests/ui/track-card-press.test.ts:33-44. The identical build call appears at results-fit-phone:24, keycap-legend-resize:32, desktop-start-screen:63, desktop-hud-scale:42, countdown-clear-browser:39, keycap-legend-slide:55, desktop-hud:72 and best-lap-e2e:284. The shared copy is tests/ui/hud-motion.ts:42-65 `export function setup(): { browser(): Browser; origin(): string }` (same body, with prefix 'hud-motion-'), used only by the 8 hud-motion-*.test.ts files.
- Suggested fix:
  > A night may add a new tests/ui/browser-build.ts (or tests/browser.ts) exporting hud-motion's `setup()` under a neutral name, so new browser tests import it instead of copying. Owner: point hud-motion.ts and the ten files at it and delete their local beforeAll/afterAll blocks. A vitest globalSetup that builds once would also remove the ~18 repeated builds, but the vitest config is owner-only.
- Seen 1× (first 2026-11-22, last 2026-11-22)


## In an open maintenance PR (0)

None.


## Stale (no longer reproduced) (3)

### C003 · sim · simplify · worth low · ~2 lines

- Files: `src/sim/track.ts` (line 224)
- Claim:
  > validateTrack copies every prop row twice. The map at line 224 already builds a fresh object literal per row, then line 240 spreads each one into another new object. The second copy does nothing.

### C006 · render · dead code · worth medium · ~6 lines

- Files: `src/render/index.ts` (line 5)
- Claim:
  > The render barrel re-exports seven names that nothing imports through it: `frameWidthFor`, `LIGHT_DIRECTION`, `TOON_STEPS`, `attachOutline`, `groundMesh`, `outlinedFlatMesh` and `type RenderRole`. This makes the public seam look wider than it is.

### C029 · sim · dead code · worth low · ~8 lines

- Files: `src/sim/index.ts` (line 3)
- Claim:
  > The sim barrel re-exports nine names that nothing imports through it: `nextRange`, `nextInt`, `type Rng`, `encodeInputs`, `decodeInputs`, `replayInputs`, `type Replay`, `type WorldOptions` and `CAR_LENGTH`. As with the render barrel (C006/C024), this makes the public seam look wider than it is.


## Closed: merged, do not report again (13)

### C007 · render · dead code · worth low · ~5 lines

- Files: `src/render/geometry.ts`, `src/render/outline.ts`, `src/render/materials/index.ts` (line 167)
- Claim:
  > Four module exports are only used inside their own file: `smoothNormals` (geometry.ts), `attachOutline` and `CREASE_ANGLE_DEG` (outline.ts, apart from the barrel), and `OUTLINE_PX_AT_844` and `MaterialKind` (materials/index.ts). Dropping the `export` keyword gives them a smaller surface and doesn't change behaviour.

### C011 · render · docs (CLAUDE.md, comments) · worth low · ~1 lines

- Files: `src/render/scene.ts` (line 12)
- Claim:
  > The scene-graph comment, which tests and gates rely on, says each car Group holds the 'body mesh + player ▼ marker'. It leaves out the 'car-roundel' mesh that every car also carries.

### C024 · seams · dead code · worth low · ~8 lines

- Files: `src/render/index.ts` (line 5)
- Claim:
  > The render barrel re-exports about 12 names that nothing outside src/render imports: no src module, test, gate or harness file. The only consumer in src is game.ts (createRaceScene, createRenderer, RaceScene).

### C030 · sim · docs (CLAUDE.md, comments) · worth low · ~2 lines

- Files: `src/sim/world.ts` (line 46)
- Claim:
  > The grid comment says slots from GRID_CURVED_FROM on are reached only by six-car races. But GRID_CURVED_FROM is 4, so slot index 4 is used by any race with five or more cars, and startRace accepts 1 to 6 cars.

### C040 · seams · docs (CLAUDE.md, comments) · worth low · ~2 lines

- Files: `src/game.ts` (line 178)
- Claim:
  > A comment in tick() still describes the Phase 0 finish panel. Since B02, the results screen is what takes over once the player finishes. That is the same stale reference C013 fixed in CLAUDE.md, and it would send a feature night looking at the dead finish-panel.ts.

### C042 · performance · performance · worth medium · ~20 lines

- Files: `src/sim/car.ts` (line 193)
- Claim:
  > groundUnderBody still allocates two arrays on every call: the `ts` literal and the `hs` array from `ts.map` with a closure. visualPose also returns a fresh `{ y, pitch }` object. Both run for every car on every tick through carViews→carView, so a 6-car race makes about 18 short-lived allocations per tick. C027 (closed) only removed the groundAt default object and the per-ramp `[-1e-6, -r.length]` array; these allocations were left.

### C001 · sim · docs (CLAUDE.md, comments) · worth medium · ~4 lines

- Files: `src/sim/car.ts` (line 76)
- Claim:
  > The maxStepUp doc comment says applying it on every track is 'fine while no replay baselines exist (before G3)'. Replay baselines now exist and G3 enforces them, so the comment is stale. It also suggests a global physics change is still acceptable, which is a trap: CLAUDE.md requires new physics to be opt-in per track, car or surface.

### C002 · sim · docs (CLAUDE.md, comments) · worth low · ~4 lines

- Files: `src/sim/types.ts`, `src/sim/bot.ts` (line 15)
- Claim:
  > Two sim comments describe the game as it was earlier. TrackData.width says the width is '8.4 per UI_RULES §9', but registered tracks use 11. The bot.ts header calls the bot 'the race opponent' and 'its line', but player races now run five bots (one per roster AI driver).

### C005 · render · dead code · worth low · ~5 lines

- Files: `src/render/geometry.ts` (line 134)
- Claim:
  > `MeshBuilder.triangleCount` is never read. Nothing in src/, tests/, harness/ or guardrails/ uses it; the only `triangleCount` matches are an unrelated journal field in harness/lib/journal.ts.

### C013 · ui · docs (CLAUDE.md, comments) · worth low · ~2 lines

- Files: `CLAUDE.md` (line 39)
- Claim:
  > CLAUDE.md says race-ui.ts produces 'finish-panel updates', but race-ui.ts shows the results screen and never uses the finish panel. A feature night that reads this would look in the dead finish-panel.ts instead of results-screen.ts.

### C016 · content · docs (CLAUDE.md, comments) · worth low · ~4 lines

- Files: `src/content/drivers.ts` (line 21)
- Claim:
  > The JSDoc for raceDrivers sits above PLAYER_CAR_COUNT. That makes two stacked doc comments: editors and hovers attach both to the constant, and raceDrivers ends up with no doc at all. The next night that edits the roster could misread which comment describes what.

### C018 · tests · tests (new tests only) · worth medium · ~45 lines

- Files: `tests/ui/no-inline-colour-overlays.test.ts`
- Claim:
  > The 'no colour in any inline style or SVG paint attribute' rule is never checked for the pause screen. The results screen gets only a weaker check: 4 paint attributes instead of 7, and it does not allow hatch url() fills. Both screens use icons and the hatch, which is exactly where a stray fill/stroke attribute would slip in.

### C027 · performance · performance · worth high · ~10 lines

- Files: `src/sim/car.ts` (line 192)
- Claim:
  > groundUnderBody (called through carView→visualPose for every car on every tick via carViews) calls groundAt without the module's scratch `ground`. groundAt's default parameter therefore allocates a new Ground object for every sample. The function also builds a throwaway `[-1e-6, -r.length]` array for every ramp. groundAt is the top allocation site in dust-bowl and the third in bends.

