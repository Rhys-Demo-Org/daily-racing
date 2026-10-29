#!/usr/bin/env bash
# Runs the thin gate suite (G1, G2, G3, G8) on a committed branch SHA and writes
# <out-dir>/gates.json, <out-dir>/summary.md and <out-dir>/logs/. Trust model: plans/phase0-plan.md.
#
#   harness/scripts/run-gates.sh [--maintenance] [--main-ref <ref>] [--today <YYYY-MM-DD>] \
#       <repo-dir> <branch-sha> <out-dir>
#
# "main" is origin/main when <repo-dir> has it, else main (--main-ref overrides, for the self-test).
# Both trees are clean `git archive` extractions (no .git); main's is read-only. Gate code,
# configs, budgets, manifest and baselines come only from main's tree. Every step is a fresh
# `--network none --read-only` container of the pinned image, as the host uid, tmpfs /tmp + HOME:
#   measure  main's tree with the branch's src/ and tests/ (src/driver from main, no
#            tests/baselines), node_modules read-only, no output mount: results leave over stdout.
#   verdict  main's gate code over the measure output and both trees as data; writes only /out.
# Exit 0 only when every gate passes; missing/malformed output, crash, timeout or zero tests fail.
set -euo pipefail

usage() { echo "usage: run-gates.sh [--maintenance] [--main-ref <ref>] [--today <YYYY-MM-DD>] <repo-dir> <branch-sha> <out-dir>" >&2; exit 2; }
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
[[ $# -eq 3 ]] || usage

here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
[[ -f "$here/../config.env" ]] && source "$here/../config.env"
: "${GATE_CAP_MIN:=20}" "${BOT_SEEDS:=1,2,3,42,1234}" "${TZ_NAME:=Europe/London}" "${DAILY_HOME:=$HOME/.daily-racer}"

repo="$(cd "$1" && pwd)"
sha="$(git -C "$repo" rev-parse --verify --quiet "$2^{commit}")" || { echo "run-gates.sh: no commit $2" >&2; exit 2; }
if [[ -z $main_ref ]]; then
  main_ref=main
  git -C "$repo" rev-parse --verify --quiet origin/main >/dev/null && main_ref=origin/main
fi
main_sha="$(git -C "$repo" rev-parse --verify "$main_ref^{commit}")"
base_sha="$(git -C "$repo" merge-base "$main_sha" "$sha")"
today="${today:-$(TZ="$TZ_NAME" date +%F)}"
mkdir -p "$3/logs"
out="$(cd "$3" && pwd)"
rm -f "$out/gates.json" "$out/summary.md"
started="$(date -u +%FT%TZ)"
t0=$(date +%s%3N)
deadline=$(( $(date +%s) + GATE_CAP_MIN * 60 ))
maint=()
(( maintenance )) && maint=(--maintenance)
run_id="$$-$RANDOM"
mkdir -p "$DAILY_HOME/work" "$DAILY_HOME/cache"
work="$(mktemp -d "$DAILY_HOME/work/gates.XXXXXX")"
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
  for f in "$work"/io/*.err "$work/install.log"; do [[ -f $f ]] && tail -c 200000 "$f" >"$out/logs/$(basename "$f" .err).log"; done
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
# measure_tree <branch-tree> <dest>: main's tree with that tree's src/ and tests/.
measure_tree() {
  cp -a "$work/main/." "$2"
  chmod -R u+w "$2"
  rm -rf "$2/src" "$2/tests"
  local d
  for d in src tests; do [[ -d "$1/$d" ]] && cp -a "$1/$d" "$2/$d"; done
  chmod -R u+w "$2"
  rm -rf "$2/src/driver" "$2/tests/baselines"
  mkdir -p "$2/src" "$2/node_modules"
  cp -a "$work/main/src/driver" "$2/src/driver"
  chmod -R a-w "$2"
}
measure_tree "$work/branch" "$work/m"
mkdir -p "$work/g3in/replays" "$work/g3in/tracks"
cp "$work/main/tests/baselines/replays/"*.json "$work/g3in/replays/" 2>/dev/null || true
cp "$work/main/src/content/tracks/"*.json "$work/g3in/tracks/"
chmod -R a-w "$work/main" "$work/branch" "$work/g3in"

image="daily-racer-toolchain:$(sha256sum "$work/main/harness/container/Dockerfile" | cut -c1-12)"
docker image inspect "$image" >/dev/null 2>&1 || { echo "run-gates.sh: image $image missing; run harness/container/build.sh" >&2; exit 2; }

# --- install, cached per lockfile + image ---------------------------------------------------------
key="$( (cat "$work/main/package.json" "$work/main/pnpm-lock.yaml" "$work/main/.npmrc"; echo "$image") | sha256sum | cut -c1-16)"
nm="$DAILY_HOME/cache/install-$key"
(
  flock 9
  if [[ ! -f "$nm/.ok" ]]; then
    rm -rf "$nm"
    mkdir -p "$nm"
    cp "$work/main/package.json" "$work/main/pnpm-lock.yaml" "$work/main/.npmrc" "$nm/"
    docker run --rm --network bridge --user "$(id -u):$(id -g)" --tmpfs /tmp:exec -e HOME=/tmp/home \
      -v "$nm:/i" -v daily-racer-pnpm-store:/pnpm-store -w /i "$image" \
      pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm-store >"$work/install.log" 2>&1
    mkdir -p "$nm/node_modules/.vite" "$nm/node_modules/.vite-temp" "$nm/node_modules/.vitest-cache"
    touch "$nm/.ok"
  fi
) 9>"$DAILY_HOME/cache/install-$key.lock"

# --- containers ----------------------------------------------------------------------------------
# run <name> <stdout> <stderr> <docker args...>: one fresh locked-down container, killed at the cap
# (or after $RUN_TIMEOUT s). Returns its exit code; 124 = timed out, noted against its gate.
run() {
  local name=$1 so=$2 se=$3 rc=0 left=${RUN_TIMEOUT:-$(( deadline - $(date +%s) ))} gate=${1:0:2}
  shift 3
  if (( left <= 0 )); then
    echo "timed out at the ${GATE_CAP_MIN}-minute gate cap ($name not started)" >>"$work/results/${gate^^}.note"
    return 124
  fi
  ( ulimit -f $(( 512 * 1024 ))
    exec timeout -k 10 "$left" docker run --rm --name "dr-$run_id-$name" --label "daily-racer-gates=$run_id" \
      --network none --read-only --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges \
      --pids-limit 4096 --memory 8g --tmpfs /tmp:exec,size=2g -e HOME=/tmp/home -e TZ=UTC "$@" ) >"$so" 2>"$se" || rc=$?
  docker rm -f "dr-$run_id-$name" >/dev/null 2>&1 || true
  (( rc != 124 )) || echo "timed out at the ${GATE_CAP_MIN}-minute gate cap ($name)" >>"$work/results/${gate^^}.note"
  return $rc
}
# measure <name> <tree> <cmd...>: branch code; stdout → io/<name>.out, exit → io/<name>.exit.
measure() {
  local name=$1 tree=$2 rc=0
  shift 2
  run "$name" "$work/io/$name.out" "$work/io/$name.err" \
    -v "$tree:/w:ro" -v "$nm/node_modules:/w/node_modules:ro" \
    --tmpfs /w/node_modules/.vite:mode=1777 --tmpfs /w/node_modules/.vite-temp:mode=1777 --tmpfs /w/node_modules/.vitest-cache:mode=1777 \
    -v "$work/g3in:/in:ro" -w /w "$image" "$@" || rc=$?
  echo "$rc" >"$work/io/$name.exit"
}
# verdict <gate> <script> <args...>: main's gate code; result → results/<gate>.json.
verdict() {
  local gate=$1 script=$2
  shift 2
  mkdir -p "$work/res/$gate"
  run "$gate-verdict" "$work/io/$gate-verdict.out" "$work/io/$gate-verdict.err" \
    -v "$work/main:/main:ro" -v "$work/branch:/branch:ro" -v "$work/io:/in:ro" -v "$work/res/$gate:/out" \
    "$image" node "/main/guardrails/gates/$script" --out /out/result.json "${maint[@]}" "$@" || true
  cp "$work/res/$gate/result.json" "$work/results/$gate.json" 2>/dev/null || true
}
measured() { echo --measure "/in/$1.out" --exit "$(cat "$work/io/$1.exit")" --stderr "/in/$1.err"; }

# --- gates ---------------------------------------------------------------------------------------
G1() {
  local cache="$DAILY_HOME/cache/main-g1-$main_sha-$key.json"
  measure g1 "$work/m" node guardrails/gates/g1-measure.ts /w &
  local pid=$!
  if [[ ! -s "$cache" ]]; then # main's own test count, measured once per main SHA
    measure_tree "$work/main" "$work/m-main"
    measure g1main "$work/m-main" node guardrails/gates/g1-measure.ts /w
    [[ $(cat "$work/io/g1main.exit") == 0 ]] && mv "$work/io/g1main.out" "$cache"
  fi
  wait "$pid"
  cp "$cache" "$work/io/g1main.json" 2>/dev/null || true
  # shellcheck disable=SC2046
  verdict G1 g1-verdict.ts $(measured g1) --main-measure /in/g1main.json --main /main --branch /branch
}
G2() {
  measure g2 "$work/m" node --permission --allow-fs-read=/w guardrails/gates/g2-measure.ts /w "$BOT_SEEDS"
  # shellcheck disable=SC2046
  verdict G2 g2-verdict.ts $(measured g2) --main /main --image "$image"
}
G3() {
  measure g3 "$work/m" node --permission --allow-fs-read=/w --allow-fs-read=/in guardrails/gates/g3-measure.ts /in/replays /in/tracks
  # shellcheck disable=SC2046
  verdict G3 g3-verdict.ts $(measured g3) --main /main --image "$image"
}
G8() {
  local d=(-C "$repo" -c core.quotePath=false diff --no-renames --no-ext-diff --no-textconv --ignore-submodules=none -z)
  git "${d[@]}" --raw "$base_sha" "$sha" >"$work/io/diff-raw"
  git "${d[@]}" --numstat "$base_sha" "$sha" >"$work/io/diff-numstat"
  git -C "$repo" ls-tree -r -z --name-only "$main_sha" >"$work/io/main-files"
  git -C "$repo" ls-tree -r -z --name-only "$sha" >"$work/io/branch-files"
  verdict G8 g8.ts --main /main --branch /branch --in /in --today "$today"
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
RUN_TIMEOUT=120 run report "$work/io/report.out" "$work/io/report.err" \
  -v "$work/main:/main:ro" -v "$work/results:/r:ro" -v "$out:/o" "$image" \
  node /main/guardrails/gates/report.ts --results /r --out /o --branch-sha "$sha" --main-sha "$main_sha" \
  --started "$started" --duration-ms $(( $(date +%s%3N) - t0 )) "${maint[@]}" || rc=$?
cat "$out/summary.md" >&2 2>/dev/null || true
exit $(( rc == 0 ? 0 : 1 ))
