#!/usr/bin/env bash
# Sandbox self-test (called by self-test.sh): proves the agent container can't escape.
#
#   harness/scripts/self-test-sandbox.sh
#
# On the host it copies the repo (with node_modules, without .git) to a scratch workdir and runs
# agent-run.sh on it with `--fake-claude` pointing at THIS script, so the checks below run inside
# a real agent container (same mounts, network, env as a nightly call). Inside, it checks the
# network (proxy allowlist, IP literals, metadata, private IPs, plain http, direct egress, DNS,
# host services), every protected path, HOME, .git, the token, and that pnpm typecheck/test/build
# work; it prints a table and exits non-zero on any failure. Then the host checks the
# wall-clock timeout and the missing-token refusal.
set -euo pipefail

# ---- inside the agent container (we are `claude`) ----
if [[ -f /run/daily-racer-sandbox ]]; then
  read -r cmd date hostips < /run/prompt.md
  [[ "$cmd" == sleep ]] && exec sleep 600
  fails=0
  check() { # <want ok|fail> <name> <command...>: runs the command, compares with the expectation
    local want="$1" name="$2" got=fail; shift 2
    "$@" >/dev/null 2>&1 && got=ok
    if [[ "$got" == "$want" ]]; then printf 'PASS  %-58s %s\n' "$name" "$got" >&2
    else printf 'FAIL  %-58s %s (want %s)\n' "$name" "$got" "$want" >&2; fails=$((fails + 1)); fi
  }
  write() { mkdir -p "$(dirname "/work/$1")" && : >> "/work/$1"; }
  probe() { timeout 3 bash -c "echo > /dev/tcp/$1/$2"; }
  argv=" $* "
  check ok   'claude gets --permission-mode bypassPermissions' test "${argv#* --permission-mode bypassPermissions }" != "$argv"
  check ok   'claude gets --disallowedTools WebFetch,WebSearch' test "${argv#* --disallowedTools WebFetch,WebSearch }" != "$argv"
  check ok   'HOME is empty' test -z "$(ls -A "$HOME")"
  check fail '.git is not usable' git -C /work rev-parse --git-dir
  check fail '.git is not readable as a gitdir pointer' grep -q gitdir /work/.git
  check ok   'token env var is set' test -n "${CLAUDE_CODE_OAUTH_TOKEN:-}"
  check fail 'DNS for external names (getent example.com)' getent hosts example.com
  check fail 'direct https://api.anthropic.com (no proxy)' curl -fsS -m 5 --noproxy '*' -o /dev/null https://api.anthropic.com
  check ok   'via proxy https://api.anthropic.com connects' curl -sS -m 15 -o /dev/null https://api.anthropic.com
  for url in https://example.com https://api.anthropic.com:8443 http://api.anthropic.com https://1.1.1.1 \
      https://169.254.169.254 https://metadata.google.internal https://10.0.0.1 https://192.168.1.1 \
      'https://[::1]' https://2130706433 https://0x7f.1; do
    check fail "via proxy $url" curl -fsS -m 10 -g -o /dev/null "$url"
  done
  for ip in $hostips 172.17.0.1; do check fail "host service $ip:22" probe "$ip" 22; done
  for p in package.json pnpm-lock.yaml .npmrc .nvmrc tsconfig.json tsconfig.node.json vite.config.ts \
      vitest.config.ts index.html CLAUDE.md README.md harness/scripts/agent-run.sh guardrails/BACKLOG.md \
      public/fonts/fonts.css node_modules/vite/package.json; do
    check fail "write existing $p" write "$p"
  done
  for p in vite.config.js .claude/settings.json .mcp.json .gitattributes pnpm-workspace.yaml .pnpmfile.cjs \
      playwright.config.ts eslint.config.js harness/new.sh guardrails/new.json public/new.txt \
      src/driver/new.ts tests/baselines/new.png journal/new.md journal/runs/2000-01-01/x node_modules/new; do
    check fail "create new $p" write "$p"
  done
  check fail 'mkdir .claude' mkdir /work/.claude
  check fail 'delete package.json' rm -f /work/package.json
  check fail 'move index.html into src/' mv /work/index.html /work/src/
  for p in src/__selftest.txt tests/__selftest.txt "journal/runs/$date/__selftest.txt"; do
    check ok "write allowed $p" write "$p"; rm -f "/work/$p"
  done
  check ok 'pnpm typecheck' pnpm typecheck
  check ok 'pnpm test' pnpm test
  check ok 'pnpm build' pnpm build
  check fail 'no file contains the token' grep -rqsF "$CLAUDE_CODE_OAUTH_TOKEN" /work/src /work/tests /work/journal /tmp "$HOME"
  if (( fails == 0 )); then echo '{"type":"result","subtype":"success","is_error":false,"result":"sandbox ok","num_turns":1}'
  else echo "{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":true,\"result\":\"$fails sandbox checks failed\"}"; fi
  exit $(( fails > 0 ))
