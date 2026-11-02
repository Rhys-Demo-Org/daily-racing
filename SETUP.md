# Setup: nightly runs (M4-thin + live PRs)

Minimal steps for the owner to run the thin harness on the VM (Debian 12, Docker, systemd).
Dry runs (`--dry-run`) push nothing; live runs (`--live`, `plans/live-prs.md`) push `daily/<date>`
and open a PR. The GitHub App and the judge come later.

Everything lives under `~/.daily-racer` (`DAILY_HOME` in `harness/config.env`):

| Path | What |
|---|---|
| `harness/` | checkout of `main` that the timer runs; every harness script comes from here (you update it; the harness never does) |
| `repo/` | the harness's own work clone; nightly branches `daily/<date>` live here (pushed by live runs only) |
| `runs/<date>/` | that night's logs: `run.log`, `meta.json`, `spec.md`, `phases/`, `gates-<n>.json`, `result.json`, `builder/` (the builder's own journal files) |
| `work/` | per-night prompts and gate scratch space |
| `cache/` | `install-<hash>/`: the one `node_modules` per lockfile + image, mounted read-only by agents and gates; `g1main-*.json`: main's test count. Pruned after 14 days unused |
| `oauth-token` | Claude token (mode 600) |
| `github-token` | fine-grained GitHub token for live runs (mode 600) |
| `dry-runs.json` | dry runs only: ledger of backlog items already tried, so each night tries a different one |
| `daily.lock` | held by the running night, so two never overlap |
| `STOP` | kill switch |

## 1. Prerequisites
Your user must be in the `docker` group (`sudo usermod -aG docker $USER`, then log in again), and
the host needs `git`, `jq`, `flock` and (live runs) `gh`. Node and pnpm only ever run in the container.

```sh
git clone https://github.com/Rhys-Demo-Org/daily-racing.git ~/.daily-racer/harness
cd ~/.daily-racer/harness
harness/container/build.sh          # builds daily-racer-toolchain:<hash>
```
After merging a harness change: `git -C ~/.daily-racer/harness pull --ff-only` (and rerun
`build.sh` if the Dockerfile changed). `repo/` is created by the first run.

## 2. Claude token
```sh
harness/scripts/in-container.sh --net -- claude setup-token
install -m 600 /dev/null ~/.daily-racer/oauth-token
nano ~/.daily-racer/oauth-token     # paste the token, save
```
The token goes in that file and nowhere else: not in the repo, a shell history, an env file or a
chat. Only `agent-run.sh` reads it, and passes it to the sandbox by environment variable.

## 2b. GitHub token (live runs)
GitHub → Settings → Developer settings → Fine-grained tokens: resource owner the repo's org, only
this repository, **Contents, Pull requests, Issues: read and write**, Workflows unset (so GitHub
rejects any push touching `.github/workflows/`). Save it like the Claude token, at
`~/.daily-racer/github-token`. Only `publish.sh` and `daily.sh`'s pre-flight read it, on the host;
no container ever sees it.

## 3. A manual dry run first
```sh
harness/daily.sh --dry-run --manual
```
`--manual` skips the 03:00 start cutoff and sets the limits to start + 3h15 (no new phase) and
start + 4h30 (hard stop). One run per date: to run again the same day, delete
`~/.daily-racer/runs/<date>` (the branch is recreated).

## 4. Read the report
```sh
harness/scripts/dry-run-report.sh            # latest run; or pass a date
harness/scripts/dry-run-report.sh --full     # with the whole diff
```
It shows the item, the outcome, each phase's wall clock against 06:30, usage and notional cost,
the gate table per attempt, retries, any abort reason, and the branch's diff against `main`.

## 5. Install the timer
The template runs `daily.sh --live`; for dry runs change its `ExecStart` to `--dry-run`.
```sh
sed -e "s|__USER__|$USER|" -e "s|__REPO__|$HOME/.daily-racer/harness|g" \
  harness/systemd/daily-racer.service | sudo tee /etc/systemd/system/daily-racer.service >/dev/null
sudo cp harness/systemd/daily-racer.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now daily-racer.timer
systemctl list-timers daily-racer.timer      # next run: 02:00 Europe/London
```
It is a system unit with `User=`, so it runs without you logged in (no linger needed).
Logs: `journalctl -u daily-racer` plus `~/.daily-racer/runs/<date>/run.log`.

## Kill switches
- `touch ~/.daily-racer/STOP` stops runs on this VM until you remove it.
- A `harness/STOP` file on `main` stops every run.
- Stop the current run: `sudo systemctl stop daily-racer`. Disable nightly runs:
  `sudo systemctl disable --now daily-racer.timer`.

## Known residuals
What the thin harness does not stop yet (Later in the plan):
- **Gate measurements run branch code.** G2 and G3 use the branch's own sim, so a branch can fake
  its own lap and replay numbers; the per-run nonce only blocks naive forgery of the measure
  output (say, a line printed from `process.on('exit')`). Likewise in G1 a test process that
  escapes its process group could race Vitest's report, and branch code imported by tests can
  neuter them. The judge and your review are the backstop.
- **The proxy checks the CONNECT host, not the TLS SNI**, then tunnels raw TCP to the address it
  resolved for that host.
- **Token redaction covers the exact token** (raw or JSON-escaped) in the tree and the run folder
  before each commit; an encoded or split copy would survive. Live runs also refuse to push a
  commit holding either token or a secret-shaped string (`sk-ant-…`, `github_pat_…`, `gh?_…`), but
  an encoded copy would still get through, into a public repo.
- **Live journals are public.** `run.log`, prompts and agent output are pushed with the branch.
- **PR previews run branch code in CI** (the `build` job, no secrets); the Cloudflare token sits in
  the `deploy` job, which runs no branch code.
