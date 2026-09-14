const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, X509Certificate } = require('node:crypto');
const { spawnSync } = require('node:child_process');

function signingDirectory() {
  return process.env.DEVFLUX_SIGNING_DIR || path.join(os.homedir(), '.config/devflux/signing/com.marcos.devflux');
}

function publicDetails(directory) {
  const certificate = new X509Certificate(fs.readFileSync(path.join(directory, 'upload-certificate.pem')));
  return { directory, alias: 'devflux-upload', sha256: certificate.fingerprint256, expires: certificate.validTo };
}

function createSigning(directory = signingDirectory()) {
  const store = path.join(directory, 'upload-keystore.p12');
  const config = path.join(directory, 'credentials.json');
  const certificate = path.join(directory, 'upload-certificate.pem');
  for (const file of [store, config, certificate]) {
    if (fs.existsSync(file)) throw new Error('Signing files already exist; refusing to replace any key or credentials.');
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const password = randomBytes(32).toString('base64url');
  const env = { ...process.env, DEVFLUX_NEW_KEY_PASSWORD: password };
  const run = args => {
    const result = spawnSync('keytool', args, { env, encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error('keytool failed; no existing signing files were replaced. Inspect the private directory before retrying.');
  };
  run(['-genkeypair', '-keystore', store, '-storetype', 'PKCS12', '-alias', 'devflux-upload',
    '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=DevFlux Upload',
    '-storepass:env', 'DEVFLUX_NEW_KEY_PASSWORD', '-keypass:env', 'DEVFLUX_NEW_KEY_PASSWORD']);
  fs.chmodSync(store, 0o600);
  // Save credentials immediately after key generation so an export failure cannot orphan the key.
  fs.writeFileSync(config, JSON.stringify({
    DEVFLUX_UPLOAD_STORE_FILE: store,
    DEVFLUX_UPLOAD_STORE_PASSWORD: password,
    DEVFLUX_UPLOAD_KEY_ALIAS: 'devflux-upload',
    DEVFLUX_UPLOAD_KEY_PASSWORD: password,
  }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  run(['-exportcert', '-rfc', '-keystore', store, '-alias', 'devflux-upload', '-file', certificate,
    '-storepass:env', 'DEVFLUX_NEW_KEY_PASSWORD']);
  return publicDetails(directory);
}

module.exports = { createSigning, publicDetails, signingDirectory };
if (require.main === module) {
  try {
    console.log(JSON.stringify(process.argv.includes('--create') ? createSigning() : publicDetails(signingDirectory()), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
