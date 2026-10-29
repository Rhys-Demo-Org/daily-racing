#!/usr/bin/env bash
# Nightly loop, thin version (HANDOVER §6, plan M4-thin): pre-flight, pick, spec, build, gates,
# retries, journal. Only dry runs exist: nothing is pushed, no PR, no GitHub writes.
#
#   harness/daily.sh --dry-run [--manual]
#
#   --manual  owner-run daytime dry run: no start cutoff; the no-new-phase and hard limits are the
#             start plus the nightly offsets from START_AT (+3h15, +4h30).
#
# Works in its own clone ($DAILY_HOME/repo, never the owner's working copy) on branch
# daily/<London date>. Every harness script comes from this checkout. Logs go to
# $DAILY_HOME/runs/<date>/ (outside every container) and are copied to journal/runs/<date>/ and
# committed on the branch at the end, abort included; the builder's own journal files move under
# journal/runs/<date>/builder/ so they can't pose as harness files. Before every commit the token
# is redacted from the tree and the run folder.
# Exit 0: the night ran (whatever the outcome) or was skipped on purpose. Non-zero: harness error.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/lib/common.sh"

dry=0 manual=0
for arg in "$@"; do
  case $arg in --dry-run) dry=1 ;; --manual) manual=1 ;; *) echo "usage: daily.sh --dry-run [--manual]" >&2; exit 2 ;; esac
done
(( dry )) || { echo "daily.sh: live mode isn't built yet; run with --dry-run" >&2; exit 2; }

# Test-only hooks, used by harness/tests/daily-e2e.sh and nothing else: a folder of stub
# agent-run/run-gates/sandbox-net scripts and a file holding a fake epoch clock.
SCRIPTS="${DAILY_SCRIPTS:-$here/scripts}"
now() { if [[ -n ${DAILY_TEST_CLOCK:-} ]]; then cat "$DAILY_TEST_CLOCK"; else date +%s; fi; }

RUN_LOG=/dev/null
log() { local l; l="$(date -u +%FT%TZ) $*"; echo "$l" >&2; echo "$l" >>"$RUN_LOG"; }
skip() { log "skip: $*"; exit 0; }
die() { log "error: $*"; exit 1; }
# disk <handler>: `<handler> <reason>` when DAILY_HOME is short of space.
disk() {
  local gb
  gb=$(df -BG --output=avail "$DAILY_HOME" | tail -1 | tr -dc 0-9)
  (( gb >= MIN_FREE_DISK_GB )) || $1 "only ${gb} GB free under $DAILY_HOME (< $MIN_FREE_DISK_GB)"
}

# ---- Pre-flight -------------------------------------------------------------------------------
command -v docker >/dev/null && docker info >/dev/null 2>&1 || die "docker is not available"
need_image
mkdir -p "$DAILY_HOME/runs" "$DAILY_HOME/work"
[[ ! -e $DAILY_HOME/STOP ]] || skip "kill switch $DAILY_HOME/STOP"

# Time windows come from the first invocation, which re-execs itself under a hard `timeout`
# ending at HARD_DEADLINE (stdin closed so no container grabs the terminal).
if [[ -z ${DAILY_WINDOWS:-} ]]; then
  DAILY_WINDOWS="$(ts_node windows "$(now)" $( ((manual)) && echo --manual))"
  eval "$DAILY_WINDOWS"
  [[ -z $REFUSED ]] || skip "$REFUSED"
  left=$(( HARD_AT - $(now) ))
  (( left > 0 )) || skip "past the hard deadline"
  export DAILY_WINDOWS
  exec timeout --kill-after=120 "$left" "$0" "$@" </dev/null
fi
eval "$DAILY_WINDOWS"

exec 9>"$DAILY_HOME/daily.lock"
flock -n 9 || skip "another run holds $DAILY_HOME/daily.lock"
RUN="$DAILY_HOME/runs/$DATE"
[[ ! -e $RUN ]] || skip "already ran for $DATE ($RUN exists)"
disk die

CLONE="$DAILY_HOME/repo"
[[ -d $CLONE/.git ]] || git clone --quiet "$(git -C "$here/.." remote get-url origin)" "$CLONE"
git -C "$CLONE" fetch --quiet --prune origin
! git -C "$CLONE" cat-file -e origin/main:harness/STOP 2>/dev/null || skip "kill switch harness/STOP on origin/main"

