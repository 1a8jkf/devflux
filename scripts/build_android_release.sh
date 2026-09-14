#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
MODE="${1:-aab}"
case "$MODE" in
  aab) TASKS=(:app:bundleRelease); FORMATS=(aab) ;;
  apk) TASKS=(:app:assembleRelease); FORMATS=(apk) ;;
  both) TASKS=(:app:assembleRelease :app:bundleRelease); FORMATS=(apk aab) ;;
  audit) TASKS=(:app:bundleRelease); FORMATS=(aab) ;;
  *) printf 'Usage: bash scripts/build_android_release.sh [aab|apk|both|audit]\n' >&2; exit 2 ;;
esac
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 13)) throw new Error("Expo SDK 57 requires Node >= 22.13");'
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export NODE_ENV=production
[[ -f node_modules/expo/bin/cli ]] || { printf 'Install the locked dependencies before building.\n' >&2; exit 1; }
# Apply only DevFlux's mods to existing native files. Expo 57 prebuild can recreate Android.
if [[ -f android/gradlew ]]; then
  node scripts/prepare-android-release.cjs
else
  node node_modules/expo/bin/cli prebuild --platform android --no-install
fi
ARGS=()
if [[ "$MODE" == audit ]]; then ARGS+=("-PdevfluxUnsignedAudit=true"); fi
(cd android && ./gradlew "${TASKS[@]}" -PreactNativeArchitectures=arm64-v8a "${ARGS[@]}" --no-daemon --max-workers=2)
mkdir -p dist/release
for FORMAT in "${FORMATS[@]}"; do
  if [[ "$FORMAT" == apk ]]; then
    SOURCE=android/app/build/outputs/apk/release/app-release.apk
  else
    SOURCE=android/app/build/outputs/bundle/release/app-release.aab
  fi
  if [[ "$MODE" == audit ]]; then
    DEST=dist/release/DevFlux-UNSIGNED-AUDIT.aab
    node scripts/check-android-native.cjs "$SOURCE"
  else
    DEST="dist/release/DevFlux-release.$FORMAT"
    node scripts/check-android-native.cjs --strict "$SOURCE"
    if [[ "$FORMAT" == apk ]]; then
      "$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose --print-certs "$SOURCE"
      "$ANDROID_HOME/build-tools/36.0.0/zipalign" -c -P 16 4 "$SOURCE"
    else
      VERIFY_LOG=dist/release/aab-signature-verification.txt
      jarsigner -J-Duser.language=en -J-Duser.country=US -verify "$SOURCE" > "$VERIFY_LOG" 2>&1
      grep -q 'jar verified.' "$VERIFY_LOG"
      if grep -q 'unsigned entries' "$VERIFY_LOG"; then
        printf 'AAB contains unsigned entries; refusing release copy.\n' >&2
        exit 1
      fi
    fi
  fi
  cp "$SOURCE" "$DEST"
  printf 'Artifact: %s/%s\n' "$ROOT" "$DEST"
  sha256sum "$DEST"
done
if [[ "$MODE" == audit ]]; then
  printf 'Unsigned audit only. This is not a validated publication build.\n'
fi
