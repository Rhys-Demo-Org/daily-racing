# Live PRs early (owner request, 2026-10-30)

The owner asked to skip the rest of the dry-run week and have nightly runs open PRs now ("it's an
experiment"). This brings forward the PR part of "Later"; the judge, G4–G7/G9–G11 and the GitHub App
stay in Later.

## What changes
- `daily.sh --live` (the timer switches from `--dry-run` after the owner says go). `--dry-run` is
  unchanged.
- Pre-flight reads the repo's `daily` PRs: 7 or more open skips the night; the picker treats
  `backlog:Bxx` PRs as state: merged = done, open or closed-unmerged = never picked again (no
  rotation, unlike the dry-run ledger).
- After `finish()` commits the journal, `harness/scripts/publish.sh <run-dir>` pushes
  `daily/<date>` and opens the PR: ready + `daily` + `backlog:Bxx` on pass, draft + `failed` otherwise.
  Nights with no work outside the journal (skips, early aborts) push nothing.

## Push safety (repo is public; CI holds the Cloudflare secrets)
1. The builder never sees GitHub credentials: publish runs on the host after every container exits.
2. Every path touched by any commit on the branch must be in the nightly allowlist, and the final diff
   must pass G8's rules (`harness/lib/allowlist.ts`). Linear history on top of the run's main SHA.
3. No commit in the range may contain the Claude or GitHub token, or a secret-shaped string
   (`sk-ant-…`, `github_pat_…`, `gh?_…`). The existing exact-token redaction still runs before every commit.
4. Fine-grained PAT, this repo only, Contents/Pull requests/Issues write, no Workflows permission:
   GitHub itself rejects a push touching `.github/workflows/`. Stored at `~/.daily-racer/github-token`
   (0600), handed to git via `GIT_ASKPASS` and to gh via `GH_TOKEN`, never in argv or the repo.

## Known gaps (accepted for the experiment)
- No judge and no style/perf gates yet; the owner reviews every PR before merging.
- Journals (run.log, agent transcripts) are public once pushed; only the exact token and the
  patterns above are scrubbed.
