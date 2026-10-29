#!/usr/bin/env bash
# Test stub for harness/scripts/agent-run.sh (daily-e2e.sh only). Same flags and outputs; no claude.
# Steered by env: STUB_LOG (append one line per call), STUB_EXIT_<phase>, STUB_CLOCK_AFTER_<phase>
# (epoch written to $DAILY_TEST_CLOCK), STUB_SLEEP_<phase> (seconds), STUB_TAMPER=1 (build edits spec.md),
# STUB_BUILD=<file> (sourced by the build phase in the workdir, with $J its journal folder).
set -euo pipefail
declare -A o=([maintenance]=0)
while [[ $# -gt 0 ]]; do
  if [[ $1 == --maintenance ]]; then o[maintenance]=1; shift; else o[${1#--}]=$2; shift 2; fi
done
phase=${o[phase]} out=${o[out]} work=${o[workdir]} date=${o[date]:?--date is required}
echo "agent-run $phase prompt=${o[prompt-file]} turns=${o[max-turns]} wall=${o[timeout-min]} date=$date maintenance=${o[maintenance]} tools=${o[tools]:-}" >>"${STUB_LOG:-/dev/null}"
mkdir -p "$out"
v="STUB_SLEEP_$phase"; [[ -z ${!v:-} ]] || sleep "${!v}"
if [[ $phase == ideate ]]; then
  id=$(grep -oE '^## B[0-9]{2}' "${o[prompt-file]}" | head -1 | cut -c4- || true)
  [[ -n $id ]] && bid="\"$id\"" acs='[{"id":"AC1","text":"The stub feature exists."}]' || bid=null acs='[]'
  printf '{"type":"result","subtype":"success","is_error":false,"result":"","structured_output":{"backlogId":%s,"title":"Stub feature","summary":"A stub spec for the e2e test.","acceptanceCriteria":%s,"closestExisting":[]}}\n' "$bid" "$acs" >"$out/result.json"
else
  echo "export const stub = '$phase';" >"$work/src/stub-$phase.ts"
  [[ -z ${STUB_TAMPER:-} ]] || { chmod u+w "$out/../../spec.md"; echo '- **AC9**: anything' >>"$out/../../spec.md"; }
  [[ -z ${STUB_BUILD:-} || $phase != build ]] || (cd "$work" && J="journal/runs/$date" && mkdir -p "$J" && source "$STUB_BUILD")
fi
v="STUB_CLOCK_AFTER_$phase"; [[ -z ${!v:-} ]] || echo "${!v}" >"$DAILY_TEST_CLOCK"
v="STUB_EXIT_$phase"; rc=${!v:-0}
printf '{"phase":"%s","model":"%s","exit":%s,"class":"ok","wallMs":1234,"usage":{"input_tokens":100,"output_tokens":50},"total_cost_usd":0.5,"num_turns":3}\n' "$phase" "${o[model]}" "$rc" >"$out/meta.json"
exit "$rc"
