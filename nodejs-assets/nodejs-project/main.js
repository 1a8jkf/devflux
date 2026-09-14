const rn_bridge = require('rn-bridge');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { bootstrapLinux, isLinuxInstalled, getLinuxDir } = require('./linux-bootstrap');
const { scriptArguments, terminalSize, writePtyInput } = require('./pty-session');

let ptyProcesses = {};
const ptyTerminals = {};
let ptyToolsPromise = null;
const npmOperations = new Map();
let ptyOutputBuffers = {};
let ptySilentStops = {};
let bannerShown = false;

const PTY_BUFFER_LIMIT = 60000;

function appendPtyBuffer(sessionId, payload) {
  const sid = sessionId || 'default';
  const next = String(ptyOutputBuffers[sid] || '') + String(payload || '');
  ptyOutputBuffers[sid] = next.length > PTY_BUFFER_LIMIT ? next.slice(next.length - PTY_BUFFER_LIMIT) : next;
}

function sendPtyOutput(sessionId, payload) {
  appendPtyBuffer(sessionId, payload);
  rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId, payload }));
}

function stopPtySession(sessionId, options = {}) {
  const sid = sessionId || 'default';
  if (ptyProcesses[sid]) {
    if (options.silent) ptySilentStops[sid] = true;
    try { ptyProcesses[sid].kill(); } catch (e) {}
    delete ptyProcesses[sid];
  }
  delete ptyTerminals[sid];
  if (options.clearBuffer !== false) delete ptyOutputBuffers[sid];
}

const SSH_RESULT_TYPES = {
  LINUX_SSH_LIST: 'LINUX_SSH_LIST_RESULT',
  LINUX_SSH_UPLOAD: 'LINUX_SSH_UPLOAD_RESULT',
  LINUX_SSH_DOWNLOAD: 'LINUX_SSH_DOWNLOAD_RESULT',
};

