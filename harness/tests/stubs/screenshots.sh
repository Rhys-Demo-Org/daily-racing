#!/usr/bin/env bash
# Test stub for harness/scripts/screenshots.sh <repo> <outdir> (daily-e2e.sh only): no Docker. Writes
# two PNG-signed files listed in index.json, plus what a builder's code could plant in that folder:
# a listed file that is not a PNG and an unlisted PNG. STUB_SHOTS=fail exits 1; STUB_LOG gets a line.
set -euo pipefail
echo "screenshots $*" >>"${STUB_LOG:-/dev/null}"
[[ ${STUB_SHOTS:-} != fail ]] || exit 1
out=$2
mkdir -p "$out/844x390/stage" "$out/844x390/race"
png() { printf '\x89PNG\r\n\x1a\n%s' "$2" >"$1"; }
png "$out/844x390/stage/start--menu.png" stub-stage
png "$out/844x390/race/dust-bowl-start.png" stub-race
echo 'not a png' >"$out/844x390/stage/pause--paused.png"
png "$out/planted.png" planted
e() { printf '{"name":"%s","kind":"%s","viewport":"844x390","path":"844x390/%s/%s.png"}' "$1" "$2" "$2" "$1"; }
echo "[$(e start--menu stage),$(e dust-bowl-start race),$(e pause--paused stage)]" >"$out/index.json"
