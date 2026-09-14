#!/bin/bash
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 20

export ANDROID_HOME=/home/marcos/Android/Sdk

cd /home/marcos/DevFlux
echo "Limpiando caches..."
rm -rf .expo node_modules/.cache android/app/build android/.gradle

cd android
./gradlew clean
cd ..

echo "Iniciando build..."
./build_apk.sh
