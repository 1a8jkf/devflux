#!/usr/bin/env bash
set -euo pipefail
: "${DEVFLUX_NDK_TOOLCHAIN:?Set DEVFLUX_NDK_TOOLCHAIN}"
target=aarch64-linux-android24
args=()
for arg in "$@"; do
  if [[ "$arg" == "-m32" ]]; then target=armv7a-linux-androideabi24; else args+=("$arg"); fi
done
exec "$DEVFLUX_NDK_TOOLCHAIN/bin/$target-clang" "${args[@]}"
