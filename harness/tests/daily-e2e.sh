#!/usr/bin/env bash
# End-to-end test of harness/daily.sh --dry-run with stub agent-run/run-gates (harness/tests/stubs)
# and a fake clock, against a temp origin + clone under a temp HOME. Runs on the host because
# daily.sh drives docker (the toolchain image must be built; the first case installs deps once,
# which needs network). Not part of `pnpm test`.
#
#   harness/tests/daily-e2e.sh            (~3-4 min; KEEP=1 keeps the temp dir)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/daily-e2e.XXXXXX")"
export HOME="$T/home" DAILY_TEST_CLOCK="$T/clock" STUB_LOG="$T/stub.log"
S="$ROOT/harness/tests/stubs"
export DAILY_AGENT_RUN="$S/agent-run.sh" DAILY_RUN_GATES="$S/run-gates.sh" DAILY_SANDBOX_NET="$S/sandbox-net.sh"
D="$HOME/.daily-racer"
fails=0
trap '[[ -n ${KEEP:-} ]] && echo "kept $T" || rm -rf "$T"' EXIT

ok() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1   [$2]"; fails=$((fails + 1)); fi; }
res() { jq -r "$1" "$D/runs/$2/result.json" 2>/dev/null; }
# daily <iso-utc-time> [env...]: run one dry run at a fake time; output in $T/out, exit in $rc.
daily() {
  date -u -d "$1" +%s >"$DAILY_TEST_CLOCK"; shift
  : >"$STUB_LOG"
  env "$@" "$ROOT/harness/daily.sh" --dry-run >"$T/out" 2>&1; rc=$?
}

mkdir -p "$HOME" "$D"
git init -q --bare -b main "$T/origin.git"
git -C "$ROOT" push -q "$T/origin.git" HEAD:refs/heads/main
git clone -q "$T/origin.git" "$D/repo"
origin_commit() { # origin_commit <msg> <cmd...>: change origin/main through a scratch clone
  local msg=$1; shift
  rm -rf "$T/scratch"; git clone -q "$T/origin.git" "$T/scratch"
  (cd "$T/scratch" && "$@" && git add -A && git -c user.name=t -c user.email=t@t commit -qm "$msg" && git push -q origin HEAD:main)
}

echo "happy path (Mon 2026-11-02)"
daily 2026-11-02T02:00:00Z
R="$D/runs/2026-11-02"
ok "exit 0" '[[ $rc == 0 ]]'
ok "outcome pass" '[[ $(res .outcome 2026-11-02) == pass ]]'
ok "picked B01" '[[ $(res .backlogId 2026-11-02) == B01 && $(jq -c .tried "$D/dry-runs.json") == "[\"B01\"]" ]]'
ok "journal files" 'for f in meta.json spec.md run.log result.json gates-1.json phases/ideate-1/meta.json phases/ideate-1/harness.json phases/build-1/meta.json; do [[ -f $R/$f ]] || exit 1; done'
ok "spec locked and hashed in meta" '[[ ! -w $R/spec.md && $(jq -r .specSha256 "$R/meta.json") == $(sha256sum "$R/spec.md" | cut -c1-64) ]]'
ok "spec has the AC" 'grep -q "^- \*\*AC1\*\*" "$R/spec.md"'
ok "ideate used schema-only tools" 'grep -q "agent-run ideate .*tools=Read,Glob,Grep" "$STUB_LOG"'
ok "meta has version, models, main SHA" '[[ $(jq -r ".claudeCodeVersion, .models.build, .mainSha" "$R/meta.json" | grep -c .) == 3 ]]'
ok "journal committed on daily/2026-11-02" 'git -C "$D/repo" show daily/2026-11-02:journal/runs/2026-11-02/result.json | jq -e ".outcome == \"pass\"" >/dev/null'
ok "build work in the attempt commit, journal not" '[[ $(git -C "$D/repo" show --name-only --format= daily/2026-11-02~1) == src/stub-build.ts ]]'
ok "gates ran on that commit" 'grep -q "sha=$(git -C "$D/repo" rev-parse daily/2026-11-02~1)" "$STUB_LOG"'
ok "nothing pushed" '! git -C "$T/origin.git" rev-parse -q --verify daily/2026-11-02 >/dev/null'
ok "diff size recorded" '[[ $(res .diffSize.files 2026-11-02) == 1 ]]'
ok "agent-run gets the run date, not maintenance" 'grep -q "agent-run build .*date=2026-11-02 maintenance=0" "$STUB_LOG"'
ok "sandbox network torn down at the end" '[[ $(tail -1 "$STUB_LOG") == "sandbox-net down" ]]'

echo "same date again"
daily 2026-11-02T02:30:00Z
ok "refuses a second run" '[[ $rc == 0 ]] && grep -q "already ran" "$T/out"'

echo "gate fail -> 2 retries -> fail (Tue 2026-11-03)"
daily 2026-11-03T02:00:00Z STUB_GATES=fail
R="$D/runs/2026-11-03"
ok "outcome fail" '[[ $(res .outcome 2026-11-03) == fail && $(res .retries 2026-11-03) == 2 ]]'
ok "three gate runs, build + 2 retries" '[[ -f $R/gates-3.json && -d $R/phases/retry-2 && -d $R/phases/retry-3 && ! -e $R/gates-4.json ]]'
ok "retries use retry limits" '[[ $(grep -c "agent-run retry .*turns=25 wall=30" "$STUB_LOG") == 2 ]]'
ok "retry prompt carries gate details" 'grep -q "stub details: AC1 test failed" "$D/work/2026-11-03/retry-2.md"'
ok "next unblocked item (B02)" '[[ $(res .backlogId 2026-11-03) == B02 ]]'

