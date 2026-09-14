/* global __dirname */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, X509Certificate } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { parseStringPromise } = require('xml2js');
const JSZip = require('jszip');
const { inspectPath } = require('./check-android-native.cjs');
const { signingDirectory } = require('./configure-android-signing.cjs');

const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(command + ' failed: ' + (result.stderr || result.stdout || result.error?.message || result.status));
  return result.stdout.trim();
}
function assert(condition, message) { if (!condition) throw new Error(message); }

async function parseManifest(xml) {
  const { manifest } = await parseStringPromise(xml);
  const sdk = manifest['uses-sdk'][0].$;
  const application = manifest.application[0].$;
  assert([undefined, 'false', 'true'].includes(application['android:debuggable']), 'Unresolved debuggable value');
  return {
    package: manifest.$.package,
    versionCode: Number(manifest.$['android:versionCode']),
    versionName: manifest.$['android:versionName'],
    minSdk: Number(sdk['android:minSdkVersion']),
    targetSdk: Number(sdk['android:targetSdkVersion']),
    debuggable: application['android:debuggable'] === 'true',
  };
}

async function verifyBundledSources(zip, format, root) {
  const hashes = {};
  const prefix = format === 'aab' ? 'base/assets/' : 'assets/';
  for (const [asset, source] of Object.entries({
    'index.android.bundle': 'android/app/build/generated/assets/react/release/index.android.bundle',
    'nodejs-project/main.js': 'nodejs-assets/nodejs-project/main.js',
  })) {
    const entry = zip.file(prefix + asset);
    assert(entry, 'Bundled source is missing: ' + prefix + asset);
    const bytes = await entry.async('nodebuffer');
    assert(bytes.equals(fs.readFileSync(path.join(root, source))), 'Bundled source differs from this build: ' + asset);
    hashes[asset] = createHash('sha256').update(bytes).digest('hex');
  }
  return hashes;
}

async function verify(root = path.resolve(__dirname, '..')) {
  const directory = path.join(root, 'dist/release');
  const sdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'Android/Sdk');
  const buildTools = path.join(sdk, 'build-tools/36.0.0');
  const analyzer = path.join(sdk, 'cmdline-tools/latest/bin/apkanalyzer');
  const bundletool = path.join(root, 'dist/native-node/toolchains/bundletool-all-1.18.3.jar');
  assert(sha256(bundletool) === 'a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29', 'bundletool checksum mismatch');
  const expectedCertificate = new X509Certificate(fs.readFileSync(process.env.DEVFLUX_UPLOAD_CERTIFICATE ||
    path.join(signingDirectory(), 'upload-certificate.pem')));
  const fingerprint = expectedCertificate.fingerprint256.replaceAll(':', '').toLowerCase();
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  const report = {
    verifiedAt: new Date().toISOString(),
    certificateSha256: expectedCertificate.fingerprint256,
    physicalDeviceTest: 'not-run',
    playPolicyReview: 'pending',
    artifacts: [],
  };
  for (const format of ['apk', 'aab']) {
    const file = path.join(directory, 'DevFlux-release.' + format);
    let manifest;
    if (format === 'apk') {
      const signature = run(path.join(buildTools, 'apksigner'), ['verify', '--verbose', '--print-certs', file]);
      assert(signature.includes('Number of signers: 1'), 'Expected one APK signer');
      assert(signature.includes('Signer #1 certificate SHA-256 digest: ' + fingerprint), 'APK upload certificate mismatch');
      run(path.join(buildTools, 'zipalign'), ['-c', '-P', '16', '4', file]);
      manifest = await parseManifest(run(analyzer, ['manifest', 'print', file]));
    } else {
      const signature = run('jarsigner', ['-J-Duser.language=en', '-J-Duser.country=US', '-verify', file]);
      assert(signature.includes('jar verified.') && !signature.includes('unsigned entries'), 'AAB signature verification failed');
      const signedCertificate = new X509Certificate(run('keytool', ['-printcert', '-jarfile', file, '-rfc']));
      assert(signedCertificate.fingerprint256 === expectedCertificate.fingerprint256, 'AAB upload certificate mismatch');
      run('java', ['-jar', bundletool, 'validate', '--bundle=' + file]);
      manifest = await parseManifest(run('java', ['-jar', bundletool, 'dump', 'manifest', '--bundle=' + file]));
    }
    assert(manifest.package === app.android.package, 'Package does not match app.json');
    assert(manifest.versionCode === app.android.versionCode, 'Version code does not match app.json');
    assert(manifest.versionName === app.version, 'Version name does not match app.json');
    assert(Number.isInteger(manifest.minSdk) && Number.isInteger(manifest.targetSdk) && manifest.targetSdk >= 36, 'Invalid SDK levels');
    assert(!manifest.debuggable, 'Debuggable release is forbidden');
    const libraries = await inspectPath(file);
    assert(libraries.length > 0 && libraries.every(library => library.compatible), 'Native 16 KB validation failed');
    const sourceHashes = await verifyBundledSources(await JSZip.loadAsync(fs.readFileSync(file)), format, root);
    report.artifacts.push({
      file: path.basename(file), bytes: fs.statSync(file).size, sha256: sha256(file), manifest,
      nativeLibraries: libraries.length, incompatibleNativeLibraries: 0,
      sourceHashes,
    });
  }
  assert(JSON.stringify(report.artifacts[0].manifest) === JSON.stringify(report.artifacts[1].manifest), 'APK and AAB manifests differ');
  fs.writeFileSync(path.join(directory, 'release-verification.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), report.artifacts.map(artifact => artifact.sha256 + '  ' + artifact.file).join('\n') + '\n');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

module.exports = { verify, parseManifest, verifyBundledSources };
if (require.main === module) verify().catch(error => { console.error(error.message); process.exitCode = 1; });
