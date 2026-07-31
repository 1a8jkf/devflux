const rn_bridge = require('rn-bridge');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { bootstrapLinux, isLinuxInstalled } = require('./linux-bootstrap');

let ptyProcesses = {};
let currentInputLines = {};
let bannerShown = false;

rn_bridge.channel.on('message', async (msg) => {
  try {
    const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
    
    if (data.type === 'PING') {
      rn_bridge.channel.send(JSON.stringify({ type: 'PONG', payload: 'Node.js backend is alive!' }));
    }
    
    else if (data.type === 'INIT_ENV') {
      if (data.nativeLibraryDir) {
        process.env.APP_NATIVE_LIB_DIR = data.nativeLibraryDir;
        console.log("[DevFlux] Injected nativeLibraryDir: " + data.nativeLibraryDir);
      }
      console.log("[DevFlux] Node.js backend started, waiting for environment injection...");
    }
    
    else if (data.type === 'LINUX_CHECK_STATUS') {
      const installed = isLinuxInstalled();
      rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_STATUS_RESULT', payload: { installed } }));
    }
    
    else if (data.type === 'LINUX_INSTALL') {
      const onProgress = (text) => rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_INSTALL_LOG', payload: text }));
      const res = await bootstrapLinux(onProgress);
      if (res.success) {
        // Auto-install requested packages via proot
        if (data.packages && Array.isArray(data.packages) && data.packages.length > 0) {
            onProgress(`\r\n📦 Instalando pacotes adicionais: ${data.packages.join(', ')}...\r\n`);
            
            const appLibDir = process.env.APP_NATIVE_LIB_DIR;
            if (appLibDir) {
                const spawnCmd = path.join(appLibDir, 'libproot.so');
                const spawnArgs = [
                  '--link2symlink', '-0', '-r', res.path,
                  '-b', '/dev', '-b', '/proc', '-b', '/sys',
                  '-w', '/root',
                  '/bin/sh', '-c', 
                  `apk update && apk add ${data.packages.join(' ')}`
                ];
                
                const env = { 
                  ...process.env, 
                  LD_LIBRARY_PATH: __dirname,
                  PROOT_NO_SECCOMP: '1',
                  PROOT_TMP_DIR: path.join(__dirname, 'tmp'), 
                  PROOT_LOADER: path.join(appLibDir, 'libproot-loader.so'),
                  PROOT_LOADER_32: path.join(appLibDir, 'libproot-loader32.so'),
                  HOME: '/root',
                  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                  TERM: 'xterm-256color',
                };
                
                await new Promise((resolve) => {
                    const proc = spawn(spawnCmd, spawnArgs, { env: env });
                    proc.stdout.on('data', d => onProgress(d.toString().replace(/(?<!\r)\n/g, '\r\n')));
                    proc.stderr.on('data', d => onProgress(d.toString().replace(/(?<!\r)\n/g, '\r\n')));
                    proc.on('close', code => {
                       if (code === 0) onProgress('\r\n✅ Pacotes instalados com sucesso!\r\n');
                       else onProgress(`\r\n⚠️ Instalação finalizou com código ${code}\r\n`);
                       resolve();
                    });
                    proc.on('error', err => {
                       onProgress(`\r\n❌ Erro executando proot: ${err.message}\r\n`);
                       resolve();
                    });
                });
            } else {
                onProgress('\r\n⚠️ APP_NATIVE_LIB_DIR não definido, ignorando pacotes.\r\n');
            }
        }
        rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_INSTALL_DONE' }));
      } else {
        rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_INSTALL_ERROR', payload: res.error }));
      }
    }
    
    else if (data.type === 'SHELL_PTY_START' || data.type === 'SHELL_PTY_ATTACH') {
      const sid = data.sessionId || 'default';
      
      const onProgress = (text) => {}; 
      const res = await bootstrapLinux(onProgress);
      if (!res.success) {
         rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '\r\nLinux bootstrap failed.\r\n' }));
         return;
      }
      
      // Determine the target directory for the cd command
      if (data.projectsRoot && !fs.existsSync(data.projectsRoot)) {
          try { fs.mkdirSync(data.projectsRoot, { recursive: true }); } catch (e) {}
      }
      if (data.cwd && !fs.existsSync(data.cwd)) {
          try { fs.mkdirSync(data.cwd, { recursive: true }); } catch (e) {}
      }
      
      let targetDir = '/root';
      if (data.cwd && data.projectsRoot && data.cwd.startsWith(data.projectsRoot)) {
          const relativeCwd = data.cwd.replace(data.projectsRoot, '');
          targetDir = `/projects/${relativeCwd}`;
      } else if (data.cwd) {
          targetDir = '/workspace';
      }

      // Prompt: project/name $ for code mode, root@localhost ~ $ for global
      const hasProjectContext = data.projectName && data.projectName !== 'DevFlux';
      const promptString = hasProjectContext ? `project/${data.projectName} $ ` : 'root@localhost ~ $ ';

      if (ptyProcesses[sid]) {
         // Process is already running and already in the correct directory.
         // Since the client clears the screen, send Ctrl+L to redraw prompt cleanly
         if (ptyProcesses[sid].stdin) {
             ptyProcesses[sid].stdin.write('\x0c');
         }
         return;
      }

      // First time spawning: show banner only once per app session
      if (!bannerShown) {
        const banner = `\r\n\x1b[37m    ____             ________\r\n   / __ \\___ _   __ / ____/ /_  ___  __\r\n  / / / / _ \\ | / // /_  / / / / / |/_/\r\n / /_/ /  __/ |/ // __/ / / /_/ /> <\r\n/_____/\\___/|___//_/   /_/\\__,_/_/|_|\r\n\x1b[0m\r\nWelcome to DevFlux Alpine Linux!\r\n\r\n`;
        rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: banner }));
        bannerShown = true;
      }
      const appLibDir = process.env.APP_NATIVE_LIB_DIR;
      if (!appLibDir) {
        rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '\r\n[ERRO] APP_NATIVE_LIB_DIR não foi injetado pelo lado nativo. (Reinstale o APK!)\r\n' }));
        return;
      }

      let spawnCmd = path.join(process.env.APP_NATIVE_LIB_DIR, 'libproot.so');
      console.log("[DevFlux] Executing proot directly from appLibDir: " + spawnCmd);
      
      const profilePath = path.join(res.path, 'tmp', `profile_${sid}.sh`);
      if (!fs.existsSync(path.join(res.path, 'tmp'))) {
          fs.mkdirSync(path.join(res.path, 'tmp'), { recursive: true });
      }
      fs.writeFileSync(profilePath, `export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nexport PS1='${promptString}'\nexport HISTFILE='/tmp/.ash_history_${sid}'\n`);

      let spawnArgs = [
        '--link2symlink',
        '-0',
        '-r', res.path,
        '-b', '/dev', '-b', '/proc', '-b', '/sys'
      ];
      if (data.projectsRoot) {
          spawnArgs.push('-b', `${data.projectsRoot}:/projects`);
      }
      if (data.cwd) {
          spawnArgs.push('-b', `${data.cwd}:/workspace`);
      }
      spawnArgs.push('-w', targetDir);
      spawnArgs.push('/usr/bin/env', 'TERM=xterm-256color', `ENV=/tmp/profile_${sid}.sh`, '/bin/sh', '-i');
      
      ptyProcesses[sid] = spawn(spawnCmd, spawnArgs, {
        env: { 
          ...process.env, 
          TERM: 'xterm-256color', 
          LD_LIBRARY_PATH: __dirname,
          PROOT_NO_SECCOMP: '1',
          PROOT_TMP_DIR: path.join(__dirname, 'tmp'), 
          PROOT_LOADER: path.join(appLibDir, 'libproot-loader.so'),
          PROOT_LOADER_32: path.join(appLibDir, 'libproot-loader32.so'),
          CHOKIDAR_USEPOLLING: '1',
          WATCHPACK_POLLING: 'true'
        }
      });
      currentInputLines[sid] = "";

      ptyProcesses[sid].stdout.on('data', d => {
        const outStr = d.toString().replace(/(?<!\r)\n/g, '\r\n');
        rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: outStr }));
      });

      ptyProcesses[sid].stderr.on('data', d => {
        let str = d.toString();
        // Remove job control warning
        str = str.replace(/.*can't access tty; job control turned off\r?\n?/g, "");
        
        // Clean up "not found" errors from ash
        str = str.replace(/^\/bin\/sh: (.*?): not found/gm, "$1: comando não encontrado");
        
        // Clean up other /bin/sh: prefixes to hide internal details
        str = str.replace(/^\/bin\/sh: /gm, "");
        
        if (!str) return; // Do not use trim()! Pure newlines must not be dropped.
        
        const outStr = str.replace(/(?<!\r)\n/g, '\r\n');
        rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: outStr }));
      });
      
      ptyProcesses[sid].on('error', err => {
        console.error("[DevFlux] PTY error:", err.message);
        rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: `\r\n[PTY Error: ${err.message}]\r\n` }));
        delete ptyProcesses[sid];
        delete currentInputLines[sid];
      });

      ptyProcesses[sid].on('close', code => {
         rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: `\r\n[Process exited with code ${code}]\r\n` }));
         delete ptyProcesses[sid];
         delete currentInputLines[sid];
      });
    }
    else if (data.type === 'SHELL_PTY_DATA') {
      const sid = data.sessionId || 'default';
      const ptyProcess = ptyProcesses[sid];
      if (ptyProcess && ptyProcess.stdin) {
         let input = data.payload;
         if (input === '\r') {
             currentInputLines[sid] = "";
             ptyProcess.stdin.write('\n');
             rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '\r\n' }));
         } else if (input === '\x7F') {
             if (currentInputLines[sid] && currentInputLines[sid].length > 0) {
                 currentInputLines[sid] = currentInputLines[sid].slice(0, -1);
                 ptyProcess.stdin.write('\b');
                 rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '\b \b' }));
             }
         } else if (input === '\x03') {
             currentInputLines[sid] = "";
             ptyProcess.stdin.write('\x03');
             rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '^C\r\n' }));
         } else {
             if (!currentInputLines[sid]) currentInputLines[sid] = "";
             // Only track printable characters in currentInputLine to avoid counting escape sequences
             if (input.length === 1 && input.charCodeAt(0) >= 32 && input.charCodeAt(0) <= 126) {
                 currentInputLines[sid] += input;
             }
             ptyProcess.stdin.write(input);
             rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: input }));
         }
      }
    }
    else if (data.type === 'SHELL_PTY_RESIZE') {
      const sid = data.sessionId || 'default';
      console.log(`[DevFlux] Resize session ${sid}: ${data.cols}x${data.rows}`);
    }
    else if (data.type === 'SHELL_PTY_STOP') {
      const sid = data.sessionId || 'default';
      if (ptyProcesses[sid]) {
        try { ptyProcesses[sid].kill(); } catch(e) {}
        delete ptyProcesses[sid];
      }
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
