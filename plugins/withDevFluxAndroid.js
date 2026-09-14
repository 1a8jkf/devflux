const fs = require('node:fs');
const path = require('node:path');
const {
  withAppBuildGradle, withGradleProperties, withAndroidManifest,
  withMainApplication, withDangerousMod, AndroidConfig,
} = require('expo/config-plugins');

const releaseApply = 'apply from: new File(rootProject.projectDir, "../scripts/android-release.gradle")';

function withDevFluxAndroid(config) {
  config = withAppBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('DevFlux requires Groovy app/build.gradle.');
    if (!mod.modResults.contents.includes(releaseApply)) mod.modResults.contents += '\n' + releaseApply + '\n';
    return mod;
  });
  config = withGradleProperties(config, mod => {
    // The bundled Alpine rootfs and PRoot are ARM64, so do not advertise other ABIs.
    for (const [key, value] of Object.entries({
      reactNativeArchitectures: 'arm64-v8a',
      'expo.useLegacyPackaging': 'true',
    })) {
      mod.modResults = mod.modResults.filter(item => item.type !== 'property' || item.key !== key);
      mod.modResults.push({ type: 'property', key, value });
    }
    return mod;
  });
  config = withAndroidManifest(config, mod => {
    const manifest = mod.modResults.manifest;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$['android:extractNativeLibs'] = 'true';
    application.$['android:usesCleartextTraffic'] = 'true';
    const permissions = manifest['uses-permission'] ||= [];
    for (const item of permissions) {
      if (['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'].includes(item.$['android:name'])) {
        item.$['android:maxSdkVersion'] = '32';
        item.$['tools:replace'] = 'android:maxSdkVersion';
      }
    }
    const removedPermissions = new Set(['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_DATA_SYNC', 'FOREGROUND_SERVICE_SPECIAL_USE', 'POST_NOTIFICATIONS'].map(name => 'android.permission.' + name));
    manifest['uses-permission'] = permissions.filter(item => !removedPermissions.has(item.$['android:name']));
    application.service = (application.service || []).filter(item => !['.DevFluxService', 'com.marcos.devflux.DevFluxService'].includes(item.$['android:name']));
    return mod;
  });
  config = withMainApplication(config, mod => {
    mod.modResults.contents = mod.modResults.contents.replace(/^.*add\(DevFluxPackage\(\)\).*\n/gm, '');
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const root = mod.modRequest.projectRoot;
    const nativeRoot = path.join(mod.modRequest.platformProjectRoot, 'app/src/main');
    const kotlinDir = path.join(nativeRoot, 'java/com/marcos/devflux');
    const libDir = path.join(nativeRoot, 'jniLibs/arm64-v8a');
    fs.mkdirSync(kotlinDir, { recursive: true });
    fs.mkdirSync(libDir, { recursive: true });
    for (const name of ['DevFluxPackage.kt', 'DevFluxModule.kt', 'DevFluxService.kt']) {
      // Remove only obsolete generated files from the retired background-session module.
      fs.rmSync(path.join(kotlinDir, name), { force: true });
    }
    for (const [source, name] of Object.entries({
      proot: 'libproot.so', loader: 'libproot-loader.so', loader32: 'libproot-loader32.so',
      'libpty-wrapper.so': 'libpty-wrapper.so',
    })) {
      fs.copyFileSync(path.join(root, 'nodejs-assets/nodejs-project', source), path.join(libDir, name));
    }
    const nodePackage = path.dirname(require.resolve('nodejs-mobile-react-native/package.json', { paths: [root] }));
    if (fs.existsSync(path.join(root, 'dist/native-node/build.json'))) {
      require('../scripts/build-node-mobile.cjs').applyLibrary(root);
    }
    const nodeBridge = path.join(nodePackage, 'android/src/main/java/com/janeasystems/rn_nodejs_mobile/RNNodeJsMobileModule.java');
    const java = fs.readFileSync(nodeBridge, 'utf8');
    if (!java.includes('Os.setenv("APP_NATIVE_LIB_DIR"')) {
      const anchor = 'Os.setenv("TMPDIR", reactContext.getCacheDir().getAbsolutePath(), true);';
      if (!java.includes(anchor)) throw new Error('Node mobile environment initialization anchor not found.');
      fs.writeFileSync(nodeBridge, java.replace(anchor, anchor + '\n      Os.setenv("APP_NATIVE_LIB_DIR", reactContext.getApplicationInfo().nativeLibraryDir, true);'));
    }
    return mod;
  }]);
}

module.exports = withDevFluxAndroid;