function normalizeHostPath(value) {
  return String(value || '').replace(/^file:\/\//, '').replace(/\/+$/, '');
}

function shellQuote(value) {
  return "'" + String(value ?? '').replace(/'/g, "'\\''") + "'";
}

function getProotEnv(appLibDir, extraEnv = {}) {
  return {
    ...process.env,
    ...extraEnv,
    LD_LIBRARY_PATH: __dirname,
    PROOT_NO_SECCOMP: '1',
    PROOT_TMP_DIR: path.join(__dirname, 'tmp'),
    PROOT_LOADER: path.join(appLibDir, 'libproot-loader.so'),
    PROOT_LOADER_32: path.join(appLibDir, 'libproot-loader32.so'),
    HOME: '/root',
    PATH: '/root/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    NPM_CONFIG_PREFIX: '/root/.npm-global',
    npm_config_prefix: '/root/.npm-global',
    TERM: 'xterm-256color',
  };
}


function ensureAlpineRepositories(rootfsPath) {
  const etcApkDir = path.join(rootfsPath, 'etc', 'apk');
  const repositoriesPath = path.join(etcApkDir, 'repositories');
  const repositories = [
    'https://dl-cdn.alpinelinux.org/alpine/v3.20/main',
    'https://dl-cdn.alpinelinux.org/alpine/v3.20/community',
  ].join('\n') + '\n';

  try {
    if (!rootfsPath || !fs.existsSync(rootfsPath)) return;
    fs.mkdirSync(etcApkDir, { recursive: true });
    const current = fs.existsSync(repositoriesPath) ? fs.readFileSync(repositoriesPath, 'utf8') : '';
    if (!current.includes('/v3.20/main') || !current.includes('/v3.20/community')) {
      fs.writeFileSync(repositoriesPath, repositories, 'utf8');
    }
    // Always refresh DNS — Android PRoot loses resolv.conf between sessions
    const resolvConf = path.join(rootfsPath, 'etc', 'resolv.conf');
    const dnsContent = 'nameserver 8.8.8.8\nnameserver 1.1.1.1\n';
    try { fs.writeFileSync(resolvConf, dnsContent, 'utf8'); } catch (e) {}
  } catch (e) {
    console.warn('[DevFlux] Could not update Alpine repositories:', e.message);
  }
}

function ensureNodeTooling(rootfsPath) {
  try {
    if (!rootfsPath || !fs.existsSync(rootfsPath)) return;

    const localBinDir = path.join(rootfsPath, 'usr', 'local', 'bin');
    const rootDir = path.join(rootfsPath, 'root');
    const npmGlobalDir = path.join(rootDir, '.npm-global', 'bin');
    const profileDir = path.join(rootfsPath, 'etc', 'profile.d');
    fs.mkdirSync(localBinDir, { recursive: true });
    fs.mkdirSync(rootDir, { recursive: true });
    fs.mkdirSync(npmGlobalDir, { recursive: true });
    fs.mkdirSync(profileDir, { recursive: true });

    const npmrcPath = path.join(rootDir, '.npmrc');
    const npmrc = [
      'prefix=/root/.npm-global',
      'fund=false',
      'audit=false',
      'update-notifier=false',
      '',
    ].join('\n');
    fs.writeFileSync(npmrcPath, npmrc);

    const envProfile = [
      'export HOME=/root',
      'export NPM_CONFIG_PREFIX=/root/.npm-global',
      'export npm_config_prefix=/root/.npm-global',
      'export PATH=/root/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(profileDir, 'devflux-env.sh'), envProfile, { mode: 0o644 });

    const rootProfilePath = path.join(rootDir, '.profile');
    const sourceLine = '. /etc/profile.d/devflux-env.sh';
    const currentProfile = fs.existsSync(rootProfilePath) ? fs.readFileSync(rootProfilePath, 'utf8') : '';
    if (!currentProfile.includes(sourceLine)) {
      fs.writeFileSync(rootProfilePath, `${currentProfile}${currentProfile.endsWith('\n') || !currentProfile ? '' : '\n'}${sourceLine}\n`);
    }

    const hasNode = ['usr/bin/node', 'usr/local/bin/node'].some(rel => fs.existsSync(path.join(rootfsPath, rel)));
    const hasNpm = ['usr/bin/npm', 'usr/local/bin/npm'].some(rel => fs.existsSync(path.join(rootfsPath, rel)));
    const hasNpx = ['usr/bin/npx', 'usr/local/bin/npx', 'root/.npm-global/bin/npx'].some(rel => fs.existsSync(path.join(rootfsPath, rel)));
    if (!hasNode || !hasNpm || hasNpx) return;

    const npxCli = [
      'usr/lib/node_modules/npm/bin/npx-cli.js',
      'lib/node_modules/npm/bin/npx-cli.js',
    ].find(rel => fs.existsSync(path.join(rootfsPath, rel)));
    const npxPath = path.join(localBinDir, 'npx');
    const npxScript = npxCli
      ? '#!/bin/sh\nexec node /' + npxCli + ' "$@"\n'
      : '#!/bin/sh\nexec npm exec "$@"\n';
    fs.writeFileSync(npxPath, npxScript, { mode: 0o755 });
    try { fs.chmodSync(npxPath, 0o755); } catch (e) {}
  } catch (err) {
    console.log('[DevFlux] ensureNodeTooling failed:', err.message);
  }
}

async function runLinuxCommand(command, options = {}) {
  const appLibDir = process.env.APP_NATIVE_LIB_DIR;
  if (!appLibDir) throw new Error('APP_NATIVE_LIB_DIR not found');

  const res = await bootstrapLinux(() => {});
  if (!res.success) throw new Error(res.error || 'Bootstrap failed');
  ensureAlpineRepositories(res.path);
  ensureNodeTooling(res.path);

  const spawnCmd = path.join(appLibDir, 'libproot.so');
  const spawnArgs = [
    '--link2symlink', '-0', '-r', res.path,
    '-b', '/dev', '-b', '/proc', '-b', '/sys'
  ];

  if (options.projectsRoot) {
    const projectsRoot = normalizeHostPath(options.projectsRoot);
    if (projectsRoot) {
      if (!fs.existsSync(projectsRoot)) {
        try { fs.mkdirSync(projectsRoot, { recursive: true }); } catch (e) {}
      }
      spawnArgs.push('-b', projectsRoot + ':/projects');
    }
  }

  if (options.cwd) {
    const cwd = normalizeHostPath(options.cwd);
    if (cwd) spawnArgs.push('-b', cwd + ':/workspace');
  }

  spawnArgs.push('-w', options.workdir || '/root', '/bin/sh', '-lc', command);

  return await new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn(spawnCmd, spawnArgs, { env: getProotEnv(appLibDir, options.env || {}) });
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('error', reject);
    proc.on('close', code => resolve({ code, stdout, stderr }));
  });
}


const PACKAGE_COMMANDS = {
  'util-linux-misc': ['script'],
  nodejs: ['node'],
  npm: ['npm', 'npx'],
  git: ['git'],
  python3: ['python3', 'python'],
  'build-base': ['gcc', 'make'],
  curl: ['curl'],
  wget: ['wget'],
  nano: ['nano'],
  vim: ['vim', 'vi'],
  'openssh-client': ['ssh'],
  openssh: ['ssh'],
  sshpass: ['sshpass'],
};

function getPackageCommands(pkgName) {
  const cleanName = String(pkgName || '').trim();
  return PACKAGE_COMMANDS[cleanName] || [cleanName];
}

function normalizePackageList(packages) {
  if (!Array.isArray(packages)) return [];
  return Array.from(new Set(
    packages
      .map(pkg => String(pkg || '').trim().toLowerCase())
      .filter(pkg => /^[a-zA-Z0-9._+@\/-]+$/.test(pkg))
  ));
}

function buildPackageStatusCommand(packages) {
  // Set PATH explicitly to ensure recently installed binaries are found
  const pathSetup = 'export HOME=/root; export PATH=/root/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; hash -r 2>/dev/null; ';
  const checks = packages.map(pkg => {
    // Primary: check if the package is registered in the APK database
    const apkCheck = 'apk info -e ' + shellQuote(pkg) + ' 2>/dev/null | grep -q ' + shellQuote(pkg);
    // Fallback: check if the package's commands are available in PATH
    const commandChecks = getPackageCommands(pkg)
      .filter(Boolean)
      .map(bin => 'command -v ' + shellQuote(bin) + ' >/dev/null 2>&1')
      .join(' || ');
    return 'if ' + apkCheck + ' || ' + commandChecks + '; then printf ' + shellQuote(pkg + '\t1\n') + '; else printf ' + shellQuote(pkg + '\t0\n') + '; fi';
  }).join('; ');
  return pathSetup + checks;
}


function buildPackageInstallCommand(packages, reinstall) {
  const packageArgs = packages.map(shellQuote).join(' ');
  const lines = [
    'set -e', // Exit immediately if any command fails so Node detects the non-zero exit code
    'export HOME=/root',
    'export NPM_CONFIG_PREFIX=/root/.npm-global',
    'export npm_config_prefix=/root/.npm-global',
    'export PATH=/root/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    // Ensure DNS works inside the PRoot before hitting the network
    'echo "nameserver 8.8.8.8" > /etc/resolv.conf',
    'echo "nameserver 1.1.1.1" >> /etc/resolv.conf',
    'apk update && apk add --no-cache ca-certificates',
    'apk add --no-cache ' + packageArgs,
  ];

  if (reinstall) {
    lines.push('apk fix --reinstall ' + packageArgs + ' 2>/dev/null || true');
  }

  lines.push('hash -r 2>/dev/null || true');
  // Emit explicit installed markers so the status check is reliable
  lines.push(
    packages.map(pkg =>
      'apk info -e ' + shellQuote(pkg) + ' 2>/dev/null && echo "[DEVFLUX_OK] ' + pkg + '" || true'
    ).join('\n')
  );
  return lines.join('\n');
}

async function checkLinuxPackageStatus(packages) {
  const safePackages = normalizePackageList(packages);
  const installed = {};
  safePackages.forEach(pkg => { installed[pkg] = false; });

  if (safePackages.length === 0 || !isLinuxInstalled()) return installed;

  try {
    const result = await runLinuxCommand(buildPackageStatusCommand(safePackages));
    result.stdout.split(/\r?\n/).forEach(line => {
      const parts = line.trim().split('\t');
      if (parts.length === 2 && Object.prototype.hasOwnProperty.call(installed, parts[0])) {
        installed[parts[0]] = parts[1] === '1';
      }
    });
  } catch (err) {
    console.log('[DevFlux] package status check failed:', err.message);
  }

  return installed;
}

function buildSshInstallCommand(password) {
  if (password) {
    return 'if ! command -v ssh >/dev/null 2>&1 || ! command -v sshpass >/dev/null 2>&1; then apk update --no-cache >/dev/null 2>&1; apk add --no-cache openssh-client sshpass; fi';
  }
  return 'if ! command -v ssh >/dev/null 2>&1; then apk update --no-cache >/dev/null 2>&1; apk add --no-cache openssh-client; fi';
}

function sshExtraEnv(data) {
  return data.password ? { SSHPASS: String(data.password) } : {};
}

function buildSshCommand(data) {
  const host = String(data.host || '').trim();
  if (!host) throw new Error('Missing SSH host.');
  const user = String(data.user || 'root').trim() || 'root';
  const port = Number(data.port) || 22;
  const auth = data.password ? 'sshpass -e ' : '';
  return auth + 'ssh -o StrictHostKeyChecking=accept-new -p ' + port + ' ' + shellQuote(user + '@' + host);
}

function buildScpCommand(data) {
  const host = String(data.host || '').trim();
  if (!host) throw new Error('Missing SSH host.');
  const port = Number(data.port) || 22;
  const auth = data.password ? 'sshpass -e ' : '';
  return auth + 'scp -P ' + port + ' -o StrictHostKeyChecking=accept-new';
}

function normalizeRemotePath(value, fallback = '/') {
  const raw = String(value || fallback).trim() || fallback;
  if (raw.startsWith('/')) return path.posix.normalize(raw);
  return path.posix.normalize('/' + raw);
}

function remoteListScript(remotePath) {
  return 'dir=' + shellQuote(remotePath) + '; ' +
    'if [ ! -d "$dir" ]; then echo "__DEVFLUX_ERROR__:$dir"; exit 2; fi; ' +
    'for f in "$dir"/* "$dir"/.[!.]* "$dir"/..?*; do ' +
    '[ -e "$f" ] || continue; b=$(basename "$f"); ' +
    'if [ -d "$f" ]; then printf "directory\\t%s\\n" "$b"; else printf "file\\t%s\\n" "$b"; fi; ' +
    'done';
}

function parseRemoteListing(stdout, remotePath) {
  const base = remotePath === '/' ? '' : remotePath.replace(/\/+$/, '');
  return stdout.split(/\r?\n/).filter(Boolean).filter(line => line.includes('\t')).map((line, index) => {
    const tab = line.indexOf('\t');
    const kind = line.slice(0, tab) === 'directory' ? 'directory' : 'file';
    const name = line.slice(tab + 1);
    const fullPath = path.posix.normalize((base || '') + '/' + name);
    const ext = kind === 'file' && name.includes('.') ? name.split('.').pop().toLowerCase() : undefined;
    return { id: fullPath || String(index), name, type: kind, path: fullPath, fileType: ext };
  }).sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1);
}