# From here on every exit (stop, error, deadline) ends in finish(), which journals and commits.
mkdir -p "$RUN/phases"
RUN_LOG="$RUN/run.log"
WORK="$DAILY_HOME/work/$DATE"
BRANCH="daily/$DATE"
J="$CLONE/journal/runs/$DATE" # the builder's writable journal folder
GIT=(git -C "$CLONE" -c user.name=daily-racer -c user.email=daily-racer@localhost)
MAIN_SHA="$(git -C "$CLONE" rev-parse origin/main)"
OUTCOME='' REASON='' on_branch=0
stop() { OUTCOME=$1 REASON=$2; exit 0; }

# The builder's writes, checked on the host. The harness copies into its journal folder, so only
# regular files and directories may stay there (a planted symlink would redirect the copy).
sanitize() { find "$J" -mindepth 1 ! -type f ! -type d -delete; }
# quota <handler>: `<handler> <reason>` when src/, tests/ and the journal folder hold a file over
# 5 MB or more than 200 MB in all.
quota() {
  local big mb
  big="$(find "$CLONE/src" "$CLONE/tests" "$J" -type f -size +5M -print -quit)"
  mb="$(du -scm "$CLONE/src" "$CLONE/tests" "$J" | tail -1 | cut -f1)"
  if [[ -n $big ]]; then $1 "builder wrote a file over 5 MB (${big#"$CLONE"/})"
  elif (( mb > 200 )); then $1 "builder wrote ${mb} MB under src/, tests/ and the journal (limit 200 MB)"; fi
}
discard() { log "discarding uncommitted work: $*"; git -C "$CLONE" reset -q --hard; git -C "$CLONE" clean -qffdx; }
# scrub: redacts the token (when one exists) from the clone and the run folder; fails if it stays.
scrub() { [[ ! -s $TOKEN_FILE ]] || tr -d '[:space:]' <"$TOKEN_FILE" | ts_node redact "$CLONE" "$RUN" 2>>"$RUN_LOG"; }

finish() {
  set +e
  trap - TERM INT
  log "outcome: $OUTCOME${REASON:+ ($REASON)}"
  if (( on_branch )); then
    docker ps -q --filter name=daily-racer-agent- | xargs -r docker rm -f >/dev/null # nothing writes the tree now
    sanitize
    quota discard
    scrub || { discard "the token could not be redacted"; scrub; } || { on_branch=0; log "token still present: nothing committed"; }
  fi
  if (( on_branch )); then
    "${GIT[@]}" add -A && "${GIT[@]}" commit -qm "daily $DATE: work in progress at stop" 2>/dev/null
    git -C "$CLONE" diff --numstat "$MAIN_SHA" HEAD -- . ':(exclude)journal' >"$RUN/diffstat.txt"
  fi
  ts_node result "$RUN" "$OUTCOME" "$REASON" 2>>"$RUN_LOG"
  if (( on_branch )); then
    rm -rf "$RUN/builder" && mv "$J" "$RUN/builder" 2>/dev/null
    cp -rT "$RUN" "$J" && "${GIT[@]}" add -A && "${GIT[@]}" commit -qm "journal: $DATE dry run ($OUTCOME)"
  fi
  "$SCRIPTS/sandbox-net.sh" down >>"$RUN_LOG" 2>&1 || log "sandbox-net.sh down failed"
  # Thin disk cleanup: exited toolchain containers, dangling images, old local daily/* branches and
  # cached installs unused for KEEP_DAYS.
  docker ps -aq --filter status=exited --filter "ancestor=$IMAGE" | xargs -r docker rm >/dev/null
  docker image prune -f >/dev/null
  local cutoff=$(( $(date +%s) - KEEP_DAYS * 86400 )) t b
  git -C "$CLONE" for-each-ref --format='%(committerdate:unix) %(refname:short)' refs/heads/daily/ |
    while read -r t b; do (( t < cutoff )) && [[ $b != "$BRANCH" ]] && git -C "$CLONE" branch -qD "$b"; done
  find "$DAILY_HOME/cache" -mindepth 1 -maxdepth 1 -mtime +"$KEEP_DAYS" -exec rm -rf {} + 2>/dev/null
  git -C "$CLONE" worktree prune
  log "journal: $RUN (and journal/runs/$DATE on $BRANCH in $CLONE)"
}
on_exit() {
  local rc=$?
  [[ -n $OUTCOME ]] || { OUTCOME=abort REASON="harness error (exit $rc)"; }
  finish
  exit "$rc"
}
trap on_exit EXIT
trap 'OUTCOME=abort REASON="terminated: hard deadline $HARD_DEADLINE reached (or service stopped)"; exit 124' TERM
trap 'OUTCOME=abort REASON="interrupted"; exit 130' INT

