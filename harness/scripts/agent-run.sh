#!/usr/bin/env bash
# Runs one `claude -p --output-format json` call in a fresh sandbox container (HANDOVER §4.1, §8).
#
#   agent-run.sh --phase <ideate|build|retry> --workdir <dir> --prompt-file <file> --model <id>
#     --max-turns <n> --timeout-min <m> --out <dir> --date <YYYY-MM-DD> [--json-schema <file>]
#     [--tools <list>] [--maintenance] [--fake-claude <script>]
#
# Writes <out>/result.json (claude's stdout, verbatim), <out>/stderr.log, <out>/meta.json.
# Exit: 0 ok · 10 usage/rate limit or unrecognised error · 11 max turns · 12 wall-clock timeout ·
# 2 harness/usage error (classification: harness/lib/classify.ts).
#
# Mount scheme: the workdir is mounted at /work READ-ONLY, then only the allowlist (plan deviation
# 2) is bound read-write over it: src/, tests/, journal/runs/<date>/ (and CLAUDE.md with
# --maintenance). src/driver/ and tests/baselines/ are pre-created on the host and bound read-only
# again inside those. So every other path, existing or not (a new vite.config.js, .npmrc,
# .claude/settings.json…), is on a read-only mount and can't be written or created. .git is
# masked, node_modules is the shared cached install (deps in common.sh) mounted read-only, and
# build/test caches (node_modules/.vite*, .vitest-cache, dist/, dev-dist/) are tmpfs, so pnpm
# test/typecheck/build work unchanged.
#
# --date         today's journal folder
# --maintenance  Sunday maintenance: CLAUDE.md is writable too
# --fake-claude  TEST ONLY (self-test-sandbox.sh): mounts <script> as `claude` and passes a random
#                dummy token instead of TOKEN_FILE, so the sandbox can be exercised without a token.
set -euo pipefail

source "$(dirname "$0")/../lib/common.sh"
proxy_url=http://daily-racer-proxy:3128

