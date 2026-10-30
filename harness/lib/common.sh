# The one bash prelude every harness script sources: config, toolchain image, hardened container
# flags, the cached dependency install and ts_node.
# shellcheck shell=bash

HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../config.env
source "$HARNESS_ROOT/harness/config.env"

# image_tag [dockerfile]: the toolchain tag is the Dockerfile's hash, so an edit means a new image.
image_tag() { echo "daily-racer-toolchain:$(sha256sum "${1:-$HARNESS_ROOT/harness/container/Dockerfile}" | cut -c1-12)"; }
IMAGE="$(image_tag)"
die() { echo "$(basename "$0"): $*" >&2; exit 2; }
need_image() { docker image inspect "$IMAGE" >/dev/null 2>&1 || die "image $IMAGE missing; run harness/container/build.sh"; }
scratch() { mkdir -p "$1" && mktemp -d "$1/${2:-tmp}.XXXXXX"; } # scratch <parent> [prefix]

# Base of every toolchain container: host uid, no capabilities, throwaway /tmp and HOME. Callers
# add the network, mounts and limits.
DOCKER_BASE=(--rm --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges
  --tmpfs /tmp:exec,size=2g -e HOME=/tmp/home)

# Live mode (plans/live-prs.md): owner/name of <clone>'s GitHub origin, and gh with the PAT in
# GH_TOKEN for that one command (never argv). DAILY_GH is a test hook (daily-e2e.sh's stub gh).
repo_slug() { git -C "$1" remote get-url origin | sed -E 's#^(https://github\.com/|git@github\.com:)##; s#(\.git)?/?$##'; }
gh_() { GH_TOKEN="$(tr -d '[:space:]' <"$GITHUB_TOKEN_FILE")" "${DAILY_GH:-gh}" "$@"; }

# deps <tree>: prints a node_modules installed (frozen lockfile, no scripts) for <tree>'s
# package.json + pnpm-lock.yaml + .npmrc, cached under $DAILY_HOME/cache per those and $IMAGE.
deps() {
  local nm
  nm="$DAILY_HOME/cache/install-$( (cat "$1/package.json" "$1/pnpm-lock.yaml" "$1/.npmrc"; echo "$IMAGE") | sha256sum | cut -c1-16)"
  mkdir -p "$DAILY_HOME/cache"
  ( flock 9 # errexit is off in here (the subshell is tested), hence the && chain
    [[ -f $nm/.ok ]] && exit
    rm -rf "$nm" && mkdir -p "$nm" && cp "$1/package.json" "$1/pnpm-lock.yaml" "$1/.npmrc" "$nm/" &&
      docker run "${DOCKER_BASE[@]}" --network bridge -v "$nm:/i" -v daily-racer-pnpm-store:/pnpm-store -w /i "$IMAGE" \
        pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm-store >&2 &&
      mkdir -p "$nm/node_modules/.vite" "$nm/node_modules/.vite-temp" "$nm/node_modules/.vitest-cache" &&
      touch "$nm/.ok" ) 9>"$nm.lock" || die "dependency install failed"
  touch "$nm" # last use, for the prune in daily.sh
  echo "$nm/node_modules"
}

# Runs harness/lib/cli.ts in the toolchain container (never on the host's Node), stdin attached,
# config.env as its environment. The harness and DAILY_HOME are mounted at their host paths, so
# host paths work as arguments; no network.
ts_node() {
  docker run "${DOCKER_BASE[@]}" -i --network none --read-only --env-file "$HARNESS_ROOT/harness/config.env" \
    -v "$HARNESS_ROOT:$HARNESS_ROOT:ro" -v "$DAILY_HOME:$DAILY_HOME" -w "$HARNESS_ROOT" \
    "$IMAGE" node harness/lib/cli.ts "$@"
}
