# Phase 0 status

Resume point for any session working on Phase 0. Plan: `plans/phase0-plan.md` (owner-approved,
don't re-plan). Spec: `HANDOVER.md`. Delete this file when Phase 0 is handed over.

Milestone order: M1 → M1.5 spike → M2 → M3 → M4-thin → dry-run week → Later.
One `phase0/mN-*` branch and PR per milestone; the owner merges. Every milestone gets a spec
audit and a code review (speed, LOC, duplication) with fixes applied before handover.

## Done
### M1 · Scaffold, docs, tokens, backlog — PR #1 (merged 2026-10-29)
- Folders per HANDOVER §4; exact-pinned `package.json` + `pnpm-lock.yaml`; `.nvmrc` (24), `.npmrc`,
  `.gitignore`; strict tsconfigs (`tsconfig.json` = src/browser, `tsconfig.node.json` = tests,
  scripts, spikes, configs); `vite.config.ts` (aliases `@tokens`, `@tokens/css`; PWA manifest,
  icons in M2); `vitest.config.ts`; `index.html`; placeholder `src/main.ts`.
- `guardrails/scripts/gen-tokens.ts` → `guardrails/palette.json`, `guardrails/generated/tokens.{ts,css}`;
  `--check` for gate 8.
- Fonts extracted byte-for-byte from the design export into `public/fonts/` (+ `fonts.css`, `OFL.txt`).
- `VISION.md`, `CLAUDE.md`, `guardrails/BACKLOG.md` (B01–B12).
- **Checkpoint passed (2026-10-29):** owner approved the backlog (incl. B11 lock rule, no S6
  settings button) and the UI_RULES §9 toon thresholds (≥ 0.7 / ≥ −0.6 / below).

### M1.5 · Spike — PR #2 (merged 2026-10-29)
Built:
- `harness/container/Dockerfile`: Playwright `v1.64.1-noble` pinned by digest, Node **24.22.2**
  from nodejs.org (SHA-256 checked; replaces the image's apt Node), pnpm 12.16.1 via corepack
  (pre-downloaded), Claude Code 2.1.304, `DISABLE_AUTOUPDATER=1`,
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. `harness/container/build.sh` tags it
  `daily-racer-toolchain:<Dockerfile sha256[:12]>`.
- `harness/scripts/in-container.sh [--net] [--ro] [--cpuset <cpus>] -- <cmd>`: host uid, tmpfs
  `/tmp` + `HOME`, `--network none` unless `--net`, shared `daily-racer-pnpm-store` volume.
- `spikes/m1.5/`: throwaway test scene + gate-side runner (since deleted; findings below).

Findings (all run in the container, Chromium `--use-angle=swiftshader --enable-unsafe-swiftshader`):
1. **Install then offline works.** `pnpm install --frozen-lockfile --ignore-scripts --store-dir
   /pnpm-store` with network, then typecheck, tests, token check and build under `--network none`.
2. **Pixel output is palette-exact.** Toon + inverted-hull outline scene (palette-index `Uint8`
   attribute with `gpuType = IntType`, GLSL3 `RawShaderMaterial`, `flat` varying, `palette[10]` +
   `ladder[10]` uniforms, `ColorManagement.enabled = false`, `LinearSRGBColorSpace` output).
   `readPixels` at 844×390 and 1440×900 with outlines on and AA forced off: **0 off-palette pixels**.
   Renderer string: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)…), SwiftShader driver)`.
3. **Gate-owned instrumentation works** via `addInitScript`: `__THREE_DEVTOOLS__` captures the
   Scene and WebGLRenderer (scene walk sees all 40 meshes, materials, palette attributes);
   `getContext` override forces `antialias:false, preserveDrawingBuffer:true` (confirmed via
   `getContextAttributes`); draw calls, triangles, `shaderSource` all counted.
   **Gotcha:** three.js uploads nine 1×1 zero-filled placeholder textures at renderer init
   (`WebGLState.createTexture`). The texture rule must ignore exactly those (1×1, `ArrayBufferView`
   source) and fail on any other upload.
4. **`node --permission --allow-fs-read=<branch dir>` contains branch code.** Denied: reads outside
   the branch, any write (incl. `/tmp`), symlink, child process, worker, native addon (`dlopen`),
   inspector, WASI. Reading inside the branch and writing stdout still work. Network isn't covered by
   `--permission` in Node 24; `--network none` covers it.
5. **Perf A/A noise is workable with batch timing.** Per-frame timing is useless here
   (`performance.now()` is coarsened to 0.1 ms; tiny scene ran 0.8 ms/frame). Timing a 300-frame
   batch with `gl.finish()` per frame on a ~420 draw call / ~8.6k triangle scene, 4× CDP throttle,
   pinned to 4 cores, 20 runs per side of the *same* build:
   - mean 14.45 ms/frame, run-to-run CV 6.0% (min 13.07, max 16.35)
   - |median A − median B| / median, resampling k runs per side:
     k=5 p95 11.2% p99 14.8% · k=7 p95 10.2% p99 13.1% · k=9 p95 9.6% p99 12.2%
   - Unthrottled: 2.50 ms/frame, so the 4× throttle really does apply under SwiftShader.
   - **Proposal for G4:** 7 alternating runs per side, fail if the branch is > 15% slower than
     `main` (≈1% false-fail on identical code). That catches large regressions only; triangles,
     draw calls and bundle size stay the hard limits. ~5 s per run → ~70 s per G4.
6. **Visual notes for M2** (not spike failures): with the §9 light, a dark-dirt ramp's slope
   faces away from the light enough to drop to ink, so ramp tops need care in M2. Outlines at
   `widthPx 2` read thin at 844 wide, so tune the width in M2.

Perf margin accepted by the owner (see Owner decisions).

## Awaiting merge
### M2 · Playable core — PR #3 (branch `phase0/m2-core`)
Built in parallel by three agents against shared contracts (`src/sim/types.ts`, `src/ui/types.ts`),
then integrated:
- `src/sim/`: mulberry32 RNG, closed Catmull-Rom track with arc-length sampling and local
  nearest-search, arcade car (grip/drift split, dirt vs grass, ramp launch + landing, prop
  collisions with push-out and sub-stepping, no respawn), race (180-tick countdown, ordered sectors
  so shortcuts never count, finish), world, frozen replay format (int8 steer + flag bits).
  Dirt top speed 25 u/s, grass 15. `stepWorld` quantises steer to int8 so live play == replay.
  `CarView.pitch` tilts the car on ramps (upper convex hull of the ground under it, so the body
  never clips the slope or the lip).
- `src/content/tracks/dust-bowl.json`: scaled ~2.07× to reach a ~40 s lap (1008 units).
  `src/content/tracks.ts` registers tracks by glob (id must match the file name).
- `src/render/`: the one materials factory (toon ladder, hull, flat, crease), meshes (car with
  geometry race number and ▼ marker, hay bale, tyre stack, cone tree, ramp with chevrons, ribbon
  with ruts, chequered start band), blob shadows, pooled dust, camera rig (57°, vfov 19°,
  56/55 units across). Static geometry is merged: ground in ~64-row chunks, props in 32-unit
  cells, so a frame is ~26 draw calls. Faces with normal y ≥ 0.95 keep their base colour
  (UI_RULES §8 "top faces take the base colour"); this keeps the dark-dirt ramp slope off ink.
  Outline width is 2.5 px at 844 wide, scaled with the viewport. DPR capped at 1.5.
- `src/ui/` + `src/input/`: HUD (POS, LAP, minimap, TIME + BEST), touch controls (active → resting
  after 4 s → pressed, 12 px slop, multi-touch), countdown roundels + GO! stamp, start screen,
  finish panel; keyboard (arrows/WASD). Off-scale mockup values snapped to tokens (listed in the M2
  PR). No pause/action buttons (B01/B12). No per-frame DOM writes or allocations when nothing changes.
- `src/game.ts` (fixed-step loop, interpolation, UI sync; GO! clears 60 ticks after the start in
  sim time so staged frames are deterministic), `src/driver/` (`window.__racer`: startRace, freeze,
  step, play, state), `guardrails/build/pwa-icons.ts`.
- `spikes/m2-game`: end-to-end check `run.ts`, input generator `inputs.ts`, frame capture `frames.ts`.
- Reviewed (spec audit + code review per area) and fixed before handover: restart camera, gate-5
  colour scan, per-frame churn, ramp-lip pop-up, dead and duplicated code.
- **Reference frames approved (2026-10-29)**: turn tick 1100 and ramp tick 442 in
  `guardrails/design/reference-frames/`.

### M3 · Bot opponent — branch `phase0/m3-bot` (stacked on #3)
- `src/sim/bot.ts`: `createBot(world, carIndex)` → `bot.input(world)`, the same `CarInput` as the
  player. Centreline follower with a seeded racing offset and pace; corner speed planned from
  curvature along its own line, shorter look-ahead in tight corners; passes the nearest car ahead,
  but not in tight corners or on a ramp approach; stuck recovery by reversing on opposite lock.
- Car–car collisions (oriented boxes, split push-out). Cars rest on prop tops and car roofs;
  push-outs are capped at travel + 0.2 units per tick, so no tick moves a car more than 0.625 units
  (G2's teleport limit; worst seen 0.617).
- Track rules in `validateTrack`: ramp slope ≤ `MAX_RAMP_SLOPE` (0.32), height ≤ `MAX_RAMP_HEIGHT`
  (2) and 25 units of straight track after every lip, so every full-speed jump lands on the
  straight and the bot needs no lip-speed planning. Sectors are `max(8, ceil(length / 40))`
  (Dust Bowl: 26).
- Sim speed: grid broadphase and allocation-light contacts, ~1 µs/tick per car (was ~3),
  proven bit-identical on 48 long runs before the behaviour changes.
- Game: car 1 is the bot (KOSKI #7, mustard/navy); HUD shows POS x/2 and both cars on the minimap.
  `src/ui/race-ui.ts` owns the countdown, GO!, finish panel and HUD sync; one scene is kept and
  reused on restart, disposed on a track change.
- Tests: bots finish every registered track (5 seeds, lap-time bounds, never stuck, no teleport),
  hairpin and ramp-before-corner tracks, stuck recovery, positions, car contact, push-out bounds
  (and that a car landing between props can always drive away), broadphase identity, race UI flow.
- Reviewed: spec audit (displacement, bot robustness, ramp rules) + code review (speed, LOC,
  duplication); every finding fixed. Re-checked with the auditor's own scripts: worst step 0.617,
  all 90 races of its sweep (6 tracks × 1/2/4 cars × 5 seeds) pass. A second review of the fixes
  found a "jammed car returns to its tick-start position" rule that could freeze a car for good
  after landing on a tyre row (19 of 2,880 landings); it was removed, along with bot code that
  never changed a race (braking zones, lip-speed cap). The approved frames' inputs are unchanged.

Verified in the container: typecheck, 272 tests (sim 166, UI 44, render 31, input 24, tokens 4,
content 3), build, end-to-end in Chromium at 844×390 (touch) and 1440×900 with two cars.

**Checkpoint passed (2026-10-29):** owner re-approved the reference frames (the M2 review fixes
and the bot car changed the look); the new shots replace the M2 ones.

## Next step
After M3 is merged: **M4-thin · Thin harness + nightly dry runs** (G1, G2, G3, G8).

## Owner decisions
1. G4 perf margin: 15% with 7 alternating runs per side (M1.5 finding 5). Accepted 2026-10-29.
2. Dust Bowl stays nearly flat-out (the bot never slides); drifting comes from tighter later
   tracks (B10/B11). Accepted 2026-10-29.

## Notes for later milestones
- `playwright.config.ts` is not created until a milestone uses `@playwright/test` (the spike uses
  the Playwright library directly).
- npm 11 in the image blocks Claude Code's `postinstall` by default; `claude --version` works
  without it. Recheck `claude -p` at the M4-thin auth checkpoint.
- Node 24.22.2 has no official Docker image yet; irrelevant now since the Dockerfile installs it
  from nodejs.org. The M1 lockfile was generated on 24.22.1 and is unchanged under 24.22.2.
