# Shared by the harness bash scripts (source it): config, toolchain image tag, ts_node.
# shellcheck shell=bash

HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../config.env
source "$HARNESS_ROOT/harness/config.env"
# Same tag rule as harness/container/build.sh and in-container.sh.
IMAGE="daily-racer-toolchain:$(sha256sum "$HARNESS_ROOT/harness/container/Dockerfile" | cut -c1-12)"

# Runs harness/lib/cli.ts in the toolchain container (never on the host's Node). The harness and
# DAILY_HOME are mounted at their host paths, so host paths work as arguments; no network.
ts_node() {
  docker run --rm --network none --read-only --tmpfs /tmp --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$HARNESS_ROOT:$HARNESS_ROOT:ro" -v "$DAILY_HOME:$DAILY_HOME" -w "$HARNESS_ROOT" \
    "$IMAGE" node harness/lib/cli.ts "$@"
}
