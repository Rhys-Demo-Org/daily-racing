#!/usr/bin/env bash
# Runs the thin gate suite (G1, G2, G3, G8) on a committed branch SHA and writes
# <out-dir>/gates.json, <out-dir>/summary.md and <out-dir>/logs/. Trust model: plans/phase0-plan.md.
#
#   harness/scripts/run-gates.sh [--maintenance] [--main-ref <ref>] --today <YYYY-MM-DD> \
#       <repo-dir> <branch-sha> <out-dir>
#
# "main" is origin/main when <repo-dir> has it, else main (--main-ref overrides, for the self-test).
# Both trees are clean `git archive` extractions (no .git); main's is read-only. Gate code,
# configs, budgets, manifest, baselines and the toolchain image come only from main's tree. Every
# step is a fresh `--network none --read-only` container of the pinned image (DOCKER_BASE):
#   measure  main's tree with the branch's src/ and tests/ (src/driver from main, no
#            tests/baselines), node_modules read-only, no output mount: results leave over stdout,
#            and the last line must carry this run's nonce.
#   verdict  main's gate code over the measure output and both trees as data; writes only /out.
# Exit 0 only when every gate passes; missing/malformed output, crash, timeout or zero tests fail.
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"

usage() { die "usage: run-gates.sh [--maintenance] [--main-ref <ref>] --today <YYYY-MM-DD> <repo-dir> <branch-sha> <out-dir>"; }
maintenance=0 main_ref="" today=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --maintenance) maintenance=1; shift ;;
    --main-ref) main_ref=$2; shift 2 ;;
    --today) today=$2; shift 2 ;;
    -*) usage ;;
    *) break ;;
  esac