log "dry run $DATE (manual=$manual) main=$MAIN_SHA"
jq -n --arg date "$DATE" --argjson manual "$( ((manual)) && echo true || echo false)" --argjson startedAt "$(now)" \
  --argjson noNewPhaseAt "$NO_NEW_PHASE_AT" --argjson hardDeadlineAt "$HARD_AT" --arg mainSha "$MAIN_SHA" --arg image "$IMAGE" \
  --arg claudeCodeVersion "$(docker run "${DOCKER_BASE[@]}" --network none --read-only "$IMAGE" claude --version)" \
  --arg ideate "$MODEL_IDEATE" --arg build "$MODEL_BUILD" --arg judge "$MODEL_JUDGE" \
  '{$date, dryRun: true, $manual, $startedAt, $noNewPhaseAt, $hardDeadlineAt, $mainSha, $image, $claudeCodeVersion,
    models: {$ideate, $build, $judge}}' >"$RUN/meta.json"

git -C "$CLONE" checkout -qf -B "$BRANCH" origin/main
git -C "$CLONE" clean -qffdx
mkdir -p "$J"
on_branch=1

# ---- Pick ---------------------------------------------------------------------------------------
pick="$(ts_node pick "$SUNDAY" "$CLONE/guardrails/BACKLOG.md" "$DAILY_HOME/dry-runs.json" "$RUN/item.md" "$RUN/meta.json")"
eval "$pick"
case $KIND in
  phase2) stop skip "phase 2 not built" ;;
  blocked) stop skip "blocked: every open backlog item waits on unmerged dependencies" ;;
esac
MODE=$KIND   # backlog | maintenance
maint=(); [[ $MODE != maintenance ]] || maint=(--maintenance)
log "work: $MODE ${ITEM_ID:+$ITEM_ID · $ITEM_TITLE}"

# ---- Phase helpers --------------------------------------------------------------------------------
mkdir -p "$WORK"
tonight() { printf '\n## Tonight\n\n- Date: %s\n- Mode: %s\n' "$DATE" "$MODE"; }
check_time() { (( $(now) < NO_NEW_PHASE_AT )) || stop abort "deadline: no new phase after $NO_NEW_PHASE_AFTER ($1 not started)"; }
verify_spec() { [[ $(sha256sum "$RUN/spec.md" | cut -c1-64) == "$SPEC_SHA" ]] || stop abort "spec.md hash mismatch before $1"; }

# agent <phase> <attempt> <prompt-file> <model> <max-turns> <wall-min> [agent-run args...]
# Wall clock is capped so a gate run still fits before the hard deadline.
agent() {
  local out="$RUN/phases/$1-$2" wall=$6 t0 rc=0
  local fit=$(( (HARD_AT - $(now)) / 60 - GATE_CAP_MIN - 2 ))
  (( wall <= fit )) || wall=$fit
  (( wall > 0 )) || stop abort "deadline: no time left for $1-$2"
  mkdir -p "$out"; t0=$(now)
  log "phase $1-$2: start (max turns $5, wall ${wall}m)"
  "$SCRIPTS/agent-run.sh" --phase "$1" --workdir "$CLONE" --prompt-file "$3" --model "$4" --max-turns "$5" \
    --timeout-min "$wall" --out "$out" --date "$DATE" "${maint[@]}" "${@:7}" >>"$RUN_LOG" 2>&1 || rc=$?
  printf '{"startedAt":%s,"endedAt":%s,"exit":%s}\n' "$t0" "$(now)" "$rc" >"$out/harness.json"
  log "phase $1-$2: exit $rc"
  case $rc in
    0) ;;
    10) stop abort "usage limit or unrecognised error in $1-$2 (agent-run exit 10)" ;;
    11 | 12) log "phase $1-$2 hit its $( ((rc == 11)) && echo turn || echo time) limit; continuing with what exists" ;;
    *) stop abort "agent-run failed in $1-$2 (exit $rc)" ;;
  esac
  quota 'stop abort'
}

