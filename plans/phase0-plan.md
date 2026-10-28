# Phase 0 plan: Daily AI-Built Racer (bootstrap)

## Context
`HANDOVER.md` asks this session to build a small playable core plus a harness that lets nightly
headless Claude runs build, test and judge one feature a day, assuming the builder will game any gate
it can. The repo holds only `HANDOVER.md` and the design pack in `guardrails/design/`. No code exists.
The milestones of HANDOVER §11 are **re-scoped** (owner, 2026-10-28): build M1, M1.5, M2 and M3 as
planned, then a **thin harness** (M4-thin) and run it **nightly in dry-run mode for a week**. The
remaining gates, PR opening, judge, CI and red team come later (see "Later"). One PR per milestone,
with `PHASE0_STATUS.md` kept current so a fresh session can resume from the files alone.

**Owner answers so far**
- This VM (Debian 12, 16 cores, Docker 29, systemd 252) is the nightly VM. SETUP.md targets Debian 12.
- Milestones land as `phase0/mN-*` branches, one PR each; the owner merges. (This plan itself was
  pushed straight to `main` at the owner's request.)
- **The repo is being made public** (owner, 2026-10-28). That makes branch protection/rulesets
  available on the Free plan, so HANDOVER §7.1 applies as written, with one change: the owner is a
  ruleset bypass actor in "pull requests only" mode, so their own PRs can merge. See deviation 1.
- Shading follows the concept frames and UI_RULES §8: N·L ≥ 0.7 base, ≥ −0.6 one rung, else two.
  I'll put the matching UI_RULES §9 wording change in the M1 PR as its own commit for you to approve.
- **Node 24 LTS** (24.22.2) instead of 22.

## Deviations from HANDOVER (each one is deliberate; veto in review)
1. **Public repo.** Rulesets on `main` (set up when PRs go live): require a PR, 1 approval, Code
   Owner review, the CI gate checks, up-to-date branches; block force pushes and direct updates.
   The owner is the only bypass actor, in "pull requests only" mode; the App never bypasses.
   Consequences of being public:
   - Everything (prompts, gates, cheat patches, journal logs) is world-readable, so secret redaction
     must exist **before the first non-dry run pushes anything**. Dry runs push nothing.
   - Set "require approval for all outside contributors" on fork-PR workflows. The harness already
     reads only text written by the App or the owner (HANDOVER §6.2 step 2), so stranger issues/PRs
     never reach a prompt. The health check only touches issues it created.
   - Actions minutes are free for public repos, so CI gate runs aren't rationed.
   - The GitHub App stays private, owned by Rhys-Demo-Org, installed on this repo only.
2. **Protected paths become an allowlist.** Daily runs may only touch `src/**` (except
   `src/driver/**`), add new files under `tests/**`, and `journal/runs/<today>/**`; `CLAUDE.md` on
   Sundays. Everything else is protected (closes `.gitattributes`, nested `CLAUDE.md`, `.mcp.json`,
   `.pnpmfile.cjs`, `vite.config.js`, etc.). Diffs use `--no-renames --numstat` against the merge
   base; binary `-` counts, symlinks, mode changes and submodules fail.
3. **Baselines for new tracks/screens are written by the harness, not the builder.** Gate 9 rejects
   any builder-added file in `tests/baselines/`; after a green run the harness commits the new
   baselines it measured, and CI re-measures and checks them.
4. **Pixel check runs with outlines on** (ink is a palette colour, so it's stricter) and AA forced off
   by the gate, not by a game toggle.
5. **Tracks are JSON** (`src/content/tracks/*.json`): pure data for gate 11, and gates can load them
   without running branch code. Prop rows are declarative (`{kind, side, from, to, spacing}`).
6. **`src/driver/` is a small protected module** exposing `window.__racer` in every build (start a
   race with track/seed, read sim state, stage fixed camera shots). Gates use it instead of test-only
   query strings; scene and renderer inspection comes from the gate side (below), not from it.
7. **TypeScript 6.0.3**, not 7: TS 7 has no JS compiler API, which the AST lints need.
8. **No ESLint**: lints are gate scripts on the TS compiler API, run from `main`'s copy; the builder
   runs the same scripts locally. `eslint-disable` text is still banned.
9. **PR images live on the `daily-status` branch** (`runs/<date>/…`), linked from the PR body; the
   judge gets a PNG frame strip, since its Read tool can't read video.
10. **Execution order:** M1 → M1.5 spike → M2 → M3 → M4-thin → a week of nightly dry runs → Later.
    The container image moves up into M1.5 and the sandbox network into M4-thin, so the gates are
    built in their final environment.

## Technical decisions
| Area | Decision |
|---|---|
| Runtime | All pnpm/node work runs in the pinned container (`harness/scripts/in-container.sh`), not on the VM's Node 22. Image: pinned `mcr.microsoft.com/playwright:v1.64.1-*` + Node 24.22.2 + pnpm 12.16.1 (corepack) + Claude Code pinned, `DISABLE_AUTOUPDATER=1`. |
| TS config | strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `allowImportingTsExtensions`; so `src/sim` and all gate/harness scripts run under plain `node` (native type stripping). |
| Tokens | `pnpm gen:tokens` → `guardrails/palette.json`, `guardrails/generated/tokens.{ts,css}` (alias `@tokens`). Only colour literals anywhere. Gate 8 checks they match a fresh regeneration. |
| Fonts | Latin + latin-ext woff2 (Barlow Condensed 800/900/900i, Atkinson Hyperlegible 400/700) from the design export, in `public/fonts/` with `OFL.txt`, `font-display: block`. Keycap arrows are SVG icons (glyphs aren't in the subset). |
| PWA icons | Plugin in `guardrails/build/pwa-icons.ts` draws palette shapes with `pngjs` at build time. |
| Colour pipeline | `ColorManagement.enabled=false`, no output encoding, no tone mapping/fog/dithering. Mesh colour is one `Uint8` **palette-index** attribute; shader has `palette[10]` + `ladder[10]` uniforms generated from tokens, a GLSL3 `flat` varying, and picks rung 0/1/2 by N·L. Off-ladder colours are impossible by construction. |
| Outlines | Inverted hull from a position-merged copy with smoothed normals, pushed in clip space (≈2px at 844 wide), `polygonOffset`; crease lines as edge `LineSegments`. Flat ground-level meshes are a factory "flat" kind exempt from hulls only if every normal is straight up. |
| Camera | Pitch 57°, vfov 19°, north-up, translation-only follow with look-ahead; distance derived so frame width is 56 (mobile) / 55 (desktop) units (≈77 at 844×390). One exported `CAMERA` constant + a live quaternion check. |
| Sim | XZ car + scalar height for jumps; 60 Hz fixed step; seeded mulberry32 passed explicitly; replay format frozen at M2 start (int8 steer, bit flags). Nearest-centreline search is local to the last segment (safe on hairpins/crossings). Seeds vary start offset and bot noise. `src/sim` may not reference `process`, `globalThis`, `window`, `navigator`, `document`, `Date`, `performance`, `Math.random`. |
| First track | "Dust Bowl" (name and ~40 s lap from the S5/S6 mockups), 3 laps. |
| Menus | Only a start screen (navy ground + RACE) and finish panel (FINISHED + RACE AGAIN) from existing components. No pause button until backlog S4. |
| DOM tests | `happy-dom 21.0.4` so UI acceptance tests run in Vitest. |

**Dependencies (exact pins):** `three 0.186.1`, `@types/three 0.186.0`, `vite 8.3.5`,
`vite-plugin-pwa 2.0.0`, `typescript 6.0.3`, `vitest 5.0.5`, `happy-dom 21.0.4`,
`@playwright/test 1.64.1`, `pixelmatch 8.0.0`, `pngjs 7.0.0`, `@types/pngjs 6.0.5`, `@types/node 24.19.2`.
Install is always `pnpm install --frozen-lockfile --ignore-scripts`.

## Test suites
Two layers. Everything lives under `tests/` (game) or `harness/tests/` (harness), runs in the
container with Vitest, and gate 1 + CI run all of it on every PR.

**A. Written in Phase 0 alongside each milestone (tests land in the same PR as the code)**
| Suite | What it proves | Milestone |
|---|---|---|
| `tests/sim/*` | rng/vec; track sampling + progress (incl. hairpin locality); car behaviours: accelerates to top speed, drifts when steering hard at speed, grass slows, ramp launches + lands, collisions push out and bleed speed, no tunnelling through props at max speed; race: countdown, lap counting, no shortcut laps, finish; determinism (same seed + inputs → identical state) | M2 |
| `tests/render/*` (Node, no WebGL) | Dust Bowl scene graph has the expected props; every mesh comes from the factory, has palette indices < 10, and has an outline; liveries (player red + cream stripe + ▼, AI never red); camera constants within §9 | M2 |
| `tests/ui/*` (happy-dom) | time format `m:ss.cc`, position `x/n`, touch-control state machine (active → resting after 4 s → pressed → reactivated), countdown sequence, start → race → finish flow | M2 |
| `tests/input/*` | keyboard map, multi-touch (steer + gas at once), 12px hit slop | M2 |
| `tests/sim/bot*` + replays | bot finishes every registered track inside lap-time bounds; recorded inputs (drift, jump, collision, full lap) reproduce exact end states | M3–M4-thin |
| Browser end-to-end (in the gates) | touch smoke (menu → race → finish by touch only), screenshots per track/screen, perf A/B, pixel check, computed-style scan | Later |
| `harness/tests/*` | backlog picker + dry-run ledger, London time windows incl. DST days, usage-limit classifier, spec lock, allowlist diff | M4-thin |
| `harness/tests/*` | redaction (incl. encoded tokens), resume rules, existing-work author filter, phase 2 detection | Later |
| Cheat suite | every included gate catches its known-bad patch; clean control passes | M4-thin, extended Later |

**B. Written by every nightly run, enforced by the gates**
- The locked spec lists acceptance criteria `AC1…ACn`; the builder must add a test named `AC<n>: …`
  for each (visual features too, e.g. "scene on track X contains the new mesh", "HUD contains widget").
- Gate 10 (Later) runs those tests against `main`'s `src/` (each AC needs at least one failing
  test, for any reason including a missing module) and the branch (must pass), so tests that pass
  without the feature are rejected.
- Gate 9 makes the suite append-only: no test from `main` deleted or edited (except Sundays), test
  count never drops, no `.skip/.only/.todo/it.fails/passWithNoTests`. Every merged feature leaves
  permanent regression tests that all later nights must keep green.
- The judge scores "tests that don't really test" from the diff.

## Gate trust model (full design; M4-thin builds the subset listed there)
- `harness/scripts/run-gates.sh <branch-sha> <out>`: makes a clean worktree of the committed branch
  SHA and a read-only worktree of `origin/main`. Gate code, configs (always passed with explicit
  `--config`, never `pnpm run`), budgets, manifest and baselines come only from `main`.
- **Measure / verdict split.** Branch code runs only in a *measure* container that has the branch,
  `node_modules` and its inputs, no baselines, no `/out`; output goes over stdout. Node-side
  measurement uses `node --permission` with read access limited to the branch. A separate *verdict*
  container runs only `main`'s gate code over that output and writes `/out/result.json`. All gate
  containers: `--network none --read-only`, tmpfs for `/tmp`/`HOME`/caches, `--user` = host uid.
- `run-gates.sh` writes `gates.json` itself; missing/malformed output, crash, timeout, or zero tests
  = fail. 20-min cap from `config.env`.
- **Browser instrumentation is gate-owned**, injected with Playwright `addInitScript`:
  `window.__THREE_DEVTOOLS__` receives every Scene/WebGLRenderer Three.js creates; `getContext` is
  wrapped to force `antialias:false`, `preserveDrawingBuffer:true`; `drawElements/drawArrays` counted
  for draw calls/triangles; `texImage2D`-family calls fail the run; every `shaderSource` is hashed and
  new hashes vs `main` are listed for the judge. Chromium runs `--use-angle=swiftshader
  --enable-unsafe-swiftshader`, and the gate asserts the renderer string says SwiftShader.
- Gate notes: **G2** teleport check from per-tick trajectory, progress against `main`'s track JSON.
  **G4** `--disable-frame-rate-limit --disable-gpu-vsync`, CPU-pinned, alternating ≥7 runs each of
  `main`/branch (`main` build cached per SHA), timing render + `gl.finish()` over a scripted race;
  triangles, draw calls, bundle size are hard limits. **G5** static lints (incl. `onBeforeCompile`,
  `.fragmentShader=`, `Color.offsetHSL/lerp`, numeric `0x` colours, computed `THREE[...]`), scene
  walk at load + during a bot race, pixel check per track, computed-style scan per screen, camera
  check. **G9** also bans WebGL renderer-string queries, `hardwareConcurrency`, `deviceMemory`.
  **G10** (revised after owner review; the earlier "import only from `index.ts`" and "must fail
  inside the test body" rules are dropped because they rejected normal TDD tests):
  - On the branch: every new test passes; every `AC<n>` in the locked spec has ≥1 test named
    `AC<n>: …`; each AC test makes ≥1 assertion (counted by a gate-owned setup file via
    `expect.getState().assertionCalls`).
  - On `main`: the branch's added `tests/` files (helpers included) are overlaid on `main`'s tree;
    each AC needs ≥1 test that fails there, **for any reason**, including "module not found".
    Tests import whatever they need. Only ACs need a red test; regression tests alongside them may
    pass on `main`.
  - Gate-owned canary tests (one pass, one fail) detect forged reports.
  - Known gap: a test that imports the new module and asserts something trivial still passes. The
    judge's "tests that don't really test" axis and owner review cover it. If it shows up in
    practice, the upgrade is requiring each AC test file to execute some of the branch's changed
    `src/` lines (V8 coverage; needs `@vitest/coverage-v8`).
  - False-reject guard: the spec prompt writes ACs only for new behaviour, never restating existing
    behaviour.
  **G11** counts `src/` lines excl. tests and track JSON, and files in `src/` + `tests/`; limits in
  `budgets.json`.
- Baselines stamped with Node version + image digest; a mismatch is reported as "toolchain
  mismatch", and `harness/scripts/rebaseline.sh` is owner-only.

## Milestones

### M1 · Scaffold, docs, tokens, backlog
Folders per §4; `package.json` + lockfile, configs, `index.html`, `.nvmrc` (24), `.npmrc`,
`.gitignore`, `public/fonts/`; `gen-tokens.ts`; `VISION.md`, `CLAUDE.md`, `PHASE0_STATUS.md`;
UI_RULES §9 threshold edit (separate commit). `guardrails/BACKLOG.md` draft, items as
`## Bnn · Title` + `depends_on:` + scope: B01 pause (S4) · B02 results (S5) · B03 AI liveries +
driver roster · B04 6-car grid (B03) · B05 desktop HUD ×1.45 + keycap legend · B06 gamepad ·
B07 best-lap persistence + new-best chip · B08 title/track select (S6) + stripe screen change (B07) ·
B09 HUD event motion · B10 track "Hay Loop" · B11 track "Pine Ridge" + lock rule (B08, B10) ·
B12 pickups + action-button power-up. **Checkpoint: you approve the backlog.**

### M1.5 · Spike (riskiest assumptions first)
Build the container; under `--network none` + SwiftShader render a toon/outline test scene; prove
exact `readPixels` palette output, `__THREE_DEVTOOLS__` capture, `pnpm --ignore-scripts` install,
`node --permission` measurement, and measure perf A/B variance over 20 runs. If noise exceeds any
workable margin, I come back to you before building G4.

### M2 · Playable core
`src/sim/` (rng, vec, track, car with drift/grip split, dirt vs grass, ramp jump, collisions with
push-out and no respawn, race, world, replay); `src/content/tracks/dust-bowl.json`; `src/render/`
(materials factory, geometry helpers, car with stripe/number/▼ marker, props, track ribbon, blob
shadows, pooled cream dust, camera rig, fixed-step loop with interpolation); `src/ui/` (HUD: POS, LAP,
minimap, TIME + BEST; touch controls with active → resting → pressed; countdown with drop/stamp;
start screen; finish panel; CSS ported from the design export, tokens only); `src/input/` (keyboard,
multi-touch with 12px slop); `src/driver/`. Unit tests for sim determinism, laps, jump, collisions.
**Checkpoint (§2.3): you approve 844×390 and 1440×900 reference frames.**

### M3 · Bot opponent
`src/sim/bot.ts`: centreline follower with curvature-based target speed, braking, stuck recovery,
emitting the same `CarInput` as the player; car–car collisions; race position → HUD "x/2".

### M4-thin · Thin harness + nightly dry runs
**Gates included** (trust model as above: gate code, configs, baselines and manifest only from
`main`'s read-only worktree; a fresh `--network none --read-only` container per gate with the repo
mounted read-only; containers running branch code get no output mount; `run-gates.sh` writes
`gates.json`, fails closed, enforces the time cap):
- **G1** typecheck, build and unit tests with `main`'s configs; no `@ts-ignore`/`@ts-nocheck`/
  `eslint-disable`. Also folds in the test-integrity slice of G9: no `.skip/.only/.todo/it.fails/
  passWithNoTests`, no test file from `main` deleted or edited, test count never drops. Without
  this, G1 is beaten by deleting a failing test.
- **G2** bot laps: every track on `main` still exists; the bot finishes every track with fixed seeds,
  no stuck, no teleport (per-tick trajectory check); median lap within ±10% of `main`'s baseline.
- **G3** physics replays: `main`'s recordings reproduce `main`'s expected end states.
- **G8** protected files: allowlist diff against the merge base, manifest hashes, generated tokens
  match a fresh regeneration.

Also in this milestone:
- Baselines (lap times, replays) and `guardrails/manifest.json`.
- A cheat patch per included gate, `self-test.sh` (clean control first), and a 10× flakiness run
  of the thin suite with timings.
- **Agent sandbox:**
  - Container with protected paths mounted read-only.
  - `--permission-mode bypassPermissions` only inside the container; the harness refuses otherwise.
  - Fresh `HOME` per `claude -p` call, `CLAUDE_CODE_OAUTH_TOKEN`, web tools disallowed,
    `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, no GitHub token.
  - Internal Docker network plus an allowlist proxy: Anthropic API only; IP literals, private
    ranges and the GCP metadata server denied.
  - The proxy stays in the thin version because it is what makes bypassPermissions plus a token
    in the environment safe.
- **`harness/daily.sh --dry-run`:**
  - Pre-flight: STOP files, 03:00 / 05:15 / 06:30 London, free disk, `meta.json`.
  - Creates branch `daily/<date>` from `main`.
  - Phase 1 backlog pick, with a dry-run ledger (`~/.daily-racer/dry-runs.json`) so each night
    tries a different unblocked item. Nothing merges in dry runs, so the real picker would choose
    B01 every night.
  - Sundays run a maintenance dry run.
  - Spec via `claude -p --json-schema`, then locked and hashed. Build via `claude -p`.
  - Thin gates, up to 2 retries.
  - A usage limit or the deadline stops the run cleanly and logs it (no resume yet).
  - The journal goes on the local branch, with wall clock and usage per phase.
  - Nothing is pushed and no PR is opened.
- `config.env`, `prompts/ideate.md` + `build.md`, `budgets.json`, systemd service + timer
  (`OnCalendar=*-*-* 02:00:00 Europe/London`, `Persistent=false`, `RuntimeMaxSec`) running
  `--dry-run`, and `harness/scripts/dry-run-report.sh`: last night's item, gates, retries, per-phase
  wall clock against 06:30, usage, and the diff.
- Minimal `SETUP.md`: build the image, `claude setup-token`, install the timer, read the report,
  kill switches.
- **Checkpoint: you run `claude setup-token`.** I verify `claude -p` in the container,
  `--max-turns`, and whether `--max-budget-usd` is enforced on subscription auth.

### Dry-run week
The timer runs `--dry-run` nightly for a week. Each morning you read `dry-run-report.sh`. We tune turn
and time limits and prompts, compare usage against the weekly allowance (Opus vs Sonnet for the
builder), and treat any gate flake seen in a real night as a bug.

### Later (re-planned after the dry-run week)
Rough order:
1. **Go-live essentials:**
   - Secret redaction, failing closed. Required before anything is pushed from a public repo.
   - GitHub App, `gh-app-token.sh` and a push wrapper limited to `daily/*` and `daily-status`.
   - PR opening, with images on `daily-status`.
   - Judge: prompt, rubric, schema, run isolated.
   - Resume per §6.3.
   - Existing-work list from GitHub (App/owner authors only).
   - The rest of G9, plus G11.
2. **Art, UI and behaviour gates:** G5, G6, G7, G10 (revised design above), and G4 using the M1.5
   variance data.
3. **GitHub:** `gates.yml` CI (PR + push to `main`), `health.yml` (hourly 07:00–09:00 UTC,
   idempotent issue per London date, reads `daily-status`), `CODEOWNERS`, rulesets per deviation 1.
4. **Full checks:** full cheat suite (every §10 row and every gate, plus harness probes), and a 10×
   flakiness run including VM↔CI parity.
5. **Wrap-up:**
   - Full `SETUP.md`: GitHub App owned by Rhys-Demo-Org, Cloudflare Pages, rulesets.
   - Independent red team (HANDOVER M9) via `harness/prompts/red-team.md`.
   - Only then does the timer switch from `--dry-run` to live, and `PHASE0_STATUS.md` is deleted.

## Verification
- Every milestone: typecheck, unit tests, build (in the container).
- M1.5: spike results (pixel exactness, perf variance numbers) written into `PHASE0_STATUS.md`.
- M2: drive Dust Bowl by keyboard and Playwright touch at 844×390 and 1440×900; side-by-side with the
  mockups and concept frames.
- M3: the bot finishes Dust Bowl from every test seed; race position updates in the HUD.
- M4-thin: `run-gates.sh` green on the milestone branch; `self-test.sh` catches every included cheat
  with its expected gate; 10 identical thin-suite runs; one manual `daily.sh --dry-run` end to end on
  this VM before the timer is enabled; harness unit tests pass.
- Throughout: report results honestly, including anything flaky or skipped.