echo "usage limit in ideate (Wed 2026-11-04)"
daily 2026-11-04T02:00:00Z STUB_EXIT_ideate=10
ok "abort, no build, no gates" '[[ $(res .outcome 2026-11-04) == abort && $(res .abortReason 2026-11-04) == *"usage limit"* && ! -e $D/runs/2026-11-04/phases/build-1 && $(res ".gateRuns|length" 2026-11-04) == 0 ]]'
ok "journal still committed" 'git -C "$D/repo" show daily/2026-11-04:journal/runs/2026-11-04/result.json >/dev/null'
ok "sandbox network torn down on abort" 'grep -q "sandbox-net down" "$STUB_LOG"'

echo "build hits max turns (11): gates still run"
daily 2026-11-10T02:00:00Z STUB_EXIT_build=11
ok "partial build gated, pass" '[[ $(res .outcome 2026-11-10) == pass && $(res ".usage[1].exit" 2026-11-10) == 11 ]]'

echo "deadline reached before build (Thu 2026-11-05)"
daily 2026-11-05T02:00:00Z STUB_CLOCK_AFTER_ideate="$(date -u -d 2026-11-05T05:20:00Z +%s)"
ok "abort on deadline, no build" '[[ $(res .outcome 2026-11-05) == abort && $(res .abortReason 2026-11-05) == *"no new phase after 05:15"* && ! -e $D/runs/2026-11-05/phases/build-1 ]]'

echo "spec tampered during build (Fri 2026-11-06)"
daily 2026-11-06T02:00:00Z STUB_TAMPER=1
ok "abort on hash mismatch before gates" '[[ $(res .outcome 2026-11-06) == abort && $(res .abortReason 2026-11-06) == *"hash mismatch before gates-1"* && $(res ".gateRuns|length" 2026-11-06) == 0 ]]'

echo "kill switches (Sat 2026-11-07)"
touch "$D/STOP"
daily 2026-11-07T02:00:00Z
ok "local STOP skips before any run" '[[ $rc == 0 && ! -e $D/runs/2026-11-07 ]] && grep -q "kill switch" "$T/out"'
rm "$D/STOP"
origin_commit "stop" touch harness/STOP
daily 2026-11-07T02:00:00Z
ok "harness/STOP on origin/main skips" '[[ $rc == 0 && ! -e $D/runs/2026-11-07 ]] && grep -q "harness/STOP on origin/main" "$T/out"'
origin_commit "unstop" rm harness/STOP

echo "Sunday maintenance (2026-11-08)"
before="$(cat "$D/dry-runs.json")"
daily 2026-11-08T02:00:00Z
ok "maintenance, gates with --maintenance, ledger untouched" '[[ $(res .ideaType 2026-11-08) == maintenance && $(res .backlogId 2026-11-08) == null ]] && grep -q "maintenance=true" "$STUB_LOG" && grep -q "agent-run build .*maintenance=1" "$STUB_LOG" &&[[ $(cat "$D/dry-runs.json") == "$before" ]]'
ok "maintenance spec has no ACs" 'grep -q "^# Maintenance" "$D/runs/2026-11-08/spec.md"'

echo "after the 03:00 cutoff (Mon 2026-11-09 03:01)"
daily 2026-11-09T03:01:00Z
ok "refused, no run" '[[ $rc == 0 && ! -e $D/runs/2026-11-09 ]] && grep -q "start cutoff" "$T/out"'

echo "overlapping run"
exec 8>"$D/daily.lock"; flock -n 8
daily 2026-11-11T02:00:00Z
exec 8>&-
ok "second run refused by the lock" '[[ $rc == 0 && ! -e $D/runs/2026-11-11 ]] && grep -q "holds" "$T/out"'

echo "hard deadline: SIGTERM to the process group mid-build (as timeout sends)"
date -u -d 2026-11-12T02:00:00Z +%s >"$DAILY_TEST_CLOCK"; : >"$STUB_LOG"
STUB_SLEEP_build=30 setsid "$ROOT/harness/daily.sh" --dry-run >"$T/out" 2>&1 & pid=$!
for _ in $(seq 60); do grep -q "agent-run build" "$STUB_LOG" && break; sleep 1; done
kill -TERM -- "-$pid"; wait "$pid"; rc=$?
ok "abort recorded as hard deadline" '[[ $(res .outcome 2026-11-12) == abort && $(res .abortReason 2026-11-12) == *"hard deadline"* ]]'
ok "journal committed after the kill" 'git -C "$D/repo" show daily/2026-11-12:journal/runs/2026-11-12/result.json >/dev/null'

echo "report"
ok "dry-run-report prints phases and gates" '"$ROOT/harness/scripts/dry-run-report.sh" 2026-11-03 >"$T/report" && grep -q "## Gates" "$T/report" && grep -q "retry-3" "$T/report" && grep -q "src/stub-build.ts" "$T/report"'

echo
(( fails == 0 )) && echo "daily-e2e: all passed" || echo "daily-e2e: $fails failed"
exit $(( fails > 0 ))
