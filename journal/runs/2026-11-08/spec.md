# Maintenance · Fewer per-tick allocations in car pose; dead code and stale docs

Date: 2026-11-08 · mode: maintenance · backlog: none

## Summary

groundUnderBody reuses the sim's existing Ground scratch and drops a throwaway array per ramp. groundAt rewrites every field of `out` before returning, and only `.h` is read straight away, so pose numbers are bit-identical. Two small dead bits are deleted: an unused getter and a redundant copy of each prop row in validateTrack. Stale comments are fixed in the sim, the driver roster and CLAUDE.md's race-ui line, and a new test covers inline colour on the pause and results screens. No simulation maths, constants, RNG calls, geometry or CSS change.

## Cleanup items

Apply exactly these items from the cleanup list, nothing else. Behaviour must not change.

### C027 · performance · performance · worth high · ~10 lines

- Files: `src/sim/car.ts` (line 192)
- Claim:
  > groundUnderBody (called through carView→visualPose for every car on every tick via carViews) calls groundAt without the module's scratch `ground`. groundAt's default parameter therefore allocates a new Ground object for every sample. The function also builds a throwaway `[-1e-6, -r.length]` array for every ramp. groundAt is the top allocation site in dust-bowl and the third in bends.
- Evidence:
  > src/sim/car.ts:206 `return { ts, hs: ts.map((t) => groundAt(track, car.x + fx * t, car.z + fz * t).h) };` takes the default at src/sim/track.ts:555 `out: Ground = { h: 0, gx: 0, gz: 0, ramp: null }`. The hot path already passes scratch: car.ts:370 and 580 `groundAt(track, car.x, car.z, ground)`, with the scratch at car.ts:324 `const ground: Ground = ...`. car.ts:201 `for (const a of [-1e-6, -r.length]) {` runs once per ramp per call. perf.json allocation per frame: groundAt 2118 B (bends) and 3975 B (dust-bowl, the top site); groundUnderBody 1168 B and 2295 B; visualPose 1197 B (dust-bowl). Only `.h` is read, straight away, and groundUnderBody never runs inside stepCars' use of `ground`, so the numbers can't change.
- Suggested fix:
  > In groundUnderBody, pass the existing scratch: `groundAt(track, car.x + fx * t, car.z + fz * t, ground).h`. Replace the literal-array loop with two explicit pushes in the same order: compute t for a = -1e-6, then for a = -r.length, keeping the `Math.abs(t) < half` check. Same ts order and same hs values, so replays, bot laps and car poses are identical.
- Seen 1× (first 2026-11-08, last 2026-11-08)
- Why tonight (plan audit): Real: car.ts:206 calls groundAt with no `out`, so each sample allocates through the default at track.ts:555, and car.ts:201 builds `[-1e-6, -r.length]` for every ramp. groundAt resets h/gx/gz/ramp before writing, and carViews (world.ts:122) never runs while moveWithCollisions/updateVertical hold `ground`, so reusing the scratch is safe. Push the two t values in the same order (-1e-6, then -r.length) with the same |t| < half check. Same ts order and hs values. Per-tick allocation win, small growth.

### C003 · sim · simplify · worth low · ~2 lines

- Files: `src/sim/track.ts` (line 224)
- Claim:
  > validateTrack copies every prop row twice. The map at line 224 already builds a fresh object literal per row, then line 240 spreads each one into another new object. The second copy does nothing.
- Evidence:
  > src/sim/track.ts:224: "return { kind: k, side, from, to, spacing, offset } as const;" and src/sim/track.ts:240: "propRows: propRows.map((r) => ({ ...r }))," — ramps (line 197/239) and props (line 230/241) are returned directly without a second copy.
- Suggested fix:
  > Drop the 'as const' at line 224 (side is already narrowed to 'left' | 'right' by the check at line 217) and return 'propRows' directly at line 240, matching ramps and props. Same values, one allocation fewer per row.
