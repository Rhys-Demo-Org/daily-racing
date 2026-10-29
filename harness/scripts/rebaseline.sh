#!/usr/bin/env bash
# Owner-only: regenerates the gate baselines and the manifest from the current checkout, then you
# review and commit them in an owner PR. Never run by the nightly loop.
#   - records any missing replay in tests/baselines/replays/ (existing recordings are frozen)
#   - tests/baselines/replay-states.json   expected end state of every replay (gate 3)
#   - tests/baselines/bot-laps.json        median lap per track over BOT_SEEDS (gate 2)
#   - guardrails/manifest.json             hashes of every protected file (gate 8), written last
# All stamped with the Node version and image tag; gates report a mismatch as a toolchain mismatch.
#
#   harness/scripts/rebaseline.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=/dev/null
[[ -f "$root/harness/config.env" ]] && source "$root/harness/config.env"
: "${BOT_SEEDS:=1,2,3,42,1234}"

dirty="$(git -C "$root" status --porcelain -- . ':!tests/baselines' ':!guardrails/manifest.json')"
[[ -z "$dirty" ]] || { echo "rebaseline.sh: commit your changes first; baselines come from committed code:" >&2; echo "$dirty" >&2; exit 2; }

image="daily-racer-toolchain:$(sha256sum "$root/harness/container/Dockerfile" | cut -c1-12)"
docker image inspect "$image" >/dev/null 2>&1 || { echo "rebaseline.sh: image $image missing; run harness/container/build.sh" >&2; exit 2; }
in_container() { docker run --rm -i --network none --user "$(id -u):$(id -g)" --tmpfs /tmp:exec -e HOME=/tmp/home -v "$root:/repo" -w /repo "$image" "$@"; }

in_container bash -euc '
  node guardrails/gates/record-replays.ts
  node --permission --allow-fs-read=/repo guardrails/gates/g3-measure.ts tests/baselines/replays src/content/tracks >/tmp/g3.out
  node guardrails/gates/g3-verdict.ts --measure /tmp/g3.out --exit 0 --stderr /dev/null --main . --image "$1" --baseline tests/baselines/replay-states.json
  node --permission --allow-fs-read=/repo guardrails/gates/g2-measure.ts . "$2" >/tmp/g2.out
  node guardrails/gates/g2-verdict.ts --measure /tmp/g2.out --exit 0 --stderr /dev/null --main . --image "$1" --baseline tests/baselines/bot-laps.json
' _ "$image" "$BOT_SEEDS"
git -C "$root" ls-files -z --cached --others --exclude-standard | in_container node guardrails/scripts/gen-manifest.ts
git -C "$root" status --short -- tests/baselines guardrails/manifest.json
