#!/usr/bin/env bash
# Test stub for harness/scripts/run-gates.sh (daily-e2e.sh only): [--maintenance] --today <date>
# <repo> <sha> <out>. STUB_GATES=fail makes G1 fail; STUB_LOG gets one line per call. Like the real
# G8, G8 fails when the branch edits or deletes a test file that exists on origin/main. With
# --maintenance it adds P1 and P2 (see below).
set -euo pipefail
maint=false; [[ $1 == --maintenance ]] && { maint=true; shift; }
[[ $1 == --today && $2 =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "stub run-gates: --today <date> required" >&2; exit 2; }
repo=$3 sha=$4 out=$5
git -C "$repo" cat-file -e "$sha" # the SHA must be a real commit in the clone
echo "run-gates maintenance=$maint today=$2 sha=$sha" >>"${STUB_LOG:-/dev/null}"
g1=true; [[ ${STUB_GATES:-pass} == fail ]] && g1=false
pass=$g1
g8=true; [[ -z $(git -C "$repo" diff --name-only --diff-filter=MD origin/main "$sha" -- tests) ]] || { g8=false pass=false; }
g() { printf '{"id":"%s","name":"%s","pass":%s,"durationMs":10,"summary":"%s","details":"%s"}' "$@"; }
# Maintenance: P1 (screens) fails when the branch changes src/ui/hud.css, P2 (geometry) when it
# changes src/render/car.ts.
extra=''
if $maint; then
  changed() { ! git -C "$repo" diff --quiet origin/main "$sha" -- "$1"; }
  p1=true p2=true
  changed src/ui/hud.css && { p1=false pass=false; }
  changed src/render/car.ts && { p2=false pass=false; }
  extra=",$(g P1 screens "$p1" "$($p1 && echo 'stub: 16 stage snapshots identical' || echo 'stub: 2 stage snapshots differ from main')" 'hud--mid-race: padding changed'),$(g P2 geometry "$p2" "$($p2 && echo 'stub: geometry identical' || echo 'stub: 1 scene difference')" 'car: player-marker changed')"
fi
printf '{"branchSha":"%s","mainSha":"x","startedAt":"now","durationMs":40,"pass":%s,"maintenance":%s,"gates":[%s,%s,%s,%s%s]}\n' \
  "$sha" "$pass" "$maint" "$(g G1 build "$g1" "stub G1" "stub details: AC1 test failed")" "$(g G2 bot true ok '')" \
  "$(g G3 replays true ok '')" "$(g G8 protected "$g8" "$($g8 && echo ok || echo 'existing tests are append-only')" '')" "$extra" >"$out/gates.json"
echo "# stub gates" >"$out/summary.md"
$pass
