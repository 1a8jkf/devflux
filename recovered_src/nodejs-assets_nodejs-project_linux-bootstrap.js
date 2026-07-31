const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Fix Node on Android lacking root CA certs

// Define paths
const rootDir = __dirname;
const linuxDir = path.join(rootDir, 'ubuntu-rootfs');
// On Android, native libraries are extracted to the app's 'lib' directory with execute permissions!
const prootPath = path.join(rootDir, 'proot');
const tarballPath = path.join(rootDir, 'ubuntu.bin');

// process.env.PROOT_LOADER = path.join(rootDir, 'loader');
// process.env.PROOT_LOADER_32 = path.join(rootDir, 'loader32');

const tmpDir = path.join(rootDir, 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
process.env.PROOT_TMPDIR = tmpDir;

try {
  fs.chmodSync(process.env.PROOT_LOADER, 0o755);
  fs.chmodSync(process.env.PROOT_LOADER_32, 0o755);
  fs.chmodSync(prootPath, 0o755);
} catch (e) {}

const ALPINE_URL = 'https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/aarch64/alpine-minirootfs-3.20.2-aarch64.tar.gz';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
         response.resume(); // free memory
         return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
         response.resume();
         return reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
      }
      
      const file = fs.createWriteStream(dest);
      file.on('error', (err) => {
         fs.unlink(dest, () => {});
         reject(err);
      });
      
      response.on('error', (err) => {
         fs.unlink(dest, () => {});
         reject(err);
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        resolve(); // autoClose does the closing
      });
    }).on('error', (err) => {
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function bootstrapLinux(onProgress) {
  try {
    // Validate alpine rootfs integrity
    if (fs.existsSync(linuxDir)) {
      if (!fs.existsSync(path.join(linuxDir, 'bin', 'sh'))) {
        fs.rmSync(linuxDir, { recursive: true, force: true });
      }
    }

    if (fs.existsSync(linuxDir)) {
       return { success: true, path: linuxDir };
    }

    onProgress('⏳ Setting up Alpine Linux environment...\r\n');

    // Download proot

    if (!fs.existsSync(prootPath)) {
      onProgress('📥 Downloading proot binary...\r\n');
      await downloadFile(PROOT_URL, prootPath);
      fs.chmodSync(prootPath, 0o755); // Make executable
    }

    // Download Alpine rootfs
    if (!fs.existsSync(linuxDir)) {
      if (!fs.existsSync(tarballPath)) {
        onProgress('📥 Downloading Alpine Linux (arm64)...\r\n');
        await downloadFile(ALPINE_URL, tarballPath);
      } else {
        onProgress('📦 Using bundled Alpine Linux...\r\n');
      }
      
      onProgress('📦 Extracting Alpine filesystem...\r\n');
      fs.mkdirSync(linuxDir, { recursive: true });
      // Use Android's native tar to extract
      execSync(`tar -xzf "${tarballPath}" -C "${linuxDir}"`);
      fs.unlinkSync(tarballPath);

      // Fix DNS resolution
      onProgress('🔧 Configuring network and permissions...\r\n');
      const resolvConf = path.join(linuxDir, 'etc', 'resolv.conf');
      fs.writeFileSync(resolvConf, 'nameserver 8.8.8.8\nnameserver 1.1.1.1\n');
    }

    onProgress('✅ Ubuntu environment ready!\r\n');
    return { success: true, path: linuxDir, proot: prootPath };
  } catch (e) {
    onProgress(`❌ Error bootstrapping Linux: ${e.message}\r\n`);
    return { success: false, error: e.message };
  }
}

module.exports = { bootstrapLinux, linuxDir, prootPath };