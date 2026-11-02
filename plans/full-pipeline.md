# Plan: the full nightly pipeline

Status: **approved** (2026-11-02, revised after an independent review). M1a is being built.
HANDOVER.md stays the spec except where this plan says otherwise. Where it overlaps the "Later"
list in `plans/phase0-plan.md`, this plan replaces it.

## Why
What runs each night today:

- ideate → build → scripted gates G1/G2/G3/G8 → PR.
- No agent checks the idea before code is written.
- No agent reviews or refactors the code afterwards.
- The judge was deferred, so it has never run.
- Sundays get "one small cleanup".

What the owner intended (2026-11-02; cost is not a constraint, result quality is the goal):

1. An agent comes up with the idea.
2. A separate agent audits the idea and plan before any code is written.
3. An agent builds it.
4. A new, independent agent audits the build, reviews the code, refactors it and applies its fixes.
5. A PR goes up for the owner's final test.
6. On the 7th day there is no feature: a refactor and dedupe of the whole codebase.
7. Every idea is checked so nothing is built twice.

Points 2, 4 and 6 were lost before HANDOVER v0. The daily loop in the original chat was Ideate,
Build, Gates, Judge, PR.

Evidence from the first four (dry-run) nights:

- **B01 and B02 played well, but an after-the-fact review found real problems in both:**
  - B01: touches passed through the pause overlay to the controls, the game loop kept running while
    paused, and the Esc listener leaked.
  - B02: stale result order and "1 LAPS", plus about 50 lines duplicating existing code.
  - B02's spec also planned to leave the old finish panel as dead code, and one of its acceptance
    criteria forced a workaround of a source-rules test.
- **B03 overlapped the open B02 work and had almost no visible effect.** The root cause is the
  backlog: B03 changes the finish UI but has `depends_on: none` instead of B02.
- **Nights are short.** Every night took 4–5 minutes of a 4.5-hour window. The binding limit is the
  Max plan's weekly usage, not the clock.

## Principles
- **Independent agents.** Every agent is a fresh `claude -p` with a fresh HOME. No agent sees
  another's transcript or self-assessment. Only artefacts the harness copies pass between them.
  The builder's notes are moved out of the tree before review.
- **Findings need evidence.** A reviewer's finding is only applied once a verifier has reproduced
  it, with a failing test or a concrete trace. Bug fixes come with a red/green test.
- **Test behaviour, not internals.** Acceptance-criterion tests go through public seams:
  - the DOM by role and text;
  - `RaceView`;
  - `window.__racer`;
  - exported content data.

  Tests that pin internal class or function names freeze those names forever, because tests are
  append-only.
- **Measure the harness.** Every prompt, model, Claude Code or harness change is scored on an eval
  set before it goes live. Harness changes ship on a fixed weekday, so their effect can be told
  apart from model updates.
- **Learning only through owner-merged text.** Agents never learn from earlier agents' output
  directly. Lessons reach future nights only via files the owner merges, which keeps out
  instruction injection.

## A feature night
| # | Phase | Who | Tools / writes | Gets | Produces |
|---|---|---|---|---|---|
| 0 | Pre-flight | script | — | kill switches, time, disk, usage budget, `resume.json` | meta.json, incl. **harness SHA and prompt hashes** |
| 1 | Upkeep (M2) | script + resolver agent | resolver: builder allowlist on that PR's branch | open daily PRs behind `main` | merges `main` in, resolves conflicts, re-runs gates, pushes |
| 2 | Owner revisions (M2) | fresh builder → review → gates | builder allowlist | PRs with `/revise` comments or "changes requested" | updated PRs. **Revisions take priority over new work.** |
| 3 | Existing-work list + pick | script | — | GitHub daily PRs (App/owner text only), backlog, journal on `main` | `existing-work.md`, item, open PRs' file lists |
| 4 | Ideate | agent A | Read/Glob/Grep, `--json-schema` | item or (Phase 2) brief, VISION, code, existing-work list | draft spec |
| 5 | Plan audit | agent B | Read/Glob/Grep, `--json-schema` | draft spec, item, existing-work list, in-flight specs and diffs, harness-computed file overlap, UI_RULES, mockups, code | approve / revise / defer / reject |
| 6 | Build + gates + ≤2 retries | agent C (fresh per retry) | builder allowlist | locked spec + audit + mockup PNGs + **its own stage screenshots** | code, tests |
| 7 | Review fan-out | reviewers R1–R5, in parallel | Read only, `--json-schema` | spec, audit, diff, gates, screenshots, codebase inventory/clone report | findings |
| 8 | Verify | agent V | Read + run tests (no `src` writes) | all findings | each finding marked verified (with a failing test or trace) or dropped |
| 9 | Fix and refactor | agent F | builder allowlist | verified findings only | **one commit per finding**, red/green test per bug, `review.md` |
| 10 | Gates | script | — | the reviewed tree | commits that fail are dropped one at a time; verified fixes that pass stay |
| 11 | Judge | agent E, isolated | Read only, `--json-schema` | spec, diff, screenshots, gates, references; **scores blind first**, then reads `review.md` and checks its claims | score and verdict |
| 12 | Judge fix round | fresh F → gates → judge | builder allowlist | the judge's failures | one round, then the PR |
| 13 | PR | script | — | everything above | ready PR on pass; otherwise draft labelled `failed` |

