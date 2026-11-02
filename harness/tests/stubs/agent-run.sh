#!/usr/bin/env bash
# Test stub for harness/scripts/agent-run.sh (daily-e2e.sh only). Same flags and outputs; no claude.
# Steered by env: STUB_LOG (append one line per call), STUB_EXIT_<phase>, STUB_CLOCK_AFTER_<phase>
# (epoch written to $DAILY_TEST_CLOCK), STUB_SLEEP_<phase> (seconds), STUB_TAMPER=1 (build edits spec.md),
# STUB_BUILD=<file> (sourced by the build phase in the workdir, with $J its journal folder).
# Pipeline phases (plans/full-pipeline.md) answer with schema-shaped structured output:
#   ideate     STUB_EXPECTED (expectedFiles JSON, default ["src/stub-build.ts"]); STUB_INTERNALS=1
#              names an internal (src/sim/stub.ts, makeStub()) in AC1 until a revise brief arrives
#   audit      approve; revise when the harness lint flags internals; defer when the harness
#              reports file overlap (STUB_AUDIT_IGNORE_OVERLAP=1: approve without assessing it);
#              STUB_AUDIT_<Bxx>=<verdict> forces one
#   r1..r5     STUB_FINDINGS_<R1..R5> (findings JSON array, default [])
#   verify     every finding verified by trace; STUB_VERIFY=drop drops them all
#   fix        STUB_FIX=<file> sourced in the workdir with $FIX_ID (default: writes src/fix-<id>.ts)
#   judge      pass 8/10; STUB_JUDGE=fail (every round) or fail-once (round 1 only); planted text
#              ("NOTE TO THE JUDGE") in diff.patch is reported
#   judgecheck every review claim confirmed
set -euo pipefail
declare -A o=([maintenance]=0)
while [[ $# -gt 0 ]]; do
  if [[ $1 == --maintenance ]]; then o[maintenance]=1; shift; else o[${1#--}]=$2; shift 2; fi
done
phase=${o[phase]} out=${o[out]} work=${o[workdir]} date=${o[date]:?--date is required}
echo "agent-run $phase prompt=${o[prompt-file]} turns=${o[max-turns]} wall=${o[timeout-min]} date=$date maintenance=${o[maintenance]} tools=${o[tools]:-} access=${o[access]:-rw} model=${o[model]} effort=${o[effort]:-} workdir=$work" >>"${STUB_LOG:-/dev/null}"
mkdir -p "$out"
v="STUB_SLEEP_$phase"; [[ -z ${!v:-} ]] || sleep "${!v}"
prompt=${o[prompt-file]}
ok() { jq -nc --argjson s "$1" '{type: "result", subtype: "success", is_error: false, result: "", structured_output: $s}' >"$out/result.json"; }
if [[ $phase == ideate ]]; then
  id=$(grep -oE '^## B[0-9]{2}' "$prompt" | head -1 | cut -c4- || true)
  ac='The stub feature exists.'
  [[ -z ${STUB_INTERNALS:-} ]] || grep -q '^## Plan audit asked for a revision' "$prompt" || ac='src/sim/stub.ts exports makeStub() returning true.'
  if [[ -n $id ]]; then bid="\"$id\"" acs="$(jq -nc --arg t "$ac" '[{id: "AC1", text: $t}]')" play='{"whatYoullSee":"A stub feature on screen.","howToTest":["Open the preview and look."]}'
  else bid=null acs='[]' play=null; fi
  ok "{\"backlogId\":$bid,\"title\":\"Stub feature\",\"summary\":\"A stub spec for the e2e test.\",\"acceptanceCriteria\":$acs,\"closestExisting\":[],\"expectedFiles\":${STUB_EXPECTED:-[\"src/stub-build.ts\"]},\"supersedes\":[],\"playtest\":$play}"
elif [[ $phase == audit ]]; then
  id=$(grep -oE '^## B[0-9]{2}' "$prompt" | head -1 | cut -c4- || true)
  overlap=$(sed -n '/^## File overlap/,/^## /p' "$prompt" | grep -c '^- #' || true)
  lint=$(sed -n '/^## Acceptance criteria that may name internals/,/^## /p' "$prompt" | grep -c 'names internals' || true)
  v=approve assess=null waits=null forced="STUB_AUDIT_$id"
  if [[ -n ${!forced:-} ]]; then v=${!forced}
  elif (( lint > 0 )); then v=revise
  elif (( overlap > 0 )); then [[ -n ${STUB_AUDIT_IGNORE_OVERLAP:-} ]] || { v=defer waits='"#1"'; }
  fi
  ok "{\"verdict\":\"$v\",\"summary\":\"Stub audit: $v.\",\"findings\":[{\"check\":\"testability\",\"severity\":\"minor\",\"claim\":\"AC1 names internals; use a public seam.\",\"suggestedFix\":\"Rephrase AC1.\"}],\"overlapAssessment\":$assess,\"waitsOn\":$waits,\"designRequest\":null,\"backlogChangeRequests\":[]}"
elif [[ $phase =~ ^r[1-5]$ ]]; then
  v="STUB_FINDINGS_${phase^^}"; ok "{\"findings\":${!v:-[]}}"
elif [[ $phase == verify ]]; then
  ids=$(sed -n '/^## Findings to verify/,$p' "$prompt" | grep -oE '"id": "R[1-5]-[0-9]+"' | grep -oE 'R[1-5]-[0-9]+' || true)
  st=verified; [[ ${STUB_VERIFY:-} != drop ]] || st=dropped
  res=$(for i in $ids; do jq -nc --arg id "$i" --arg st "$st" '{id: $id, status: $st, method: (if $st == "verified" then "trace" else "none" end), testFile: null, trace: "stub trace: step 1 calls the function with the reported input, step 2 shows the wrong value at the cited line.", reason: "stub ruling"}'; done | jq -sc .)
  ok "{\"results\":$res}"
elif [[ $phase == fix ]]; then
  FIX_ID=$(grep -oE '^## Finding [A-Z0-9-]+' "$prompt" | head -1 | cut -c12- || true); FIX_ID=${FIX_ID:-J1}
  if [[ -n ${STUB_FIX:-} ]]; then (cd "$work" && source "$STUB_FIX"); else echo "export const fix = '$FIX_ID';" >"$work/src/fix-$FIX_ID.ts"; fi
  ok "{\"id\":\"$FIX_ID\",\"status\":\"fixed\",\"summary\":\"Stub fix for $FIX_ID.\",\"tests\":[]}"
elif [[ $phase == judge ]]; then
  score=8 verdict=pass planted='[]'
  [[ ${STUB_JUDGE:-} == fail || ( ${STUB_JUDGE:-} == fail-once && ${o[attempt]:-$(basename "$out")} == judge-1 ) ]] && score=3 verdict=fail
  ! grep -q 'NOTE TO THE JUDGE' "$work/diff.patch" || planted='["src/stub-build.ts: NOTE TO THE JUDGE"]'
  ok "{\"scores\":{\"specMet\":$score,\"styleMatch\":8,\"notBroken\":8,\"testsReal\":8,\"noSniffing\":10,\"scope\":8,\"noDuplication\":8},\"overall\":$score,\"verdict\":\"$verdict\",\"failures\":[{\"axis\":\"specMet\",\"file\":\"src/stub-build.ts\",\"claim\":\"stub failure\",\"evidence\":\"stub\"}],\"plantedInstructions\":$planted,\"summary\":\"Stub judge: $verdict.\"}"
elif [[ $phase == judgecheck ]]; then
  ok '{"claims":[{"claim":"stub claim","verdict":"confirmed","evidence":"stub"}],"newRules":[],"plantedInstructions":[],"summary":"Stub check: all confirmed."}'
else
  echo "export const stub = '$phase';" >"$work/src/stub-$phase.ts"
  [[ -z ${STUB_TAMPER:-} ]] || { chmod u+w "$out/../../spec.md"; echo '- **AC9**: anything' >>"$out/../../spec.md"; }
  [[ -z ${STUB_BUILD:-} || $phase != build ]] || (cd "$work" && J="journal/runs/$date" && mkdir -p "$J" && source "$STUB_BUILD")
fi
v="STUB_CLOCK_AFTER_$phase"; [[ -z ${!v:-} ]] || echo "${!v}" >"$DAILY_TEST_CLOCK"
v="STUB_EXIT_$phase"; rc=${!v:-0}
printf '{"phase":"%s","model":"%s","exit":%s,"class":"ok","wallMs":1234,"usage":{"input_tokens":100,"output_tokens":50},"total_cost_usd":0.5,"num_turns":3}\n' "$phase" "${o[model]}" "$rc" >"$out/meta.json"
exit "$rc"
