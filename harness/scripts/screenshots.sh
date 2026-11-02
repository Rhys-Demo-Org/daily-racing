#!/usr/bin/env bash
# Screenshots every screen stage (src/ui/stages/*.stage.ts) and a few race frames per track (seed 1,
# real time frozen, stepped through window.__racer) at 844x390 and 1440x900.
#
#   harness/scripts/screenshots.sh <repo> <outdir>
#
# Writes <outdir>/<viewport>/{stage,race}/<name>.png and <outdir>/index.json:
#   [{ "name": "...", "kind": "stage"|"race", "viewport": "844x390", "path": "relative.png" }]
# <repo>'s working tree (tracked and untracked, not ignored) is built with the harness's own
# harness/screens (vite.config.ts adds the stages page; `pnpm build` never includes it), then served
# and captured in one offline, read-only toolchain container. Two runs give identical PNGs.
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"

[[ $# -eq 2 ]] || die "usage: screenshots.sh <repo> <outdir>"
repo="$(cd "$1" && pwd)"
mkdir -p "$2"
out="$(cd "$2" && pwd)"
need_image
work="$(scratch "$DAILY_HOME/work" shots)"
trap 'chmod -R u+w "$work" 2>/dev/null || true; rm -rf "$work"' EXIT

# The tree: <repo>'s working files (no .git, node_modules or build output), then the harness's
# capture code over its harness/screens.
mkdir -p "$work/tree"
if git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$repo" ls-files -z -co --exclude-standard |
    tar -C "$repo" --null --ignore-failed-read -T - -cf - 2>/dev/null | tar -C "$work/tree" -xf -
else
  tar -C "$repo" --exclude=./.git --exclude=./node_modules --exclude=./dist -cf - . | tar -C "$work/tree" -xf -
fi
rm -rf "$work/tree/harness/screens"
mkdir -p "$work/tree/harness" "$work/tree/node_modules"
cp -a "$HARNESS_ROOT/harness/screens" "$work/tree/harness/screens"
chmod -R a-w "$work/tree"
nm="$(deps "$work/tree")"

timeout -k 10 600 docker run "${DOCKER_BASE[@]}" --network none --read-only --pids-limit 4096 --memory 8g --shm-size 1g \
  -e TZ=UTC -v "$work/tree:/w:ro" -v "$nm:/w/node_modules:ro" \
  --tmpfs /w/node_modules/.vite:mode=1777 --tmpfs /w/node_modules/.vite-temp:mode=1777 \
  -v "$out:/out" -w /w "$IMAGE" sh -c '
    node_modules/.bin/vite build --config harness/screens/vite.config.ts --outDir /tmp/dist --emptyOutDir --logLevel warn >&2 &&
    node harness/screens/capture.ts /tmp/dist /out'
