# CLAUDE.md

Guide for agents working in this repo. Read `VISION.md` first for what this project is.
`HANDOVER.md` is the full Phase 0 spec and `plans/phase0-plan.md` the approved plan, including
deliberate deviations from HANDOVER. While Phase 0 is in progress, `PHASE0_STATUS.md` says what
exists today; anything below marked *(planned)* does not exist yet.

## Ground rules
- **Style:** read `guardrails/design/UI_RULES.md` before any UI or rendering change. It wins on
  look and feel. If it doesn't cover something, don't invent: in a nightly run, write
  `journal/runs/<date>/design-request.md` and pick a different idea.
- **Colours, fonts, sizes:** only from tokens. Import `@tokens` in TS and use the CSS variables
  from `@tokens/css` in CSS. Never write a hex/rgb/hsl literal, font name, or raw pixel size in
  `src/`. The only files allowed to contain colour literals are the generated ones in
  `guardrails/generated/` and `guardrails/palette.json`.
- **3D assets are code.** No textures (including `CanvasTexture`/`DataTexture`), no model files,
  no `data:` URIs, no image files outside `guardrails/design/` and `tests/baselines/`.
- **Dependencies are frozen.** Never change `package.json` or `pnpm-lock.yaml`. Install with
  `pnpm install --frozen-lockfile --ignore-scripts`.
- **No environment sniffing in `src/`:** no `navigator.webdriver`, `process.env`, user-agent
  checks, test-only query strings, or `import.meta.env` (except `DEV`/`PROD` in one config module).
- **Tests are append-only.** Never delete or edit an existing test, never use `.skip`, `.only`,
  `.todo`, `it.fails` or `passWithNoTests`, never add `@ts-ignore`, `@ts-nocheck` or
  `eslint-disable`.

## What a nightly run may touch
Allowlist (plan deviation 2): `src/**` except `src/driver/**`; **new** files under `tests/**`
(not `tests/baselines/`, which the harness writes); `journal/runs/<today>/**`; and `CLAUDE.md`
on Sundays (maintenance). Everything else is protected and only the owner changes it.

## How the game fits together
- `src/game.ts` owns the loop: the sim steps in fixed 60 Hz ticks, render draws cars interpolated
  between the last two ticks, and the UI receives view models (`src/ui/types.ts`), never the sim.
- `src/sim/types.ts` is the contract between layers; import the sim only via `src/sim/index.ts`.
- The sim computes all track geometry (`trackLayout`); render only draws it.
- Opponents are `createBot(world, i)` (`src/sim/bot.ts`): each returns the same `CarInput` as the
  player every tick, so a race is reproducible from the seed and the player's inputs, and the bot
  also drives the gates' bot laps.
- `src/ui/race-ui.ts` turns each frame's `RaceView` into HUD, countdown, pause-screen and results-screen updates.
- `src/driver/` installs `window.__racer` (start a race with a seed, freeze real time, step/play
  inputs, read state) for gates. It is protected; never special-case it in game code.

## Layout
```
src/sim          deterministic simulation; no Three.js, DOM, or global/time/random access
src/render       Three.js scene and procedural meshes
src/render/materials   the ONLY place that may construct a Three.js material or shader
src/ui           DOM/CSS HUD and menus, tokens only; src/ui/stages = screen stages (never shipped)
src/content      tracks (src/content/tracks/*.json), cars, features: where most daily work lands
src/input        touch, keyboard, gamepad
src/driver       window.__racer test driver used by gates (protected)
tests            Vitest suites (unit, replay, bot-lap); tests/baselines/ is harness-owned
guardrails       design pack, tokens, palette, budgets, backlog, gates, cheats, manifest (protected)
harness          daily.sh, config.env, prompts, scripts, container/ (protected)
journal/runs     one folder per nightly run
spikes           Phase 0 throwaway experiments (deleted at handover)
```

## Conventions
- **TypeScript:** strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`, `erasableSyntaxOnly`. Relative imports include the `.ts` extension so
  `src/sim` and all scripts run under plain `node` (native type stripping). No enums, namespaces
  or parameter properties.
- **Tokens:** `guardrails/design/tokens.json` is the single source. `pnpm gen:tokens` regenerates
  `guardrails/palette.json` and `guardrails/generated/tokens.{ts,css}`; `pnpm check:tokens` fails
  if they are stale. A mesh colour is a palette **index** (0–9, `PALETTE` order); the shader steps
  down `LADDER_INDEX` for shading, so off-palette colours can't be produced.
- **Simulation:** fixed 60 Hz step, seeded RNG passed explicitly, fully decoupled from rendering so
  it runs headless in Node. New physics behaviour is opt-in per track, car or surface so existing
  replays never change.
- **Registration by file convention:** tracks, cars and screens register by being in their folder
  (`import.meta.glob`), never via a hand-edited index. Every file in a content folder must be
  registered. Tracks are JSON data and must pass `validateTrack` (`src/sim/track.ts`: e.g. ramp
  slope ≤ `MAX_RAMP_SLOPE`, height ≤ `MAX_RAMP_HEIGHT`, 25 units of straight track after a lip); bots must finish every
  registered track (`tests/sim/bot.test.ts`).
- **Screen stages:** every screen and overlay state has a stage. `src/ui/stages/<name>.stage.ts`
  default-exports `{ '<state>': (root) => … } satisfies StageFile` (see `stage.ts`), rendering that
  state with the real UI modules and fixed data; `raceStage()` sets up the race screen. Stages
  register by glob (`registry.ts`) and nothing in the game may import them, so they never ship. A
  new screen, or a new state of one, needs a new stage in the same PR.
  Screenshots of every stage plus race frames at 844×390 and 1440×900: on the host,
  `harness/scripts/screenshots.sh <repo> <outdir>` (needs Docker); inside the agent sandbox or the
  toolchain container, `node_modules/.bin/vite build --config harness/screens/vite.config.ts
  --outDir /tmp/shots-dist --emptyOutDir && node harness/screens/capture.ts /tmp/shots-dist /tmp/shots`.
  Compare yours with the mockup.
- **Browser tests:** a test may render a screen stage in Chromium through
  `harness/screens/browser.ts` (`serve`, `launch`, `context`,
  `renderStage`), e.g. to prove a layout fits 844×390. Gate G1 and CI run the same Playwright
  image, so such a test passes in CI exactly when it passes the gates.
- **Fonts:** self-hosted woff2 in `public/fonts/` (`fonts.css`), Barlow Condensed 800/900/900i and
  Atkinson Hyperlegible 400/700, Latin + Latin Extended only.

## Commands
All pnpm/node work runs in the pinned container, not on the host's Node. Build the image once with
`harness/container/build.sh`, install with
`harness/scripts/in-container.sh --net -- pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm-store`,
then run anything offline with `harness/scripts/in-container.sh -- <command>` (e.g. `-- pnpm test`).

| Command | Does |
|---|---|
| `pnpm dev` | Vite dev server |
| `pnpm build` | production build + PWA |
| `pnpm typecheck` | `tsc` over `src/` (browser) and tests/scripts/configs (node) |
| `pnpm test` | Vitest, `tests/**` and `harness/tests/**` |
| `pnpm gen:tokens` / `pnpm check:tokens` | regenerate / verify generated token files |

## Acceptance tests (nightly runs)
The locked spec lists `AC1…ACn`. Add at least one test named `AC<n>: …` per criterion, in a new
file. Each must fail on `main` and pass on your branch; purely visual features still need a test
that proves the thing exists (a mesh in the scene graph, a widget in the HUD).
