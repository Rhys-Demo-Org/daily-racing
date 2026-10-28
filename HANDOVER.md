# Handover: Daily AI-Built Racer (Phase 0 – Bootstrap)

You are bootstrapping a long-running experiment. An AI agent (you, in future headless runs) will invent and ship one new feature or level **every day** for a three-quarter-view arcade racer inspired by the feel of the original *Reckless Racing* (dirt tracks, drifting, short chaotic races). A human (the owner) reviews and merges each day's PR. Nothing else is human-made: all code, assets, ideas and tests are produced by AI.

This session's job is **not** to build the game. It is to build a small playable core plus the harness that lets future daily runs build, test and judge themselves safely. Optimise for the harness being trustworthy, measurable and hard to game.

## 0. How to work in this session
- **Start in plan mode.** Read this whole document and the design files, then produce a plan broken into milestones (see section 10). Wait for the owner to approve before writing code.
- Build one milestone at a time, with a commit per milestone and a short status note. Don't attempt everything in one pass.
- If the design files in section 2.2 are missing, stop and ask; don't invent a UI style.
- Ask the owner before choosing anything not specified here that would be hard to change later.

---

## 1. Product constraints
- Runs in the browser on mobile **and** desktop; **mobile-first** (landscape, touch steering, mid-range Android at 30fps+). Desktop adds keyboard/gamepad.
- Installable as a PWA. Single codebase.
- Fixed tilted three-quarter "diorama" camera (~57° down, narrow FOV, never rotates, follows by translation only). Exact spec: `guardrails/design/UI_RULES.md` section 9.
- Every 3D asset is generated **in code**. No textures, no external 3D models, no AI image/3D generators. The only image files allowed in the repo are the reference designs in `guardrails/design/` (never shipped in the game) and test screenshots.
- Fonts: only Barlow Condensed (800/900, 900 italic) and Atkinson Hyperlegible (400/700), both OFL, self-hosted as woff2.

## 2. Art direction: "70s rally toy diorama" (strict)

### 2.1 3D world
- Low-poly meshes built from primitives via `BufferGeometry`, **vertex colours only**, flat normals.
- Toon shading with 3 hard steps on the **shade ladder** in `tokens.json` (base colour → one rung down → two rungs down), one directional light from screen top-left, plus ink inverted-hull outlines on every mesh. Values and thresholds: `UI_RULES.md` sections 8–9.
- Chunky toy proportions: big wheels, stubby bodies. Liveries = stripes and race numbers built from geometry, never decals.
- Shadows are fake blob shadows. Dust/mud = flat-coloured particles.
- **Palette is closed. Only these colours, ever:**
  `#F2E6C9` cream · `#C08A4F` dirt · `#8A5A32` dark dirt · `#6E8B3D` grass · `#3F5A2A` deep green · `#3E8A8C` teal · `#D64933` rally red · `#E3A72F` mustard · `#24324A` navy · `#1B1A1F` ink (outlines)
- Never compute a darker or lighter hex. Shading only ever steps down the ladder, so every rendered pixel of the 3D world (before outlines/anti-aliasing) is one of the 10 palette colours.
- Car liveries, prop colours and the player-car rules are in `UI_RULES.md` section 8.

### 2.2 UI and reference designs (from Claude Design, provided by the owner)
These live in `guardrails/design/` and are the source of truth for all 2D UI and the 3D look:
- `tokens.json`: colours, shade ladder, text pairs, type scale, spacing, radius, outlines, shadows, touch sizes, motion, car colours. `guardrails/palette.json` must be generated from it, so there is one source of truth.
- `UI_RULES.md`: the rules sheet, including how to build any new UI element and the camera spec. Read it before any UI or rendering change.
- `mockups/`: S1–S2 race HUD + touch, S3 countdown, S4 pause, S5 results, S6 title/track select, desktop race HUD.
- `concept-frames/`: concept A (mobile 844×390) and B (desktop 1440×900) at the three-quarter camera angle. The visual target for the whole game, used by the judge (section 6).
- `boards/`: foundations, components, rules, tokens and motion boards (reference only).
- `source/Daily_AI_Racer_UI_Look.html`: the original Claude Design export. Open it in a browser to see the live motion demos and exact component CSS.