function localProjectPath(relativePath) {
  const clean = String(relativePath || '').replace(/^\/+/, '');
  return clean ? '/projects/' + clean : '/projects';
}

rn_bridge.channel.on('message', async (msg) => {
  try {
    const data = typeof msg === 'string' ? JSON.parse(msg) : msg;

    if (data.type === 'PING') {
      rn_bridge.channel.send(JSON.stringify({ type: 'PONG', payload: 'Node.js backend is alive!' }));
    }
    else if (data.type === 'CHECK_ALPINE') {
       rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_CHECK_STATUS', reqId: data.reqId, payload: { installed: isLinuxInstalled() } }));
    }

    else if (data.type === 'INIT_ENV') {
      if (data.nativeLibraryDir) {
        process.env.APP_NATIVE_LIB_DIR = data.nativeLibraryDir;
        console.log("[DevFlux] Injected nativeLibraryDir: " + data.nativeLibraryDir);
      }
      if (data.documentDir) {
        // Safe persistent storage outside nodejs-project APK updates
        process.env.DATADIR = data.documentDir.startsWith('/') ? data.documentDir : '/' + data.documentDir;
      }
      console.log("[DevFlux] Node.js backend started, environment injected.");
      // ACK so the frontend knows env was received
      rn_bridge.channel.send(JSON.stringify({
        type: 'INIT_ENV_ACK',
        payload: { nativeLibraryDir: process.env.APP_NATIVE_LIB_DIR || '' }
      }));
    }

    else if (data.type === 'LINUX_CHECK_STATUS') {
      const installed = isLinuxInstalled();
      rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_STATUS_RESULT', payload: { installed } }));
    }

    else if (data.type === 'LINUX_INSTALL') {
      const reqId = data.reqId;
      const sendMessage = (type, payload) => rn_bridge.channel.send(JSON.stringify({ type, reqId, payload }));
      const onProgress = (text) => sendMessage('LINUX_INSTALL_LOG', text);
      const res = await bootstrapLinux(onProgress, true);
      if (res.success) {
        ensureAlpineRepositories(res.path);
        ensureNodeTooling(res.path);
        let packageInstallFailed = false;
        const safePackages = normalizePackageList(data.packages);

        if (safePackages.length > 0) {
            onProgress(`\r\nInstalling Alpine packages: ${safePackages.join(', ')}...\r\n`);

            const appLibDir = process.env.APP_NATIVE_LIB_DIR;
            if (appLibDir) {
                const spawnCmd = path.join(appLibDir, 'libproot.so');
                if (!fs.existsSync(spawnCmd)) {
                  packageInstallFailed = true;
                  onProgress('\r\nproot executable was not found at ' + spawnCmd + '.\r\n');
                } else {
                const spawnArgs = [
                  '--link2symlink', '-0', '-r', res.path,
                  '-b', '/dev', '-b', '/proc', '-b', '/sys',
                  '-w', '/root',
                  '/bin/sh', '-c',
                  buildPackageInstallCommand(safePackages, data.reinstall)
                ];

                const env = getProotEnv(appLibDir);

                const installCode = await new Promise((resolve) => {
                    const proc = spawn(spawnCmd, spawnArgs, { env });
                    proc.stdout.on('data', d => onProgress(d.toString().replace(/(?<!\r)\n/g, '\r\n')));
                    proc.stderr.on('data', d => onProgress(d.toString().replace(/(?<!\r)\n/g, '\r\n')));
                    proc.on('close', code => {
                       if (code === 0) {
                         ensureAlpineRepositories(res.path);
                         ensureNodeTooling(res.path);
                         onProgress('\r\nPackage installation finished. Verifying commands...\r\n');
                       } else {
                         onProgress(`\r\nInstallation finished with code ${code}.\r\n`);
                       }
                       resolve(code);
                    });
                    proc.on('error', err => {
                       onProgress(`\r\nError running proot: ${err.message}\r\n`);
                       resolve(-1);
                    });
                });
                if (installCode !== 0) packageInstallFailed = true;
                }
            } else {
                packageInstallFailed = true;
                onProgress('\r\nAPP_NATIVE_LIB_DIR is not set; package installation cannot continue.\r\n');
            }
        }
        if (packageInstallFailed) {
          sendMessage('LINUX_INSTALL_ERROR', 'Failed to install one or more Alpine packages.');
          return;
        }

        const packageStatus = await checkLinuxPackageStatus(safePackages);
        const missingPackages = safePackages.filter(pkg => packageStatus[pkg] !== true);
        if (missingPackages.length > 0) {
          sendMessage('LINUX_INSTALL_LOG', `\r\nWarning: Package commands not immediately found in PATH: ${missingPackages.join(', ')}.\r\n`);
        }

        sendMessage('LINUX_PACKAGES_STATUS', packageStatus);
        sendMessage('LINUX_INSTALL_DONE', { packages: packageStatus });
      } else {
        sendMessage('LINUX_INSTALL_ERROR', res.error);
      }
    }
    else if (data.type === 'LINUX_CHECK_PACKAGES') {
      const installed = await checkLinuxPackageStatus(data.packages);
      rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_PACKAGES_STATUS', reqId: data.reqId, payload: installed }));
    }
    else if (data.type === 'LINUX_GET_SERVERS') {
      const appLibDir = process.env.APP_NATIVE_LIB_DIR;
      const linuxDir = getLinuxDir();
      if (!appLibDir) {
         rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_SERVERS_RESULT', payload: [] }));
         return;
      }

      const spawnCmd = path.join(appLibDir, 'libproot.so');
      const spawnArgs = [
        '--link2symlink', '-0', '-r', linuxDir,
        '-b', '/dev', '-b', '/proc', '-b', '/sys',
        '/bin/sh', '-c', 'netstat -tlnp 2>/dev/null | grep LISTEN || true'
      ];

      let outData = '';
      const proc = spawn(spawnCmd, spawnArgs, {
        env: getProotEnv(appLibDir)
      });
      proc.stdout.on('data', d => outData += d.toString());
      proc.on('close', () => {
         const servers = [];
         const lines = outData.split('\\n');
         for (let line of lines) {
             const parts = line.trim().split(/\\s+/);
             if (parts.length >= 7 && parts[5] === 'LISTEN') {
                 const localAddress = parts[3];
                 let port = localAddress.split(':').pop();
                 let processInfo = parts[6] || 'unknown';
                 // Some formats might have PID/Program name
                 if (processInfo.includes('/')) {
                     processInfo = processInfo.split('/')[1];
                 }
                 if (port && !servers.find(s => s.port === port)) {
                     servers.push({ port, process: processInfo, address: localAddress });
                 }
             }
         }
         rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_SERVERS_RESULT', payload: servers }));
      });
    }

    else if (data.type === 'LINUX_SSH_LIST') {
      const sid = data.reqId || Math.random().toString(36).substring(7);
      try {
        const remotePath = normalizeRemotePath(data.remotePath || '/');
        const command = buildSshInstallCommand(data.password) + '; ' + buildSshCommand(data) + ' ' + shellQuote(remoteListScript(remotePath));
        const result = await runLinuxCommand(command, { projectsRoot: data.projectsRoot, env: sshExtraEnv(data) });
        if (result.code !== 0) throw new Error((result.stderr || result.stdout || 'Failed to list remote directory.').trim());
        rn_bridge.channel.send(JSON.stringify({ type: SSH_RESULT_TYPES.LINUX_SSH_LIST, reqId: sid, payload: parseRemoteListing(result.stdout, remotePath) }));
      } catch (err) {
        rn_bridge.channel.send(JSON.stringify({ type: SSH_RESULT_TYPES.LINUX_SSH_LIST, reqId: sid, error: err.message }));
      }
    }

    else if (data.type === 'LINUX_SSH_UPLOAD') {
      const sid = data.reqId || Math.random().toString(36).substring(7);
      try {
        const user = String(data.user || 'root').trim() || 'root';
        const host = String(data.host || '').trim();
        const localPath = localProjectPath(data.localPath);
        const remotePath = normalizeRemotePath(data.remotePath || path.posix.basename(localPath));
        const remoteSpec = user + '@' + host + ':' + remotePath;
        const command = buildSshInstallCommand(data.password) + '; ' + buildScpCommand(data) + ' ' + shellQuote(localPath) + ' ' + shellQuote(remoteSpec);
        const result = await runLinuxCommand(command, { projectsRoot: data.projectsRoot, env: sshExtraEnv(data) });
        if (result.code !== 0) throw new Error((result.stderr || result.stdout || 'SCP upload failed.').trim());
        rn_bridge.channel.send(JSON.stringify({ type: SSH_RESULT_TYPES.LINUX_SSH_UPLOAD, reqId: sid, payload: { ok: true } }));
      } catch (err) {
        rn_bridge.channel.send(JSON.stringify({ type: SSH_RESULT_TYPES.LINUX_SSH_UPLOAD, reqId: sid, error: err.message }));
      }
    }

    else if (data.type === 'LINUX_SSH_DOWNLOAD') {
      const sid = data.reqId || Math.random().toString(36).substring(7);
      try {
        const user = String(data.user || 'root').trim() || 'root';
        const host = String(data.host || '').trim();
        const remotePath = normalizeRemotePath(data.remotePath);
        const localPath = localProjectPath(data.localPath || path.posix.basename(remotePath));
        const remoteSpec = user + '@' + host + ':' + remotePath;
        const command = buildSshInstallCommand(data.password) + '; mkdir -p ' + shellQuote(path.posix.dirname(localPath)) + '; ' + buildScpCommand(data) + ' ' + shellQuote(remoteSpec) + ' ' + shellQuote(localPath);
        const result = await runLinuxCommand(command, { projectsRoot: data.projectsRoot, env: sshExtraEnv(data) });
        if (result.code !== 0) throw new Error((result.stderr || result.stdout || 'SCP download failed.').trim());
        rn_bridge.channel.send(JSON.stringify({ type: SSH_RESULT_TYPES.LINUX_SSH_DOWNLOAD, reqId: sid, payload: { ok: true } }));
      } catch (err) {
        rn_bridge.channel.send(JSON.stringify({ type: SSH_RESULT_TYPES.LINUX_SSH_DOWNLOAD, reqId: sid, error: err.message }));
      }
    }

    else if (data.type === 'LINUX_GIT_COMMAND') {
      const appLibDir = process.env.APP_NATIVE_LIB_DIR;
      const sid = data.reqId || Math.random().toString(36).substring(7);

      if (!appLibDir) {
         rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_GIT_RESULT', reqId: sid, error: 'APP_NATIVE_LIB_DIR not found' }));
         return;
      }

      const res = await bootstrapLinux(() => {});
      if (!res.success) {
         rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_GIT_RESULT', reqId: sid, error: 'Bootstrap failed' }));
         return;
      }

      ensureNodeTooling(res.path);
      const projectsRoot = normalizeHostPath(data.projectsRoot);
      const cwd = normalizeHostPath(data.cwd);

      let targetDir = '/workspace';
      if (cwd && projectsRoot && cwd.startsWith(projectsRoot)) {
          const relativeCwd = cwd.slice(projectsRoot.length).replace(/^\/+/, '');
          targetDir = relativeCwd ? `/projects/${relativeCwd}` : '/projects';
      }

      const spawnCmd = path.join(appLibDir, 'libproot.so');
      const spawnArgs = [
        '--link2symlink', '-0', '-r', res.path,
        '-b', '/dev', '-b', '/proc', '-b', '/sys'
      ];
      if (projectsRoot) {
          spawnArgs.push('-b', `${projectsRoot}:/projects`);
      }
      if (cwd) {
          spawnArgs.push('-b', `${cwd}:/workspace`);
      }
      spawnArgs.push('-w', targetDir);

      // Construir comando git
      let gitCommand = data.args ? `git ${data.args.join(' ')}` : data.command;
      spawnArgs.push('/bin/sh', '-c', gitCommand);

      let outData = '';
      let errData = '';
      const proc = spawn(spawnCmd, spawnArgs, {
        env: getProotEnv(appLibDir)
      });

      proc.stdout.on('data', d => outData += d.toString());
      proc.stderr.on('data', d => errData += d.toString());
      proc.on('close', (code) => {
         rn_bridge.channel.send(JSON.stringify({
           type: 'LINUX_GIT_RESULT',
           reqId: sid,
           payload: outData,
           error: code !== 0 ? errData : null,
           code
         }));
      });
    }

    else if (data.type === 'LINUX_NPM_CANCEL') {
      const operation = npmOperations.get(data.reqId);
      if (operation) {
        operation.cancelled = true;
        if (operation.process) {
          try { process.kill(-operation.process.pid, 'SIGTERM'); }
          catch (_) { operation.process.kill(); }
        }
      }
    }
    else if (data.type === 'LINUX_NPM_COMMAND') {
      const sid = data.reqId || Math.random().toString(36).substring(7);
      const operation = { cancelled: false, process: null };
      npmOperations.set(sid, operation);
      let finished = false;
      let timeout;
      const finish = (payload, error, code) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        npmOperations.delete(sid);
        rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_NPM_RESULT', reqId: sid, payload, error, code }));
      };
      try {
        const appLibDir = process.env.APP_NATIVE_LIB_DIR;
        if (!appLibDir) throw new Error('APP_NATIVE_LIB_DIR not found');
        const res = await bootstrapLinux(() => {});
        if (!res.success) throw new Error('Bootstrap failed');
        if (operation.cancelled) throw new Error('Operacao NPM cancelada.');
        ensureNodeTooling(res.path);
        const projectsRoot = normalizeHostPath(data.projectsRoot);
        const cwd = normalizeHostPath(data.cwd);
        if (!projectsRoot || !cwd || !path.resolve(cwd).startsWith(path.resolve(projectsRoot) + path.sep)) {
          throw new Error('Diretorio NPM fora do projeto.');
        }
        const relativeCwd = path.relative(projectsRoot, cwd);
        const spawnArgs = [
          '--link2symlink', '-0', '-r', res.path, '-b', '/dev', '-b', '/proc', '-b', '/sys',
          '-b', projectsRoot + ':/projects', '-b', cwd + ':/workspace', '-w', '/projects/' + relativeCwd,
        ];
        if (!Array.isArray(data.args) || data.args.some(arg => typeof arg !== 'string')) throw new Error('Argumentos NPM invalidos.');
        const npmCommand = 'command -v npm >/dev/null 2>&1 || apk add --no-cache nodejs npm; exec npm ' + data.args.map(shellQuote).join(' ');
        spawnArgs.push('/bin/sh', '-c', npmCommand);
        let outData = '';
        let errData = '';
        const proc = spawn(path.join(appLibDir, 'libproot.so'), spawnArgs, { env: getProotEnv(appLibDir), detached: true });
        operation.process = proc;
        timeout = setTimeout(() => {
          operation.cancelled = true;
          try { process.kill(-proc.pid, 'SIGTERM'); } catch (_) { proc.kill(); }
          finish(outData, 'NPM excedeu o tempo limite.', 1);
        }, 295000);
        proc.stdout.setEncoding('utf8');
        proc.stderr.setEncoding('utf8');
        proc.stdout.on('data', data => { outData = (outData + data).slice(-65536); });
        proc.stderr.on('data', data => { errData = (errData + data).slice(-65536); });
        proc.on('error', error => finish(outData, error.message, 1));
        proc.on('close', code => finish(outData, operation.cancelled ? 'Operacao NPM cancelada.' : code !== 0 ? (errData || outData || 'NPM falhou.') : null, code));
      } catch (error) {
        finish('', error.message, 1);
      }
    }

    else if (data.type === 'SHELL_PTY_START' || data.type === 'SHELL_PTY_ATTACH') {
      const sid = data.sessionId || 'default';

      const bootstrapLog = [];
      const res = await bootstrapLinux(text => bootstrapLog.push(String(text || '')));
      if (!res.success) {
         const reason = res.error || 'erro desconhecido';
         sendPtyOutput(sid, `\r\nLinux bootstrap failed: ${reason}\r\nUse terminal reset or reinstall Alpine in Settings if the error persists.\r\n`);
         rn_bridge.channel.send(JSON.stringify({ type: 'SHELL_PTY_ERROR', sessionId: sid, error: reason, details: bootstrapLog.join('') }));
         return;
      }

      const projectsRoot = normalizeHostPath(data.projectsRoot);
      const cwd = normalizeHostPath(data.cwd);

      // Determine the target directory for the cd command
      if (projectsRoot && !fs.existsSync(projectsRoot)) {
          try { fs.mkdirSync(projectsRoot, { recursive: true }); } catch (e) {}
      }
      if (cwd && !fs.existsSync(cwd)) {
          try { fs.mkdirSync(cwd, { recursive: true }); } catch (e) {}
      }

      let targetDir = '/root';
      if (cwd && projectsRoot && cwd.startsWith(projectsRoot)) {
          const relativeCwd = cwd.slice(projectsRoot.length).replace(/^\/+/, '');
          targetDir = relativeCwd ? `/projects/${relativeCwd}` : '/projects';
      } else if (cwd) {
          targetDir = '/workspace';
      }

      ensureNodeTooling(res.path);

      // Expanded by the shell before every prompt, including after cd and failed commands.
      const promptString = '$(pwd -P)# ';
      const shellCols = Math.max(32, Number(data.cols) || 80);
      const shellRows = Math.max(10, Number(data.rows) || 24);

      if (ptyProcesses[sid]) {
         const replay = ptyOutputBuffers[sid] || '';
         rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: replay }));
         return;
      }

      try {
        if (!ptyToolsPromise) {
          ptyToolsPromise = runLinuxCommand([
            'for tool in stty tty; do command -v "$tool" >/dev/null 2>&1 || { printf "Utilitario de terminal indisponivel no PATH do Alpine: %s\\n" "$tool" >&2; exit 127; }; done',
            '/usr/bin/script --version >/dev/null 2>&1 || { apk add --no-cache util-linux-misc || exit $?; }',
            '/usr/bin/script --version >/dev/null 2>&1 || { printf "script indisponivel apos preparar util-linux-misc.\\n" >&2; exit 127; }',
          ].join('\n'))
            .then(result => {
              if (result.code !== 0) throw new Error(result.stderr || 'Falha ao preparar os utilitarios do terminal.');
            })
            .catch(error => { ptyToolsPromise = null; throw error; });
        }
        await ptyToolsPromise;
      } catch (error) {
        rn_bridge.channel.send(JSON.stringify({ type: 'SHELL_PTY_ERROR', sessionId: sid, error: error.message }));
        return;
      }
      if (ptyProcesses[sid]) return;

      // First time spawning: show banner only once per app session
      if (!bannerShown) {
        const banner = `\r\n\x1b[37m    ____             ________\r\n   / __ \\___ _   __ / ____/ /_  ___  __\r\n  / / / / _ \\ | / // /_  / / / / / |/_/\r\n / /_/ /  __/ |/ // __/ / / /_/ /> <\r\n/_____/\\___/|___//_/   /_/\\__,_/_/|_|\r\n\x1b[0m\r\nWelcome to DevFlux Alpine Linux!\r\n\r\n`;
        sendPtyOutput(sid, banner);
        bannerShown = true;
      }
      const appLibDir = process.env.APP_NATIVE_LIB_DIR;
      if (!appLibDir) {
        sendPtyOutput(sid, '\r\n[ERROR] APP_NATIVE_LIB_DIR was not injected by the native side. Reinstall the APK.\r\n');
        return;
      }

      let spawnCmd = path.join(process.env.APP_NATIVE_LIB_DIR, 'libproot.so');
      console.log("[DevFlux] Executing proot directly from appLibDir: " + spawnCmd);

      // Write persistent profile to /etc/profile.d/ inside rootfs (survives app restarts)
      const profileDir = path.join(res.path, 'etc', 'profile.d');
      if (!fs.existsSync(profileDir)) {
          fs.mkdirSync(profileDir, { recursive: true });
      }
      const profilePath = path.join(profileDir, 'devflux.sh');
      // Use project-specific history file so each project has its own terminal history
      const safeProjectName = String(data.projectName || sid).replace(/[^a-zA-Z0-9_-]/g, '_');
      const histFilePath = `/tmp/.ash_history_${safeProjectName}`;
      const profileContent = [
        '# DevFlux environment profile — auto-generated',
        'export HOME=/root',
        'export NPM_CONFIG_PREFIX=/root/.npm-global',
        'export PATH=/root/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        `export PS1='${promptString}'`,
        'export TERM=xterm-256color',
        'export LANG=C.UTF-8',
        `export HISTFILE='${histFilePath}'`,
        '',
      ].join('\n');
      fs.writeFileSync(profilePath, profileContent);
      // Ensure /etc/profile sources profile.d (Alpine default does this, but be safe)
      try {
        const mainProfile = path.join(res.path, 'etc', 'profile');
        if (fs.existsSync(mainProfile)) {
          const profileText = fs.readFileSync(mainProfile, 'utf-8');
          if (!profileText.includes('profile.d')) {
            fs.appendFileSync(mainProfile, '\nfor f in /etc/profile.d/*.sh; do [ -r "$f" ] && . "$f"; done\n');
          }
        }
      } catch(e) {}

      let spawnArgs = [
        '--link2symlink',
        '-0',
        '-r', res.path,
        '-b', '/dev', '-b', '/proc', '-b', '/sys'
      ];
      if (projectsRoot) {
          spawnArgs.push('-b', `${projectsRoot}:/projects`);
      }
      if (cwd) {
          spawnArgs.push('-b', `${cwd}:/workspace`);
      }
      spawnArgs.push('-w', targetDir);
      // Use login shell (-l) so /etc/profile and /etc/profile.d/* are sourced automatically
      // We pass ENV=/etc/profile.d/devflux.sh to guarantee it runs on subshells too.
      const ttyFile = '/tmp/devflux-tty-' + require('crypto').randomBytes(12).toString('hex');
      ptyTerminals[sid] = { ttyFile: path.join(res.path, ttyFile.slice(1)) };
      spawnArgs.push('/usr/bin/env', 'TERM=xterm-256color', 'SHELL=/bin/sh', 'ENV=/etc/profile.d/devflux.sh', 'PS1=' + promptString, '/usr/bin/script',
        ...scriptArguments({ cols: shellCols, rows: shellRows, ttyFile }));

      ptyProcesses[sid] = spawn(spawnCmd, spawnArgs, {
        env: {
          // script runs stty/tty before the login profile; never inherit Android's PATH here.
          ...getProotEnv(appLibDir),
          COLUMNS: String(shellCols),
          LINES: String(shellRows),
          PS1: promptString,
          ENV: '/etc/profile.d/devflux.sh',
          CHOKIDAR_USEPOLLING: '1',
          WATCHPACK_POLLING: 'true'
        }
      });
      const startedProcess = ptyProcesses[sid];
      startedProcess.stdout.setEncoding('utf8');
      startedProcess.stderr.setEncoding('utf8');
      startedProcess.stdin.on('error', error => {
        rn_bridge.channel.send(JSON.stringify({ type: 'SHELL_PTY_ERROR', sessionId: sid, error: error.message }));
      });

      ptyProcesses[sid].stdout.on('data', d => {
        sendPtyOutput(sid, d);
      });

      ptyProcesses[sid].stderr.on('data', d => {
        let str = d.toString();

        // Clean up "not found" errors from ash
        str = str.replace(/^\/bin\/sh: (.*?): not found/gm, "$1: command not found");

        // Clean up other /bin/sh: prefixes to hide internal details
        str = str.replace(/^\/bin\/sh: /gm, "");

        if (!str) return; // Do not use trim()! Pure newlines must not be dropped.

        const outStr = str.replace(/(?<!\r)\n/g, '\r\n');
        sendPtyOutput(sid, outStr);
      });

      ptyProcesses[sid].on('error', err => {
        console.error("[DevFlux] PTY error:", err.message);
        sendPtyOutput(sid, `\r\n[PTY Error: ${err.message}]\r\n`);
        if (ptyProcesses[sid] === startedProcess) delete ptyProcesses[sid];
      });

      ptyProcesses[sid].on('close', code => {
         if (ptyProcesses[sid] === startedProcess) {
           delete ptyProcesses[sid];
           delete ptyTerminals[sid];
         }
         fs.unlink(path.join(res.path, ttyFile.slice(1)), () => {});
         if (ptySilentStops[sid]) {
           delete ptySilentStops[sid];
           return;
         }
         sendPtyOutput(sid, `\r\n[Process exited with code ${code}]\r\n`);
      });
    }
    else if (data.type === 'SHELL_PTY_DATA') {
      const sid = data.sessionId || 'default';
      const ptyProcess = ptyProcesses[sid];
      if (!writePtyInput(ptyProcess, data.payload)) {
        rn_bridge.channel.send(JSON.stringify({ type: 'SHELL_PTY_ERROR', sessionId: sid, error: 'Sessao de terminal indisponivel.' }));
      }
    }
    else if (data.type === 'SHELL_PTY_RESIZE') {
      const sid = data.sessionId || 'default';
      const terminal = ptyTerminals[sid];
      if (!terminal || !fs.existsSync(terminal.ttyFile)) return;
      const tty = fs.readFileSync(terminal.ttyFile, 'utf8').trim();
      if (!/^\/dev\/pts\/\d+$/.test(tty)) return;
      const size = terminalSize(data.cols, data.rows);
      runLinuxCommand('stty -F ' + shellQuote(tty) + ' cols ' + size.cols + ' rows ' + size.rows)
        .then(result => {
          if (result.code !== 0) throw new Error(result.stderr);
        })
        .catch(error => rn_bridge.channel.send(JSON.stringify({ type: 'SHELL_PTY_ERROR', sessionId: sid, error: 'Resize: ' + error.message })));
    }
    else if (data.type === 'SHELL_PTY_RESET') {
      const sid = data.sessionId || 'default';
      stopPtySession(sid, { clearBuffer: true, silent: true });
      rn_bridge.channel.send(JSON.stringify({ type: 'SHELL_PTY_RESET_DONE', sessionId: sid }));
    }
    else if (data.type === 'SHELL_PTY_STOP') {
      const sid = data.sessionId || 'default';
      stopPtySession(sid, { clearBuffer: true, silent: true });
    }
    else if (data.type === 'GET_SYS_STATS') {
      try {
        const stats = {
          totalmem: os.totalmem(),
          freemem: os.freemem(),
          cpus: os.cpus().length,
          uptime: os.uptime(),
          platform: os.platform(),
          release: os.release(),
          arch: os.arch()
        };
        rn_bridge.channel.send(JSON.stringify({ type: 'SYS_STATS_RES', payload: stats }));
      } catch(e) {}
    }

    // Old non-PTY handler (used by legacy commands if any)
    else if (data.type === 'COMMAND') {
      const child = exec(data.command, { cwd: data.cwd || process.cwd() });
      child.stdout.on('data', d => rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', payload: d.toString() })));
      child.stderr.on('data', d => rn_bridge.channel.send(JSON.stringify({ type: 'CMD_ERR', payload: d.toString() })));
      child.on('close', code => rn_bridge.channel.send(JSON.stringify({ type: 'CMD_CLOSE', code })));
    }
  } catch (err) {
    rn_bridge.channel.send(JSON.stringify({ type: 'CMD_ERR', payload: err.message + '\n' }));
  }
});

rn_bridge.channel.send(JSON.stringify({ type: 'READY' }));
setInterval(() => {
  try {
    rn_bridge.channel.send(JSON.stringify({ type: 'HEARTBEAT' }));
  } catch(e) {}
}, 2000);
