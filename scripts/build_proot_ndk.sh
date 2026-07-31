#!/bin/bash
set -e

# Caminho para o NDK e PROOT
NDK_PATH="/home/marcos/Android/Sdk/ndk/27.1.12297006"
PROOT_DIR="/home/marcos/proot-devflux/src"
TOOLCHAIN="${NDK_PATH}/toolchains/llvm/prebuilt/linux-x86_64"

export CC="${TOOLCHAIN}/bin/aarch64-linux-android34-clang"
export CXX="${TOOLCHAIN}/bin/aarch64-linux-android34-clang++"
export AR="${TOOLCHAIN}/bin/llvm-ar"
export LD="${TOOLCHAIN}/bin/ld"
export RANLIB="${TOOLCHAIN}/bin/llvm-ranlib"
export STRIP="${TOOLCHAIN}/bin/llvm-strip"
export OBJCOPY="${TOOLCHAIN}/bin/llvm-objcopy"
export OBJDUMP="${TOOLCHAIN}/bin/llvm-objdump"

export CFLAGS="-O2 -fPIE -fPIC"
export LDFLAGS="-pie -fPIE -fPIC"

export MAKE="${NDK_PATH}/prebuilt/linux-x86_64/bin/make"

echo "Compilando PRoot com NDK (Android 34)..."
cd "${PROOT_DIR}"
${MAKE} clean || true
${MAKE} V=1
echo "Compilação concluída."
