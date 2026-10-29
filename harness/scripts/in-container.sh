#!/usr/bin/env bash
# Runs a command in the pinned toolchain container with the repo at /repo.
#
#   harness/scripts/in-container.sh [--net] [--ro] [--cpuset <cpus>] -- <command> [args...]
#
#   --net   allow network (only for `pnpm install`); default is --network none
#   --ro    mount the repo read-only
#   --cpuset <cpus>   pin the container to these CPUs (perf measurement), e.g. 4-7
#
# Runs as the host user with a throwaway HOME, so nothing persists between calls except the
# shared pnpm store volume (content-addressed, so a poisoned entry fails integrity checks).
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
dockerfile="$root/harness/container/Dockerfile"
image="daily-racer-toolchain:$(sha256sum "$dockerfile" | cut -c1-12)"

network=none
mount_mode=rw
cpu_flags=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --net) network=bridge; shift ;;
    --ro) mount_mode=ro; shift ;;
    --cpuset) cpu_flags=(--cpuset-cpus "$2"); shift 2 ;;
    --) shift; break ;;
    *) echo "in-container.sh: unknown option $1" >&2; exit 2 ;;
  esac
done
[[ $# -gt 0 ]] || { echo "usage: in-container.sh [--net] [--ro] [--cpuset <cpus>] -- <command> [args...]" >&2; exit 2; }

if ! docker image inspect "$image" >/dev/null 2>&1; then
  echo "in-container.sh: image $image missing; run harness/container/build.sh" >&2
  exit 2
fi

tty_flags=()
[[ -t 0 && -t 1 ]] && tty_flags=(-it)

exec docker run --rm "${tty_flags[@]}" "${cpu_flags[@]}" \
  --network "$network" \
  --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:exec \
  -e HOME=/tmp/home \
  -v "$root:/repo:$mount_mode" \
  -v daily-racer-pnpm-store:/pnpm-store \
  -w /repo \
  "$image" "$@"
