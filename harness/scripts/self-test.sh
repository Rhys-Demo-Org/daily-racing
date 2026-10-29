#!/usr/bin/env bash
# Cheat suite (HANDOVER §10): proves the gates catch every known-bad patch. Uses this checkout's
# committed HEAD as "main". First a clean control run (no patch) must pass; then each
# guardrails/cheats/<id>.patch is committed on top of HEAD as a scratch commit (temporary index, no
# branch or worktree touched) and run-gates.sh must fail with the patch's `Expect:` gate failing
# and no gate failing outside `Expect:` + `Also:`. No output dir may contain a forged marker.
# Finally runs harness/scripts/self-test-sandbox.sh when present.
#
#   harness/scripts/self-test.sh [--jobs <n>] [<cheat-id>...]
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
jobs=4
[[ ${1:-} == --jobs ]] && { jobs=$2; shift 2; }
[[ -z "$(git -C "$root" status --porcelain)" ]] || { echo "self-test.sh: commit first; the gates test committed HEAD" >&2; exit 2; }
base="$(git -C "$root" rev-parse HEAD)"
out="$(mktemp -d "${TMPDIR:-/tmp}/self-test.XXXXXX")"
cheats=("$@")
if [[ ${#cheats[@]} -eq 0 ]]; then
  for p in "$root"/guardrails/cheats/*.patch; do cheats+=("$(basename "$p" .patch)"); done
fi

# commit_patch <id>: prints a scratch commit of HEAD + the patch.
commit_patch() {
  local index="$out/$1.index"
  GIT_INDEX_FILE="$index" git -C "$root" read-tree "$base"
  GIT_INDEX_FILE="$index" git -C "$root" apply --cached "$root/guardrails/cheats/$1.patch"
  local tree
  tree="$(GIT_INDEX_FILE="$index" git -C "$root" write-tree)"
  git -C "$root" -c user.name=self-test -c user.email=self-test@localhost commit-tree "$tree" -p "$base" -m "cheat $1"
}
# check <id>: runs the gates on one cheat and prints a table row; returns 1 when not caught.
check() {
  local id=$1 sha expect also failing verdict=ok
  sha="$(commit_patch "$id")"
  "$root/harness/scripts/run-gates.sh" --main-ref "$base" "$root" "$sha" "$out/$id" >/dev/null 2>&1 || true
  expect="$(sed -n 's/^Expect: //p;q' "$root/guardrails/cheats/$id.patch")"
  also="$(sed -n '2s/^Also: //p' "$root/guardrails/cheats/$id.patch")"
  failing="$(jq -r '[.gates[] | select(.pass | not) | .id] | join(",")' "$out/$id/gates.json" 2>/dev/null || echo "no gates.json")"
  [[ "$(jq -r .pass "$out/$id/gates.json" 2>/dev/null)" == false ]] || verdict="NOT CAUGHT"
  [[ ",$failing," == *",$expect,"* ]] || verdict="NOT CAUGHT by $expect"
  local g
  for g in ${failing//,/ }; do [[ ",$expect,$also," == *",$g,"* ]] || verdict="unexpected $g"; done
  printf '| %s | %s | %s | %s | %s |\n' "$id" "$expect" "${also:--}" "${failing:-none}" "$verdict"
  [[ $verdict == ok ]]
}

echo "| cheat | expect | also allowed | failed | verdict |"
echo "|---|---|---|---|---|"
fails=0
if "$root/harness/scripts/run-gates.sh" --main-ref "$base" "$root" "$base" "$out/control" >/dev/null 2>&1; then
  echo "| (clean control) | pass | - | none | ok |"
else
  echo "| (clean control) | pass | - | $(jq -r '[.gates[] | select(.pass | not) | .id] | join(",")' "$out/control/gates.json" 2>/dev/null) | FAILED |"
  echo "self-test.sh: the clean control must pass; see $out/control/summary.md" >&2
  exit 1
fi

running=0
for id in "${cheats[@]}"; do
  check "$id" >"$out/$id.row" || echo 1 >"$out/$id.bad" &
  (( ++running >= jobs )) && { wait -n || true; running=$(( running - 1 )); }
done
wait
for id in "${cheats[@]}"; do cat "$out/$id.row"; [[ -f "$out/$id.bad" ]] && fails=$(( fails + 1 )); done

if [[ -n "$(find "$out" -name FORGED)" ]] || grep -lqs '"summary": "FORGED"' "$out"/*/gates.json; then echo "self-test.sh: a forged marker reached an output dir" >&2; fails=$(( fails + 1 )); fi
if [[ -x "$root/harness/scripts/self-test-sandbox.sh" ]]; then
  "$root/harness/scripts/self-test-sandbox.sh" || { echo "self-test.sh: sandbox checks failed" >&2; fails=$(( fails + 1 )); }
fi
echo "results: $out"
(( fails == 0 )) || { echo "self-test.sh: $fails failure(s)" >&2; exit 1; }
echo "self-test: every cheat caught"