- Seen 1× (first 2026-11-08, last 2026-11-08)
- Why tonight (plan audit): Real: track.ts:224 already builds a fresh object per row, and :240 spreads each one again. `fail` returns never, so `side` is already narrowed to 'left'|'right' without `as const`. Return `propRows` directly, as ramps and props are. Same values, deletes code. Must pass typecheck.

### C005 · render · dead code · worth low · ~5 lines

- Files: `src/render/geometry.ts` (line 134)
- Claim:
  > `MeshBuilder.triangleCount` is never read. Nothing in src/, tests/, harness/ or guardrails/ uses it; the only `triangleCount` matches are an unrelated journal field in harness/lib/journal.ts.
- Evidence:
  > src/render/geometry.ts:134-137:
  >   /** Number of triangles added so far. */
  >   get triangleCount(): number {
  >     return this.solid.col.length + this.decal.col.length;
  >   }
  > Grep for `triangleCount` over src/, tests/, harness/ and guardrails/ finds only harness/lib/journal.ts:132 `triangleCount: null` and harness/tests/journal.test.ts:43, which are a journal metric and not this getter.
- Suggested fix:
  > Delete the getter and its doc comment (geometry.ts:134-137). Geometry output does not change.
- Seen 1× (first 2026-11-08, last 2026-11-08)
- Why tonight (plan audit): Real: `get triangleCount` (geometry.ts:134-137) has no reader. The only other matches are an unrelated journal field in harness/. Deleting it changes no geometry.

### C001 · sim · docs (CLAUDE.md, comments) · worth medium · ~4 lines

- Files: `src/sim/car.ts` (line 76)
- Claim:
  > The maxStepUp doc comment says applying it on every track is 'fine while no replay baselines exist (before G3)'. Replay baselines now exist and G3 enforces them, so the comment is stale. It also suggests a global physics change is still acceptable, which is a trap: CLAUDE.md requires new physics to be opt-in per track, car or surface.
- Evidence:
  > src/sim/car.ts:76-79: "/** Highest step a grounded car can climb in one tick; ... (see MAX_RAMP_SLOPE). It applies on every track: fine while no replay baselines exist (before G3). */ maxStepUp: 0.3," — the baselines are present: tests/baselines/replay-states.json and tests/baselines/replays/{drift,jump,prop-collision,car-contact,bot-race}.json. PHASE0_STATUS.md:140 lists 'G3 physics replays' as an active gate.
- Suggested fix:
  > Replace the last sentence with one saying the value is part of the recorded replay behaviour (G3 baselines), so it must not change; a different step rule has to be opt-in per track, car or surface. Comment only.
- Seen 1× (first 2026-11-08, last 2026-11-08)
- Why tonight (plan audit): Real: car.ts:78 says applying maxStepUp everywhere is fine 'before G3', but replay baselines exist in tests/baselines/replays/. Comment only. It stops a later night from treating a global physics change as acceptable.

### C002 · sim · docs (CLAUDE.md, comments) · worth low · ~4 lines

- Files: `src/sim/types.ts`, `src/sim/bot.ts` (line 15)
- Claim:
  > Two sim comments describe the game as it was earlier. TrackData.width says the width is '8.4 per UI_RULES §9', but registered tracks use 11. The bot.ts header calls the bot 'the race opponent' and 'its line', but player races now run five bots (one per roster AI driver).
- Evidence:
  > src/sim/types.ts:15: "/** Track ribbon width in units (8.4 per UI_RULES §9). */" vs src/content/tracks/dust-bowl.json:5 "width": 11 (bends.json:5 is 8.4; in-flight hay-loop is 11). src/sim/bot.ts:1: "// Bot driver: the race opponent, and the driver the bot-lap gate (G2) uses on every track." vs merged #20 (B04): six-car races, 'each driven by its own seeded bot'.
- Suggested fix:
  > types.ts:15: change to 'Track ribbon width in units (e.g. 8.4, the UI_RULES §9 reference).' bot.ts:1: change to 'Bot driver: drives every AI car in a race, and the car the bot-lap gate (G2) uses on every track.' Comments only.
