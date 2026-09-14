/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { inspectElf } = require('./check-android-native.cjs');

const revision = 'd9552e0e01ed5bdbe12a31d1ce6c0877a4f39580';
const archiveHash = 'e27d6aad2551b47d81fff65fa7027358435fd7a9761869a302baabf4b84b2983';
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const cacheFor = root => path.join(root, 'dist/native-node');

function applyLibrary(root) {
  const cache = cacheFor(root);
  const artifact = path.join(cache, 'arm64-v8a/libnode.so');
  const metadata = JSON.parse(fs.readFileSync(path.join(cache, 'build.json'), 'utf8'));
  const elf = inspectElf(fs.readFileSync(artifact));
  if (metadata.revision !== revision || metadata.sha256 !== digest(artifact) || !elf.compatible || elf.machine !== 183 || elf.bits !== 64) {
    throw new Error('Node Mobile artifact failed provenance, ARM64 or 16 KB validation.');
  }
  const target = path.join(root, 'node_modules/nodejs-mobile-react-native/android/libnode/bin/arm64-v8a/libnode.so');
  if (!fs.existsSync(target) || digest(target) !== metadata.sha256) fs.copyFileSync(artifact, target);
  return metadata;
}

function build(root = path.resolve(__dirname, '..')) {
  const cache = cacheFor(root);
  fs.mkdirSync(cache, { recursive: true });
  const log = path.join(cache, 'build.log');
  const fd = fs.openSync(log, 'a');
  const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, { cwd: cache, stdio: ['ignore', fd, fd], ...options });
    if (result.error || result.status !== 0) throw new Error(command + ' failed. See ' + log);
  };
  try {
    const archive = path.join(cache, 'node-d9552e0.tar.gz');
    if (!fs.existsSync(archive)) run('curl', ['--fail', '--location', '--retry', '3',
      'https://codeload.github.com/nodejs-mobile/nodejs-mobile/tar.gz/' + revision, '--output', archive]);
    if (digest(archive) !== archiveHash) throw new Error('Node source archive checksum mismatch.');
    const source = path.join(cache, 'nodejs-mobile-' + revision);
    if (!fs.existsSync(source)) run('tar', ['-xf', archive, '-C', cache]);
    const python = process.env.DEVFLUX_BUILD_PYTHON || path.join(cache, 'toolchains/Python-3.11.9/python');
    run(python, ['-c', 'import sys, zlib, bz2; assert (3, 6) <= sys.version_info[:2] <= (3, 11); print(sys.version, zlib.ZLIB_RUNTIME_VERSION)']);
    const bin = path.join(cache, 'toolchains/bin');
    fs.mkdirSync(bin, { recursive: true });
    for (const name of ['python', 'python3', 'python3.11']) {
      const link = path.join(bin, name);
      if (!fs.existsSync(link)) fs.symlinkSync(python, link);
      if (fs.realpathSync(link) !== fs.realpathSync(python)) throw new Error('Python toolchain link points to a different runtime.');
    }
    const ndk = process.env.DEVFLUX_NODE_NDK || path.join(os.homedir(), 'Android/Sdk/ndk/24.0.8215888');
    if (!/^Pkg.Revision\s*=\s*24\.0\.8215888\s*$/m.test(fs.readFileSync(path.join(ndk, 'source.properties'), 'utf8'))) {
      throw new Error('Use NDK 24.0.8215888, matching the upstream Node Mobile build.');
    }
    const toolchain = path.join(ndk, 'toolchains/llvm/prebuilt/linux-x86_64/bin');
    const ldflags = '-Wl,-z,max-page-size=16384';
    const env = { ...process.env, PATH: bin + ':' + process.env.PATH, LDFLAGS: ldflags, PYTHON: python };
    console.log('Building official Node Mobile ' + revision + '. Log: ' + log);
    run('./android-configure', [ndk, '24', 'arm64'], { cwd: source, env });
    if (!fs.existsSync(path.join(source, 'config.gypi'))) throw new Error('Node configure did not produce config.gypi.');
    run('make', ['-j' + (process.env.DEVFLUX_NATIVE_JOBS || '2')], { cwd: source, env });
    const built = ['out/Release/lib.target/libnode.so', 'out/Release/obj.target/libnode.so']
      .map(file => path.join(source, file)).find(file => fs.existsSync(file));
    if (!built) throw new Error('Node shared library missing after build.');
    const directory = path.join(cache, 'arm64-v8a');
    fs.mkdirSync(directory, { recursive: true });
    const artifact = path.join(directory, 'libnode.so');
    fs.copyFileSync(built, artifact);
    run(path.join(toolchain, 'llvm-strip'), ['--strip-unneeded', artifact]);
    const elf = inspectElf(fs.readFileSync(artifact));
    if (!elf.compatible || elf.machine !== 183) throw new Error('Built Node library is not ARM64 / 16 KB compatible.');
    const metadata = { revision, archiveHash, ndk: '24.0.8215888', api: 24, ldflags, sha256: digest(artifact), builtAt: new Date().toISOString() };
    fs.writeFileSync(path.join(cache, 'build.json'), JSON.stringify(metadata, null, 2) + '\n');
    console.log(JSON.stringify(applyLibrary(root), null, 2));
  } finally { fs.closeSync(fd); }
}

module.exports = { applyLibrary, build };
if (require.main === module) {
  try { build(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
