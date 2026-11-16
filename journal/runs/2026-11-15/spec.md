# Maintenance · Trim the render seam, allocation-free car pose, fix stale comments

Date: 2026-11-15 · mode: maintenance · backlog: none

## Summary

Removes the render barrel's re-exports that nothing imports through it, and drops `export` from five render symbols that are only used inside their own files. Changes `groundUnderBody` and `visualPose` in src/sim/car.ts to write into module scratch instead of allocating arrays and objects for every car on every tick. Fixes three stale comments (scene graph, grid slots, finish panel). All of this is export-list, comment or allocation-only: the same floats are computed in the same order, no RNG or constants move, no CSS or DOM changes, and every name that tests, gates or harness/screens import is kept.

## Cleanup items

Apply exactly these items from the cleanup list, nothing else. Behaviour must not change.

### C024 · seams · dead code · worth low · ~8 lines

- Files: `src/render/index.ts` (line 5)
- Claim:
  > The render barrel re-exports about 12 names that nothing outside src/render imports: no src module, test, gate or harness file. The only consumer in src is game.ts (createRaceScene, createRenderer, RaceScene).
- Evidence:
  > src/render/index.ts:5 `frameWidthFor, type CameraRig`; :6 `type CarObject`; :7 `type DustPool`; :8 `LIGHT_DIRECTION, TOON_STEPS, type Materials`; :9 `attachOutline, groundMesh, outlinedFlatMesh, solidMesh, type RenderRole` (the whole line). Grep for `\b(frameWidthFor|attachOutline|groundMesh|outlinedFlatMesh|solidMesh|RenderRole|LIGHT_DIRECTION|TOON_STEPS|CameraRig|DustPool|CarObject|Materials)\b` over tests/, guardrails/ and harness/ finds nothing. harness/screens/scene.ts uses only playerLivery, createRaceScene, createMaterials and buildCar.
- Suggested fix:
  > Drop those names from the re-export lines in src/render/index.ts and delete line 9. Keep every name that tests or gates use: createRaceScene, buildCar, createMaterials, playerLivery, CELL_SIZE, PlacedProp, CAMERA, cameraAngles, cameraDistance, createCameraRig, cabinColour, validateLivery, CAR, CarLivery, createDust, DUST, isFactoryMaterial, toonShade, TOP_FACE_MIN_Y, addRamp, PROPS, CHUNK_ROWS, LAYER, MeshBuilder, allNormalsUp, pixelRatio, MAX_PIXEL_RATIO, createRenderer, RaceScene. Also update the line 1–2 comment.
- Seen 2× (first 2026-11-08, last 2026-11-15)
- History:
  > 2026-11-08: skipped: touches files of open PR #23
