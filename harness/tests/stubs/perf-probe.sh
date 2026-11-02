#!/usr/bin/env bash
# Test stub for harness/scripts/perf-probe.sh <repo> <out.json> (daily-e2e.sh only): no Docker.
# STUB_PERF=fail exits 1; STUB_LOG gets a line.
set -euo pipefail
echo "perf-probe $*" >>"${STUB_LOG:-/dev/null}"
[[ ${STUB_PERF:-} != fail ]] || exit 1
echo '{"scene":{"tracks":[{"id":"dust-bowl","draws":225}]},"page":{"races":[{"track":"dust-bowl","drawCallsPerFrame":30}]}}' >"$2"
