#!/usr/bin/env bash
# Builds the pinned toolchain image, tagged with the Dockerfile's hash (image_tag in common.sh), so
# in-container.sh always runs the one matching the checked-out Dockerfile.
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"
docker build --pull=false -t "$IMAGE" "$HARNESS_ROOT/harness/container"
echo "$IMAGE"
