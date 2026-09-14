/* global __dirname */
const { test } = require('node:test');
const { Buffer } = require('node:buffer');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { applyLibrary } = require('../scripts/build-node-mobile.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const JSZip = require('jszip');
const { inspectElf, inspectPath } = require('../scripts/check-android-native.cjs');

function elf(alignment, { is64 = true, offset = 0, address = 0 } = {}) {
  const data = Buffer.alloc(is64 ? 120 : 84);
  data.write('7f454c46', 0, 'hex');
  data[4] = is64 ? 2 : 1;
  data[5] = 1;
  data.writeUInt16LE(is64 ? 183 : 40, 18);
  const header = is64 ? 64 : 52;
  if (is64) data.writeBigUInt64LE(BigInt(header), 32); else data.writeUInt32LE(header, 28);
  data.writeUInt16LE(is64 ? 56 : 32, is64 ? 54 : 42);
  data.writeUInt16LE(1, is64 ? 56 : 44);
  data.writeUInt32LE(1, header);
  if (is64) {
    data.writeBigUInt64LE(BigInt(offset), header + 8);
    data.writeBigUInt64LE(BigInt(address), header + 16);
    data.writeBigUInt64LE(BigInt(alignment), header + 48);
  } else {
    data.writeUInt32LE(offset, header + 4);
    data.writeUInt32LE(address, header + 8);
    data.writeUInt32LE(alignment, header + 28);
  }
  return data;
}

for (const is64 of [true, false]) {
  test('ELF' + (is64 ? 64 : 32) + ' validates every LOAD alignment and offset', () => {
    assert.equal(inspectElf(elf(4096, { is64 })).compatible, false);
    assert.equal(inspectElf(elf(16384, { is64 })).compatible, true);
    assert.equal(inspectElf(elf(65536, { is64 })).compatible, true);
    assert.equal(inspectElf(elf(16384, { is64, address: 4096 })).compatible, false);
    assert.equal(inspectElf(elf(16384, { is64, offset: 256, address: 16640 })).compatible, true);
  });
}
test('ELF scanner rejects invalid and truncated binaries', () => {
  assert.throws(() => inspectElf(Buffer.alloc(4)));
  assert.throws(() => inspectElf(elf(16384).subarray(0, 70)));
  const data = elf(16384);
  data[5] = 2;
  assert.throws(() => inspectElf(data));
});
test('AAB audit inspects real ZIP entries and cannot pass without native libraries', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devflux-aab-test-'));
  try {
    const bundle = path.join(dir, 'app.aab');
    const zip = new JSZip();
    zip.file('base/lib/arm64-v8a/libproot.so', elf(16384));
    zip.file('base/lib/arm64-v8a/libnode.so', elf(4096));
    fs.writeFileSync(bundle, await zip.generateAsync({ type: 'nodebuffer' }));
    const results = await inspectPath(bundle);
    assert.equal(results.length, 2);
    assert.equal(results.filter(result => !result.compatible)[0].file, 'base/lib/arm64-v8a/libnode.so');
    fs.writeFileSync(bundle, await new JSZip().generateAsync({ type: 'nodebuffer' }));
    await assert.rejects(inspectPath(bundle), /No 64-bit/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('strict release gate fails for 4 KB libraries while the diagnostic mode remains available', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devflux-native-gate-'));
  try {
    const file = path.join(dir, 'libtest.so');
    fs.writeFileSync(file, elf(4096));
    const scanner = path.resolve(__dirname, '../scripts/check-android-native.cjs');
    const strict = spawnSync(process.execPath, [scanner, '--strict', file], { encoding: 'utf8' });
    assert.equal(strict.status, 1);
    assert.equal(JSON.parse(strict.stdout).incompatible, 1);
    assert.equal(spawnSync(process.execPath, [scanner, file]).status, 0);
    fs.writeFileSync(file, elf(16384));
    assert.equal(spawnSync(process.execPath, [scanner, '--strict', file]).status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('native cache restores the validated library after dependency installation and rejects tampering', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devflux-node-cache-'));
  const cache = path.join(root, 'dist/native-node');
  const target = path.join(root, 'node_modules/nodejs-mobile-react-native/android/libnode/bin/arm64-v8a/libnode.so');
  try {
    fs.mkdirSync(path.join(cache, 'arm64-v8a'), { recursive: true });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const artifact = path.join(cache, 'arm64-v8a/libnode.so');
    const valid = elf(16384);
    fs.writeFileSync(artifact, valid);
    const metadata = { revision: 'd9552e0e01ed5bdbe12a31d1ce6c0877a4f39580',
      sha256: createHash('sha256').update(valid).digest('hex') };
    fs.writeFileSync(path.join(cache, 'build.json'), JSON.stringify(metadata));
    fs.writeFileSync(target, elf(4096));
    applyLibrary(root);
    assert.deepEqual(fs.readFileSync(target), valid);
    fs.writeFileSync(target, elf(4096));
    applyLibrary(root);
    assert.deepEqual(fs.readFileSync(target), valid);
    const invalid = elf(4096);
    fs.writeFileSync(artifact, invalid);
    assert.throws(() => applyLibrary(root), /validation/);
    metadata.sha256 = createHash('sha256').update(invalid).digest('hex');
    fs.writeFileSync(path.join(cache, 'build.json'), JSON.stringify(metadata));
    assert.throws(() => applyLibrary(root), /validation/);
    assert.deepEqual(fs.readFileSync(target), valid);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Expo plugin removes obsolete native registration and preserves ARM64 and signing settings across repeated prebuilds', async () => {
  const callbacks = {};
  const pluginApi = { AndroidConfig: { Manifest: { getMainApplicationOrThrow: manifest => manifest.manifest.application[0] } } };
  for (const name of ['withAppBuildGradle', 'withGradleProperties', 'withAndroidManifest', 'withMainApplication']) {
    pluginApi[name] = (config, fn) => { callbacks[name] = fn; return config; };
  }
  pluginApi.withDangerousMod = config => config;
  const context = { module: { exports: {} }, require: name => name === 'expo/config-plugins' ? pluginApi : require(name) };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../plugins/withDevFluxAndroid.js'), 'utf8'), context);
  context.module.exports({});
  const fixtures = {
    withAppBuildGradle: { language: 'groovy', contents: 'android {}' },
    withGradleProperties: [{ type: 'property', key: 'reactNativeArchitectures', value: 'arm64-v8a,x86_64' }],
    withAndroidManifest: { manifest: { application: [{ $: {}, service: [] }] } },
    withMainApplication: { contents: 'PackageList(this).packages.apply {\nadd(DevFluxPackage())\n}' },
  };
  for (const [name, modResults] of Object.entries(fixtures)) {
    const once = await callbacks[name]({ modResults });
    const expected = JSON.stringify(once);
    assert.equal(JSON.stringify(await callbacks[name](once)), expected, name);
  }
  assert.match(fixtures.withAppBuildGradle.contents, /android-release.gradle/);
  assert.doesNotMatch(fixtures.withMainApplication.contents, /add\(DevFluxPackage\(\)\)/);
});
