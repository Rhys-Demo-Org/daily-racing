#!/usr/bin/env bash
# Test stub for harness/scripts/sandbox-net.sh (daily-e2e.sh only): logs the call, touches no network.
echo "sandbox-net $*" >>"${STUB_LOG:-/dev/null}"
