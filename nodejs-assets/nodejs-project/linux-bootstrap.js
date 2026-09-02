/**
 * linux-bootstrap.js
 * 
 * Responsavel por preparar o rootfs do Alpine Linux para uso com proot.
 * - Verifica se ja existe um rootfs extraido (cache)
 * - Se nao existir, baixa o minirootfs do Alpine e extrai
 * - Configura DNS, repositorios e permissoes basicas
 * 
 * Retorna: { success: true, path: string } ou { success: false, error: string }
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

// Alpine minirootfs URL (aarch64 para Android)
const ALPINE_VERSION = '3.20';
const ALPINE_RELEASE = '3.20.1';
const ALPINE_ARCH = 'aarch64';

// Fallback mirrors
const FALLBACK_URLS = [
  `https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VERSION}/releases/${ALPINE_ARCH}/alpine-minirootfs-${ALPINE_RELEASE}-${ALPINE_ARCH}.tar.gz`,
  `https://mirror.leaseweb.com/alpine/v${ALPINE_VERSION}/releases/${ALPINE_ARCH}/alpine-minirootfs-${ALPINE_RELEASE}-${ALPINE_ARCH}.tar.gz`,
  `https://alpine.mirror.wearetriple.com/v${ALPINE_VERSION}/releases/${ALPINE_ARCH}/alpine-minirootfs-${ALPINE_RELEASE}-${ALPINE_ARCH}.tar.gz`,
];

/**
 * Diretorio base onde o rootfs e armazenado.
 */
function getRootfsDir() {
  return path.join(__dirname, 'alpine-rootfs');
}

function getTarballPath() {
  return path.join(__dirname, 'alpine-rootfs.tar.gz');
}

/**
 * Verifica se o rootfs ja esta bootstrapped (existencia de /bin/sh)
 */
function isBootstrapped() {
  const rootfs = getRootfsDir();
  try {
    return fs.existsSync(path.join(rootfs, 'bin', 'sh'));
  } catch (e) {
    return false;
  }
}

/**
 * Download de arquivo com suporte a redirect e progresso
 */
function downloadFile(url, destPath, onProgress, attempt) {
  attempt = attempt || 0;
  return new Promise(function(resolve, reject) {
    onProgress('\u{1F4E5} Baixando Alpine Linux rootfs...\r\n');
    onProgress('   URL: ' + url + '\r\n');

    var protocol = url.startsWith('https') ? https : http;

    var request = protocol.get(url, { 
      headers: { 'User-Agent': 'DevFlux/1.0' },
      timeout: 30000 
    }, function(response) {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        onProgress('   \u21AA Redirecionando...\r\n');
        downloadFile(response.headers.location, destPath, onProgress, attempt)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error('HTTP ' + response.statusCode + ': Falha ao baixar rootfs'));
        return;
      }

      var totalSize = parseInt(response.headers['content-length'] || '0', 10);
      var downloadedSize = 0;
      var lastProgressPct = -1;

      var fileStream = fs.createWriteStream(destPath);

      response.on('data', function(chunk) {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          var pct = Math.floor((downloadedSize / totalSize) * 100);
          if (pct !== lastProgressPct && pct % 10 === 0) {
            lastProgressPct = pct;
            var mb = (downloadedSize / (1024 * 1024)).toFixed(1);
            var totalMb = (totalSize / (1024 * 1024)).toFixed(1);
            onProgress('   \u{1F4E6} ' + mb + 'MB / ' + totalMb + 'MB (' + pct + '%)\r\n');
          }
        }
      });

      response.pipe(fileStream);

      fileStream.on('finish', function() {
        fileStream.close();
        onProgress('   \u2705 Download concluido!\r\n');
        resolve();
      });

      fileStream.on('error', function(err) {
        try { fs.unlinkSync(destPath); } catch(e2) {}
        reject(err);
      });
    });

    request.on('error', function(err) {
      reject(err);
    });

    request.on('timeout', function() {
      request.destroy();
      reject(new Error('Timeout ao baixar rootfs'));
    });
  });
}

