const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, exec } = require('child_process');

const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false });

// Define paths
const rootDir = __dirname;
// IMPORTANT: Use DATADIR to prevent nodejs-mobile from wiping PRoot when app restarts
function getLinuxDir() {
  return process.env.DATADIR ? path.join(process.env.DATADIR, 'ubuntu-rootfs') : path.join(rootDir, 'ubuntu-rootfs');
}
// On Android, native libraries are extracted to the app's 'lib' directory with execute permissions!
function getProotPath() {
  if (process.env.APP_NATIVE_LIB_DIR) {
    const libproot = path.join(process.env.APP_NATIVE_LIB_DIR, 'libproot.so');
    if (fs.existsSync(libproot)) return libproot;
  }
  return path.join(rootDir, 'proot');
}
const tarballPath = path.join(rootDir, 'ubuntu.bin');

function pathExists(p) {
  try { fs.lstatSync(p); return true; } catch(e) { return false; }
}

// process.env.PROOT_LOADER = path.join(rootDir, 'loader');
// process.env.PROOT_LOADER_32 = path.join(rootDir, 'loader32');

const tmpDir = path.join(rootDir, 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
process.env.PROOT_TMPDIR = tmpDir;

try {
  fs.chmodSync(process.env.PROOT_LOADER, 0o755);
  fs.chmodSync(process.env.PROOT_LOADER_32, 0o755);
  fs.chmodSync(getProotPath(), 0o755);
} catch (e) {}

const ALPINE_URL = 'https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/aarch64/alpine-minirootfs-3.20.2-aarch64.tar.gz';

/**
 * Check if Alpine Linux rootfs is already installed and valid.
 * Returns true if the rootfs directory exists and contains /bin/sh.
 */
function isLinuxInstalled() {
  try {
    const linuxDir = getLinuxDir();
    // We check BOTH etc/os-release and bin/sh.
    // We use pathExists (lstatSync) to ensure broken absolute symlinks (like a natively extracted /bin/sh -> /bin/busybox) are also detected.
    return pathExists(linuxDir) && pathExists(path.join(linuxDir, 'etc', 'os-release')) && pathExists(path.join(linuxDir, 'bin', 'sh'));
  } catch (e) {
    return false;
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { agent: insecureHttpsAgent }, (response) => {
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

async function bootstrapLinux(onProgress, allowInstall = false) {
  try {
    // Validate alpine rootfs integrity
    const linuxDir = getLinuxDir();
    if (pathExists(linuxDir)) {
      if (!pathExists(path.join(linuxDir, 'etc', 'os-release')) || !pathExists(path.join(linuxDir, 'bin', 'sh'))) {
        if (!allowInstall) {
           return { success: false, error: 'O Alpine Linux está corrompido. Instale-o no painel Configurações ou faça o Setup Inicial.' };
        }
        onProgress('Rootfs is corrupted. Backing up and reinstalling...\r\n');
        try {
          const backupPath = linuxDir + '_backup_' + Date.now();
          fs.renameSync(linuxDir, backupPath);
          onProgress(`Corrupted rootfs backed up to ${path.basename(backupPath)}\r\n`);
        } catch (e) {
          onProgress('Failed to backup rootfs. Removing it...\r\n');
          fs.rmSync(linuxDir, { recursive: true, force: true });
        }
      }
    }

    // Already installed — return immediately (offline-first: no network needed)
    if (isLinuxInstalled()) {
       return { success: true, path: getLinuxDir(), proot: getProotPath() };
    }

    if (!allowInstall) {
       return { success: false, error: 'O Alpine Linux não está instalado. Conclua o Setup Inicial na tela inicial do DevFlux.' };
    }

    onProgress('Setting up Alpine Linux environment...\r\n');

    // OFFLINE-FIRST: Use bundled tarball (ubuntu.bin) shipped inside the APK
    if (fs.existsSync(tarballPath)) {
      onProgress('Extracting Alpine Linux from bundled package (offline)...\r\n');
    } else {
      // FALLBACK ONLY: Download if bundled tarball is somehow missing
      onProgress('Bundled tarball was not found. Downloading Alpine Linux (arm64)...\r\n');
      onProgress('Internet connection is required for this step.\r\n');
      await downloadFile(ALPINE_URL, tarballPath);
      onProgress('Download complete.\r\n');
    }
    
    onProgress('Extracting Alpine filesystem (this may take a minute)...\r\n');
    fs.mkdirSync(getLinuxDir(), { recursive: true });
    // IMPORTANT: Extract the tarball UNDER PRoot with --link2symlink!
    // This ensures all symlinks in the Alpine rootfs (like /bin/sh) are created as fake symlinks (!<symlink> files)
    // instead of real Android symlinks, which PRoot would fail to resolve later.
    const extractCmd = `"${getProotPath()}" --link2symlink -0 -r / -b /dev -b /proc -b /sys -w "${getLinuxDir()}" tar -xzf "${tarballPath}"`;
    try {
      await new Promise((resolve, reject) => {
        exec(extractCmd, { timeout: 45000 }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    } catch (err) {
      onProgress('Extraction failed via PRoot. Falling back to native tar...\r\n');
      await new Promise((resolve, reject) => {
        exec(`tar -xzf "${tarballPath}" -C "${getLinuxDir()}"`, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    // Fix DNS resolution
    onProgress('\r\nConfiguring DNS...\r\n');
    const resolvConf = path.join(getLinuxDir(), 'etc', 'resolv.conf');
    fs.writeFileSync(resolvConf, 'nameserver 8.8.8.8\nnameserver 1.1.1.1\n');

    onProgress('\r\nAlpine Linux installed successfully.\r\n');
    return { success: true, path: getLinuxDir(), proot: getProotPath() };
  } catch (e) {
    onProgress(`Error bootstrapping Linux: ${e.message}\r\n`);
    return { success: false, error: e.message };
  }
}

module.exports = { bootstrapLinux, isLinuxInstalled, getLinuxDir, getProotPath };