# gates <attempt>: harness commit of the whole working tree (the builder's journal folder too, so
# G8 polices it), then run-gates on it.
gates() {
  local out="$WORK/gates-$1" sha rc=0
  disk 'stop abort'
  sanitize
  scrub || stop abort "the token is in the work tree and could not be redacted"
  "${GIT[@]}" add -A || die "git add failed"
  "${GIT[@]}" commit -q --allow-empty --no-verify -m "daily $DATE: attempt $1 (harness commit)" || die "git commit failed"
  sha="$(git -C "$CLONE" rev-parse HEAD)"
  verify_spec "gates-$1"
  mkdir -p "$out"
  log "gates attempt $1 on $sha"
  "$SCRIPTS/run-gates.sh" "${maint[@]}" --today "$DATE" "$CLONE" "$sha" "$out" >>"$RUN_LOG" 2>&1 || rc=$?
  cp "$out/gates.json" "$RUN/gates-$1.json" 2>/dev/null || log "gates attempt $1: no gates.json"
  cp "$out/summary.md" "$RUN/gates-$1.md" 2>/dev/null || true
  (( rc == 0 )) && jq -e '.pass == true' "$RUN/gates-$1.json" >/dev/null 2>&1 && return
  FEEDBACK="$(ts_node feedback "$RUN/gates-$1.json")"
  return 1
}

# ---- Spec ------------------------------------------------------------------------------------------
check_time ideate
{ cat "$here/prompts/ideate.md"; tonight; } >"$WORK/ideate.md"
[[ $MODE != backlog ]] || printf '\n### Backlog item\n\n%s\n' "$(cat "$RUN/item.md")" >>"$WORK/ideate.md"
agent ideate 1 "$WORK/ideate.md" "$MODEL_IDEATE" "$MAX_TURNS_IDEATE" "$WALL_IDEATE_MIN" \
  --json-schema "$here/schemas/spec.json" --tools Read,Glob,Grep
SPEC_SHA="$(ts_node spec "$RUN/phases/ideate-1/result.json" "$RUN/spec.md" "$DATE" "$MODE" "${ITEM_ID:--}" "$RUN/meta.json" 2>>"$RUN_LOG")" ||
  stop fail "ideate produced no valid spec (see run.log)"
log "spec locked: sha256 $SPEC_SHA"

# ---- Build, gates, retries ------------------------------------------------------------------------------
{ cat "$here/prompts/build.md"; tonight; printf '\n## Locked spec\n\n'; cat "$RUN/spec.md"; } >"$WORK/build.md"
attempt=1 phase=build turns=$MAX_TURNS_BUILD wall=$WALL_BUILD_MIN prompt="$WORK/build.md"
while :; do
  check_time "$phase-$attempt"
  verify_spec "$phase-$attempt"
  agent "$phase" "$attempt" "$prompt" "$MODEL_BUILD" "$turns" "$wall"
  gates "$attempt" && stop pass ''
  (( attempt <= MAX_RETRIES )) || stop fail "gates failed after $MAX_RETRIES retries"
  (( $(now) < NO_NEW_PHASE_AT )) || stop fail "gates failed; no retry after $NO_NEW_PHASE_AFTER"
  prompt="$WORK/retry-$((attempt + 1)).md"
  { cat "$WORK/build.md"; printf '\n## Gate failures after attempt %s\n\nFix these. Your earlier work is already in the tree.\n\n' "$attempt"; echo "$FEEDBACK"; } >"$prompt"
  attempt=$((attempt + 1)) phase=retry turns=$MAX_TURNS_RETRY wall=$WALL_RETRY_MIN
done
