#!/usr/bin/env bash
# Test stub for harness/scripts/run-gates.sh (daily-e2e.sh only): [--maintenance] --today <date>
# <repo> <sha> <out>. STUB_GATES=fail makes G1 fail; STUB_LOG gets one line per call.
set -euo pipefail
maint=false; [[ $1 == --maintenance ]] && { maint=true; shift; }
[[ $1 == --today && $2 =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "stub run-gates: --today <date> required" >&2; exit 2; }
repo=$3 sha=$4 out=$5
git -C "$repo" cat-file -e "$sha" # the SHA must be a real commit in the clone
echo "run-gates maintenance=$maint today=$2 sha=$sha" >>"${STUB_LOG:-/dev/null}"
pass=true; [[ ${STUB_GATES:-pass} == fail ]] && pass=false
g() { printf '{"id":"%s","name":"%s","pass":%s,"durationMs":10,"summary":"%s","details":"%s"}' "$@"; }
printf '{"branchSha":"%s","mainSha":"x","startedAt":"now","durationMs":40,"pass":%s,"maintenance":%s,"gates":[%s,%s,%s,%s]}\n' \
  "$sha" "$pass" "$maint" "$(g G1 build "$pass" "stub G1" "stub details: AC1 test failed")" "$(g G2 bot true ok '')" \
  "$(g G3 replays true ok '')" "$(g G8 protected true ok '')" >"$out/gates.json"
echo "# stub gates" >"$out/summary.md"
$pass
