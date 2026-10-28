# Handover: Daily AI-Built Racer (Phase 0 – Bootstrap)

You are bootstrapping a long-running experiment. An AI agent (you, in future headless runs) will invent and ship one new feature or level **every day** for a three-quarter-view arcade racer inspired by the feel of the original *Reckless Racing* (dirt tracks, drifting, short chaotic races). A human (the owner) reviews and merges each day's PR. Nothing else is human-made: all code, assets, ideas and tests are produced by AI.

This session's job is **not** to build the game. It is to build a small playable core plus the harness that lets future daily runs build, test and judge themselves safely. Optimise for the harness being trustworthy, measurable and hard to game. **Assume the daily builder will take any shortcut that turns the gates green.** Section 10 lists the known shortcuts; every one must be blocked by something the builder cannot write to.

## 0. How to work in this session
- **Start in plan mode.** Read this whole document and the design files, then produce a plan broken into milestones (see section 11). Wait for the owner to approve before writing code.
- Build one milestone at a time, with a commit per milestone and a short status note. Don't attempt everything in one pass.
- If the design files in section 2.2 are missing, stop and ask; don't invent a UI style.
- Ask the owner before choosing anything not specified here that would be hard to change later.
- **Phase 0 may span several sessions.** Keep `PHASE0_STATUS.md` at the repo root up to date (milestones done, in progress, open questions, next step) so a fresh session can pick up from the files alone. Delete it when Phase 0 is handed over.

### 0.1 The three phases of the experiment
1. **Phase 0 – Bootstrap** (interactive sessions with the owner, this document): the harness plus a minimal playable core (section 11).
2. **Phase 1 – Build-out** (daily runs): everything in the visual brief that Phase 0 didn't build, worked through in order from `guardrails/BACKLOG.md`. Phase 0 writes this backlog at the end of milestone 1 and gets owner approval. It covers the remaining mockup screens (S4 pause, S5 results, S6 title/track select), the desktop HUD and keycap legend, AI cars in every allowed livery, more opponents, and enough tracks for a few to choose from. Each item must fit within the gate 11 size limit and lists its `depends_on` items. Expect roughly 10–15 items; there is no fixed end date.
3. **Phase 2 – Invention** (daily runs): starts automatically once every backlog item has been merged. From then on the agent invents its own features, which must be things **not** in the visual brief or backlog, while still obeying every style rule.

The owner can add items to the backlog at any time; Phase 2 runs pause and the harness goes back to Phase 1 until the backlog is clear again.

---

## 1. Product constraints
- Runs in the browser on mobile **and** desktop; **mobile-first** (landscape, touch steering, mid-range Android at 30fps+). Desktop adds keyboard/gamepad.
- Installable as a PWA. Single codebase.
- Fixed tilted three-quarter "diorama" camera (~57° down, narrow FOV, never rotates, follows by translation only). Exact spec: `guardrails/design/UI_RULES.md` section 9.
- Every 3D asset is generated **in code**. No textures (including `CanvasTexture`/`DataTexture`), no external 3D models, no AI image/3D generators, no `data:` URIs. The only image files allowed in the repo are the reference designs in `guardrails/design/` (never shipped in the game) and test screenshots/baselines under `tests/baselines/`. PWA icons are generated at build time from code.
- Fonts: only Barlow Condensed (800/900, 900 italic) and Atkinson Hyperlegible (400/700), both OFL, self-hosted as woff2.

## 2. Art direction: "70s rally toy diorama" (strict)

### 2.1 3D world
- Low-poly meshes built from primitives via `BufferGeometry`, **vertex colours only**, flat normals.
- Toon shading with 3 hard steps on the **shade ladder** in `tokens.json` (base colour → one rung down → two rungs down), one directional light from screen top-left, plus ink inverted-hull outlines on every mesh. Values and thresholds: `UI_RULES.md` sections 8–9.
- All materials come from **one materials factory** in `src/render/materials/`. Nothing else in `src/` may construct a Three.js material or shader.
- Chunky toy proportions: big wheels, stubby bodies. Liveries = stripes and race numbers built from geometry, never decals.
- Shadows are fake blob shadows. Dust/mud = flat-coloured particles.
- **Palette is closed. Only these colours, ever:**
  `#F2E6C9` cream · `#C08A4F` dirt · `#8A5A32` dark dirt · `#6E8B3D` grass · `#3F5A2A` deep green · `#3E8A8C` teal · `#D64933` rally red · `#E3A72F` mustard · `#24324A` navy · `#1B1A1F` ink (outlines)