fi

# ---- on the host ----
root="$(cd "$(dirname "$0")/../.." && pwd)"
[[ -f "$root/harness/config.env" ]] && source "$root/harness/config.env"
: "${DAILY_HOME:=$HOME/.daily-racer}" "${TOKEN_FILE:=$DAILY_HOME/oauth-token}"
[[ -d "$root/node_modules" ]] || { echo "self-test-sandbox.sh: run pnpm install first" >&2; exit 2; }
self="$(realpath "$0")"
run="$root/harness/scripts/agent-run.sh"
mkdir -p "$DAILY_HOME"
tmp="$(mktemp -d "$DAILY_HOME/selftest.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
date=2099-01-01
work="$tmp/work"
mkdir -p "$work"
tar -C "$root" --exclude=./.git --exclude=./node_modules --exclude=./dist --exclude=./dev-dist -c . | tar -C "$work" -x
cp -al "$root/node_modules" "$work/node_modules" 2>/dev/null || cp -a "$root/node_modules" "$work/node_modules"
echo "gitdir: $root/.git/worktrees/secret" > "$work/.git" # like a real worktree's pointer file
echo "selftest $date $(hostname -I)" > "$tmp/prompt"
echo sleep > "$tmp/sleep"
common=(--workdir "$work" --model fake --max-turns 1 --date "$date" --fake-claude "$self")

fails=0
host_check() { # <want-exit> <name> <got-exit>
  if [[ "$3" == "$1" ]]; then printf 'PASS  %-58s exit %s\n' "$2" "$3"
  else printf 'FAIL  %-58s exit %s (want %s)\n' "$2" "$3" "$1"; fails=$((fails + 1)); fi
}

rc=0; "$run" --phase build --prompt-file "$tmp/prompt" --timeout-min 10 --out "$tmp/checks" "${common[@]}" || rc=$?
cat "$tmp/checks/stderr.log"
host_check 0 'agent-run.sh with all in-container checks' "$rc"

rc=0; "$run" --phase build --prompt-file "$tmp/sleep" --timeout-min 0.1 --out "$tmp/timeout" "${common[@]}" 2>/dev/null || rc=$?
host_check 12 'wall-clock timeout kills the container' "$rc"
leftover="$(docker ps -aq --filter name=daily-racer-agent-)"
host_check 0 'no agent container left running' "$([[ -z "$leftover" ]]; echo $?)"

if [[ ! -e "$TOKEN_FILE" ]]; then
  rc=0; "$run" --phase build --prompt-file "$tmp/prompt" --timeout-min 1 --out "$tmp/notoken" \
    --workdir "$work" --model fake --max-turns 1 2>/dev/null || rc=$?
  host_check 2 'missing TOKEN_FILE refuses to run' "$rc"
fi
(( fails == 0 )) && echo "sandbox self-test: all checks passed" || echo "sandbox self-test: $fails host checks failed"
exit $(( fails > 0 ))
