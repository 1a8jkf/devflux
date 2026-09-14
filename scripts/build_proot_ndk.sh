#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
NDK="${ANDROID_NDK_HOME:-$SDK/ndk/27.1.12297006}"
PROOT_SOURCE="${DEVFLUX_PROOT_SOURCE:-$HOME/proot-devflux}"
TALLOC="${DEVFLUX_TALLOC_ROOT:-$HOME/talloc-termux/data/data/com.termux/files/usr}"
export DEVFLUX_NDK_TOOLCHAIN="$NDK/toolchains/llvm/prebuilt/linux-x86_64"
[[ -f "$PROOT_SOURCE/src/GNUmakefile" && -f "$TALLOC/lib/libtalloc.a" && -f "$TALLOC/include/talloc.h" ]] || {
  printf 'Missing PRoot source or static ARM64 talloc. Set DEVFLUX_PROOT_SOURCE and DEVFLUX_TALLOC_ROOT.\n' >&2
  exit 1
}
[[ -x "$DEVFLUX_NDK_TOOLCHAIN/bin/aarch64-linux-android24-clang" ]] || { printf 'Android NDK compiler not found.\n' >&2; exit 1; }
mkdir -p "$ROOT/dist"
BUILD="$(mktemp -d "$ROOT/dist/native-build.XXXXXX")"
cp -a "$PROOT_SOURCE/src" "$BUILD/src"
# Compile in an isolated copy; never clean or overwrite the user's external PRoot tree.
make -C "$BUILD/src" clean
ALIGN="-Wl,-z,max-page-size=16384,-z,common-page-size=16384"
make -C "$BUILD/src" -j"${DEVFLUX_BUILD_JOBS:-2}" \
  CC="bash $ROOT/scripts/ndk-proot-cc.sh" \
  STRIP="$DEVFLUX_NDK_TOOLCHAIN/bin/llvm-strip" \
  OBJCOPY="$DEVFLUX_NDK_TOOLCHAIN/bin/llvm-objcopy" \
  OBJDUMP="$DEVFLUX_NDK_TOOLCHAIN/bin/llvm-objdump" \
  CPPFLAGS="-D_FILE_OFFSET_BITS=64 -D_GNU_SOURCE -I. -I$TALLOC/include" \
  CFLAGS="-O2 -fPIE -fPIC" \
  LDFLAGS="-pie -fPIE -fPIC $TALLOC/lib/libtalloc.a -ldl -Wl,-z,noexecstack $ALIGN" \
  LOADER_LDFLAGS="-static -nostdlib -Wl,--build-id=none,-Ttext=0x2000000000,--rosegment,-z,noexecstack $ALIGN" \
  LOADER_LDFLAGS-m32="-static -nostdlib -Wl,--build-id=none,-Ttext=0x20000000,--rosegment,-z,noexecstack $ALIGN"
"$DEVFLUX_NDK_TOOLCHAIN/bin/aarch64-linux-android24-clang" -O2 -fPIE -pie $ALIGN \
  -o "$BUILD/libpty-wrapper.so" "$ROOT/pty-wrapper.c"
node "$ROOT/scripts/check-android-native.cjs" "$BUILD/src/proot" "$BUILD/src/loader/loader" \
  "$BUILD/src/loader/loader-m32" "$BUILD/libpty-wrapper.so" > "$BUILD/alignment.json"
ASSETS="$ROOT/nodejs-assets/nodejs-project"
cp "$BUILD/src/proot" "$ASSETS/proot"
cp "$BUILD/src/loader/loader" "$ASSETS/loader"
cp "$BUILD/src/loader/loader-m32" "$ASSETS/loader32"
cp "$BUILD/libpty-wrapper.so" "$ASSETS/libpty-wrapper.so"
printf 'Compiled native assets. Audit: %s/alignment.json\n' "$BUILD"
printf 'Run Expo prebuild to copy these assets into Android. libnode and device validation remain separate checks.\n'