- Never compute a darker or lighter hex. Shading only ever steps down the ladder, so every rendered pixel of the 3D world (before outlines/anti-aliasing) is one of the 10 palette colours. Gate 5 verifies this by pixel, not just by inspecting vertex data.
- Car liveries, prop colours and the player-car rules are in `UI_RULES.md` section 8.

### 2.2 UI and reference designs (from Claude Design, provided by the owner)
These live in `guardrails/design/` and are the source of truth for all 2D UI and the 3D look:
- `tokens.json`: colours, shade ladder, text pairs, type scale, spacing, radius, outlines, shadows, touch sizes, motion, car colours. `guardrails/palette.json` must be generated from it, so there is one source of truth.
- `UI_RULES.md`: the rules sheet, including how to build any new UI element and the camera spec. Read it before any UI or rendering change.
- `mockups/`: S1–S2 race HUD + touch, S3 countdown, S4 pause, S5 results, S6 title/track select, desktop race HUD.
- `concept-frames/`: concept A (mobile 844×390) and B (desktop 1440×900) at the three-quarter camera angle. The visual target for the whole game, used by the judge (section 6).
- `boards/`: foundations, components, rules, tokens and motion boards (reference only).
- `source/Daily_AI_Racer_UI_Look.html`: the original Claude Design export. Open it in a browser to see the live motion demos and exact component CSS.

Build UI in plain DOM/CSS over the canvas, using CSS variables generated from `tokens.json`. Never hard-code a colour, font or size outside the tokens, in CSS **or** in TS (`el.style.*`, SVG attributes, canvas 2D). Where `UI_RULES.md` and this document disagree on look or feel, `UI_RULES.md` wins; where they disagree on harness or process, this document wins.

### 2.3 Swapping in a real reference frame
The concept frames are illustrations, so the real game will never match them pixel for pixel. At the end of milestone 2, capture the in-race view at 844×390 and 1440×900 and **ask the owner to approve them**. Approved shots go in `guardrails/design/reference-frames/` and become the judge's primary style reference; the concept frames stay as the secondary "intent" reference.

### 2.4 When the rules don't cover something (headless runs)
`UI_RULES.md` section 10 says "ask for a design update — don't invent". A daily run has nobody to ask. In that case the run must: write the need to `journal/runs/<date>/design-request.md`, and **pick a different idea** that the existing rules fully cover. It must never invent a new UI pattern, colour use or motion. The owner reviews design requests and may update `UI_RULES.md` by hand.

## 3. Tech stack (use exactly this)
- TypeScript (strict), Vite, Three.js, `vite-plugin-pwa`.
- **Custom deterministic arcade physics**: fixed timestep, seeded RNG, no physics engine. Simulation must be fully decoupled from rendering so it runs headless in Node.
- Vitest: unit tests, physics replay tests, bot-lap tests (headless, Node).
- Playwright (Chromium, mobile emulation, CPU throttling via CDP): perf, touch, screenshots, gameplay clip.
- `pixelmatch` for screenshot diffs.
- Hosting: Cloudflare Pages via its **GitHub integration** (preview deploy per branch with a link on the PR, production on `main`). No Cloudflare secrets in GitHub Actions.
- Node 22 LTS, pnpm. Pin all dependency versions (lockfile committed).
- **Daily runs may not add, remove or upgrade dependencies.** Any change to `package.json` or `pnpm-lock.yaml` fails the run. Only the owner changes dependencies.

## 4. Repo layout
```
/src/sim        deterministic simulation (cars, tracks, bots) – no Three.js imports
/src/render     Three.js scene, procedural meshes, shaders (materials factory lives here)
/src/ui         DOM/CSS HUD and menus (tokens only)
/src/content    tracks, cars, features (data + builders) – where daily work mostly lands
/src/input      touch, keyboard, gamepad
/tests          unit + replay + bot-lap tests (daily runs may ADD files; see gate 9)
/tests/baselines  lap-time, replay and screenshot baselines (add-only for daily runs; see gate 9)
/guardrails     STYLE.md, palette.json, budgets.json, judge-rubric.md, BACKLOG.md, design/, gates/*, cheats/*, manifest  (PROTECTED)
/harness        daily.sh, config.env, prompts/, scripts/  (PROTECTED)
/journal        runs/YYYY-MM-DD/ only (one folder per day; see section 9)
/.github        workflows, CODEOWNERS (PROTECTED)
```