Build UI in plain DOM/CSS over the canvas, using CSS variables generated from `tokens.json`. Never hard-code a colour, font or size outside the tokens. Where `UI_RULES.md` and this document disagree on look or feel, `UI_RULES.md` wins; where they disagree on harness or process, this document wins.

### 2.3 Swapping in a real reference frame
The concept frames are illustrations, so the real game will never match them pixel for pixel. At the end of milestone 2, capture the in-race view at 844×390 and 1440×900 and **ask the owner to approve them**. Approved shots go in `guardrails/design/reference-frames/` and become the judge's primary style reference; the concept frames stay as the secondary "intent" reference.

## 3. Tech stack (use exactly this)
- TypeScript (strict), Vite, Three.js, `vite-plugin-pwa`.
- **Custom deterministic arcade physics**: fixed timestep, seeded RNG, no physics engine. Simulation must be fully decoupled from rendering so it runs headless in Node.
- Vitest: unit tests, physics replay tests, bot-lap tests (headless, Node).
- Playwright (Chromium, mobile emulation, CPU throttling via CDP): perf, touch, screenshots, gameplay clip.
- `pixelmatch` for screenshot diffs.
- Hosting: Cloudflare Pages (preview deploy per PR, production on `main`).
- Node 22 LTS, pnpm. Pin all dependency versions (lockfile committed).

## 4. Repo layout
```
/src/sim        deterministic simulation (cars, tracks, bots) – no Three.js imports
/src/render     Three.js scene, procedural meshes, shaders
/src/ui         DOM/CSS HUD and menus (tokens only)
/src/content    tracks, cars, features (data + builders) – where daily work mostly lands
/src/input      touch, keyboard, gamepad
/tests          unit + replay + bot-lap tests (agent may ADD files here)
/guardrails     STYLE.md, palette.json, budgets.json, judge-rubric.md, design/, gates/*, manifest  (PROTECTED)
/harness        daily.sh, prompts/, scripts/ (PROTECTED)
/journal        IDEAS.md, CHANGELOG.md, metrics.csv, runs/YYYY-MM-DD/  (append-only for daily runs)
/.github        workflows (PROTECTED)
```
`/guardrails`, `/harness` and `/.github` are **protected**: daily runs must never modify them. Enforce this three ways: Claude Code permission deny rules for those paths, a hash manifest checked by the gates, and a CI check that fails any PR touching them. Only the owner changes protected files, by hand, in separate PRs.

## 5. Gates (all scripted, run by the harness, not by the agent's say-so)
1. **Build & types & unit tests.**
2. **Bot laps**: a waypoint-following bot drives every registered track N times with fixed seeds. Fail if stuck, can't finish, or any *existing* track's median lap time moves >10% versus the stored baseline.
3. **Physics replays**: recorded input sequences must reproduce car end positions within tolerance. Fail on drift.
4. **Mobile performance**: Playwright, phone viewport, 4× CPU throttle. Budgets from `budgets.json` (p95 frame time, triangles, draw calls, bundle size).
5. **Art & UI lint**: load every scene headless; fail on any vertex colour outside `palette.json`, any texture, any material without the toon shader, any mesh without outline. Scan built CSS for colours, fonts, sizes, radii, shadows or `opacity`/`filter`/gradient usage not allowed by `tokens.json` and `UI_RULES.md`. Check the camera config matches section 9 of `UI_RULES.md` (pitch 55–60°, no yaw/roll).
6. **Visual regression**: fixed camera shots per track and UI screen compared to baselines; new tracks create new baselines, changed old ones are flagged.
7. **Touch smoke test**: menu → race → finish using simulated touch only.
8. **Protected-files check**: hash manifest unchanged.

Every new track/car/screen must register itself so gates 2, 5, 6 pick it up automatically. Output one machine-readable `gates.json` plus a human summary.

## 6. Daily loop (`harness/daily.sh`, systemd timer on an always-on VM)
0. **Pre-flight**: exit immediately if `harness/STOP` exists (kill switch). Check today's spend against the cap. Record Claude Code version, model ID, and git SHA to `journal/runs/<date>/meta.json`.
1. Pull `main`, create branch `daily/YYYY-MM-DD`.
2. **Ideate** (`claude -p` with `harness/prompts/ideate.md`): read `VISION.md`, `IDEAS.md`, `CHANGELOG.md`; propose one idea that fits in a day, fits the style, isn't a repeat. Write a spec with testable acceptance criteria to `journal/runs/<date>/spec.md`.
   - **Every 7th day is a maintenance day**: no new content; refactor, remove dead code, improve tests or docs, keep `CLAUDE.md` accurate. All gates still apply and behaviour must not change.
