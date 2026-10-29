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
source "$(dirname "$0")/../lib/common.sh"

dirty="$(git -C "$HARNESS_ROOT" status --porcelain -- . ':!tests/baselines' ':!guardrails/manifest.json')"
[[ -z "$dirty" ]] || die "commit your changes first; baselines come from committed code:"$'\n'"$dirty"
run=("$HARNESS_ROOT/harness/scripts/in-container.sh" --)
"${run[@]}" bash -euc '
  export GATE_NONCE=rebaseline
  v="--exit 0 --stderr /dev/null --nonce $GATE_NONCE --main . --image $1"
  node guardrails/gates/record-replays.ts
  node --permission --allow-fs-read=/repo guardrails/gates/g3-measure.ts tests/baselines/replays src/content/tracks >/tmp/g3.out
  node guardrails/gates/g3-verdict.ts --measure /tmp/g3.out $v --baseline tests/baselines/replay-states.json
  node --permission --allow-fs-read=/repo guardrails/gates/g2-measure.ts . "$2" >/tmp/g2.out
  node guardrails/gates/g2-verdict.ts --measure /tmp/g2.out $v --baseline tests/baselines/bot-laps.json
' _ "$IMAGE" "$BOT_SEEDS"
git -C "$HARNESS_ROOT" ls-files -z --cached --others --exclude-standard | "${run[@]}" node guardrails/scripts/gen-manifest.ts
git -C "$HARNESS_ROOT" status --short -- tests/baselines guardrails/manifest.json