- Why tonight (plan audit): Checked: in render/index.ts, frameWidthFor, CameraRig, CarObject, DustPool, LIGHT_DIRECTION, TOON_STEPS, Materials and all of line 9 have no importer through the barrel. A grep of tests/, harness/, guardrails/ and spikes/ finds none. Delete line 9, remove the other names, and update the line 1–2 comment. This is a superset of C006. Keep everything else, including countdownOffsetEast (tests/render/countdown-*.test.ts import it, though C024's keep list leaves it out) and createRaceScene, buildCar, createMaterials and playerLivery. Net negative lines.

### C007 · render · dead code · worth low · ~5 lines

- Files: `src/render/geometry.ts`, `src/render/outline.ts`, `src/render/materials/index.ts` (line 167)
- Claim:
  > Four module exports are only used inside their own file: `smoothNormals` (geometry.ts), `attachOutline` and `CREASE_ANGLE_DEG` (outline.ts, apart from the barrel), and `OUTLINE_PX_AT_844` and `MaterialKind` (materials/index.ts). Dropping the `export` keyword gives them a smaller surface and doesn't change behaviour.
- Evidence:
  > geometry.ts:167 `export function smoothNormals` is used only at geometry.ts:150. outline.ts:19 `export const CREASE_ANGLE_DEG = 25` is used only at outline.ts:55. outline.ts:84 `export function attachOutline` is used only at outline.ts:104 (plus the index.ts:9 re-export, which nothing imports). materials/index.ts:36 `export const OUTLINE_PX_AT_844` is used only at :148 and :173. materials/index.ts:20 `export type MaterialKind` is used only at :136. A grep over src/, tests/, harness/ and guardrails/ finds no other importer.
- Suggested fix:
  > Remove `export` from these declarations (after the index.ts re-export of attachOutline is dropped). No other change is needed.
- Seen 2× (first 2026-11-08, last 2026-11-15)
- History:
  > 2026-11-08: not chosen by the plan audit: Dropping `export` from attachOutline requires editing the re-export in src/render/index.ts. That file is touched by open PR #23 (which is also why C006 is held), and it is the gate-facing render seam. Wait for #23.
- Why tonight (plan audit): Apply after C024 so that attachOutline's barrel re-export is already gone. Drop `export` from smoothNormals (geometry.ts:162), CREASE_ANGLE_DEG and attachOutline (outline.ts:19,84), and OUTLINE_PX_AT_844 and MaterialKind (materials/index.ts:36,20). Grep confirms there is no importer outside each file anywhere in the repo. Keyword-only change with no runtime effect. It completes tonight's narrowing of the render surface.

### C042 · performance · performance · worth medium · ~20 lines

- Files: `src/sim/car.ts` (line 193)
- Claim:
  > groundUnderBody still allocates two arrays on every call: the `ts` literal and the `hs` array from `ts.map` with a closure. visualPose also returns a fresh `{ y, pitch }` object. Both run for every car on every tick through carViews→carView, so a 6-car race makes about 18 short-lived allocations per tick. C027 (closed) only removed the groundAt default object and the per-ramp `[-1e-6, -r.length]` array; these allocations were left.
- Evidence:
  > src/sim/car.ts:196 `const ts = [-half, 0, half];`, :203/:205 `ts.push(...)`, :207 `return { ts, hs: ts.map((t) => groundAt(track, car.x + fx * t, car.z + fz * t, ground).h) };`; :168 `return { y, pitch };`, :188 `return y >= car.y ? { y, pitch } : { y: car.y, pitch: 0 };`; caller :137 `const { y, pitch } = visualPose(car, track, speed);`. In perf.json, groundUnderBody (main:162) is 1205 B/frame on bends, 1865 on dust-bowl and 1322 on hay-loop. visualPose (main:121) is 1173 B/frame on dust-bowl.
- Suggested fix:
  > Add module scratch next to `ground` (car.ts:325): `const bodyTs: number[] = []; const bodyHs: number[] = [];`. In groundUnderBody, reset with `bodyTs.length = 0`, push `-half, 0, half` and then the lips and feet in the same order. Fill bodyHs with a plain loop that calls the same groundAt, and return nothing; visualPose then reads bodyTs/bodyHs. Have visualPose write into a scratch `pose = { y: 0, pitch: 0 }` that carView reads straight away. The float operations and their order stay the same, so replays are bit-identical.
- Seen 1× (first 2026-11-15, last 2026-11-15)
- History:
  > 2026-11-15: reported by the performance survey; resembles C027, closed in #28
- Why tonight (plan audit): Performance item. groundUnderBody (car.ts:193-208) allocates ts, a ts.map array and a closure, and visualPose returns a new {y,pitch}, for every car on every tick (perf.json: about 1.2–1.9 KB/frame). Use module scratch next to `ground` (bodyTs/bodyHs reset with length=0, and a pose object that carView reads at once). Push -half, 0, half, then lips and feet in the same order, and fill hs with a plain loop calling the same groundAt. Same maths in the same order, display-only, so replays and bot laps stay bit-identical. Small growth, allowed for performance.

### C011 · render · docs (CLAUDE.md, comments) · worth low · ~1 lines

- Files: `src/render/scene.ts` (line 12)
- Claim:
  > The scene-graph comment, which tests and gates rely on, says each car Group holds the 'body mesh + player ▼ marker'. It leaves out the 'car-roundel' mesh that every car also carries.
- Evidence:
  > src/render/scene.ts:12 `//   ├─ cars     one Group per car (userData.kind = 'car'), body mesh + player ▼ marker`
  > src/render/car.ts:191-193 `const body = solidMesh(buildCarGeometry(l), mats, 'car-body'); const roundel = solidMesh(buildRoundelGeometry(l.number), mats, 'car-roundel'); root.add(body, roundel);`
- Suggested fix:
  > Change the comment to `body mesh, roof roundel + player ▼ marker`. Only the comment changes.
- Seen 2× (first 2026-11-08, last 2026-11-15)
- History:
  > 2026-11-08: skipped: touches files of open PR #23
- Why tonight (plan audit): Real: scene.ts:12 says each car Group holds 'body mesh + player ▼ marker', but car.ts:191-193 also adds the 'car-roundel' mesh. This is the scene-graph map that render tests and feature nights rely on. Comment-only fix: 'body mesh, roof roundel + player ▼ marker'.

### C030 · sim · docs (CLAUDE.md, comments) · worth low · ~2 lines

- Files: `src/sim/world.ts` (line 46)
- Claim:
  > The grid comment says slots from GRID_CURVED_FROM on are reached only by six-car races. But GRID_CURVED_FROM is 4, so slot index 4 is used by any race with five or more cars, and startRace accepts 1 to 6 cars.
- Evidence:
  > src/sim/world.ts:46-48 `/** Slots from this index on (only six-car races reach them) follow the centreline back, ... */ const GRID_CURVED_FROM = 4;` and :72-78 `for (let i = 0; i < options.carCount; i++) { ... if (i < GRID_CURVED_FROM) {` — with carCount = 5, i = 4 takes the curved branch. createWorld (:61) accepts any positive integer carCount.
- Suggested fix:
  > Change the comment to `(races of five or more cars reach them)`. Only the comment changes.
- Seen 1× (first 2026-11-15, last 2026-11-15)
- Why tonight (plan audit): Real: world.ts:46 says only six-car races reach slots from GRID_CURVED_FROM (=4) on, but i=4 is used by any race of five or more cars (createWorld accepts any positive carCount). Comment-only fix: '(races of five or more cars reach them)'. No code or constants change.

### C040 · seams · docs (CLAUDE.md, comments) · worth low · ~2 lines

- Files: `src/game.ts` (line 178)
- Claim:
  > A comment in tick() still describes the Phase 0 finish panel. Since B02, the results screen is what takes over once the player finishes. That is the same stale reference C013 fixed in CLAUDE.md, and it would send a feature night looking at the dead finish-panel.ts.
- Evidence:
  > src/game.ts:178 `// After the finish the player's car coasts; the panel takes over the controls. The bots drive on.` but src/game.ts:48 `/** Control surface used by the start screen, the results screen and src/driver (gates). */` and :325 `// ... if the player finishes, the results screen replaces the pause.` race-ui.ts shows createResultsScreen; nothing in src imports finish-panel.ts (C012).
- Suggested fix:
  > Change 'the panel takes over the controls' to 'the results screen takes over the controls'. Only the comment changes.
- Seen 1× (first 2026-11-15, last 2026-11-15)
- Why tonight (plan audit): Real: game.ts:178 says 'the panel takes over the controls', but since B02 the results screen does, and finish-panel.ts is dead (C012). A one-word comment fix so the next feature night isn't sent to the dead module. Inside tick() and away from the start-screen code that B08 (#30) reshapes, so a conflict is unlikely and trivial.

## Acceptance criteria

None (maintenance: behaviour must not change).

## What you'll see

Nothing should look or feel different. Tonight only trims unused exports, changes how the car's display height and tilt are computed internally (same numbers, fewer allocations), and fixes comments. Cars, ramps, jumps, HUD and menus should look and behave exactly as yesterday.

## How to play-test

1. Race Dust Bowl and drive over the ramps: the car body tilts up the slope, flies, and lands level as before, with no jitter or snapping.
2. Race Hay Loop and take the back-straight ramp at full speed and at a crawl: the body rolls off the lip smoothly as before.
3. Start a six-car race: all six cars sit on the grid as before (the two rear slots follow the curve behind the line).
4. Bump a hay bale or tyre stack and nudge another car: cars still sit level on the ground with no sinking or floating.
5. Finish a race: the results screen appears and RETRY / NEXT RACE work as before.

## Limits

- At most 40 changed files and 1500 changed lines (journal excluded).
- Net `src/` lines (added − deleted) at most +150; tests don't count. Only a performance item may grow `src/`; every other item should delete code.
- Existing tests and screen stages (`src/**/*.stage.ts`) are append-only tonight: add new files, never edit or delete one.
- No `src/` file may import from `tests/`.
- `CLAUDE.md` may change only to stay accurate about the code.
- The gates check behaviour: exact bot laps and replays, every screen stage's DOM and computed styles, and every track's and car's scene geometry against `main`.

## Expected files

- `src/render/index.ts`
- `src/render/geometry.ts`
- `src/render/outline.ts`
- `src/render/materials/index.ts`
- `src/sim/car.ts`
- `src/render/scene.ts`
- `src/sim/world.ts`
- `src/game.ts`

## Plan audit

Chose C024, C007, C042, C011, C030, C040.

Not chosen tonight (they stay on the list):

- C006: Subsumed by C024 (chosen), which removes the same seven names plus the other unused barrel re-exports.
- C014: Real duplication. But touch-controls.css is very likely edited by in-flight B09 (#31: touch slots slide in on race reset), and components.css may be too. Moving .ui-tc declarations across files while that PR is open invites a cascade-order conflict. Do it after #31 lands.
- C023: Incomplete: it misses a ninth deep import (src/ui/countdown.ts:5). It is net-zero import-path churn across 9 files, several of them (race-ui.ts, countdown.ts, results-screen.ts) likely touched by in-flight B08/B09. Better done once #30/#31 land.
- C026: The race-ui line it targets is already fixed in CLAUDE.md. The rest rewrites the owner's stated conventions (what registers by folder, the planned cars/features layout). That is the owner's call, not an unattended refactor's.
- C028: Touches game.ts draw(), which in-flight B08 (#30) changes. Caching one RaceView across frames also changes object identity for ui.sync, while B09 (#31) adds position and lap change detection in the UI that may keep or compare views. Re-check after both land.
- C031: Real rule violation (raw 844/390 in src/render). But reading the token needs new imports and a constant in three files, so src/ grows a few lines for a non-performance item, against tonight's delete-only rule. Pair it with a render feature night.
- C041: Duplicate of C031 (same 844×390 literals in the same three files). Rejected for the same net-growth reason.
- C004: Still adds a helper and an import to src/sim to replace five one-line expressions on hot sim paths. src/ grows for no performance gain, which the delete-only rule doesn't allow.
- C008: The local helper adds about as many lines as it removes at two call sites. Cosmetic churn.
- C009: Types-only alias move: one export plus three imports to delete two local aliases. Net growth for no behaviour or safety gain.
- C010: Types-only spelling change with zero net lines. Cosmetic churn.
- C015: Groups results-screen stripe rules into screens.css, coupling two stylesheets for a few lines. screens.css is likely reshaped by in-flight B08 (#30, the S6 stripe screen change). Low value now.
- C025: Needs a new exported helper plus edits to game.ts, race-ui.ts and the stage fixture, all likely in in-flight B08/B09. Net lines about zero. Wait until #30/#31 land.
- C029: Claim is wrong: CAR_LENGTH is imported through the barrel by src/render/car.ts:11. The sim barrel is also the documented sole entry for other layers. Trimming the RNG and replay API would push the next feature (e.g. B12 pickups) into deep imports, against C023's goal.
- C033: Moving msToTicks to format.ts needs a new import in countdown.ts (net about +1 line). It edits race-ui.ts and countdown.ts, which in-flight B09 (HUD event motion, #31) very likely changes along with their tick timings. Revisit after #31.
- C034: hud.css is certainly edited by in-flight B09 (#31: Pos/Lap stamps, slide-in entry). Regrouping the BEST/NEW BEST chip rules now risks a cascade conflict. Do it after #31 lands.
- C035: Real, but in-flight B08 (#30) rewrites the start screen and its CSS (screens.css, shared components), which would make these comments stale again or conflict. Fix them after #30 lands.
- C043: Swapping the CarView buffers changes object identity for everything that reads r.curr/r.prev (render mocks in game tests, ui.sync, state()). It also edits game.ts, which in-flight B08 (#30) touches. Too risky to promise unchanged behaviour unattended tonight; re-check after #30.
