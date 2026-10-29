# Phase 0 status

Resume point for any session working on Phase 0. Plan: `plans/phase0-plan.md` (owner-approved,
don't re-plan). Spec: `HANDOVER.md`. Delete this file when Phase 0 is handed over.

Milestone order: M1 → M1.5 spike → M2 → M3 → M4-thin → dry-run week → Later.
One `phase0/mN-*` branch and PR per milestone; the owner merges.

## Done
_(nothing merged yet)_

## In progress: M1 · Scaffold, docs, tokens, backlog (branch `phase0/m1-scaffold`)
Built:
- Folders per HANDOVER §4 (empty ones hold `.gitkeep`).
- `package.json` with exact pins from the plan, `pnpm-lock.yaml`, `.nvmrc` (24), `.npmrc`
  (`engine-strict`, `save-exact`), `.gitignore`.
- `tsconfig.base.json` + `tsconfig.json` (src, browser) + `tsconfig.node.json` (tests, scripts,
  configs); `vite.config.ts` (aliases `@tokens`, `@tokens/css`; PWA manifest without icons yet);
  `vitest.config.ts`; `index.html`; placeholder `src/main.ts` + `src/ui/base.css`.
- `guardrails/scripts/gen-tokens.ts`: generates `guardrails/palette.json` and
  `guardrails/generated/tokens.{ts,css}` from `tokens.json`; `--check` mode for gate 8.
- Fonts: 10 woff2 files (Barlow Condensed 800/900/900i, Atkinson Hyperlegible 400/700; Latin and
  Latin Extended) extracted byte-for-byte from the design export into `public/fonts/`, with
  `fonts.css` and `OFL.txt`.
- `VISION.md`, `CLAUDE.md`, draft `guardrails/BACKLOG.md` (B01–B12).
- UI_RULES §9 toon thresholds changed to N·L ≥ 0.7 / ≥ −0.6 / below, in its own commit.
- `tests/tokens/generated.test.ts` (4 tests).

Verified (in `node:24.22.1-bookworm-slim` + pnpm 12.16.1): `pnpm install --frozen-lockfile
--ignore-scripts`, `pnpm typecheck`, `pnpm check:tokens`, `pnpm test` (4/4), `pnpm build`.

**Checkpoint passed (2026-10-29):** owner approved `guardrails/BACKLOG.md` (including the B11 lock
rule and leaving out the S6 settings button) and the UI_RULES §9 commit. PR #1 awaits merge.

## Next step
After the M1 PR merges: **M1.5 spike**. Build the pinned container image
(`mcr.microsoft.com/playwright:v1.64.1-*` + Node 24.22.2 + pnpm 12.16.1 + Claude Code,
`DISABLE_AUTOUPDATER=1`) and `harness/scripts/in-container.sh`; then the spike items in the plan
(SwiftShader palette-exact `readPixels`, `__THREE_DEVTOOLS__` capture, `--ignore-scripts` install
under `--network none`, `node --permission`, perf A/B variance over 20 runs).

## Open questions for the owner
1. **Node 24.22.2 Docker image doesn't exist yet** (Docker Hub has up to `24.22.1`; nodejs.org has
   24.22.2). M1 used `node:24.22.1` only to generate the lockfile. M1.5 installs Node 24.22.2 into
   the Playwright image itself, so this only matters if that install fails; fallback is 24.22.1.

## Notes for later milestones
- PWA icons: `guardrails/build/pwa-icons.ts` (draws palette shapes with `pngjs`) lands in M2; the
  manifest currently has `icons: []`.
- `playwright.config.ts` is not created until a milestone uses Playwright (M1.5 spike / Later).
- pnpm 12 puts its store in `node_modules/.pnpm-store` when `HOME` is ephemeral; harmless
  (gitignored), but the container should set a fixed store dir in M1.5.
