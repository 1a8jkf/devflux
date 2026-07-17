const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Fix Node on Android lacking root CA certs

// Define paths
const rootDir = process.cwd();
const linuxDir = path.join(rootDir, 'ubuntu-rootfs');
const prootPath = path.join(rootDir, 'proot');
const tarballPath = path.join(rootDir, 'ubuntu.tar.gz');

const PROOT_URL = 'https://github.com/proot-me/proot/releases/download/v5.4.0/proot-v5.4.0-aarch64-static';
const ALPINE_URL = 'https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/aarch64/alpine-minirootfs-3.20.2-aarch64.tar.gz';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
         return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
         return reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function bootstrapLinux(onProgress) {
  try {
    if (fs.existsSync(linuxDir) && fs.existsSync(prootPath)) {
       return { success: true, path: linuxDir, proot: prootPath };
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
      onProgress('📥 Downloading Alpine Linux (arm64)...\r\n');
      await downloadFile(ALPINE_URL, tarballPath);
      
      onProgress('📦 Extracting Alpine filesystem...\r\n');
      fs.mkdirSync(linuxDir, { recursive: true });
      // Use Android's native tar to extract
      execSync(`tar -xzf "${tarballPath}" -C "${linuxDir}"`);
      fs.unlinkSync(tarballPath);

      // Fix DNS resolution
      onProgress('🔧 Configuring network and permissions...\r\n');
      const resolvConf = path.join(linuxDir, 'etc', 'resolv.conf');
      fs.writeFileSync(resolvConf, 'nameserver 8.8.8.8\nnameserver 1.1.1.1\n');
      
      onProgress('✅ Alpine installation complete!\r\n');
    }

    return { success: true, path: linuxDir, proot: prootPath };
  } catch (err) {
    onProgress(`\r\n❌ ERROR in bootstrap: ${err.message}\r\n`);
    return { success: false, error: err.message };
  }
}

module.exports = { bootstrapLinux, linuxDir, prootPath };