- Seen 1× (first 2026-11-08, last 2026-11-08)
- Why tonight (plan audit): Real: types.ts:15 says width is 8.4, but dust-bowl uses 11, and bot.ts:1 calls the bot 'the race opponent' though races now have five. Comment-only fixes with no code change.

### C016 · content · docs (CLAUDE.md, comments) · worth low · ~4 lines

- Files: `src/content/drivers.ts` (line 21)
- Claim:
  > The JSDoc for raceDrivers sits above PLAYER_CAR_COUNT. That makes two stacked doc comments: editors and hovers attach both to the constant, and raceDrivers ends up with no doc at all. The next night that edits the roster could misread which comment describes what.
- Evidence:
  > src/content/drivers.ts:21-25:
  > /** The drivers of an `carCount`-car race: the player (car 0), then the first carCount − 1 AI drivers. */
  > /** Races the player starts (RACE, RETRY, RESTART RACE, NEXT RACE): YOU plus every roster AI driver. */
  > export const PLAYER_CAR_COUNT = ROSTER.length;
  > 
  > export function raceDrivers(carCount: number): Driver[] {
- Suggested fix:
  > Move line 21's comment to directly above `export function raceDrivers` (line 25), and fix its typo 'an `carCount`-car' to 'a `carCount`-car'. Only comments change.
- Seen 1× (first 2026-11-08, last 2026-11-08)
- Why tonight (plan audit): Real: drivers.ts:21-22 stacks two doc comments on PLAYER_CAR_COUNT, so raceDrivers has none. Move line 21 above raceDrivers and fix 'an `carCount`' to 'a `carCount`'. Only comments change, and the file is in no open PR.

### C013 · ui · docs (CLAUDE.md, comments) · worth low · ~2 lines

- Files: `CLAUDE.md` (line 39)
- Claim:
  > CLAUDE.md says race-ui.ts produces 'finish-panel updates', but race-ui.ts shows the results screen and never uses the finish panel. A feature night that reads this would look in the dead finish-panel.ts instead of results-screen.ts.
- Evidence:
  > CLAUDE.md:39: "- `src/ui/race-ui.ts` turns each frame's `RaceView` into HUD, countdown and finish-panel updates." Meanwhile src/ui/race-ui.ts:10 has `import { createResultsScreen } from './results-screen.ts';` and :112-120 calls `results.update(...)` / `results.show(...)` when the phase is 'finished'. race-ui.ts:1 itself lists the parts as "HUD, countdown, touch controls, results and pause screens".
- Suggested fix:
  > Sunday edit to CLAUDE.md:39: "…into HUD, countdown, pause-screen and results-screen updates."
- Seen 1× (first 2026-11-08, last 2026-11-08)
- Why tonight (plan audit): Real: CLAUDE.md:39 says race-ui produces finish-panel updates, but race-ui.ts imports createResultsScreen and createPauseScreen and never imports finish-panel. Today is Sunday, so CLAUDE.md may be edited. Change only this line, to '…HUD, countdown, pause-screen and results-screen updates.'

### C018 · tests · tests (new tests only) · worth medium · ~45 lines

- Files: `tests/ui/no-inline-colour-overlays.test.ts`
- Claim:
  > The 'no colour in any inline style or SVG paint attribute' rule is never checked for the pause screen. The results screen gets only a weaker check: 4 paint attributes instead of 7, and it does not allow hatch url() fills. Both screens use icons and the hatch, which is exactly where a stray fill/stroke attribute would slip in.
- Evidence:
  > tests/ui/no-inline-colour.test.ts:19-25 builds the HUD, touch controls, countdown, start screen and the dead finish panel, but not createPauseScreen (src/ui/pause-screen.ts:27) or the results screen. tests/ui/results-screen.test.ts:120-126 checks only `['fill','stroke','color','stop-color']`, while PAINT_ATTRS in no-inline-colour.test.ts:14 also has flood-color, lighting-color and bgcolor. No test checks inline colour on .ui-pause (grep COLOUR_PROPS: only those two files).
- Suggested fix:
  > Add a new test file. It renders createPauseScreen(...).show({lap:1,laps:3,timeMs:0}) and a createRaceUi synced to a finished RaceView (results visible). It then applies the same COLOUR_PROPS/COLOUR_VALUE/PAINT_ATTRS checks as no-inline-colour.test.ts, allowing only `url(#…)` paint references. It passes on main today: icons.ts and the hatch set no colour attributes.
- Seen 1× (first 2026-11-08, last 2026-11-08)
- Why tonight (plan audit): Real gap: no-inline-colour.test.ts never builds createPauseScreen, and results-screen.test.ts checks only 4 paint attributes. Add one new test file that renders the pause screen (show({lap:1,laps:3,timeMs:0})) and a createRaceUi synced to a finished RaceView. Apply the full COLOUR_PROPS/COLOUR_VALUE/PAINT_ATTRS checks and allow only url(#…) fills (the hatch). It passes on main: icons use currentColor via CSS, and the only paint attribute is the hatch url fill. Tests only.

## Acceptance criteria

None (maintenance: behaviour must not change).

## What you'll see

Nothing should look or feel different. Cars sit and pitch on ramps exactly as before, every track loads the same, and the pause and results screens look the same. Apart from one new test, the only changes are an internal allocation fix, deleted dead code and corrected comments.

## How to play-test

1. Race Dust Bowl and drive over the ramp: the car tilts up the slope, leaves the lip and lands as before, with no jitter or sinking into the ramp.
2. Watch the AI cars over the ramps: they tilt and sit on the ground as before.
3. Race Bramble Bends: hay bales, tyre stacks and trees line the track in the same places as before.
4. Pause and resume a race: the pause card looks and behaves as before.
5. Finish a race: the results screen, its stripes and its table look as before, and RETRY and NEXT RACE still work.

## Limits

- At most 40 changed files and 1500 changed lines (journal excluded).
- Net `src/` lines (added − deleted) at most +150; tests don't count. Only a performance item may grow `src/`; every other item should delete code.
- Existing tests and screen stages (`src/**/*.stage.ts`) are append-only tonight: add new files, never edit or delete one.
- No `src/` file may import from `tests/`.
- `CLAUDE.md` may change only to stay accurate about the code.
- The gates check behaviour: exact bot laps and replays, every screen stage's DOM and computed styles, and every track's and car's scene geometry against `main`.

## Expected files

- `src/sim/car.ts`
- `src/sim/track.ts`
- `src/render/geometry.ts`
- `src/sim/types.ts`
- `src/sim/bot.ts`
- `src/content/drivers.ts`
- `CLAUDE.md`
- `tests/ui/no-inline-colour-overlays.test.ts`

## Plan audit

Chose C027, C003, C005, C001, C002, C016, C013, C018.

Not chosen tonight (they stay on the list):

- C004: It adds a helper and an import to src/sim to replace five one-line expressions, so src/ grows a little for no performance gain. It also touches hot sim paths for low value. Not worth a night under the delete-only rule for tidy-ups.
- C007: Dropping `export` from attachOutline requires editing the re-export in src/render/index.ts. That file is touched by open PR #23 (which is also why C006 is held), and it is the gate-facing render seam. Wait for #23.
- C008: The local helper adds about as many lines as it saves (net ≥0) across two call sites. That is cosmetic churn, not a deletion.
- C010: A types-only rename with zero net lines. Cosmetic churn.
- C015: Grouping the selectors would keep computed styles the same (specificity is unchanged). But it moves results-screen layout into screens.css, coupling two stylesheets for a few lines saved. Low value. Leave it for a night that touches the stripe styles anyway.
- C026: It overlaps C013 (chosen) on the race-ui line. Its other edits rewrite the owner's conventions: what registers by folder, and the planned cars/features content layout. Whether to drop or keep those as intent is the owner's call, not an unattended refactor's.

Skipped (they touch files of open PRs):

- C006: open PR #23
- C014: open PR #24
- C023: open PR #26, #25, #23
- C028: open PR #26, #25, #23
- C009: open PR #23
- C011: open PR #23
- C024: open PR #23
- C025: open PR #26, #25, #23