### Plan audit (step 5)
The auditor's checklist:

- **Scope.** In scope and on-style per UI_RULES. Size is not a reason to reject.
- **Design rules.** If UI_RULES doesn't cover it, the auditor writes `design-request.md`.
- **Duplicates.** Not a duplicate of merged, open or rejected work.
- **In-flight overlap.** The harness intersects the draft's `expectedFiles` with every open PR's
  files and hands the auditor the result.
- **Testable criteria.** Every acceptance criterion is testable through a public seam. Criteria
  naming internals are rejected.
- **Retired code.** Code the feature replaces is named in `supersedes`, not left as dead code.
- **Visible change.** The owner will see a difference, and the spec says how to play-test it.
- **Backlog fixes.** It may file a backlog-change request, e.g. "B03 should depend on B02". The
  owner applies it.

The spec schema gains `expectedFiles`, `supersedes` (modules this feature retires; G1/G9 allow
deleting exactly those modules' tests along with them) and `playtest` ("What you'll see", "How to
test").

What each verdict does:

- **revise:** a fresh ideate agent gets the findings. Then a fresh auditor runs. At most 2 rounds.
- **defer:** "waits on #n". The picker treats it as a soft dependency and tries the next item.
- **reject:** the reason is recorded and the next item is tried (at most 2 items a night). If
  nothing passes, the night goes to upkeep and revisions.
- **approve:** the spec is locked and hashed with the audit attached.

### Review (steps 7–10)
Five read-only reviewers, each with one focus:

- **R1, spec:** each acceptance criterion is truly met, and the test really proves it.
- **R2, correctness and determinism:** state leaks, listeners, edge cases, input, replays.
- **R3, duplication:** against a harness-generated inventory of exported helpers and components and a
  clone report. Reuse instead of parallel copies; flag dead or superseded code.
- **R4, UI_RULES with screenshots:** compares the stage screenshots with the mockups and boards.
- **R5, test strength:** reads the mutation report (M2) and spots trivial assertions.

**R2 runs on Sonnet 5.5 at max effort** as a model-diversity trial. It stays only if the evals show it finds things
Opus misses. The verifier is what stops "confident" but wrong findings, and stops the fixer
over-refactoring.

### Screenshots from M1
Pause, results and menu screens can't be reached through `__racer`. So M1 adds a **screen-stage
convention**: `*.stage.ts` fixtures registered by glob, like stories.

- A harness script renders every stage, plus race frames, at 844×390 and 1440×900.
- The builder self-checks them against the mockup PNG. Today `build.md` never tells it to open the
  mockup.
- R4, the judge and the PR body all get them.
- The same stages later give G6 visual regression and the maintenance day's DOM and style snapshots.

### PR
The body is in this order:

1. **How to play-test** and **What you'll see**.
2. The preview link.
3. Any CLAUDE.md or rule change, shown in its own highlighted section.
4. The spec, the audit, verified findings and fixes, the judge verdict, the gate table and usage.

Labels are `daily`, `backlog:Bxx` or `maintenance`, plus `failed` when it applies. The PR requests
the owner's review, so it lands on the owner's phone with the preview link.

## The 7th day: survey everything, change in safe bounded steps
The owner leans towards whole-codebase. The review agrees: survey everything, but apply changes in
steps whose behaviour is proven unchanged. At about 5.5k `src` lines a whole-codebase survey is
cheap. Split it by module once it grows.

1. **Survey.** Read-only reviewers per area (sim, render, ui, content, tests), plus:
   - one cross-cutting duplication pass fed by the clone report;
   - one **performance pass**: per-frame allocations, draw calls, triangle counts, DOM work per frame,
     and G4 numbers once G4 exists. They write to a **persistent cleanup
   list** owned by the harness. Items carry over week to week and are closed with PR references,
   so nothing is redone.
2. **Plan audit.** Keeps the items that are behaviour-preserving and worth it.
3. **Refactor.** Applies the top items within the maintenance size limit: 40 files, 1,500 changed
   lines, **net `src` LOC must not grow** (tests don't count). It also keeps `CLAUDE.md` accurate.
4. **Review fan-out → verify → fix**, as on feature nights.
5. **Behaviour-preservation checks.** These make render and CSS refactors safe before G6 exists:
   - exact laps (G2) and replays (G3);
   - DOM plus computed-style snapshot equality for every screen stage;
   - scene-graph geometry hashes compared in Node.
6. **Tests.** Tests that pin internal names may be rewritten into public-seam tests, as long as the
   mutation score on those modules doesn't drop.
7. **Conflicts.** Skip files touched by open PRs, or land maintenance first and let upkeep merge it
   into the others.

Weeknight reviewers still deduplicate inside the files each feature touches. The PR is labelled
`maintenance`.

## Never building the same thing twice
The existing-work list (HANDOVER §6.2) is built from GitHub:

- merged PRs;
- in-flight PRs, drafts included, plus any run waiting to resume;
- rejected PRs, with the owner's reason;
- maintenance PRs.

Each entry carries its title, labels, spec summary and files.

Who uses it:

- **ideate:** must not repeat anything on it;
- **plan audit:** checks for duplicates and for overlap with in-flight PRs' files;
- **judge:** its duplication check;
- **Sunday survey:** together with the persistent cleanup list.

**Blocker: whose text it is.** With the PAT, harness posts and owner comments are both authored by
`rhyscharris`. The "owner or harness text only" rule can't tell them apart. The **GitHub App moves
into M1**. Until it exists, every harness post carries a hidden marker and is treated as harness
text. Text from other accounts is dropped by exact login (the Wiz bot already comments on PRs).

Re-trying work:

- A closed backlog PR re-enters the pool if the owner adds `retry`.
- A merged PR labelled `revert` gets a revert PR opened by the harness. G1/G9 allow deleting
  exactly the tests that PR added, and the item returns to the backlog as `reverted`.
- Cloudflare's instant production rollback is documented in SETUP.md.

## Owner feedback loop (M2)
| Owner action | What the harness does |
|---|---|
| `/revise <notes>` comment, or "Request changes" | The next night revises that PR first: same branch, fresh builder, then review, gates and judge |
| `/reject <why>` | The PR is closed and the reason joins the rejected list |
| 1–5 rating comment on merge | Goes into the metrics; replaces the weekly `fun.csv` |
| Weekly | An agent drafts a **lessons PR** (CLAUDE.md or backlog changes) from the owner's comments. Only the owner merges it |

## Security additions
- **Journals.** Agent containers mask `journal/` except tonight's folder. Merged transcripts and
  builder notes could otherwise carry instructions to every later night.
- **CLAUDE.md.** Every later `claude -p` loads it as instructions. Any change to it is shown
  separately in the PR, and the judge flags any new rule or instruction.

## Measuring it: evals and metrics (M1)
**Eval corpus** (`harness/evals/`, owner-protected). It is built from real nights:

- **B02 at `f830338`.** Ground truth is the 2 bugs and the duplications from the PR #10 review.
- **B01.** Ground truth is the 5 findings from the PR #9 review.
- **B03 against an open B02.** The auditor must return defer or revise.
- **Seeded variants:** broken determinism, a listener leak, off-token CSS, a trivial AC test, a
  planted instruction aimed at the judge.

It scores reviewer recall and precision, audit verdicts, and judge agreement with the owner, with
3+ samples per case. It runs before any prompt, model, Claude Code or harness change goes live.

**`metrics.csv` from day one.** One row per night:

- turns, tokens and wall clock per phase;
- audit verdict and rounds;
- findings by reviewer, severity and verified/dropped;
- LOC before and after review;
- duplication score, mutation score (M2), judge scores;
- owner outcome: merged, revised or closed, time to merge, rating;
- escaped defects, via a `regression-of:#n` label on later fixes.

The four existing nights are recomputed as the no-review baseline.

## Usage budget instead of a clock
Nights use about 5 of 270 minutes, so the window isn't the constraint. Weekly Max usage is (exact
cap unknown; the metrics will show it).

Each night has a usage budget. When it is tight, things are dropped in this order:

1. reviewer count, down to R1–R3;
2. the judge fix round.

Verification, gates and the judge are never dropped.

Resume after a usage limit stays per §6.3: rerun from the locked spec. Resuming at the review phase
is not needed.

## Gaps from HANDOVER and the original chat that are still to build
| Item | Source | Milestone |
|---|---|---|
| Resume after usage limit (today an aborted night opens a draft PR) | §6.3 | M2 |
| Health check 08:00, `daily-status`, health issues | §7.3 | M2 |
| CI reruns every gate on each PR (today: typecheck/test/build) | chat, §7.2 | M2 |
| Mutation testing on changed lines (report-only, then gate), seed fuzz for sim/track changes | review | M2 → M3 |
| G10 red/green, with a worked example in `build.md` and a valid-feature cheat that must pass | §5.2, chat | M3 |
| G11 size, report-only (800 lines / 20 files; maintenance limit above) | §5.2, owner | M3 |
| Rest of G9, plus G5, G6, G7, G4 | §5.2 | M3 |
| Feel telemetry per bot race (drift fraction, airtime, collisions, overtakes), as a delta against `main` | review, VISION | M3–M4 |
| `result.json` metrics; `attempts` is hard-coded to 1 | §9 | M1 |
| `journal-summary` → `IDEAS.md`, `CHANGELOG.md` | §9 | M4 |
| Phase 2 invention, and backlog re-entry pausing it | §6.2, §0.1 | M4 |
| Rulesets on `main` (the repo is public, so available now), CODEOWNERS | §7.1 | M5 |
| Full cheat suite, 10× flakiness incl. VM↔CI parity | §10, §11 | M5 |
| Real-device performance: no device farm; the owner phone-tests each PR | review, owner | — |
| Independent red team | §11 | **dropped** (owner) |

## Milestones
Each milestone gets a spec audit and code review before merge.

**M1a · Feature-night core**
- Existing-work list and file overlap.
- Plan audit with revise/defer/reject, and the new spec fields.
- Screen stages and the screenshot script.
- Review fan-out, verifier, fixer, per-fix gating.
- Blind judge with screenshots, and the judge fix round.
- PR body and labels.
- GitHub App (hidden-marker fallback until then).
- Journal masking.
- Metrics and `meta.json` provenance.
- Eval corpus and runner.
- Prompts: `plan-audit.md`, `review-*.md`, `verify.md`, `fix.md`, `judge.md` + `judge-rubric.md`.
- Schemas and limits.
- Harness tests, e2e stubs and cheat patches for every new phase:
  - the reviewer weakens a test;
  - a planted instruction aimed at the judge;
  - a duplicate or overlapping spec;
  - a criterion naming internals.

**M1b · Maintenance day**
- Survey, persistent cleanup list, the refactor flow.
- DOM/computed-style snapshots and geometry hashes.

**M2 · Living with open PRs**
- Upkeep and resolver, with `MAX_OPEN_DAILY_PRS` lowered from 7 to 3. At the cap, the night does
  upkeep and revisions instead of skipping.
- Owner feedback loop, rollback, resume.
- Health check, CI gates.
- Mutation report, seed fuzz.

**M3 · Remaining gates**
- G10, G11, G9, G5, G6, G7, G4.
- Mutation gate.
- Feel telemetry.

**M4 · Phase 2 and summaries**

**M5 · Hardening**
- Rulesets, CODEOWNERS, full cheat suite, flakiness and parity.

## Until M1a lands
The owner chose (2026-11-02) to keep the timer running and to have the first slice of M1a live for
that night's 02:00 run:

- **Tonight's slice:** existing-work list and overlap, plan audit, review fan-out → verify → fix
  with per-fix gating, blind judge and fix round, PR body and labels, metrics and provenance,
  journal masking, hidden-marker fallback, screen stages and screenshots.
- **Follows:** the eval corpus and runner, and the GitHub App (needs the owner to create it).
- #9 and #10 are merged. #11 is being reworked on top of them.
- Fix B03's `depends_on` in BACKLOG.md.

## Owner decisions (2026-11-02)
1. Maintenance is on **Sundays** (London).
2. Maintenance size limit: 40 files / 1,500 lines with no net `src` LOC growth. Agreed.
3. 2 ideate↔audit rounds, 2 backlog items a night, 3 open daily PRs. Agreed.
4. Model diversity: **trial Sonnet 5.5 at max effort as reviewer R2**, kept or dropped on the evals.
   No non-Anthropic model.
5. Best-of-2 builds: **not planned** (too much usage). Logged under Ideas.
6. Real-device performance: **no device farm.**
   - G4 runs its tests in the container.
   - The owner tests each PR's preview on a phone and reports back.
   - The Sunday refactor includes a performance pass.
7. Feature size: G11's file limit goes from 12 to 20 (PR #12).
   - Size is a guide for ideate, not a reason to cut a feature's core.
   - The plan audit doesn't reject on size.
   - G11 reports size in the PR but doesn't fail it.

## Ideas (not planned)
- Best-of-2 builds: two builders in parallel worktrees, and the reviewers and judge pick one.
