const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { parseManifest, verifyBundledSources } = require('../scripts/verify-android-artifacts.cjs');

const manifest = debuggable => '<manifest xmlns:android="http://schemas.android.com/apk/res/android" ' +
  'package="com.marcos.devflux" android:versionCode="1" android:versionName="1.0.0">' +
  '<uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/>' +
  '<application android:label="DevFlux"' + (debuggable === undefined ? '' : ' android:debuggable="' + debuggable + '"') +
  '/></manifest>';

test('reads SDK, version and debug state from structured Android XML', async () => {
  for (const debuggable of [undefined, 'false', 'true']) {
    assert.deepEqual(await parseManifest(manifest(debuggable)), {
      package: 'com.marcos.devflux', versionCode: 1, versionName: '1.0.0',
      minSdk: 24, targetSdk: 36, debuggable: debuggable === 'true',
    });
  }
});

test('rejects malformed or unresolved manifest data', async () => {
  await assert.rejects(parseManifest('<manifest>'));
  await assert.rejects(parseManifest(manifest('@bool/debuggable')), /Unresolved/);
  await assert.rejects(parseManifest('<manifest><application/></manifest>'));
});

for (const format of ['apk', 'aab']) {
  test(format + ' cannot pass with a missing or stale bundled runtime', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devflux-bundled-source-'));
    try {
      const bundle = 'android/app/build/generated/assets/react/release/index.android.bundle';
      const runtime = 'nodejs-assets/nodejs-project/main.js';
      for (const file of [bundle, runtime]) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), 'current');
      }
      const zip = new JSZip();
      const prefix = format === 'aab' ? 'base/assets/' : 'assets/';
      await assert.rejects(verifyBundledSources(zip, format, root), /missing/);
      zip.file(prefix + 'index.android.bundle', 'current');
      zip.file(prefix + 'nodejs-project/main.js', 'old');
      await assert.rejects(verifyBundledSources(zip, format, root), /differs/);
      zip.file(prefix + 'nodejs-project/main.js', 'current');
      assert.equal(Object.keys(await verifyBundledSources(zip, format, root)).length, 2);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}
