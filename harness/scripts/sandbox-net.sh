#!/usr/bin/env bash
# Agent sandbox network (HANDOVER §8): an --internal Docker network with no route out (in
# "isolated" gateway mode, so the host has no address on it and host services such as sshd are
# unreachable too), and the allowlist proxy (harness/proxy/server.ts) attached to it and to an
# egress bridge. Agent containers join the internal network and reach the internet only via
# HTTPS_PROXY.
#
#   harness/scripts/sandbox-net.sh up|down|status
#
# `up` is idempotent and recreates the proxy if its code, PROXY_ALLOW or the image changed;
# agent-run.sh calls it before every agent call, daily.sh calls `down` at the end of the night.
# The proxy keeps `--restart on-failure:5` so a crash mid-run recovers, but it never comes back on
# its own after `down` or a reboot: nothing listens between nights.
set -euo pipefail

source "$(dirname "$0")/../lib/common.sh"
internal=daily-racer-sandbox
egress=daily-racer-egress
proxy=daily-racer-proxy

hash="$(cat "$HARNESS_ROOT"/harness/proxy/*.ts <(echo "$PROXY_ALLOW $IMAGE") | sha256sum | cut -c1-16)"
isolated() {
  [[ "$(docker network inspect -f '{{.Internal}} {{index .Options "com.docker.network.bridge.gateway_mode_ipv4"}}' \
    "$internal" 2>/dev/null)" == "true isolated" ]]
}
running_hash() { docker inspect -f '{{if .State.Running}}{{index .Config.Labels "daily-racer.proxy"}}{{end}}' "$proxy" 2>/dev/null || true; }

case "${1:-}" in
  up)
    if ! isolated; then # missing, or created by hand without isolation: (re)create it
      docker rm -f "$proxy" >/dev/null 2>&1 || true
      docker network rm "$internal" >/dev/null 2>&1 || true
      docker network create --internal -o com.docker.network.bridge.gateway_mode_ipv4=isolated "$internal" >/dev/null
    fi
    docker network inspect "$egress" >/dev/null 2>&1 || docker network create "$egress" >/dev/null
    [[ "$(running_hash)" == "$hash" ]] && exit 0
    docker rm -f "$proxy" >/dev/null 2>&1 || true
    # The base flags minus --rm, which conflicts with --restart.
    docker run -d "${DOCKER_BASE[@]:1}" --name "$proxy" --label "daily-racer.proxy=$hash" \
      --network "$egress" --network "$internal" --restart on-failure:5 --read-only --memory 256m --pids-limit 64 \
      -e PROXY_ALLOW="$PROXY_ALLOW" -v "$HARNESS_ROOT/harness/proxy:/proxy:ro" "$IMAGE" node /proxy/server.ts >/dev/null
    # Wait until it listens (first log line), so the first agent call doesn't race it.
    for _ in $(seq 50); do docker logs "$proxy" 2>&1 | grep -q listening && exit 0; sleep 0.1; done
    echo "sandbox-net.sh: proxy did not start" >&2; docker logs "$proxy" >&2; exit 1 ;;
  down)
    docker rm -f "$proxy" >/dev/null 2>&1 || true
    docker network rm "$internal" "$egress" >/dev/null 2>&1 || true ;;
  status)
    ok=0
    for n in "$internal" "$egress"; do
      docker network inspect "$n" >/dev/null 2>&1 && echo "network $n: present" || { echo "network $n: missing"; ok=1; }
    done
    isolated || { echo "network $internal: not internal+isolated"; ok=1; }
    if [[ "$(running_hash)" == "$hash" ]]; then echo "proxy $proxy: running, current"
    else echo "proxy $proxy: not running or stale"; ok=1; fi
    exit "$ok" ;;
  *) echo "usage: sandbox-net.sh up|down|status" >&2; exit 2 ;;
esac
