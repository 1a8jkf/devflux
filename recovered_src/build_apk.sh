#!/bin/bash
set -e

cd /home/marcos/DevFlux

# Instalar NVM e Node se não existirem
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 20
nvm use 20

# Garantir npm install
npm install

# Build do Android
export ANDROID_HOME=/home/marcos/Android/Sdk

# Expo prebuild
npx expo prebuild -p android --clean


# Forçar legacy packaging para que o Android extraia as bibliotecas nativas para a pasta lib/
sed -i 's/expo.useLegacyPackaging=false/expo.useLegacyPackaging=true/' android/gradle.properties

# Create jniLibs and copy libproot.so and libtalloc.so
mkdir -p android/app/src/main/jniLibs/arm64-v8a
cp /tmp/userland-git/assets/arm64/proot android/app/src/main/jniLibs/arm64-v8a/libproot.so
cp /tmp/userland-git/assets/arm64/libtalloc.so.2 android/app/src/main/jniLibs/arm64-v8a/libtalloc.so

# Apply SONAMEs and replace dependencies using patchelf
/tmp/patch_elf_dir/bin/patchelf --set-soname libproot.so android/app/src/main/jniLibs/arm64-v8a/libproot.so
/tmp/patch_elf_dir/bin/patchelf --replace-needed libtalloc.so.2 libtalloc.so android/app/src/main/jniLibs/arm64-v8a/libproot.so
/tmp/patch_elf_dir/bin/patchelf --set-soname libtalloc.so android/app/src/main/jniLibs/arm64-v8a/libtalloc.so

# Inject APP_NATIVE_LIB_DIR into NodejsMobile module to reliably resolve lib path (idempotent)
if ! grep -q "APP_NATIVE_LIB_DIR" node_modules/nodejs-mobile-react-native/android/src/main/java/com/janeasystems/rn_nodejs_mobile/RNNodeJsMobileModule.java; then
    sed -i '/Os.setenv("TMPDIR"/a \      Os.setenv("APP_NATIVE_LIB_DIR", reactContext.getApplicationInfo().nativeLibraryDir, true);' node_modules/nodejs-mobile-react-native/android/src/main/java/com/janeasystems/rn_nodejs_mobile/RNNodeJsMobileModule.java
fi



# Ensure extractNativeLibs is true
sed -i 's/<application /<application android:extractNativeLibs="true" /' android/app/src/main/AndroidManifest.xml

# === EPIC 3: FOREGROUND SERVICE INJECTION ===
# Copy native modules
cp /home/marcos/DevFlux/native-src/*.kt android/app/src/main/java/com/marcos_app0001/DevFlux/

# Register Package in MainApplication.kt
sed -i 's/\/\/ add(MyReactNativePackage())/add(DevFluxPackage())/' android/app/src/main/java/com/marcos_app0001/DevFlux/MainApplication.kt

# Inject Permissions in AndroidManifest.xml
sed -i '/<application/i \    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />' android/app/src/main/AndroidManifest.xml

# Inject Service in AndroidManifest.xml
sed -i '/<\/application>/i \        <service android:name=".DevFluxService" android:foregroundServiceType="dataSync" android:exported="false" />' android/app/src/main/AndroidManifest.xml

# Compilar o APK Release
cd android
chmod +x gradlew
./gradlew assembleRelease

# Copy to Windows Desktop
cp app/build/outputs/apk/release/app-release.apk /mnt/c/Users/user01/Desktop/DevFlux-Release.apk
echo "APK copied to Desktop!"