done
[[ $# -eq 3 && $today =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || usage

repo="$(cd "$1" && pwd)"
sha="$(git -C "$repo" rev-parse --verify --quiet "$2^{commit}")" || die "no commit $2"
if [[ -z $main_ref ]]; then
  main_ref=main
  git -C "$repo" rev-parse --verify --quiet origin/main >/dev/null && main_ref=origin/main
fi
main_sha="$(git -C "$repo" rev-parse --verify "$main_ref^{commit}")"
base_sha="$(git -C "$repo" merge-base "$main_sha" "$sha")"
mkdir -p "$3/logs"
out="$(cd "$3" && pwd)"
rm -f "$out/gates.json" "$out/summary.md"
started="$(date -u +%FT%TZ)"
t0=$(date +%s%3N)
deadline=$(( $(date +%s) + GATE_CAP_MIN * 60 ))
maint=()
(( maintenance )) && maint=(--maintenance)
run_id="$$-$RANDOM"
nonce="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
work="$(scratch "$DAILY_HOME/work" gates)"
mkdir -p "$work/io" "$work/res" "$work/results"

# Writes a failing gates.json when the report step never ran (harness error, missing image, ...).
fail_closed() {
  [[ -s "$out/gates.json" ]] && return
  local gates="" g
  for g in G1 G2 G3 G8; do gates+="${gates:+,}{\"id\":\"$g\",\"name\":\"$g\",\"pass\":false,\"durationMs\":0,\"summary\":\"harness error: see logs/run-gates.log\",\"details\":\"\"}"; done
  printf '{"branchSha":"%s","mainSha":"%s","startedAt":"%s","durationMs":%s,"pass":false,"maintenance":%s,"gates":[%s]}\n' \
    "$sha" "$main_sha" "$started" $(( $(date +%s%3N) - t0 )) "$( (( maintenance )) && echo true || echo false)" "$gates" >"$out/gates.json"
  printf '# Gates: FAIL\n\nHarness error before the report step; see logs/run-gates.log.\n' >"$out/summary.md"
}
cleanup() {
  docker ps -aq --filter "label=daily-racer-gates=$run_id" | xargs -r docker rm -f >/dev/null 2>&1 || true
  for f in "$work"/io/*.err; do [[ -f $f ]] && tail -c 200000 "$f" >"$out/logs/$(basename "$f" .err).log"; done
  chmod -R u+w "$work" 2>/dev/null || true
  rm -rf "$work"
  fail_closed
}
trap cleanup EXIT
exec 3>&2 2> >(tee "$out/logs/run-gates.log" >&3)

# --- trees ---------------------------------------------------------------------------------------
extract() { mkdir -p "$2"; git -C "$repo" archive --format=tar "$1" | tar -x -C "$2"; }
extract "$main_sha" "$work/main"
extract "$sha" "$work/branch"
# The measure tree: main's tree with the branch's src/ and tests/, main's src/driver, no baselines.
cp -a "$work/main/." "$work/m"
rm -rf "$work/m/src" "$work/m/tests"
for d in src tests; do [[ -d $work/branch/$d ]] && cp -a "$work/branch/$d" "$work/m/$d"; done
rm -rf "$work/m/src/driver" "$work/m/tests/baselines"
mkdir -p "$work/m/src" "$work/m/node_modules" "$work/main/node_modules" "$work/g3in/replays" "$work/g3in/tracks"
cp -a "$work/main/src/driver" "$work/m/src/driver"
cp "$work/main/tests/baselines/replays/"*.json "$work/g3in/replays/" 2>/dev/null || true
cp "$work/main/src/content/tracks/"*.json "$work/g3in/tracks/"
chmod -R a-w "$work/main" "$work/branch" "$work/m" "$work/g3in"

IMAGE="$(image_tag "$work/main/harness/container/Dockerfile")"
need_image
nm="$(deps "$work/main")"

# --- containers ----------------------------------------------------------------------------------
# run <name> <docker args...>: one fresh locked-down container, stdout/stderr → io/<name>.out/.err,
# killed at the cap (or after $RUN_TIMEOUT s). Returns its exit code; 124 = timed out, noted.
run() {
  local name=$1 rc=0 left=${RUN_TIMEOUT:-$(( deadline - $(date +%s) ))} gate=${1:0:2}
  shift
  if (( left <= 0 )); then
    echo "timed out at the ${GATE_CAP_MIN}-minute gate cap ($name not started)" >>"$work/results/${gate^^}.note"
    return 124
  fi
  ( ulimit -f $(( 512 * 1024 ))
    exec timeout -k 10 "$left" docker run "${DOCKER_BASE[@]}" --name "dr-$run_id-$name" --label "daily-racer-gates=$run_id" \
      --network none --read-only --pids-limit 4096 --memory 8g -e TZ=UTC "$@" ) >"$work/io/$name.out" 2>"$work/io/$name.err" || rc=$?
  docker rm -f "dr-$run_id-$name" >/dev/null 2>&1 || true
  (( rc != 124 )) || echo "timed out at the ${GATE_CAP_MIN}-minute gate cap ($name)" >>"$work/results/${gate^^}.note"
  return $rc
}
# measure <name> <tree> <cmd...>: branch code; exit code → io/<name>.exit.
measure() {
  local name=$1 tree=$2 rc=0
  shift 2
  run "$name" -v "$tree:/w:ro" -v "$nm:/w/node_modules:ro" -e GATE_NONCE="$nonce" \
    --tmpfs /w/node_modules/.vite:mode=1777 --tmpfs /w/node_modules/.vite-temp:mode=1777 --tmpfs /w/node_modules/.vitest-cache:mode=1777 \
    -v "$work/g3in:/in:ro" -w /w "$IMAGE" "$@" || rc=$?
  echo "$rc" >"$work/io/$name.exit"
}
# verdict <gate> <script> <measure name|-> <args...>: main's gate code; result → results/<gate>.json.
verdict() {
  local gate=$1 script=$2 m=()
  [[ $3 == - ]] || m=(--measure "/in/$3.out" --exit "$(cat "$work/io/$3.exit")" --stderr "/in/$3.err" --nonce "$nonce")
  shift 3
  mkdir -p "$work/res/$gate"
  run "$gate-verdict" -v "$work/main:/main:ro" -v "$work/branch:/branch:ro" -v "$work/io:/in:ro" -v "$work/res/$gate:/out" \
    "$IMAGE" node "/main/guardrails/gates/$script" --out /out/result.json "${maint[@]}" "${m[@]}" "$@" || true
  cp "$work/res/$gate/result.json" "$work/results/$gate.json" 2>/dev/null || true
}

# --- gates ---------------------------------------------------------------------------------------
G1() { # main's test count (its unit tests only) is measured once per main SHA and image
  local cache="$DAILY_HOME/cache/g1main-$main_sha-${IMAGE#*:}.json" pid=''
  [[ -s $cache ]] || { measure g1main "$work/main" node guardrails/gates/g1-measure.ts /w --tests-only & pid=$!; }
  measure g1 "$work/m" node guardrails/gates/g1-measure.ts /w
  [[ -z $pid ]] || { wait "$pid"; [[ $(cat "$work/io/g1main.exit") != 0 ]] || mv "$work/io/g1main.out" "$cache"; }
  cp "$cache" "$work/io/g1main.json" 2>/dev/null || true
  verdict G1 g1-verdict.ts g1 --main-measure /in/g1main.json --main /main --branch /branch
}
G2() {
  measure g2 "$work/m" node --permission --allow-fs-read=/w guardrails/gates/g2-measure.ts /w "$BOT_SEEDS"
  verdict G2 g2-verdict.ts g2 --main /main --image "$IMAGE"
}
G3() {
  measure g3 "$work/m" node --permission --allow-fs-read=/w --allow-fs-read=/in guardrails/gates/g3-measure.ts /in/replays /in/tracks
  verdict G3 g3-verdict.ts g3 --main /main --image "$IMAGE"
}
G8() {
  local d=(-C "$repo" -c core.quotePath=false diff --no-renames --no-ext-diff --no-textconv --ignore-submodules=none -z)
  git "${d[@]}" --raw "$base_sha" "$sha" >"$work/io/diff-raw"
  git "${d[@]}" --numstat "$base_sha" "$sha" >"$work/io/diff-numstat"
  git -C "$repo" ls-tree -r -z --name-only "$main_sha" >"$work/io/main-files"
  git -C "$repo" ls-tree -r -z --name-only "$sha" >"$work/io/branch-files"
  verdict G8 g8.ts - --main /main --branch /branch --in /in --today "$today"
}
timed() {
  local s
  s=$(date +%s%3N)
  "$1" || echo "gate script error" >>"$work/results/$1.note"
  echo $(( $(date +%s%3N) - s )) >"$work/results/$1.ms"
}
pids=()
for g in G1 G2 G3 G8; do timed "$g" & pids+=($!); done
wait "${pids[@]}" # not a bare wait: that would also wait for the log tee

rc=0
RUN_TIMEOUT=120 run report -v "$work/main:/main:ro" -v "$work/results:/r:ro" -v "$out:/o" "$IMAGE" \
  node /main/guardrails/gates/report.ts --results /r --out /o --branch-sha "$sha" --main-sha "$main_sha" \
  --started "$started" --duration-ms $(( $(date +%s%3N) - t0 )) "${maint[@]}" || rc=$?
cat "$out/summary.md" >&2 2>/dev/null || true
exit $(( rc == 0 ? 0 : 1 ))