### 4.1 Protected paths
Daily runs must never modify, create or delete anything in these paths:
- `guardrails/`, `harness/`, `.github/`
- `.claude/` (a modified settings file or hook would run in later steps, including the judge)
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`
- `tsconfig*.json`, `vite.config.*`, `vitest.config.*`, `playwright.config.*`, lint config files
- `index.html`, `public/`
- existing files under `tests/baselines/` (new files may be added)
- `journal/runs/*` folders other than today's

`CLAUDE.md` is editable only on maintenance days (section 6).

Enforcement, strongest first. Permission deny rules alone are **not** enforcement, because `Bash` can bypass them.
1. **Read-only mounts**: the build container mounts every protected path read-only.
2. **Trusted copies**: gates, the manifest and baselines are always read from `origin/main`, never from the branch under test.
3. **Push permission**: the GitHub App (section 7) has no "Workflows" permission, so GitHub rejects any push that touches `.github/workflows/`.
4. **CI check**: the protected-files gate runs in CI as a required status check, and CODEOWNERS covers every protected path.
5. Claude Code deny rules: an extra layer only.

Only the owner changes protected files, by hand, in separate PRs.

## 5. Gates (all scripted, run by the harness, not by the agent's say-so)

### 5.1 Trust model
- Gate code, gate configs, budgets, the manifest and existing baselines come from a **separate read-only checkout of `origin/main`**. Branch code is only ever the thing being tested.
- Each gate runs in a **fresh container** with the repo mounted read-only and a separate output directory that branch code cannot reach. Gate suites run in their **own process and Vitest config**, never in the same process as agent-written tests, so agent code cannot patch `fs`, `expect`, `Math.random`, `process.exit` and so on for the gate.
- The harness writes `gates.json` itself from exit codes and machine-readable reporter output. Anything missing counts as a fail: no output, a crash, a timeout, malformed JSON, or **zero tests executed**.
- Install happens once, before the build phase, with `pnpm install --frozen-lockfile --ignore-scripts`.
- A full gate run has a wall-clock cap of **20 minutes** (in `config.env`). Going over the cap is a fail, not a hang.

### 5.2 The gates
1. **Build & types & unit tests.** Strict TS, no `@ts-ignore`/`@ts-nocheck`/`eslint-disable` added.
2. **Bot laps**: a waypoint-following bot drives every registered track N times with fixed seeds. Fail if stuck, if it can't finish, if it respawns or teleports at all, or if any *existing* track's median lap time moves >10% versus the baseline on `main`. On maintenance days lap times must be identical.
3. **Physics replays**: recorded input sequences must reproduce car end positions within tolerance (exactly, on maintenance days). Recordings and expected positions come from `main`. New physics behaviour must be **opt-in per track, car or surface**, so existing replays never change.
4. **Mobile performance**: Playwright, phone viewport, 4× CPU throttle. Triangles, draw calls and bundle size are hard limits from `budgets.json`. Frame time is noisy on a GPU-less VM (SwiftShader), so measure it **A/B against `main` in the same run** (median of N runs each), and fail only if the branch is worse than `main` by more than the margin in `budgets.json`. The same rule applies in CI.
5. **Art & UI lint**:
   - Walk the scene graph at load **and at several points during a bot race**, so meshes spawned at runtime are covered. Fail on any vertex colour outside `palette.json`, any texture, any material not created by the materials factory, or any mesh without an outline.
   - **Pixel check**: render each track with outlines and anti-aliasing off; every pixel must be one of the 10 palette colours. This catches shader tricks.
   - Static lint on `src/`: no Three.js material/shader construction outside the factory; no hex/rgb/hsl colour literals outside the generated token module; no `data:` URIs.
   - Scan built CSS **and the computed styles of the live DOM on every screen** for colours, fonts, sizes, radii, shadows, or `opacity`/`filter`/gradient/blend usage not allowed by `tokens.json` and `UI_RULES.md`.
   - Check the camera config matches section 9 of `UI_RULES.md` (pitch 55–60°, no yaw/roll).
6. **Visual regression**: fixed camera shots per track and UI screen. New tracks or screens add new baseline files. Changes to an existing baseline are a **warning** on normal days: the diff images go into the PR and to the judge. On maintenance days any change is a **fail**.
7. **Touch smoke test**: menu → race → finish using simulated touch only.
8. **Protected files**: hash manifest from `main` matches, and `git diff origin/main --name-only` touches no protected path (section 4.1).
9. **Integrity**: compares the branch against `main`.
   - Every track, car and screen registered on `main` is still registered. Registration is also cross-checked against the file system: every file in `src/content/tracks/` and similar folders must be registered.
   - No test file present on `main` is deleted or modified (except on maintenance days), and the total test count does not go down.
   - No `.skip`, `.only`, `.todo`, `it.fails` or `passWithNoTests` anywhere.
   - Existing files under `tests/baselines/` are unchanged; only additions are allowed.
   - No environment sniffing in `src/`: `navigator.webdriver`, `process.env`, `import.meta.env` (except `DEV`/`PROD` in one config module), test-only query strings, and user-agent checks.
   - No new binary, image or font files outside the allowed paths.
   - `journal/` changes are limited to `journal/runs/<today>/`.
10. **Acceptance tests are real (red/green)**: the new test files are run against **`main`'s `src/`**, where they must **fail**, and against the branch, where they must pass. Each acceptance criterion in the spec must map to at least one such test. This catches tests that always pass. Purely visual features still need at least one test that proves they exist (for example "the scene graph on track X contains the new mesh" or "the HUD contains the new widget"). Maintenance days are exempt from this gate, since behaviour must not change.
11. **Size**: at most **800 changed lines** in `src/`, excluding tests and pure-data track files, at most **12 changed files**, and each track data file at most 300 lines. Limits live in `budgets.json`.

Every new track, car or screen must register itself so gates 2, 5 and 6 pick it up automatically. Registration works **by file convention** (for example `import.meta.glob` over `src/content/tracks/*`), never through a shared hand-edited index file. That way PRs that each add content don't conflict with each other. Output one machine-readable `gates.json` plus a human summary.

## 6. Daily loop (`harness/daily.sh`, systemd timer on an always-on VM)

### 6.1 Schedule and time limits
The owner's usage is a Claude subscription with a rolling 5-hour window. Runs must happen overnight and finish before the owner's day starts.
- systemd timer: `OnCalendar=*-*-* 02:00:00 Europe/London`, `Persistent=false`. The VM runs in UTC, and `Persistent=true` would fire a missed run at boot in the daytime.
- `daily.sh` refuses to start after **03:00** London time (catches late wake-ups).
- No new phase or retry starts after **05:15**.
- A hard `timeout` on the whole script kills everything at **06:30**.
- Per-phase limits come from `harness/config.env` (starting values, tune after the dry runs):

  | Phase | `--max-turns` | Wall clock |
  |---|---|---|
  | Ideate | 15 | 10 min |
  | Build | 60 | 75 min |
  | Each retry | 25 | 30 min |
  | Judge | 10 | 10 min |

- Models are set explicitly with `--model` from `config.env`. Default `claude-opus-5-5`; the owner may switch the builder to Sonnet if usage is too high. If a model ID is rejected (for example retired), the run aborts and raises a health issue (section 7.3) instead of failing silently every night.
- **Permission mode**: agent phases run with `--permission-mode bypassPermissions` **only inside the container**, where the read-only mounts and network proxy are the real controls. In `-p` mode, anything needing approval is silently denied, so the builder would otherwise stall. The harness refuses to start an agent phase if it detects it is not inside the container.
- **Fresh home per call**: every `claude -p` call gets a new, empty `HOME`/`CLAUDE_CONFIG_DIR` holding only the login token. Then no settings, auto-memory or session history carries between runs or from builder to judge.
- **Subscription auth (verified on the owner's Max plan, Claude Code 2.1.304):** `claude -p` runs headless on a subscription login. In the container, authenticate with `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`. **Never use `--bare`**: it ignores OAuth and only accepts an API key. `--max-turns` is enforced (the JSON result has `subtype: "error_max_turns"`). `--output-format json` reports `usage` and a notional `total_cost_usd`, and `--json-schema` enforces structured output (use it for ideate and judge). Also pass `--max-budget-usd` from `config.env` as an extra brake; milestone 6 must check whether it is enforced under subscription auth and document the result.
- If any `claude -p` call hits a usage or rate limit, or the 06:30 deadline cuts the build off, **stop cleanly**: log it, open no PR, and don't count it as a failed feature. Section 6.3 says what happens the next day. The exact output of a usage-limit error can't be produced on demand, so the classifier must match on the JSON `is_error`/`subtype`/`result` fields with a broad pattern ("usage limit", "rate limit", "429", "overloaded"), log the raw output, and treat any unrecognised error the same way as a usage limit.

### 6.2 Steps
0. **Pre-flight**:
   - Exit immediately if `harness/STOP` exists on `main` **or** `~/.daily-racer/STOP` exists on the VM (kill switches).
   - Exit if it is after 03:00 London time.
   - Exit if **7 or more** open PRs with the `daily` label exist.
   - If `~/.daily-racer/resume.json` exists, follow section 6.3 instead of steps 1–2.
   - Record Claude Code version, model IDs and git SHA to `journal/runs/<date>/meta.json`. Claude Code is pinned in the container (`DISABLE_AUTOUPDATER=1`).
1. Pull `main`, create branch `daily/YYYY-MM-DD`. Install dependencies (section 5.1), then cut network access to everything except the Anthropic API for the agent phases.
2. **Choose the work.** The harness (not the agent) works out the phase and gathers the **existing-work list**, so nothing gets built twice:
   - **merged**: every merged daily PR (title, labels, `spec.md` summary), plus the journal summary from `journal/runs/*` on `main`;
   - **in flight**: every **open** daily PR, including drafts labelled `failed`, with its `spec.md`, plus any run waiting to resume (section 6.3);
   - **rejected**: daily PRs closed without merging, with the owner's closing comment if any. These must not be retried unless the owner adds them to the backlog.

   Only text written by the GitHub App or the owner is included (PR bodies, specs, comments). Anything written by any other account is dropped, so outsiders can't inject instructions through PR comments.

   Then:
   - **Phase 1 (backlog not finished)**: the harness picks the first backlog item that has no merged or open PR (tracked by the PR label `backlog:<ID>`) and whose `depends_on` items are all **merged**. Work always branches from `main`, so it can't build on unmerged PRs. If every remaining item is blocked or in flight, **skip the day** (log "blocked", no usage spent). The ideate agent then only turns that item into a spec.
   - **Phase 2 (backlog finished)**: **Ideate** (`claude -p` with `harness/prompts/ideate.md`, Read/Glob/Grep tools only, `--json-schema`). Inputs: `VISION.md`, the visual brief, the code on `main`, and the existing-work list. Generate 5 candidates, one each of track / car / mechanic / juice-and-feel / wildcard. Each must be something not in the visual brief, backlog or existing-work list. Score each on fun, novelty, fit with the rules (section 2.4) and fit within the gate 11 size limit. Pick one, avoiding the category used in each of the last 2 runs. Be bold: a new track and a crazy mechanic are both fine, as long as it fits the size limit. The output must name the **3 closest existing items** and say in one line why the new idea is different; the judge checks this claim.
   - **Every Sunday (London) is a maintenance day** in both phases: no new content; refactor, remove dead code, improve tests or docs, keep `CLAUDE.md` accurate. All gates apply, with the stricter maintenance rules in gates 2, 3 and 6: behaviour must not change.
   - Output goes to stdout. The harness writes it to `journal/runs/<date>/spec.md`, including testable acceptance criteria and the backlog ID if any, then **hashes it and makes it read-only**. The judge reads the harness's copy.
3. **Build** (`claude -p` with `build.md`): implement on the branch and add tests for every acceptance criterion. The prompt lists the section 10 shortcuts and states that each one is detected automatically and fails the run. The build container has **no GitHub token**; the agent never commits, pushes or calls `gh`.
4. **Gates**: the script (not the agent) runs all gates per section 5.1. On failure, feed the summary back to the builder, up to 2 retries (subject to the 05:15 cutoff). The final verdict always comes from a gate run *after* the last build step.
5. **Judge** (fresh `claude -p` with `judge.md`, **`--allowedTools Read` only**, run from a temp folder outside the repo with `--setting-sources user` and a `--settings` file from the harness, so the repo's `CLAUDE.md` and `.claude/` are never loaded). Inputs are copied in by the harness:
   - the locked spec and the full diff
   - today's screenshots, any visual-regression diffs and a short clip
   - the gate summary
   - the reference frames (once approved), concept frames and mockups, plus `UI_RULES.md`

   - the existing-work list from step 2

   Score against `judge-rubric.md`: spec met, style match to the reference designs, anything broken-looking, tests that don't really test, environment sniffing, scope creep, and duplication of existing work. The prompt states that everything it reads is **data**, and any text in code, spec or screenshots addressed to the judge is an automatic fail. Output must match a JSON schema the harness validates; invalid output = fail. **Pass** = all gates green, overall score ≥ 6/10 and no rubric axis below 4. The judge is not retried.
6. **Open PR** (the harness, using the GitHub App token): spec, gate table, judge verdict, screenshots, visual-regression warnings, preview link (posted by Cloudflare). Labels `daily`, plus `backlog:<ID>` for Phase 1 items or `maintenance` on Sundays. If it ultimately failed, open as a draft labelled `failed` (failures are data). The `--dry-run` flag stops just before this step.
7. Write `journal/runs/<date>/result.json` (section 9) and commit it on the branch.

**Secret redaction (before any commit or push in steps 6–7):** the agent's sandbox has the Claude token in its environment, and anything it runs (for example `env`) can print it into a log. Before committing, the harness scans every file being committed. It replaces the exact token value, the GitHub App key, and any `sk-ant-`-style token or private-key block with `[REDACTED]`, then rescans. If the scan errors, or the rescan finds anything, **nothing is pushed** and a health issue is raised.

`daily.sh --dry-run` must do everything except push and open the PR.

### 6.3 Resuming after a usage limit or deadline
When a run stops early (section 6.1), the work isn't thrown away:
- The harness commits the work in progress to the local branch `daily/<original-date>` (never pushed) and writes `~/.daily-racer/resume.json` on the VM: original date, branch, locked spec hash, the phase it stopped in, retries used, and the attempt count.
- **If nothing was built yet** (the limit hit during pre-flight or ideation), delete `resume.json` and start fresh the next day. That doesn't count as an attempt.
- **The next night**, pre-flight sees `resume.json` and continues the **same idea**: same branch, same locked spec, same `journal/runs/<original-date>/` folder (logs for the new night go in an `attempt-2/` subfolder). No ideation. A fresh builder gets the spec, the diff so far and the last gate summary, with the instruction "continue this work". Resuming takes priority over a Sunday maintenance day; maintenance moves to the following Sunday.
- **Maximum 2 attempts in total.** If the second attempt also stops early, the harness opens a draft PR labelled `failed` and `incomplete` with whatever exists, deletes `resume.json`, and the next night starts fresh. This stops one oversized idea from using up several nights.
- In the existing-work list (step 2) a resumable run counts as **in flight**, so it is never re-ideated.

## 7. GitHub
### 7.1 Auth: a GitHub App (no extra account or email needed)
The owner creates a private GitHub App under their own account and installs it on this repo only. Permissions: Contents read/write, Pull requests read/write, Issues read/write (for health issues), Metadata read. **No Workflows, no Administration.** The private key lives on the VM, outside the repo and outside the build container. `harness/scripts/gh-app-token.sh` mints a 1-hour installation token (JWT signed with `openssl`) and passes it to `git push` and `gh` as `GH_TOKEN`, only in steps 6–7.

Because PRs are authored by `<app-name>[bot]` rather than the owner:
- the owner can approve them (GitHub doesn't allow approving your own PR);
- the owner gets notified (watch the repo in the GitHub mobile app).

Branch protection on `main`: require a PR, 1 approving review, required status checks (all CI gates plus the protected-files check), Code Owner review, "require branches to be up to date before merging" (so CI reruns against the latest `main` after each merge), and "do not allow bypassing". The App can push branches and open PRs but cannot merge.

### 7.2 Actions
- **On PR**: rerun every gate independently (never trust the VM's report). Check out the PR into one folder and `main`'s `guardrails/` and baselines into another; gates always run from `main`'s copy. Upload artifacts. The workflow needs no secrets.
- **Previews and production**: handled by the Cloudflare Pages GitHub integration (preview per branch with a PR comment, production on `main`).

### 7.3 Health check (so failures are never silent)
- A scheduled workflow runs at **08:00 London** every day. If no daily PR was opened or updated overnight, and the VM didn't record a planned skip (STOP, 7 open PRs, Phase 1 blocked, or stopping early per section 6.3), it opens or updates a GitHub issue labelled `harness-health`. You get that notification on your phone. This covers the VM being off, a broken timer, or a crashed script.
- The VM records planned skips by pushing `journal/runs/<date>/result.json` to a `daily-status` branch, which isn't protected and is never merged.
- `daily.sh` also raises a `harness-health` issue directly, using the App token, for errors it can see: rejected model ID, failed secret redaction, gate infrastructure crash, or disk nearly full.
- The workflow needs no secrets (it uses the built-in `GITHUB_TOKEN` with `issues: write`).

## 8. Security and usage (the VM runs an unattended agent)
- Run every agent phase and every gate inside a container with only the repo mounted (protected paths read-only, section 4.1). No other secrets in the container.
- Claude auth: a long-lived subscription token from `claude setup-token`, passed as `CLAUDE_CODE_OAUTH_TOKEN`. No API key, no `--bare` (section 6.1). The token lives on the VM outside the repo and is passed into the container as an environment variable only for the agent phases.
- Web access tools disabled for daily runs (removes prompt-injection paths). Outbound network for agent phases: Anthropic API only. The package registry is reachable only during the install step.
- **How network restriction works:** Docker can't filter by domain name. Run the agent and gate containers on an **internal-only Docker network** with no route out. The only way out is a small forward-proxy container (for example tinyproxy or squid) with a domain allowlist from `config.env`, reached through `HTTPS_PROXY`. Gates get no network at all. `self-test.sh` checks that `curl https://example.com` fails from inside the agent container.
- Usage is controlled by the time window, `--max-turns`, wall-clock limits and model choice (section 6.1). Record `usage` and `total_cost_usd` from `--output-format json` per phase as a cost proxy.
- Keep full run logs in `journal/runs/<date>/`, redacted per section 6.2. Logs are written outside the container and copied in at the end, so the agent can't edit them.
- **Disk cleanup** at the end of every run: remove stopped containers, dangling images, Playwright videos and screenshots older than 14 days (they're already in the PR/CI artifacts), and local `daily/*` branches whose PR is merged or closed. Pre-flight raises a health issue if free disk is below 10 GB.
- Owner-maintained versions: Claude Code, Node, pnpm, Playwright and the model IDs are only changed by the owner, in `harness/config.env` and the container definition.

## 9. Metrics and journal
Shared append-only files would conflict whenever several daily PRs are open. Instead, each run writes only to its own `journal/runs/<date>/` folder: `meta.json`, `spec.md`, `gates.json`, `judge.json`, `result.json`, logs, and optionally `design-request.md`.

`harness/scripts/journal-summary` generates `IDEAS.md`, `CHANGELOG.md` and `metrics.csv` from those folders on demand (gitignored; used as ideation input and by the owner). Merged status is computed live from `gh` when the summary is generated, not stored.

`result.json` fields: date, phase (1/2), attempt count, model IDs, Claude Code version, idea type (backlog/track/car/mechanic/juice/wildcard/maintenance), backlog ID, gates passed/failed (per gate), retries, judge score, median lap times, p95 frame time, triangle count, bundle size, diff size, per-phase usage, and abort reason if any. The owner adds a weekly fun rating (1–10) separately in `journal/fun.csv`. Phase 0 produces the day-0 baseline folder.

## 10. Threat model and cheat suite
Known shortcuts a daily builder might take, and what blocks each one:

| Shortcut | Blocked by |
|---|---|
| Edit gates, budgets, manifest, workflows, configs, `.claude/` | Read-only mounts, trusted `main` copies, App has no Workflows permission, gate 8 |
| Regenerate or edit baselines | Baselines read from `main`; gate 9 add-only |
| Unregister or delete a track/screen | Gate 9 registry check |
| Delete or weaken tests, `.skip`/`.only` | Gate 9 |
| Tests that always pass | Gate 10 red/green, judge reviews the diff |
| Edit the spec mid-build | Spec locked and hashed by the harness |
| Behave differently under test | Gate 9 sniffing lint, judge reviews the diff |
| Runtime-spawned off-palette meshes, custom shaders, textures | Gate 5 in-race scene walk, pixel check, factory lint |
| Colours via inline styles, SVG, canvas | Gate 5 computed-style scan and literal lint |
| Bot teleport/respawn to finish | Gate 2 |
| New dependencies or install scripts | Frozen lockfile, `--ignore-scripts`, gate 8 |
| Write `gates.json` or patch the gate process from test code | Separate process, read-only repo, harness-owned output |
| Commit/push/open PR itself | No GitHub token in the build container |
| Print the Claude token into a log that gets committed | Secret redaction before every commit (section 6.2), fails closed |
| Leave notes in `~/.claude` memory or settings for later runs or the judge | Fresh home per `claude -p` call |
| Instructions slipped in via PR comments from other accounts | Existing-work list only uses text written by the App or owner |
| Reach the internet from the sandbox | Internal-only network plus allowlist proxy; checked by `self-test.sh` |
| Instructions to the judge hidden in code, spec or screenshots | Isolated judge, Read-only tools, explicit auto-fail rule, schema validation |
| Oversized feature | Gate 11, 2-attempt cap (section 6.3) |
| Re-create something already merged, open or rejected | Harness-built existing-work list, "3 closest items" claim, judge duplication check |

**Cheat suite**: `guardrails/cheats/` holds one known-bad patch per row above (and per gate). `harness/scripts/self-test.sh` applies each patch to a scratch branch, runs the gates, and passes only if **every** patch is caught by the expected gate. It must pass before handover, during the first-week dry runs, and after any owner change to `guardrails/` or `harness/`.

## 11. What to deliver in THIS session (milestones)
1. Repo scaffold per section 4, `VISION.md` (short, from this doc), `CLAUDE.md` (architecture + conventions), `PHASE0_STATUS.md`, design files wired in, `palette.json` generated from tokens, and a draft `guardrails/BACKLOG.md` for Phase 1 (section 0.1) for the owner to approve. Each item has an ID, a short description, `depends_on`, and fits the gate 11 size limit.
2. Deterministic sim + player car + one dirt oval track with a jump, hay bales, tyre stacks and cone trees, drivable via touch and keyboard, at the section 9 camera, in the art style, with HUD, touch controls and countdown matching the mockups. Then do the reference-frame approval in section 2.3.
3. One bot opponent using the same bot as the lap gate.
4. All 11 gates working per section 5.1, with baselines generated, plus the cheat suite and `self-test.sh` (section 10) passing.
5. **Flakiness check**: run the full gate suite 10 times on unchanged code; any non-deterministic result is a bug to fix before handover. Report each gate's run time; the full suite must fit the 20-minute cap with room to spare.
6. `harness/daily.sh` (pre-flight, time limits, dry-run, phase detection, existing-work list, maintenance-day logic, stopping early and resuming per section 6.3), `config.env`, the three prompts, `judge-rubric.md` + judge JSON schema, `budgets.json`, `gh-app-token.sh`, `journal-summary`, the systemd service and timer units.
7. The GitHub workflows (PR gates, health check per section 7.3), CODEOWNERS.
8. `SETUP.md`: exact steps for the owner to provision the VM (Ubuntu), the container sandbox, Node/pnpm/Playwright/Claude Code/gh, `claude setup-token`, creating and installing the GitHub App, Cloudflare Pages GitHub integration, branch protection, and the systemd timer. Include a "first week" checklist: run `self-test.sh`, then 3–5 manual `--dry-run`s reviewed by the owner before enabling the timer. Each dry run must report wall-clock time per phase (against the 06:30 deadline) and usage per phase, so the owner can choose Opus or Sonnet for the builder with the weekly Max allowance in mind.
9. **Independent red-team session**: after milestone 8, the owner starts a **fresh** Claude Code session with no Phase 0 context. Its only job is to find a way to get a bad change past the harness (merged, or reported green) without the owner noticing. Every hole it finds gets a fix and a new patch in `guardrails/cheats/`. Only then is the timer enabled.

## 12. Rules
- Keep the core small and boring; future days add content. Do not build menus beyond what the mockups and touch test need.
- Prefer clarity over cleverness: future agents with no memory must understand the codebase from the files alone.
- Finish by running every gate, the cheat suite and the flakiness check, and report results honestly, including anything flaky or skipped.
