#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
exec bash "$(dirname "${BASH_SOURCE[0]}")/scripts/build_android_release.sh" "${1:-aab}"
