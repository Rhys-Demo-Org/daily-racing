#!/usr/bin/env bash
# Nightly loop (HANDOVER §6, plans/full-pipeline.md M1a, M1b): pre-flight, existing-work list, pick,
# then the spec: ideate ⇄ plan audit on feature nights; on Sunday's maintenance night (M1b) a survey
# of the whole codebase into the persistent cleanup list and a plan audit that picks items from it.
# Then build (the refactor, on maintenance nights) + gates + retries, review fan-out → verify → fix
# with per-fix gating, blind judge (+ one fix round), journal and metrics. Maintenance gate runs add
# the behaviour-preservation gates P1/P2 (run-gates.sh) and the size limits M1. A dry run pushes
# nothing; a live run (plans/live-prs.md) then hands the branch to scripts/publish.sh, which pushes
# it and opens the PR. Every agent is a fresh `claude -p` in its own sandbox container
# (scripts/agent-run.sh); only harness-copied files pass between them.
#
#   harness/daily.sh --dry-run|--live [--manual] [--maintenance]
#
#   --manual       owner-run daytime dry run: no start cutoff; the no-new-phase and hard limits are
#                  the start plus the nightly offsets from START_AT (+3h15, +4h30).
#   --maintenance  a maintenance night on any day (maintenance is otherwise Sunday, London time).
#
# Works in its own clone ($DAILY_HOME/repo, never the owner's working copy) on branch
# daily/<London date>. Every harness script comes from this checkout. Logs go to
# $DAILY_HOME/runs/<date>/ (outside every container) and are copied to journal/runs/<date>/ and
# committed on the branch at the end, abort included; the builder's own journal files move under
# journal/runs/<date>/builder/ so they can't pose as harness files. Before every commit the token
# is redacted from the tree and the run folder. Live runs also take the backlog state from the
# repo's daily PRs and skip the night when MAX_OPEN_DAILY_PRS are open; dry runs read them too
# (read-only) when a GitHub token exists, for the existing-work list and the pick.
# Exit 0: the night ran (whatever the outcome) or was skipped on purpose. Non-zero: harness error.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/lib/common.sh"

mode='' manual=0 force_maint=0
for arg in "$@"; do
  case $arg in --dry-run) mode=dry ;; --live) mode=live ;; --manual) manual=1 ;; --maintenance) force_maint=1 ;; *) mode=; break ;; esac
done
[[ -n $mode ]] || { echo "usage: daily.sh --dry-run|--live [--manual] [--maintenance]" >&2; exit 2; }