3. **Build** (`claude -p` with `build.md`): implement on the branch, add tests for the acceptance criteria.
4. **Gates**: the script (not the agent) runs all gates. On failure, feed the report back to the builder; max 2 retries.
5. **Judge** (fresh `claude -p` with `judge.md`, no build context): given the spec, today's screenshots, a short clip, the gate summary and the **reference frames (once approved), concept frames and mockups from `guardrails/design/`** plus `UI_RULES.md`, score against `judge-rubric.md` (spec met, style match to the reference designs, anything broken-looking). Return a JSON verdict.
6. **Open PR** with `gh pr create`: spec, gate table, judge verdict, screenshots, preview link (from CI). If it ultimately failed, open as a draft labelled `failed` (failures are data).
7. Append to `IDEAS.md`, `CHANGELOG.md` and one row to `journal/metrics.csv`.

`daily.sh --dry-run` must do everything except push and open the PR.

The VM's GitHub token can push branches and open PRs but **cannot merge** (branch protection + required review from the owner). The owner is notified by the PR itself (GitHub mobile app).

## 7. GitHub Actions
- **On PR**: rerun every gate independently (never trust the VM's report alone), upload artifacts, run the protected-files check, deploy a Cloudflare Pages preview and post its link on the PR so the owner can play it on their phone before merging.
- **On merge to `main`**: deploy production.

## 8. Security and cost (the VM runs an unattended agent)
- Run the daily agent inside a container/sandbox with only the repo mounted. No other secrets on the VM.
- GitHub token: fine-grained, this repo only, contents + pull requests write, no admin, no merge.
- Web access tools disabled for daily runs (removes prompt-injection paths). Restrict outbound network to what's needed (Anthropic API, GitHub, package registry).
- API key has a monthly spend cap. Each `claude -p` call has a max-turns and wall-clock limit set in the script.
- Keep full run logs in `journal/runs/<date>/` (excluding secrets).

## 9. Metrics (define on day 0, record every run)
`journal/metrics.csv`, one row per day: date, model ID, Claude Code version, idea type (track/car/feature/maintenance), gates passed/failed (per gate), retries, judge score, merged (filled in later by CI on merge), median lap times, p95 frame time, triangle count, bundle size, cost. The owner adds a weekly fun rating (1–10) separately. Phase 0 produces the day-0 baseline row.

## 10. What to deliver in THIS session (milestones)
1. Repo scaffold per section 4, `VISION.md` (short, from this doc), `CLAUDE.md` (architecture + conventions), design files wired in, `palette.json` generated from tokens.
2. Deterministic sim + player car + one dirt oval track with a jump, hay bales, tyre stacks and cone trees, drivable via touch and keyboard, at the section 9 camera, in the art style, with HUD, touch controls and countdown matching the mockups. Then do the reference-frame approval in section 2.3.
3. One bot opponent using the same bot as the lap gate.
4. All 8 gates working, with baselines generated. For each gate, include at least one unit test proving it fails on an obviously bad input (a light sanity check, not a full red-team suite).
5. **Flakiness check**: run the full gate suite 10 times on unchanged code; any non-deterministic result is a bug to fix before handover.
6. `harness/daily.sh` (with pre-flight, dry-run, maintenance-day logic), the three prompts, `judge-rubric.md`, `budgets.json`, metrics recording.
7. Both GitHub workflows.
8. `SETUP.md`: exact steps for the owner to provision the VM (Ubuntu), the container sandbox, Node/pnpm/Playwright/Claude Code/gh, secrets, spend cap, Cloudflare Pages, branch protection, and the systemd timer. Include a "first week" checklist: 3–5 manual dry runs reviewed by the owner before enabling the timer.

## 11. Rules
- Keep the core small and boring; future days add content. Do not build menus beyond what the mockups and touch test need.
- Prefer clarity over cleverness: future agents with no memory must understand the codebase from the files alone.
- Finish by running every gate and the flakiness check, and report results honestly, including anything flaky or skipped.
