const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createSigning, publicDetails } = require('../scripts/configure-android-signing.cjs');

test('creates a real private upload key without exposing credentials or replacing it', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'devflux-signing-test-'));
  try {
    const details = createSigning(directory);
    const credentials = JSON.parse(fs.readFileSync(path.join(directory, 'credentials.json'), 'utf8'));
    assert.equal(details.alias, 'devflux-upload');
    assert.match(details.sha256, /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/);
    assert.equal(JSON.stringify(details).includes(credentials.DEVFLUX_UPLOAD_STORE_PASSWORD), false);
    const original = fs.readFileSync(credentials.DEVFLUX_UPLOAD_STORE_FILE);
    assert.throws(() => createSigning(directory), /refusing to replace/);
    assert.deepEqual(fs.readFileSync(credentials.DEVFLUX_UPLOAD_STORE_FILE), original);
    assert.deepEqual(publicDetails(directory), details);
    const result = spawnSync('keytool', ['-list', '-keystore', credentials.DEVFLUX_UPLOAD_STORE_FILE,
      '-alias', credentials.DEVFLUX_UPLOAD_KEY_ALIAS, '-storepass:env', 'TEST_STORE_PASSWORD'], {
      env: { ...process.env, TEST_STORE_PASSWORD: credentials.DEVFLUX_UPLOAD_STORE_PASSWORD }, encoding: 'utf8',
    });
    assert.equal(result.status, 0);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
      for (const file of ['credentials.json', 'upload-keystore.p12']) {
        assert.equal(fs.statSync(path.join(directory, file)).mode & 0o777, 0o600);
      }
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