phase='' workdir='' prompt='' model='' turns='' timeout_min='' out='' schema='' tools='' fake='' maintenance=0 date=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase) phase="$2" ;; --workdir) workdir="$2" ;; --prompt-file) prompt="$2" ;;
    --model) model="$2" ;; --max-turns) turns="$2" ;; --timeout-min) timeout_min="$2" ;;
    --out) out="$2" ;; --json-schema) schema="$2" ;; --tools) tools="$2" ;; --date) date="$2" ;;
    --fake-claude) fake="$2" ;;
    --maintenance) maintenance=1; shift; continue ;;
    *) die "unknown option $1" ;;
  esac
  [[ $# -ge 2 ]] || die "$1 needs a value"
  shift 2
done
[[ "$phase" =~ ^(ideate|build|retry)$ ]] || die "--phase must be ideate, build or retry"
[[ -d "$workdir" && -f "$prompt" && -n "$model" && -n "$out" ]] || die "--workdir, --prompt-file, --model and --out are required"
[[ "$turns" =~ ^[1-9][0-9]*$ ]] || die "--max-turns must be a positive integer"
[[ "$timeout_min" =~ ^[0-9]+(\.[0-9]+)?$ ]] || die "--timeout-min must be a number of minutes"
limit_ms="$(awk "BEGIN { print int($timeout_min * 60000) }")"
(( limit_ms > 0 )) || die "--timeout-min must be positive"
[[ "$date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die "--date must be YYYY-MM-DD"
[[ -z "$schema" || -f "$schema" ]] || die "--json-schema file not found: $schema"
[[ -z "$fake" || -x "$fake" ]] || die "--fake-claude script must be executable: $fake"
need_image

if [[ -n "$fake" ]]; then
  token="fake-token-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
else
  [[ -r "$TOKEN_FILE" ]] || die "no Claude token at TOKEN_FILE=$TOKEN_FILE (create it with \`claude setup-token\`, mode 600)"
  token="$(tr -d '[:space:]' < "$TOKEN_FILE")"
  [[ -n "$token" ]] || die "TOKEN_FILE $TOKEN_FILE is empty"
fi

w="$(realpath "$workdir")"
mkdir -p "$out"
out="$(realpath "$out")"
mounts=(-v "$w:/work:ro")
# Every bind source must be a real directory inside the workdir: no symlinked path component
# could redirect a read-write mount to somewhere else on the host.
real_dir() { # <relative path> [file]: checks for symlinks, creates the directory if missing
  local p="$w/$1"
  [[ "$(realpath -m "$p")" == "$p" ]] || die "refusing to mount $1: path goes through a symlink"
  [[ "${2:-}" == file ]] || mkdir -p "$p"
}
bind() { real_dir "$2" "${3:-}"; mounts+=(-v "$w/$2:/work/$2:$1"); } # <mode> <relative path> [file]
bind rw src; bind ro src/driver
bind rw tests; bind ro tests/baselines
bind rw "journal/runs/$date"
(( maintenance )) && bind rw CLAUDE.md file
if [[ -d "$w/.git" ]]; then mounts+=(--tmpfs /work/.git:ro); elif [[ -e "$w/.git" ]]; then mounts+=(-v /dev/null:/work/.git:ro); fi
real_dir dist; real_dir dev-dist; real_dir node_modules
nm="$(deps "$w")"
mounts+=(-v "$nm:/work/node_modules:ro")
for c in dist dev-dist node_modules/.vite node_modules/.vite-temp node_modules/.vitest-cache; do
  mounts+=(--tmpfs "/work/$c:uid=$(id -u),gid=$(id -g)")
done

tmp="$(mktemp -d)"
name="daily-racer-agent-$phase-$$-$RANDOM"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
trap 'exit 2' INT TERM
echo "daily-racer agent sandbox $name" > "$tmp/marker"
mounts+=(-v "$tmp/marker:/run/daily-racer-sandbox:ro" -v "$(realpath "$prompt"):/run/prompt.md:ro")
[[ -n "$fake" ]] && mounts+=(-v "$(realpath "$fake"):/opt/fake-claude/claude:ro"
  -e PATH=/opt/fake-claude:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin)

args=(-p --output-format json --model "$model" --max-turns "$turns"
  --permission-mode bypassPermissions --disallowedTools WebFetch,WebSearch --no-session-persistence)
[[ -n "$schema" ]] && args+=(--json-schema "$(cat "$schema")")
[[ -n "$tools" ]] && args+=(--tools "$tools")
[[ -n "$MAX_BUDGET_USD" ]] && args+=(--max-budget-usd "$MAX_BUDGET_USD")

# In-container wrapper: refuses to start claude (with bypassPermissions) unless it's in this
# sandbox: Docker container, our read-only marker, and /work itself not writable.
entry='[ -f /.dockerenv ] && [ -f /run/daily-racer-sandbox ] && [ ! -w /work ] ||
  { echo "agent-run: not inside the agent sandbox, refusing" >&2; exit 2; }
exec claude "$@" < /run/prompt.md'

"$HARNESS_ROOT/harness/scripts/sandbox-net.sh" up || die "sandbox network/proxy failed to start"

start=$(date +%s%N)
# Backgrounded + wait so a TERM to this script runs the cleanup trap (kills the container) at once.
# The token reaches docker through its environment (-e NAME without a value): never argv or disk.
CLAUDE_CODE_OAUTH_TOKEN="$token" timeout -k 15 "${timeout_min}m" docker run "${DOCKER_BASE[@]}" --init --name "$name" \
  --network daily-racer-sandbox --read-only --memory 8g --pids-limit 4096 \
  --tmpfs "/home/agent:uid=$(id -u),gid=$(id -g),mode=0700" -e HOME=/home/agent -e CLAUDE_CODE_OAUTH_TOKEN \
  -e HTTPS_PROXY="$proxy_url" -e HTTP_PROXY="$proxy_url" -e https_proxy="$proxy_url" -e http_proxy="$proxy_url" \
  -e NO_PROXY= -e no_proxy= -e CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 -e DISABLE_AUTOUPDATER=1 \
  -e pnpm_config_verify_deps_before_run=false \
  "${mounts[@]}" -w /work "$IMAGE" bash -c "$entry" bash "${args[@]}" \
  > "$out/result.json" 2> "$out/stderr.log" &
wait $! && rc=0 || rc=$?
unset token
wall_ms=$(( ($(date +%s%N) - start) / 1000000 ))
timed_out=()
if (( rc == 124 || (rc == 137 && wall_ms >= limit_ms) )); then
  timed_out=(--timed-out)
  echo "agent-run.sh: wall-clock timeout after ${timeout_min} min" >> "$out/stderr.log"
fi
docker rm -f "$name" >/dev/null 2>&1 || true

code=0
docker run "${DOCKER_BASE[@]}" --network none --read-only -v "$HARNESS_ROOT:/repo:ro" -v "$out:/out" "$IMAGE" \
  node /repo/harness/lib/classify.ts /out "$rc" "$phase" "$model" "$wall_ms" "${timed_out[@]}" >/dev/null || code=$?
[[ "$code" =~ ^(0|10|11|12)$ ]] || die "classifier failed (exit $code)"
exit "$code"
