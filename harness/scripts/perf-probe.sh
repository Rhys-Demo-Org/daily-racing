#!/usr/bin/env bash
# Numbers for the Sunday performance survey (plans/full-pipeline.md "The 7th day"), measured
# headlessly from <repo>'s working tree in one offline, read-only toolchain container:
#   scene  per track and car: objects, meshes, lines, triangles and draw calls of the scene graph,
#          and its heaviest objects (harness/screens/scene.ts stats, Node, no WebGL)
#   page   per track, in the running game (SwiftShader): draw calls and triangles per rendered frame,
#          DOM mutations per tick and where they land, sampled JS allocations per frame by function;
#          DOM elements per screen stage (harness/screens/probe.ts perf)
#
#   harness/scripts/perf-probe.sh <repo> <out.json>
#
# Writes {"scene": …, "page": …} to <out.json>. Counts only: the VM says nothing about a phone's
# frame time. Exit non-zero (and no file) when a measurement fails.
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"

[[ $# -eq 2 ]] || die "usage: perf-probe.sh <repo> <out.json>"
repo="$(cd "$1" && pwd)"
need_image
work="$(scratch "$DAILY_HOME/work" perf)"
trap 'chmod -R u+w "$work" 2>/dev/null || true; rm -rf "$work"' EXIT

harness_tree "$repo" "$work/tree"
nm="$(deps "$work/tree")"
mkdir -p "$work/out"
timeout -k 10 600 docker run "${DOCKER_BASE[@]}" --network none --read-only --pids-limit 4096 --memory 8g --shm-size 1g \
  -e TZ=UTC -v "$work/tree:/w:ro" -v "$nm:/w/node_modules:ro" \
  --tmpfs /w/node_modules/.vite:mode=1777 --tmpfs /w/node_modules/.vite-temp:mode=1777 \
  -v "$work/out:/out" -w /w "$IMAGE" sh -c '
    node harness/screens/scene.ts /w stats >/out/scene.out &&
    node_modules/.bin/vite build --config harness/screens/vite.config.ts --outDir /tmp/dist --emptyOutDir --logLevel warn --minify false >&2 &&
    node harness/screens/probe.ts perf /tmp/dist >/out/page.out'
jq -n --slurpfile s <(tail -1 "$work/out/scene.out") --slurpfile p <(tail -1 "$work/out/page.out") \
  '{scene: ($s[0] | del(.nonce)), page: ($p[0] | del(.nonce))}' >"$work/perf.json"
mv "$work/perf.json" "$2"
