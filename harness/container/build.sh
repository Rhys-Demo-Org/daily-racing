#!/usr/bin/env bash
# Builds the pinned toolchain image. The tag is derived from the Dockerfile's hash, so any edit
# produces a new image and in-container.sh always runs the one matching the checked-out Dockerfile.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tag="daily-racer-toolchain:$(sha256sum "$here/Dockerfile" | cut -c1-12)"
docker build --pull=false -t "$tag" "$here"
echo "$tag"
