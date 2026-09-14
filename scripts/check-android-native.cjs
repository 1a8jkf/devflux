const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');

function inspectElf(data) {
  if (data.length < 52 || data.subarray(0, 4).toString('hex') !== '7f454c46') throw new Error('Invalid ELF header');
  const is64 = data[4] === 2;
  if (![1, 2].includes(data[4]) || data[5] !== 1) throw new Error('Unsupported ELF class/byte order');
  if (is64 && data.length < 64) throw new Error('Truncated ELF64 header');
  const number64 = offset => {
    const value = data.readBigUInt64LE(offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('ELF value exceeds safe integer range');
    return Number(value);
  };
  const start = is64 ? number64(32) : data.readUInt32LE(28);
  const entrySize = data.readUInt16LE(is64 ? 54 : 42);
  const count = data.readUInt16LE(is64 ? 56 : 44);
  if (!count || entrySize < (is64 ? 56 : 32) || start + count * entrySize > data.length) throw new Error('Invalid ELF program headers');
  const segments = [];
  for (let index = 0; index < count; index++) {
    const entry = start + index * entrySize;
    if (data.readUInt32LE(entry) !== 1) continue;
    const offset = is64 ? number64(entry + 8) : data.readUInt32LE(entry + 4);
    const address = is64 ? number64(entry + 16) : data.readUInt32LE(entry + 8);
    const alignment = is64 ? number64(entry + 48) : data.readUInt32LE(entry + 28);
    segments.push({ offset, address, alignment });
  }
  return {
    bits: is64 ? 64 : 32,
    machine: data.readUInt16LE(18),
    segments,
    compatible: segments.length > 0 && segments.every(segment =>
      segment.alignment >= 16384 && (segment.address - segment.offset) % 16384 === 0),
  };
}

async function inspectPath(target) {
  if (fs.statSync(target).isDirectory()) {
    const files = fs.readdirSync(target, { withFileTypes: true });
    const result = [];
    for (const file of files) {
      if (file.isDirectory() || /\.so(?:\.\d+)*$/.test(file.name)) result.push(...await inspectPath(path.join(target, file.name)));
    }
    return result;
  }
  if (/\.(aab|apk)$/.test(target)) {
    const zip = await JSZip.loadAsync(fs.readFileSync(target));
    const result = [];
    for (const file of Object.values(zip.files)) {
      if (!file.dir && /(?:^|\/)lib\/(?:arm64-v8a|x86_64)\/[^/]+\.so$/.test(file.name)) {
        result.push({ file: file.name, ...inspectElf(await file.async('nodebuffer')) });
      }
    }
    if (!result.length) throw new Error('No 64-bit native libraries found in the artifact');
    return result;
  }
  return [{ file: target, ...inspectElf(fs.readFileSync(target)) }];
}

async function main() {
  const strict = process.argv.includes('--strict');
  const targets = process.argv.slice(2).filter(argument => argument !== '--strict');
  if (!targets.length) throw new Error('Usage: node scripts/check-android-native.cjs <AAB|APK|ELF|directory> [...]');
  const results = [];
  for (const target of targets) results.push(...await inspectPath(path.resolve(target)));
  if (!results.length) throw new Error('No ELF binaries found');
  const incompatible = results.filter(result => !result.compatible);
  console.log(JSON.stringify({ checked: results.length, incompatible: incompatible.length, results }, null, 2));
  if (incompatible.length) {
    if (strict) process.exitCode = 1;
    else console.warn('Incompatible libraries found but ignoring exit code; use --strict for a release gate');
  }
}

module.exports = { inspectElf, inspectPath };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
