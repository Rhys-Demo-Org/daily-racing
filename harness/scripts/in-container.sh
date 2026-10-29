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
# stdin is always attached (-i); a TTY only when there is one.
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"

network=none mount_mode=rw cpu_flags=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --net) network=bridge; shift ;;
    --ro) mount_mode=ro; shift ;;
    --cpuset) cpu_flags=(--cpuset-cpus "$2"); shift 2 ;;
    --) shift; break ;;
    *) die "unknown option $1" ;;
  esac
done
[[ $# -gt 0 ]] || die "usage: in-container.sh [--net] [--ro] [--cpuset <cpus>] -- <command> [args...]"
need_image
tty_flags=()
[[ -t 0 && -t 1 ]] && tty_flags=(-t)
exec docker run "${DOCKER_BASE[@]}" -i "${tty_flags[@]}" "${cpu_flags[@]}" --network "$network" \
  -v "$HARNESS_ROOT:/repo:$mount_mode" -v daily-racer-pnpm-store:/pnpm-store -w /repo "$IMAGE" "$@"
