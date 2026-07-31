#!/bin/bash


cd /home/marcos/DevFlux

# Instalar NVM e Node se não existirem
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 20
nvm use 20

# Garantir npm install
n# Bundling Alpine Rootfs offline
if [ ! -f nodejs-assets/nodejs-project/ubuntu.bin ]; then
    curl -L -o nodejs-assets/nodejs-project/ubuntu.bin https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/aarch64/alpine-minirootfs-3.20.2-aarch64.tar.gz
fi
npm install
n# Bundling Alpine Rootfs offline
if [ ! -f nodejs-assets/nodejs-project/ubuntu.bin ]; then
    curl -L -o nodejs-assets/nodejs-project/ubuntu.bin https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/aarch64/alpine-minirootfs-3.20.2-aarch64.tar.gz
fi

# Build do Android
export ANDROID_HOME=/home/marcos/Android/Sdk

# Expo prebuild
# npx expo prebuild -p android --clean


# Forçar legacy packaging para que o Android extraia as bibliotecas nativas para a pasta lib/
if ! grep -q "expo.useLegacyPackaging=true" android/gradle.properties; then
    sed -i 's/expo.useLegacyPackaging=false/expo.useLegacyPackaging=true/' android/gradle.properties
fi

# Create jniLibs and copy proot (DevFlux Edition)
mkdir -p android/app/src/main/jniLibs/arm64-v8a
cp /home/marcos/proot-devflux/src/proot android/app/src/main/jniLibs/arm64-v8a/libproot.so
# Termux PRoot tem loaders embutidos, MAS no Android 14+ o mecanismo de extrair para o /tmp causa erro de permissão (W^X).
# Portanto, DEVEMOS usar os loaders nativamente extraídos no jniLibs.
cp /home/marcos/proot-devflux/src/loader/loader android/app/src/main/jniLibs/arm64-v8a/libproot-loader.so
cp /home/marcos/proot-devflux/src/loader/loader-m32 android/app/src/main/jniLibs/arm64-v8a/libproot-loader32.so

# Compile and copy pty-wrapper (Native PTY Master/Slave Engine)
/home/marcos/Android/Sdk/ndk/27.1.12297006/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android24-clang -O2 -fPIE -pie -o libpty-wrapper.so pty-wrapper.c
cp libpty-wrapper.so android/app/src/main/jniLibs/arm64-v8a/libpty-wrapper.so
cp libpty-wrapper.so nodejs-assets/nodejs-project/libpty-wrapper.so

# Inject APP_NATIVE_LIB_DIR into NodejsMobile module
if ! grep -q "APP_NATIVE_LIB_DIR" node_modules/nodejs-mobile-react-native/android/src/main/java/com/janeasystems/rn_nodejs_mobile/RNNodeJsMobileModule.java; then
    sed -i '/Os.setenv("TMPDIR"/a \      Os.setenv("APP_NATIVE_LIB_DIR", reactContext.getApplicationInfo().nativeLibraryDir, true);' node_modules/nodejs-mobile-react-native/android/src/main/java/com/janeasystems/rn_nodejs_mobile/RNNodeJsMobileModule.java
fi


# Ensure extractNativeLibs and usesCleartextTraffic are true
if ! grep -q 'android:extractNativeLibs="true"' android/app/src/main/AndroidManifest.xml; then
    sed -i 's/<application /<application android:extractNativeLibs="true" /' android/app/src/main/AndroidManifest.xml
fi
if ! grep -q 'android:usesCleartextTraffic="true"' android/app/src/main/AndroidManifest.xml; then
    sed -i 's/<application /<application android:usesCleartextTraffic="true" /' android/app/src/main/AndroidManifest.xml
fi

# === EPIC 3: FOREGROUND SERVICE INJECTION ===
# Copy native modules
cp /home/marcos/DevFlux/native-src/*.kt android/app/src/main/java/com/marcos_app0001/DevFlux/

# Register Package in MainApplication.kt
if ! grep -q "DevFluxPackage()" android/app/src/main/java/com/marcos_app0001/DevFlux/MainApplication.kt; then
    sed -i 's/\/\/ add(MyReactNativePackage())/add(DevFluxPackage())/' android/app/src/main/java/com/marcos_app0001/DevFlux/MainApplication.kt
fi

# Inject Permissions in AndroidManifest.xml
if ! grep -q "android.permission.FOREGROUND_SERVICE" android/app/src/main/AndroidManifest.xml; then
    sed -i '/<application/i \    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />' android/app/src/main/AndroidManifest.xml
fi

# Inject Service in AndroidManifest.xml
if ! grep -q "DevFluxService" android/app/src/main/AndroidManifest.xml; then
    sed -i '/<\/application>/i \        <service android:name=".DevFluxService" android:foregroundServiceType="dataSync" android:exported="false" />' android/app/src/main/AndroidManifest.xml
fi

# Compilar o APK Release
cd android
chmod +x gradlew
./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a -x lint -x lintVitalRelease -x lintVitalAnalyzeRelease

# Copy to Windows Desktop
cp app/build/outputs/apk/release/app-release.apk /mnt/c/Users/user01/Desktop/DevFlux-Release.apk
echo "APK copied to Desktop!"