/**
 * Extrai o tarball usando tar do sistema
 */
function extractTarball(tarPath, destDir, onProgress) {
  return new Promise(function(resolve, reject) {
    onProgress('\u{1F4C2} Extraindo rootfs...\r\n');

    try {
      fs.mkdirSync(destDir, { recursive: true });
    } catch (e) {
      // Ignora se ja existe
    }

    var proc = spawn('tar', ['xzf', tarPath, '-C', destDir], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    var stderr = '';

    proc.stderr.on('data', function(d) {
      stderr += d.toString();
    });

    proc.on('error', function(err) {
      onProgress('   \u26A0\uFE0F tar nativo falhou, tentando busybox...\r\n');
      
      var busybox = spawn('busybox', ['tar', 'xzf', tarPath, '-C', destDir], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      busybox.on('error', function() {
        reject(new Error('Nao foi possivel extrair o rootfs: tar e busybox nao disponiveis. ' + err.message));
      });

      busybox.on('close', function(code) {
        if (code === 0) {
          onProgress('   \u2705 Extracao concluida (busybox)!\r\n');
          resolve();
        } else {
          reject(new Error('busybox tar falhou com codigo ' + code));
        }
      });
    });

    proc.on('close', function(code) {
      if (code === 0) {
        onProgress('   \u2705 Extracao concluida!\r\n');
        resolve();
      } else {
        reject(new Error('tar falhou com codigo ' + code + ': ' + stderr));
      }
    });
  });
}

/**
 * Configura o rootfs depois de extraido
 */
function configureRootfs(rootfsPath, onProgress) {
  onProgress('\u2699\uFE0F Configurando ambiente...\r\n');

  try {
    var dirs = ['root', 'tmp', 'proc', 'sys', 'dev', 'etc', 'var/cache/apk'];
    for (var i = 0; i < dirs.length; i++) {
      var fullPath = path.join(rootfsPath, dirs[i]);
      try { fs.mkdirSync(fullPath, { recursive: true }); } catch(e) {}
    }

    // DNS
    var resolvConf = path.join(rootfsPath, 'etc', 'resolv.conf');
    fs.writeFileSync(resolvConf, 'nameserver 8.8.8.8\nnameserver 8.8.4.4\nnameserver 1.1.1.1\n');
    onProgress('   \u2705 DNS configurado\r\n');

    // Repositorios APK
    var repoDir = path.join(rootfsPath, 'etc', 'apk');
    try { fs.mkdirSync(repoDir, { recursive: true }); } catch(e) {}
    var repositories = path.join(repoDir, 'repositories');
    fs.writeFileSync(repositories, 
      'https://dl-cdn.alpinelinux.org/alpine/v' + ALPINE_VERSION + '/main\n' +
      'https://dl-cdn.alpinelinux.org/alpine/v' + ALPINE_VERSION + '/community\n'
    );
    onProgress('   \u2705 Repositorios APK configurados\r\n');

    // Profile para root
    var profile = path.join(rootfsPath, 'root', '.profile');
    fs.writeFileSync(profile, [
      'export HOME=/root',
      'export TERM=xterm-256color',
      'export LANG=C.UTF-8',
      "export PS1='[\\u@devflux \\W]\\$ '",
      'export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      'cd ~',
      ''
    ].join('\n'));
    onProgress('   \u2705 Profile configurado\r\n');

    // Hostname
    fs.writeFileSync(path.join(rootfsPath, 'etc', 'hostname'), 'devflux\n');

    // Hosts
    fs.writeFileSync(path.join(rootfsPath, 'etc', 'hosts'), '127.0.0.1 localhost devflux\n::1 localhost devflux\n');
    onProgress('   \u2705 Hostname configurado\r\n');

    onProgress('\r\n\u{1F389} Alpine Linux esta pronto!\r\n');
    return true;
  } catch (err) {
    onProgress('   \u274C Erro na configuracao: ' + err.message + '\r\n');
    return false;
  }
}

/**
 * Funcao principal de bootstrap.
 * 
 * @param {Function} onProgress - Callback para reportar progresso
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
async function bootstrapLinux(onProgress) {
  if (typeof onProgress !== 'function') {
    onProgress = function(msg) { console.log('[bootstrap]', msg); };
  }

  var rootfsDir = getRootfsDir();
  var tarballPath = getTarballPath();

  try {
    // 1. Verificar se ja existe rootfs bootstrapped
    if (isBootstrapped()) {
      onProgress('\u2705 Alpine Linux ja esta instalado.\r\n');
      return { success: true, path: rootfsDir };
    }

    onProgress('\u{1F427} Iniciando bootstrap do Alpine Linux...\r\n\r\n');

    // 2. Verificar se o tarball ja existe
    var needsDownload = true;
    if (fs.existsSync(tarballPath)) {
      var stats = fs.statSync(tarballPath);
      if (stats.size > 1024 * 1024) {
        onProgress('\u{1F4E6} Tarball existente encontrado (' + (stats.size / (1024 * 1024)).toFixed(1) + 'MB), tentando extrair...\r\n');
        needsDownload = false;
      } else {
        try { fs.unlinkSync(tarballPath); } catch(e) {}
      }
    }

    // 3. Download do rootfs
    if (needsDownload) {
      var downloaded = false;
      var lastError = null;

      for (var i = 0; i < FALLBACK_URLS.length; i++) {
        try {
          await downloadFile(FALLBACK_URLS[i], tarballPath, onProgress);
          downloaded = true;
          break;
        } catch (err) {
          lastError = err;
          onProgress('   \u26A0\uFE0F Mirror ' + (i + 1) + ' falhou: ' + err.message + '\r\n');
          if (i < FALLBACK_URLS.length - 1) {
            onProgress('   \u{1F504} Tentando proximo mirror...\r\n');
          }
        }
      }

      if (!downloaded) {
        return { 
          success: false, 
          error: 'Falha ao baixar rootfs de todos os mirrors: ' + (lastError ? lastError.message : 'Erro desconhecido')
        };
      }
    }

    // 4. Limpar rootfs anterior se existir
    if (fs.existsSync(rootfsDir)) {
      onProgress('\u{1F5D1}\uFE0F Removendo rootfs anterior incompleto...\r\n');
      try {
        fs.rmSync(rootfsDir, { recursive: true, force: true });
      } catch (e) {
        try {
          var rimraf = function(dir) {
            if (fs.existsSync(dir)) {
              fs.readdirSync(dir).forEach(function(file) {
                var curPath = path.join(dir, file);
                if (fs.lstatSync(curPath).isDirectory()) {
                  rimraf(curPath);
                } else {
                  fs.unlinkSync(curPath);
                }
              });
              fs.rmdirSync(dir);
            }
          };
          rimraf(rootfsDir);
        } catch(e2) {}
      }
    }

    // 5. Extrair
    try {
      await extractTarball(tarballPath, rootfsDir, onProgress);
    } catch (err) {
      return { 
        success: false, 
        error: 'Falha ao extrair rootfs: ' + err.message
      };
    }

    // 6. Configurar
    var configOk = configureRootfs(rootfsDir, onProgress);
    if (!configOk) {
      return { 
        success: false, 
        error: 'Falha na configuracao do rootfs'
      };
    }

    // 7. Limpar tarball para economizar espaco
    try { fs.unlinkSync(tarballPath); } catch(e) {}

    // 8. Verificacao final
    if (!isBootstrapped()) {
      return { 
        success: false, 
        error: 'Rootfs extraido mas /bin/sh nao encontrado. O download pode estar corrompido.'
      };
    }

    return { success: true, path: rootfsDir };

  } catch (err) {
    onProgress('\r\n\u274C Erro fatal no bootstrap: ' + err.message + '\r\n');
    return { 
      success: false, 
      error: err.message 
    };
  }
}

module.exports = { bootstrapLinux };