# Test-only hooks, used by harness/tests/daily-e2e.sh and nothing else: a folder of stub
# agent-run/run-gates/sandbox-net scripts and a file holding a fake epoch clock (DAILY_GH: common.sh).
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
# The harness's own commands (ts_node) only see DAILY_HOME, so the cleanup list must live there.
[[ $(realpath -m "$CLEANUP_LIST") == "$(realpath "$DAILY_HOME")"/* ]] || die "CLEANUP_LIST ($CLEANUP_LIST) must be under DAILY_HOME"
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
PRS="$DAILY_HOME/work/prs.json" prs=()
[[ $mode != live || -s $GITHUB_TOKEN_FILE ]] || die "no GitHub token at $GITHUB_TOKEN_FILE"
if [[ -s $GITHUB_TOKEN_FILE ]]; then # read-only: list the daily PRs with what the existing-work list needs
  if gh_ pr list -R "$(repo_slug "$CLONE")" --state all --label daily --limit 1000 \
    --json number,title,state,isDraft,labels,author,body,files,comments,url >"$PRS"; then
    prs=("$PRS")
  elif [[ $mode == live ]]; then die "could not list the daily PRs"
  else echo "dry run: could not list the daily PRs; going on without them" >&2; fi
fi
if [[ $mode == live ]]; then
  open_prs=$(jq '[.[] | select(.state == "OPEN")] | length' "$PRS")
  (( open_prs < MAX_OPEN_DAILY_PRS )) || skip "$open_prs daily PRs open (limit $MAX_OPEN_DAILY_PRS); review some first"
fi

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
# discard <reason>: drops every uncommitted change; the (untracked) journal folder comes back empty.
discard() { log "discarding uncommitted work: $*"; git -C "$CLONE" reset -q --hard; git -C "$CLONE" clean -qffdx; mkdir -p "$J"; }
# meta_set <key> <json value>: records a value in meta.json.
meta_set() { local t; t="$(jq --arg k "$1" --argjson v "$2" '.[$k] = $v' "$RUN/meta.json")" && printf '%s\n' "$t" >"$RUN/meta.json"; }
# notes_out [subdir]: moves the agents' journal files out of the tree into $RUN/builder[/subdir], so
# no later agent (reviewer, verifier, judge) reads the builder's self-assessment.
notes_out() {
  sanitize
  [[ -n $(ls -A "$J" 2>/dev/null) ]] || return 0
  mkdir -p "$RUN/builder/${1:-}" && cp -rT "$J" "$RUN/builder/${1:-}" && rm -rf "$J" && mkdir -p "$J"
}
# metrics: appends tonight's row to METRICS_CSV (with the header when the file is new). A file whose
# header isn't today's columns (a harness change) is first moved aside to metrics-<date>.csv.
metrics() {
  local header=() want old
  mkdir -p "$(dirname "$METRICS_CSV")"
  want="$(ts_node metricsheader 2>>"$RUN_LOG")" || { log "metrics header failed"; return 0; }
  if [[ -s $METRICS_CSV && $(head -1 "$METRICS_CSV") != "$want" ]]; then
    old="${METRICS_CSV%.csv}-$DATE.csv"
    [[ ! -e $old ]] || old="${METRICS_CSV%.csv}-$DATE-$(now).csv"
    mv "$METRICS_CSV" "$old" && log "metrics: columns changed; old file moved to $old"
  fi
  [[ -s $METRICS_CSV ]] || header=(--header)
  ts_node metrics "$RUN" "${header[@]}" >>"$METRICS_CSV" 2>>"$RUN_LOG" || log "metrics row failed"
}
# mirror_list: a copy of the persistent cleanup list (json and markdown) in the run folder, so the
# journal shows the list as the night left it; made read-only once scrubbed. Agents never see the
# original, and nothing reads the copy back.
mirror_list() {
  [[ -f $CLEANUP_LIST ]] || return 0
  rm -f "$RUN/cleanup.json" "$RUN/cleanup.md"
  cp "$CLEANUP_LIST" "$RUN/cleanup.json" && ts_node cleanup-md "$CLEANUP_LIST" "$RUN/cleanup.md" 2>>"$RUN_LOG" || log "could not mirror the cleanup list"
}
# scrub: redacts the token (when one exists) from the clone and the run folder; fails if it stays.
scrub() { [[ ! -s $TOKEN_FILE ]] || tr -d '[:space:]' <"$TOKEN_FILE" | ts_node redact "$CLONE" "$RUN" 2>>"$RUN_LOG"; }

finish() {
  set +e
  trap - TERM INT
  log "outcome: $OUTCOME${REASON:+ ($REASON)}"
  [[ ${MODE:-} != maintenance ]] || mirror_list # before the scrub, which redacts the copy too
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
  meta_set endedAt "$(now)"
  ts_node result "$RUN" "$OUTCOME" "$REASON" 2>>"$RUN_LOG"
  metrics
  chmod a-w "$RUN/cleanup.json" "$RUN/cleanup.md" 2>/dev/null
  if (( on_branch )); then
    notes_out
    cp -rT "$RUN" "$J" && "${GIT[@]}" add -A && "${GIT[@]}" commit -qm "journal: $DATE $mode run ($OUTCOME)" &&
      if [[ $mode == live ]]; then "$here/scripts/publish.sh" "$RUN" >>"$RUN_LOG" 2>&1 || log "publish failed (see run.log)"; fi
  fi
  # The cleanup items the night did: in a live PR of a night that passed they wait as in-PR #n
  # (closed when it merges, read from GitHub next time); a failed night's draft PR and a dry run that
  # passed are only noted on them, and they stay open.
  if [[ ${MODE:-} == maintenance && ( -s $RUN/pr.json || ( $mode == dry && $OUTCOME == pass ) ) ]]; then
    log "cleanup list: $(ts_node cleanup-done "$CLEANUP_LIST" "$RUN" "$BRANCH" "$OUTCOME" 2>>"$RUN_LOG") item(s) noted as done tonight"
    mirror_list && chmod a-w "$RUN/cleanup.json" "$RUN/cleanup.md" 2>/dev/null
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

log "$mode run $DATE (manual=$manual) main=$MAIN_SHA"
# Provenance: the harness checkout's SHA (and whether harness/ has local edits) and the sha256 of
# every prompt and schema, so a change in results can be traced to a harness change.
harness_sha="$(git -C "$here/.." rev-parse HEAD 2>/dev/null || echo unknown)"
[[ -z $(git -C "$here/.." status --porcelain -- harness 2>/dev/null) ]] || harness_sha+="-dirty"
prompt_hashes="$( (cd "$here/.." && sha256sum harness/prompts/* harness/schemas/*) | jq -Rn '[inputs | capture("^(?<h>[0-9a-f]{64})  (?<p>.+)$") | {key: .p, value: .h}] | from_entries')"
jq -n --arg date "$DATE" --argjson dryRun "$([[ $mode == dry ]] && echo true || echo false)" --argjson manual "$( ((manual)) && echo true || echo false)" --argjson startedAt "$(now)" \
  --argjson noNewPhaseAt "$NO_NEW_PHASE_AT" --argjson hardDeadlineAt "$HARD_AT" --arg mainSha "$MAIN_SHA" --arg image "$IMAGE" \
  --arg claudeCodeVersion "$(docker run "${DOCKER_BASE[@]}" --network none --read-only "$IMAGE" claude --version)" \
  --arg ideate "$MODEL_IDEATE" --arg audit "$MODEL_AUDIT" --arg build "$MODEL_BUILD" --arg review "$MODEL_REVIEW" --arg reviewR2 "$MODEL_REVIEW_R2" \
  --arg reviewR2Effort "$EFFORT_REVIEW_R2" --arg verify "$MODEL_VERIFY" --arg fix "$MODEL_FIX" --arg judge "$MODEL_JUDGE" \
  --arg harnessSha "$harness_sha" --argjson promptSha256 "$prompt_hashes" --argjson forcedMaintenance "$( ((force_maint)) && echo true || echo false)" \
  '{$date, $dryRun, $manual, $forcedMaintenance, $startedAt, $noNewPhaseAt, $hardDeadlineAt, $mainSha, $image, $claudeCodeVersion, $harnessSha, $promptSha256,
    models: {$ideate, $audit, $build, $review, $reviewR2, $reviewR2Effort, $verify, $fix, $judge}}' >"$RUN/meta.json"

git -C "$CLONE" checkout -qf -B "$BRANCH" origin/main
git -C "$CLONE" clean -qffdx
mkdir -p "$J"
on_branch=1

# ---- Existing work and pick ---------------------------------------------------------------------
mkdir -p "$WORK"
SKIPPED=() # backlog items tonight's plan audit deferred or rejected
pick() {
  local skip=() p
  (( ${#SKIPPED[@]} == 0 )) || skip=("--skip=$(IFS=,; echo "${SKIPPED[*]}")")
  p="$(ts_node pick "$(( SUNDAY || force_maint ))" "$CLONE/guardrails/BACKLOG.md" "$DAILY_HOME/dry-runs.json" "$RUN/item.md" "$RUN/meta.json" "${prs[@]}" "${skip[@]}")"
  eval "$p"
}
pick
case $KIND in
  phase2) stop skip "phase 2 not built" ;;
  blocked) stop skip "blocked: every open backlog item waits on unmerged dependencies or already has a PR" ;;
esac
MODE=$KIND   # backlog | maintenance
maint=(); [[ $MODE != maintenance ]] || maint=(--maintenance)
log "work: $MODE ${ITEM_ID:+$ITEM_ID · $ITEM_TITLE}"
# The existing-work list (merged / in flight / rejected daily PRs, the backlog) for ideate, the plan
# audit and the judge, and each open PR's files for the overlap check. The owner's in-flight diffs
# go to the plan auditor as files, without their journal/ sections (journal masking).
ts_node existing "${prs[0]:--}" "$CLONE/guardrails/BACKLOG.md" "$OWNER_LOGIN" "$RUN/existing-work.md" "$WORK/open-files.json"
mkdir -p "$WORK/inflight"
if (( ${#prs[@]} )); then
  for pr in $(jq -r --arg o "$OWNER_LOGIN" '.[] | select(.state == "OPEN" and .author.login == $o) | .number' "$PRS"); do
    gh_ pr diff "$pr" -R "$(repo_slug "$CLONE")" 2>>"$RUN_LOG" | ts_node nojournal >"$WORK/inflight/pr-$pr.diff" 2>>"$RUN_LOG" ||
      { log "could not fetch the diff of #$pr"; rm -f "$WORK/inflight/pr-$pr.diff"; }
  done
fi

# ---- Phase helpers --------------------------------------------------------------------------------
tonight() { printf '\n## Tonight\n\n- Date: %s\n- Mode: %s\n' "$DATE" "$MODE"; }
check_time() { (( $(now) < NO_NEW_PHASE_AT )) || stop abort "deadline: no new phase after $NO_NEW_PHASE_AFTER ($1 not started)"; }
# soft_time <phase>: false (logged) once no new phase may start; for the optional review phases.
soft_time() { (( $(now) < NO_NEW_PHASE_AT )) && return 0; log "deadline: no new phase after $NO_NEW_PHASE_AFTER; $1 skipped"; return 1; }
verify_spec() { [[ $(sha256sum "$RUN/spec.md" | cut -c1-64) == "$SPEC_SHA" ]] || stop abort "spec.md hash mismatch before $1"; }

# agent_run <phase> <attempt> <prompt-file> <model> <max-turns> <wall-min> [agent-run args...]: one
# agent call; returns agent-run's exit code (99: no time left). Later args override earlier ones
# (--workdir for the judge). Wall clock is capped so a gate run still fits before the hard deadline.
agent_run() {
  local out="$RUN/phases/$1-$2" wall=$6 t0 rc=0
  local fit=$(( (HARD_AT - $(now)) / 60 - GATE_CAP_MIN - 2 ))
  (( wall <= fit )) || wall=$fit
  (( wall > 0 )) || return 99
  mkdir -p "$out"; t0=$(now)
  log "phase $1-$2: start (max turns $5, wall ${wall}m)"
  "$SCRIPTS/agent-run.sh" --phase "$1" --workdir "$CLONE" --prompt-file "$3" --model "$4" --max-turns "$5" \
    --timeout-min "$wall" --out "$out" --date "$DATE" "${maint[@]}" "${@:7}" >>"$RUN_LOG" 2>&1 || rc=$?
  printf '{"startedAt":%s,"endedAt":%s,"exit":%s}\n' "$t0" "$(now)" "$rc" >"$out/harness.json"
  log "phase $1-$2: exit $rc"
  return "$rc"
}
# agent_rc <phase-attempt> <exit>: stops the night on a usage limit (HANDOVER §6.3), an agent or
# harness error, or no time.
agent_rc() {
  case $2 in
    0) ;;
    99) stop abort "deadline: no time left for $1" ;;
    10) stop abort "usage limit in $1 (agent-run exit 10)" ;;
    11 | 12) log "phase $1 hit its $( (($2 == 11)) && echo turn || echo time) limit; continuing with what exists" ;;
    13) stop abort "agent error in $1 (agent-run exit 13)" ;;
    *) stop abort "agent-run failed in $1 (exit $2)" ;;
  esac
}
# soft_rc <phase-attempt> <exit>: agent_rc for the phases a night can lose (a reviewer, the
# verifier, a fix): an agent error (13) is logged and returns 1 so the caller drops that agent's
# work and carries on. A usage limit, no time or a harness error still stop the night.
soft_rc() { [[ $2 == 13 ]] || { agent_rc "$@"; return 0; }; log "phase $1: agent error (exit 13); dropped, carrying on"; return 1; }
agent() { local rc=0; agent_run "$@" || rc=$?; agent_rc "$1-$2" "$rc"; quota 'stop abort'; }

# commit_tree <message>: the harness commit of the whole working tree (the agents' journal folder
# too, so G8 polices it).
commit_tree() {
  sanitize
  scrub || stop abort "the token is in the work tree and could not be redacted"
  "${GIT[@]}" add -A || die "git add failed"
  "${GIT[@]}" commit -q --allow-empty --no-verify -m "$1" || die "git commit failed"
}
dirty() { [[ -n $(git -C "$CLONE" status --porcelain) ]]; }
# run_gates <n>: run-gates on HEAD → $RUN/gates-<n>.{json,md}; 1 (and FEEDBACK) when they fail.
run_gates() {
  local out="$WORK/gates-$1" sha rc=0
  disk 'stop abort'
  sha="$(git -C "$CLONE" rev-parse HEAD)"
  verify_spec "gates-$1"
  mkdir -p "$out"
  meta_set headGateRun "$1"
  log "gates attempt $1 on $sha"
  "$SCRIPTS/run-gates.sh" "${maint[@]}" --today "$DATE" "$CLONE" "$sha" "$out" >>"$RUN_LOG" 2>&1 || rc=$?
  [[ $MODE != maintenance ]] || limits "$out"
  cp "$out/gates.json" "$RUN/gates-$1.json" 2>/dev/null || log "gates attempt $1: no gates.json"
  cp "$out/summary.md" "$RUN/gates-$1.md" 2>/dev/null || true
  (( rc == 0 )) && jq -e '.pass == true' "$RUN/gates-$1.json" >/dev/null 2>&1 && return
  FEEDBACK="$(ts_node feedback "$RUN/gates-$1.json")"
  return 1
}
gates() { commit_tree "daily $DATE: attempt $1 (harness commit)"; run_gates "$1"; }
# limits <gate-out-dir>: gate M1 (maintenance nights) over HEAD's diff against main, added to that
# gate run's gates.json and summary.md: the size limits, no net src/ growth, tests and screen stages
# append-only, no src/ file importing from tests/, the allowlist. Fails closed: if the check can't
# run, the gate run fails.
limits() {
  local d=(-C "$CLONE" -c core.quotePath=false diff --no-renames --no-ext-diff --no-textconv --ignore-submodules=none -z) t rc=0
  git "${d[@]}" --raw "$MAIN_SHA" HEAD >"$1/diff-raw"
  git "${d[@]}" --numstat "$MAIN_SHA" HEAD >"$1/diff-numstat"
  git -C "$CLONE" -c core.quotePath=false grep -z -n -I -F 'tests/' HEAD -- src >"$1/src-tests" || rc=$? # 1: no match
  if (( rc <= 1 )) && ts_node limits "$1/diff-raw" "$1/diff-numstat" "$1/gates.json" "$1/summary.md" "$DATE" "$1/src-tests" 2>>"$RUN_LOG"; then return; fi
  log "gate M1 could not run; this gate run fails"
  t="$(jq '.pass = false' "$1/gates.json" 2>/dev/null)" && printf '%s\n' "$t" >"$1/gates.json"
}
# loc_json: changed src/ lines and files of the branch so far.
loc_json() { git -C "$CLONE" diff --numstat "$MAIN_SHA" HEAD -- src | awk '{a += $1; d += $2; f++} END {printf "{\"files\":%d,\"added\":%d,\"deleted\":%d}", f, a, d}'; }
branch_diff() { git -C "$CLONE" diff "$MAIN_SHA" HEAD -- . ':(exclude)journal'; }
# screenshots <dir>: stage and race screenshots of the work tree via scripts/screenshots.sh
# (`screenshots.sh <repo> <outdir>` → <outdir>/index.json = [{name, kind, viewport, path}]). That
# folder ran the builder's code, so only the PNGs a harness-validated index lists reach <dir>
# (`cli.ts shots`: index shape and length, regular files, PNG signature, size). Optional: without
# the script, or when it fails, the night goes on without them. Only the index reaches the journal
# (G8 allows no image files).
screenshots() {
  local s="$SCRIPTS/screenshots.sh" raw="$1.raw" n
  rm -rf "$1" "$raw"
  [[ -x $s ]] || { log "screenshots: no $s; going on without them"; return 0; }
  mkdir -p "$raw"
  if timeout "${SCREENSHOT_MIN}m" "$s" "$CLONE" "$raw" >>"$RUN_LOG" 2>&1 && n="$(ts_node shots "$raw" "$1" 2>>"$RUN_LOG")"; then
    mkdir -p "$RUN/screenshots" && cp "$1/index.json" "$RUN/screenshots/index.json"
    log "screenshots: $n in $1"
  else log "screenshots: failed or invalid (see run.log); going on without them"; rm -rf "$1"; fi
  rm -rf "$raw"
}

# ---- Spec: ideate ⇄ plan audit (feature nights), survey → cleanup list → plan audit (maintenance) ----
# ideate_prompt <out> [<revise-brief> <previous-draft.md>]
ideate_prompt() {
  { cat "$here/prompts/ideate.md"; tonight
    [[ $MODE != backlog ]] || printf '\n### Backlog item\n\n%s\n' "$(cat "$RUN/item.md")"
    printf '\n## Existing work (data, from the harness)\n\n'; cat "$RUN/existing-work.md"
    if [[ -n ${2:-} ]]; then printf '\n'; cat "$2"; printf '\n### Your previous draft\n\n'; cat "$3"; fi
  } >"$1"
}
# audit_prompt <out> <draft-dir>
audit_prompt() {
  { cat "$here/prompts/plan-audit.md"; tonight
    printf '\n### Backlog item\n\n%s\n' "$(cat "$RUN/item.md")"
    printf '\n## Draft spec\n\n'; cat "$2/draft.md"
    printf '\n## File overlap with open daily PRs (computed by the harness)\n\n'; cat "$2/overlap.md"
    printf '\n## Acceptance criteria that may name internals (harness lint, advisory)\n\n'; cat "$2/lint.md"
    printf '\n## In-flight diffs\n\nThe owner'"'"'s open daily PRs'"'"' diffs are in `/inputs/` (`pr-<n>.diff`), if any.\n'
    printf '\n## Existing work (data, from the harness)\n\n'; cat "$RUN/existing-work.md"
  } >"$1"
}
# record_audit <item> <verdict> <rounds> <waits-on>: audit.json = the last item's verdict and rounds,
# plus every item tried tonight.
record_audit() {
  local t
  t="$(jq -n --slurpfile old <(cat "$RUN/audit.json" 2>/dev/null || echo '{}') --arg id "$1" --arg v "$2" --argjson r "$3" --arg w "$4" \
    '{verdict: $v, rounds: $r, items: (($old[0].items // []) + [{id: $id, verdict: $v, rounds: $r, waitsOn: (if $w == "" then null else $w end)}])}')"
  printf '%s\n' "$t" >"$RUN/audit.json"
}

# ---- Maintenance: survey → cleanup list → plan audit (plans/full-pipeline.md "The 7th day") -------
MAINT="$RUN/maintenance.json"
# survey: closes the list's items whose maintenance PR merged, then one fresh read-only agent per area
# (and the duplication and performance passes) in parallel, each with the list, the export inventory
# and whole-codebase clone report, the existing work and the perf probe's numbers; their findings
# are merged into the list. A pass that errors is dropped; the night goes on.
survey() {
  local sin="$WORK/survey-in" pids=() failed=() area rc i=0
  local areas=(sim render ui content tests seams duplication performance)
  eval "$(ts_node cleanup-sync "$CLEANUP_LIST" "${prs[0]:--}" "$OWNER_LOGIN" "$DATE" "$MAINT")"
  log "cleanup list: $SYNC_CLOSED item(s) closed by merged maintenance PRs, $SYNC_REOPENED reopened"
  mkdir -p "$sin"
  cp "$RUN/existing-work.md" "$sin/"
  git -C "$CLONE" ls-files -- src >"$WORK/all-src.txt"
  ts_node inventory "$CLONE" "$WORK/all-src.txt" "$sin"
  ts_node cleanup-md "$CLEANUP_LIST" "$sin/cleanup.md"
  if [[ -x $SCRIPTS/perf-probe.sh ]] && timeout "${PERF_PROBE_MIN}m" "$SCRIPTS/perf-probe.sh" "$CLONE" "$sin/perf.json" >>"$RUN_LOG" 2>&1; then
    cp "$sin/perf.json" "$RUN/perf.json" && log "perf probe: done"
  else rm -f "$sin/perf.json"; log "perf probe: failed or missing; the performance pass reads the code only"; fi
  "$SCRIPTS/sandbox-net.sh" up >>"$RUN_LOG" 2>&1 || stop abort "the sandbox network did not start"
  for area in "${areas[@]}"; do
    { cat "$here/prompts/survey.md" "$here/prompts/survey-$area.md"; tonight; } >"$WORK/survey-$area.md"
    agent_run "survey-$area" 1 "$WORK/survey-$area.md" "$MODEL_SURVEY" "$MAX_TURNS_SURVEY" "$WALL_SURVEY_MIN" --access ro --inputs "$sin" \
      --json-schema "$here/schemas/survey.json" --tools Read,Glob,Grep &
    pids+=("$!")
  done
  for area in "${areas[@]}"; do
    rc=0; wait "${pids[$i]}" || rc=$?; i=$((i + 1))
    soft_rc "survey-$area-1" "$rc" || failed+=("$area")
  done
  eval "$(ts_node survey "$CLEANUP_LIST" "$RUN/phases" "$CLONE" "$DATE" "$MAINT" "--failed=$(IFS=,; echo "${failed[*]}")" 2>>"$RUN_LOG")"
  log "survey: $SURVEY_FINDINGS findings, $SURVEY_NEW new on the cleanup list${failed[*]:+ (agent error, dropped: ${failed[*]})}"
}
# maintenance_spec: the survey, then tonight's eligible items (open, not owner-only, touching no open
# PR's files) for a fresh plan auditor, whose choice the harness checks and locks as spec.md.
maintenance_spec() {
  survey
  eval "$(ts_node candidates "$CLEANUP_LIST" "$WORK/open-files.json" "$DATE" "$WORK/candidates.md" "$MAINT")"
  log "cleanup list: $ELIGIBLE item(s) eligible tonight"
  (( ELIGIBLE > 0 )) || stop skip "no eligible cleanup item tonight (see cleanup.md)"
  check_time audit-1
  { cat "$here/prompts/maint-audit.md"; tonight
    printf '\n## Limits\n\n- At most %s items; %s changed files and %s changed lines in all (journal excluded).\n' "$MAINT_MAX_ITEMS" "$MAINT_MAX_FILES" "$MAINT_MAX_LINES"
    printf -- '- Net `src/` lines must not grow (added − deleted ≤ %s); tests don'"'"'t count.\n- Existing tests are append-only tonight.\n' "$MAINT_MAX_NET_SRC_LINES"
    printf '\n## Tonight'"'"'s candidates from the cleanup list (data, from the harness)\n\n'; cat "$WORK/candidates.md"
    printf '\n## In-flight diffs\n\nThe owner'"'"'s open daily PRs'"'"' diffs are in `/inputs/` (`pr-<n>.diff`), if any.\n'
    printf '\n## Existing work (data, from the harness)\n\n'; cat "$RUN/existing-work.md"
  } >"$WORK/maint-audit.md"
  agent audit 1 "$WORK/maint-audit.md" "$MODEL_AUDIT" "$MAX_TURNS_MAINT_AUDIT" "$WALL_MAINT_AUDIT_MIN" \
    --json-schema "$here/schemas/maint-audit.json" --tools Read,Glob,Grep --access ro --inputs "$WORK/inflight"
  eval "$(ts_node maintspec "$CLEANUP_LIST" "$RUN/phases/audit-1/result.json" "$RUN/spec.md" "$RUN/spec.json" "$DATE" "$RUN/meta.json" "$RUN/audit.json" "$MAINT" 2>>"$RUN_LOG")"
  log "plan audit: $CHOSEN cleanup item(s) chosen"
  (( CHOSEN > 0 )) || stop skip "the plan audit chose no cleanup item"
}

check_time "$( [[ $MODE == backlog ]] && echo ideate || echo survey)"
if [[ $MODE == backlog ]]; then
  n=0 items=0
  while :; do
    items=$((items + 1)) round=0 brief=''
    while :; do
      round=$((round + 1)) n=$((n + 1)) d="$WORK/draft-$n"
      mkdir -p "$d"
      check_time "ideate-$n"
      if [[ -n $brief ]]; then ideate_prompt "$d/ideate.md" "$brief" "$WORK/draft-$((n - 1))/draft.md"; else ideate_prompt "$d/ideate.md"; fi
      agent ideate "$n" "$d/ideate.md" "$MODEL_IDEATE" "$MAX_TURNS_IDEATE" "$WALL_IDEATE_MIN" \
        --json-schema "$here/schemas/spec.json" --tools Read,Glob,Grep --access ro
      draft="$(ts_node draft "$RUN/phases/ideate-$n/result.json" "$d" "$DATE" "$MODE" "$ITEM_ID" "$WORK/open-files.json" 2>>"$RUN_LOG")" ||
        stop fail "ideate produced no valid spec (see run.log)"
      eval "$draft"
      check_time "audit-$n"
      audit_prompt "$d/audit-prompt.md" "$d"
      agent audit "$n" "$d/audit-prompt.md" "$MODEL_AUDIT" "$MAX_TURNS_AUDIT" "$WALL_AUDIT_MIN" \
        --json-schema "$here/schemas/audit.json" --tools Read,Glob,Grep --access ro --inputs "$WORK/inflight"
      verdict="$(ts_node audit "$RUN/phases/audit-$n/result.json" "$OVERLAP" "$round" "$d/audit.json" "$d/audit.md")"
      eval "$verdict"
      mkdir -p "$RUN/audit" && cp "$d/draft.md" "$RUN/audit/draft-$n.md" && cp "$d/audit.json" "$RUN/audit/audit-$n.json"
      jq -r '.designRequest // empty' "$d/audit.json" | { grep . && echo; } >>"$RUN/design-request.md" || true
      [[ -s $RUN/design-request.md ]] || rm -f "$RUN/design-request.md"
      log "plan audit $n ($ITEM_ID, round $round): $VERDICT${WAITS_ON:+ (waits on $WAITS_ON)}"
      [[ $VERDICT == revise ]] || break
      if (( round > MAX_AUDIT_REVISIONS )); then VERDICT=reject; log "plan audit: $ITEM_ID still needs revision after $MAX_AUDIT_REVISIONS rounds; rejected"; break; fi
      brief="$d/revise.md"
      ts_node revise "$d/audit.json" >"$brief"
    done
    record_audit "$ITEM_ID" "$VERDICT" "$round" "$WAITS_ON"
    [[ $VERDICT != approve ]] || break
    SKIPPED+=("$ITEM_ID")
    (( items < MAX_ITEMS_PER_NIGHT )) || stop skip "no backlog item passed the plan audit tonight (${SKIPPED[*]})"
    pick
    [[ $KIND == backlog ]] || stop skip "no other backlog item to try after the plan audit (${SKIPPED[*]})"
    log "work: next item $ITEM_ID · $ITEM_TITLE"
  done
  SPEC_SHA="$(ts_node lock "$d/draft.json" "$d/audit.md" "$RUN/spec.md" "$RUN/spec.json" "$DATE" "$MODE" "$RUN/meta.json" 2>>"$RUN_LOG")" ||
    stop fail "could not lock the approved spec (see run.log)"
else
  maintenance_spec
fi
log "spec locked: sha256 $SPEC_SHA"

# ---- Build, gates, retries ------------------------------------------------------------------------------
# Maintenance nights build with the refactor prompt, and the refactor reports per cleanup item.
build_prompt=build build_args=()
[[ $MODE != maintenance ]] || build_prompt=refactor build_args=(--json-schema "$here/schemas/refactor.json")
{ cat "$here/prompts/$build_prompt.md"; tonight; printf '\n## Locked spec\n\n'; cat "$RUN/spec.md"; } >"$WORK/build.md"
attempt=1 phase=build turns=$MAX_TURNS_BUILD wall=$WALL_BUILD_MIN prompt="$WORK/build.md"
while :; do
  check_time "$phase-$attempt"
  verify_spec "$phase-$attempt"
  meta_set attempts "$attempt"
  agent "$phase" "$attempt" "$prompt" "$MODEL_BUILD" "$turns" "$wall" "${build_args[@]}"
  [[ $MODE != maintenance ]] || ts_node refactor "$RUN/phases/$phase-$attempt/result.json" "$MAINT" 2>>"$RUN_LOG" || log "no refactor report"
  gates "$attempt" && break
  (( attempt <= MAX_RETRIES )) || stop fail "gates failed after $MAX_RETRIES retries"
  (( $(now) < NO_NEW_PHASE_AT )) || stop fail "gates failed; no retry after $NO_NEW_PHASE_AFTER"
  prompt="$WORK/retry-$((attempt + 1)).md"
  { cat "$WORK/build.md"; printf '\n## Gate failures after attempt %s\n\nFix these. Your earlier work is already in the tree.\n\n' "$attempt"; echo "$FEEDBACK"; } >"$prompt"
  attempt=$((attempt + 1)) phase=retry turns=$MAX_TURNS_RETRY wall=$WALL_RETRY_MIN
done
gate_n=$attempt

# ---- Review fan-out → verify → fix (plans/full-pipeline.md steps 7–10) ---------------------------------
# The builder's notes leave the tree first: no later agent reads its self-assessment.
notes_out
! dirty || commit_tree "daily $DATE: builder notes moved out before review"
before="$(loc_json)"
RIN="$WORK/review-in"
mkdir -p "$RIN"
cp "$RUN/spec.md" "$RUN/existing-work.md" "$RIN/"
cp "$RUN/gates-$gate_n.md" "$RIN/gates.md" 2>/dev/null || true
branch_diff >"$RIN/diff.patch"
git -C "$CLONE" diff --name-only "$MAIN_SHA" HEAD -- src >"$RIN/changed.txt"
ts_node inventory "$CLONE" "$RIN/changed.txt" "$RIN"
screenshots "$RIN/screenshots"
inputs_note() {
  printf '\n## Inputs (copied by the harness, read-only under /inputs/)\n\n'
  printf -- '- `spec.md`: the locked spec with its plan audit\n- `diff.patch`: the branch against main (journal excluded)\n'
  printf -- '- `gates.md`: the last gate run\n- `existing-work.md`: merged, in-flight and rejected work\n'
  printf -- '- `inventory.md`, `clones.md`: exported helpers in src/ and repeated code (harness-generated)\n'
  if [[ -d $RIN/screenshots ]]; then printf -- '- `screenshots/`: stage and race screenshots of this branch (`index.json` lists them)\n'
  else printf -- '- No screenshots tonight.\n'; fi
  printf '\nThe repo at /work is this branch, read-only. Mockups and boards: `guardrails/design/`.\n'
}
review_ok=0 COUNT=0
if soft_time review; then
  "$SCRIPTS/sandbox-net.sh" up >>"$RUN_LOG" 2>&1 || stop abort "the sandbox network did not start"
  pids=() rcs=() failed=()
  for r in R1 R2 R3 R4 R5; do
    model=$MODEL_REVIEW effort=() focus="$here/prompts/review-${r,,}.md"
    [[ $r != R2 ]] || { model=$MODEL_REVIEW_R2; [[ -z $EFFORT_REVIEW_R2 ]] || effort=(--effort "$EFFORT_REVIEW_R2"); }
    [[ $MODE != maintenance || $r != R1 ]] || focus="$here/prompts/review-r1-maintenance.md"
    { cat "$here/prompts/review.md" "$focus"; [[ $MODE != maintenance ]] || cat "$here/prompts/review-maintenance.md"; tonight; inputs_note; } >"$WORK/review-$r.md"
    agent_run "${r,,}" 1 "$WORK/review-$r.md" "$model" "$MAX_TURNS_REVIEW" "$WALL_REVIEW_MIN" --access ro --inputs "$RIN" \
      --json-schema "$here/schemas/findings.json" --tools Read,Glob,Grep "${effort[@]}" &
    pids+=("$!")
  done
  for p in "${pids[@]}"; do rc=0; wait "$p" || rc=$?; rcs+=("$rc"); done
  for i in "${!rcs[@]}"; do soft_rc "r$((i + 1))-1" "${rcs[$i]}" || failed+=("R$((i + 1))"); done
  findings="$(ts_node findings "$RUN/review.json" "$RUN/phases" R1,R2,R3,R4,R5 "--failed=$(IFS=,; echo "${failed[*]}")")"
  eval "$findings"
  review_ok=1
  log "review: $COUNT findings${failed[*]:+ (agent error, dropped: ${failed[*]})}"
else
  ts_node notreviewed "$RUN/review.json" "No time: the review would have started after $NO_NEW_PHASE_AFTER, so no reviewer, verifier or fixer ran."
fi

# fix_head: the fix agent's prompt (with the maintenance rules on maintenance nights) and tonight.
fix_head() { cat "$here/prompts/fix.md"; [[ $MODE != maintenance ]] || cat "$here/prompts/fix-maintenance.md"; tonight; }
# fix_one <id> <k> <prompt>: one fresh fix agent. Its change is committed only when it reports
# `fixed`, then gated on its own; a fix that fails the gates is reverted (just that one), so a bad
# early fix never costs the good ones after it. FIX_KEPT=1 when the fix is kept. (Always returns 0,
# so errexit still holds inside it.)
fix_one() {
  local id=$1 k=$2 rc=0 commit=- res="$RUN/phases/fix-$2/result.json"
  FIX_KEPT=0
  agent_run fix "$k" "$3" "$MODEL_FIX" "$MAX_TURNS_FIX" "$WALL_FIX_MIN" --json-schema "$here/schemas/fix.json" || rc=$?
  soft_rc "fix-$k" "$rc" || res=/dev/null # an agent error: its report counts as none
  notes_out "fix-$k"
  quota discard
  eval "$(ts_node fixstatus "$res")"
  if [[ $FIX_STATUS != fixed ]]; then
    ! dirty || discard "fix $id reported $FIX_STATUS"
  elif dirty; then
    commit_tree "daily $DATE: fix $id"
    commit="$(git -C "$CLONE" rev-parse HEAD)"
  fi
  ts_node fixrecord "$RUN/review.json" "$id" "$res" "$commit"
  [[ $commit != - ]] || return 0
  gate_n=$((gate_n + 1))
  if run_gates "$gate_n"; then
    pass_n=$gate_n kept=$((kept + 1)) FIX_KEPT=1
    ts_node fixkept "$RUN/review.json" "$id" 1
    return 0
  fi
  git -C "$CLONE" reset -q --hard HEAD~1
  meta_set headGateRun "$pass_n"
  ts_node fixkept "$RUN/review.json" "$id" 0
  log "fix $id dropped: the gates failed with it"
}

pass_n=$gate_n kept=0 k=0 # pass_n: the last gate run that passed (HEAD's)
if (( review_ok && COUNT > 0 )); then
  { cat "$here/prompts/verify.md"; tonight; inputs_note; printf '\n## Findings to verify\n\n```json\n'; jq '.findings' "$RUN/review.json"; printf '```\n'; } >"$WORK/verify.md"
  rc=0
  agent_run verify 1 "$WORK/verify.md" "$MODEL_VERIFY" "$MAX_TURNS_VERIFY" "$WALL_VERIFY_MIN" --access verify --inputs "$RIN" \
    --json-schema "$here/schemas/verify.json" --tools Read,Glob,Grep,Bash,Write,Edit || rc=$?
  vres="$RUN/phases/verify-1/result.json"
  soft_rc verify-1 "$rc" || vres=/dev/null # an agent error: every finding is dropped
  quota 'stop abort'
  # The verifier's new tests are kept as evidence (regular .ts files inside tests/ only; never
  # through a symlink) and then removed from the tree: each fixer adds its own.
  : >"$WORK/verify-written.txt"
  while IFS= read -r f; do
    [[ $f == *.ts && -f $CLONE/$f && ! -L $CLONE/$f && $(realpath "$CLONE/$f") == "$CLONE/$f" && $(stat -c %s "$CLONE/$f") -le 200000 ]] || continue
    mkdir -p "$RUN/verify-tests/$(dirname "$f")" && cp "$CLONE/$f" "$RUN/verify-tests/$f" && echo "$f" >>"$WORK/verify-written.txt"
  done < <(git -C "$CLONE" ls-files --others --exclude-standard -- tests)
  git -C "$CLONE" checkout -q -- tests && git -C "$CLONE" clean -qfd -- tests
  notes_out verify
  rulings="$(ts_node rulings "$RUN/review.json" "$vres" "$WORK/verify-written.txt" "$MAX_FIXES" "$WORK/fix-queue.txt")"
  eval "$rulings"
  log "verify: $VERIFIED of $COUNT findings verified"
  mapfile -t queue <"$WORK/fix-queue.txt"
  for id in "${queue[@]}"; do
    soft_time "fix $id" || break
    k=$((k + 1))
    { fix_head; printf '\n## Locked spec\n\n'; cat "$RUN/spec.md"; printf '\n'; ts_node fixbrief "$RUN/review.json" "$id" "$RUN/verify-tests"; } >"$WORK/fix-$k.md"
    fix_one "$id" "$k" "$WORK/fix-$k.md"
  done
fi
printf '{"beforeReview":%s,"afterReview":%s}\n' "$before" "$(loc_json)" >"$RUN/loc.json"
ts_node reviewmd "$RUN/review.json" >"$RUN/review.md"

# ---- Judge (+ one fix round) -------------------------------------------------------------------------
# judge_round <r>: a blind call (spec, diff, screenshots, gates, references, existing work; no
# review.md), then a check call that also gets review.md and the blind scores. Both isolated: their
# workdir is a folder of copies, so the repo's CLAUDE.md never loads. The harness decides (PASS).
judge_round() {
  local r=$1
  local in="$WORK/judge-$r" chk="$WORK/judgecheck-$r"
  rm -rf "$in" "$chk"
  mkdir -p "$in/references"
  cp "$RUN/spec.md" "$RUN/existing-work.md" "$in/"
  cp "$RUN/gates-$pass_n.md" "$in/gates.md" 2>/dev/null || true
  branch_diff >"$in/diff.patch"
  git -C "$CLONE" archive "$MAIN_SHA" guardrails/design | tar -x -C "$in/references" --strip-components=2
  [[ ! -d $SHOTS ]] || cp -r "$SHOTS" "$in/screenshots"
  ts_node planted "$in/diff.patch" >"$WORK/planted-$r.txt"
  { cat "$here/prompts/judge.md" "$here/prompts/judge-rubric$([[ $MODE != maintenance ]] || echo -maintenance).md"; tonight
    printf '\n## This call: blind scoring\n\nScore the build from the files in this folder. There is no review yet. Fill in the blind schema.\n'; } >"$WORK/judge-$r.md"
  agent judge "$r" "$WORK/judge-$r.md" "$MODEL_JUDGE" "$MAX_TURNS_JUDGE" "$WALL_JUDGE_MIN" \
    --workdir "$in" --access isolated --json-schema "$here/schemas/judge-blind.json" --tools Read,Glob,Grep
  cp -r "$in" "$chk"
  ts_node reviewmd "$RUN/review.json" --for-check >"$chk/review.md" # dropped findings claim nothing
  ts_node structured "$RUN/phases/judge-$r/result.json" >"$chk/blind-scores.json"
  { cat "$here/prompts/judge.md"; tonight
    printf '\n## This call: check the review\n\nYour blind scores are fixed (`blind-scores.json`). Now read `review.md` and check each of its claims against `diff.patch`, then look for new agent rules and planted instructions. Fill in the check schema.\n'; } >"$WORK/judgecheck-$r.md"
  agent judgecheck "$r" "$WORK/judgecheck-$r.md" "$MODEL_JUDGE" "$MAX_TURNS_JUDGE" "$WALL_JUDGE_MIN" \
    --workdir "$chk" --access isolated --json-schema "$here/schemas/judge-check.json" --tools Read,Glob,Grep
  local v
  v="$(ts_node judge 1 "$RUN/phases/judge-$r/result.json" "$RUN/phases/judgecheck-$r/result.json" "$WORK/planted-$r.txt" "$r" "$RUN/judge-$r.json" "$RUN/judge.md")"
  eval "$v"
  log "judge round $r: $( ((PASS)) && echo pass || echo fail)"
}
# rule_changes: CLAUDE.md and other agent-instruction files the branch changes, plus any new rule
# the judge found, in their own PR section.
rule_changes() {
  local d rules
  d="$(git -C "$CLONE" diff "$MAIN_SHA" HEAD -- CLAUDE.md '*/CLAUDE.md' CLAUDE.local.md AGENTS.md '*/AGENTS.md' .claude)"
  rules="$(jq -r '.newRules[]? | "- " + .' "$RUN/judge-$1.json" 2>/dev/null)"
  rm -f "$RUN/rule-changes.md"
  [[ -z $d$rules ]] || { echo '## CLAUDE.md and agent-rule changes'; echo
    [[ -z $d ]] || printf '```diff\n%s\n```\n\n' "$d"
    [[ -z $rules ]] || printf 'New rules or instructions the judge found:\n\n%s\n' "$rules"; } >"$RUN/rule-changes.md"
}

SHOTS="$RIN/screenshots"
if (( kept )); then SHOTS="$WORK/shots-final"; screenshots "$SHOTS"; fi
# The judge is never dropped (plans/full-pipeline.md): it runs past NO_NEW_PHASE_AFTER, unless
# agent_run finds no time left before the hard deadline. Only its fix round is optional.
judge_round 1
round=1
if (( ! PASS )) && soft_time "judge fix round"; then
  k=$((k + 1))
  { fix_head; printf '\n## Locked spec\n\n'; cat "$RUN/spec.md"; printf '\n'; ts_node judgebrief "$RUN/judge-1.json"
    printf '\nThis is the judge fix round: fix what the judge found (report id `J1`).\n'; } >"$WORK/fix-$k.md"
  fix_one J1 "$k" "$WORK/fix-$k.md"
  if (( FIX_KEPT )); then
    ts_node reviewmd "$RUN/review.json" >"$RUN/review.md"
    printf '{"beforeReview":%s,"afterReview":%s}\n' "$before" "$(loc_json)" >"$RUN/loc.json"
    SHOTS="$WORK/shots-judge-fix"; screenshots "$SHOTS"
    judge_round 2
    round=2
  else
    ts_node reviewmd "$RUN/review.json" >"$RUN/review.md"
    log "judge fix round: no fix kept"
  fi
fi
rule_changes "$round"
(( PASS )) && stop pass ''
stop fail "judge: $(jq -r '.reasons | join("; ")' "$RUN/judge-$round.json")"
