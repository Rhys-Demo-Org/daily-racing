# Setup: nightly dry runs (M4-thin)

Minimal steps for the owner to run the thin harness on the VM (Debian 12, Docker, systemd).
Dry runs push nothing and open no PRs. The full setup (GitHub App, CI, Cloudflare) comes later.

Everything lives under `~/.daily-racer` (`DAILY_HOME` in `harness/config.env`):

| Path | What |
|---|---|
| `harness/` | checkout of `main` that the timer runs (you update it; the harness never does) |
| `repo/` | the harness's own work clone; nightly branches `daily/<date>` live here, never pushed |
| `runs/<date>/` | that night's logs: `run.log`, `meta.json`, `spec.md`, `phases/`, `gates-<n>.json`, `result.json` |
| `oauth-token` | Claude token (mode 600) |
| `dry-runs.json` | ledger of backlog items already tried, so each night tries a different one |
| `STOP` | kill switch |

## 1. Prerequisites
Your user must be in the `docker` group (`sudo usermod -aG docker $USER`, then log in again).

```sh
git clone https://github.com/Rhys-Demo-Org/daily-racing.git ~/.daily-racer/harness
cd ~/.daily-racer/harness
harness/container/build.sh          # builds daily-racer-toolchain:<hash>
```
After merging a harness change: `git -C ~/.daily-racer/harness pull --ff-only` (and rerun
`build.sh` if the Dockerfile changed). `repo/` is created by the first run.

## 2. Claude token
```sh
docker run --rm -it daily-racer-toolchain:$(sha256sum harness/container/Dockerfile | cut -c1-12) claude setup-token
install -m 600 /dev/null ~/.daily-racer/oauth-token
nano ~/.daily-racer/oauth-token     # paste the token, save
```
The token goes in that file and nowhere else: not in the repo, a shell history, an env file or a
chat. Only `agent-run.sh` reads it, and passes it to the sandbox by environment variable.

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
