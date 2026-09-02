const rn_bridge = require('rn-bridge');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// =============================================================================
// GLOBAL ERROR HANDLERS — Previne crash silencioso do backend Node.js
// =============================================================================

process.on('uncaughtException', function(err) {
  console.error('[DevFlux] UNCAUGHT EXCEPTION:', err.message, err.stack);
  try {
    rn_bridge.channel.send(JSON.stringify({ 
      type: 'CMD_ERR', 
      payload: '[DevFlux Backend Error] ' + err.message + '\n' 
    }));
  } catch(e) {
    // Bridge may be dead, just log
    console.error('[DevFlux] Failed to send error to RN bridge:', e.message);
  }
  // DO NOT call process.exit() — keep the backend alive for recovery
});

process.on('unhandledRejection', function(reason, promise) {
  var msg = reason instanceof Error ? reason.message : String(reason);
  console.error('[DevFlux] UNHANDLED REJECTION:', msg);
  try {
    rn_bridge.channel.send(JSON.stringify({ 
      type: 'CMD_ERR', 
      payload: '[DevFlux Backend Warning] Unhandled promise: ' + msg + '\n' 
    }));
  } catch(e) {
    console.error('[DevFlux] Failed to send rejection to RN bridge:', e.message);
  }
});

// =============================================================================
// SAFE REQUIRE — linux-bootstrap com fallback gracioso
// =============================================================================

var bootstrapLinux = null;
try {
  var bootstrapModule = require('./linux-bootstrap');
  bootstrapLinux = bootstrapModule.bootstrapLinux;
  console.log('[DevFlux] linux-bootstrap module loaded successfully.');
} catch (err) {
  console.error('[DevFlux] CRITICAL: Failed to load linux-bootstrap module:', err.message);
  // Provide a stub that always returns an error instead of crashing
  bootstrapLinux = async function(onProgress) {
    if (typeof onProgress === 'function') {
      onProgress('\r\n[ERRO] Modulo linux-bootstrap nao encontrado ou falhou ao carregar.\r\n');
      onProgress('Detalhes: ' + err.message + '\r\n');
      onProgress('Reinstale o aplicativo para corrigir.\r\n');
    }
    return { success: false, error: 'linux-bootstrap module not available: ' + err.message };
  };
}

// =============================================================================
// BOOTSTRAP CACHE — Evita re-bootstrap a cada abertura de shell
// =============================================================================

var cachedBootstrapResult = null; // { success: true, path: string } once bootstrapped

async function getBootstrapResult(onProgress) {
  // If we already have a successful bootstrap, reuse it
  if (cachedBootstrapResult && cachedBootstrapResult.success) {
    // Quick validation: ensure the rootfs dir still exists
    try {
      if (fs.existsSync(path.join(cachedBootstrapResult.path, 'bin', 'sh'))) {
        onProgress('\u2705 Alpine Linux pronto (cache).\r\n');
        return cachedBootstrapResult;
      } else {
        // Rootfs was deleted, need to re-bootstrap
        console.log('[DevFlux] Cached rootfs missing, re-bootstrapping...');
        cachedBootstrapResult = null;
      }
    } catch(e) {
      cachedBootstrapResult = null;
    }
  }

  var result = await bootstrapLinux(onProgress);
  if (result.success) {
    cachedBootstrapResult = result;
  }
  return result;
}

// =============================================================================
// PTY SESSIONS — Multi-session support
// =============================================================================

// Map of sessionId -> { proc, isPty }
var ptyProcesses = {};

/**
 * Safely spawn a process with full error protection
 */
function safeSpawn(command, args, options) {
  try {
    return spawn(command, args, options);
  } catch(err) {
    console.error('[DevFlux] Failed to spawn process:', err.message);
    return null;
  }
}

// =============================================================================
// MESSAGE HANDLER
// =============================================================================

rn_bridge.channel.on('message', async function(msg) {
  try {
    var data = typeof msg === 'string' ? JSON.parse(msg) : msg;
    
    if (data.type === 'PING') {
      rn_bridge.channel.send(JSON.stringify({ type: 'PONG', payload: 'Node.js backend is alive!' }));
    }
    
    // Set environment variables from React Native
    else if (data.type === 'INIT_ENV') {
      if (data.nativeLibraryDir) {
        process.env.APP_NATIVE_LIB_DIR = data.nativeLibraryDir;
        console.log('[DevFlux] Injected nativeLibraryDir: ' + data.nativeLibraryDir);
      }
      console.log('[DevFlux] Node.js backend started, environment injected.');
    }
    
    // Install Linux
    else if (data.type === 'LINUX_INSTALL') {
      var onProgress = function(text) { 
        rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_INSTALL_LOG', payload: text })); 
      };
      
      // Invalidate cache to force fresh bootstrap
      cachedBootstrapResult = null;
      
      var res = await bootstrapLinux(onProgress);
      if (res.success) {
        // Auto-install requested packages
        if (data.packages && Array.isArray(data.packages) && data.packages.length > 0) {
            onProgress('\r\n\u{1F4E6} Instalando pacotes adicionais: ' + data.packages.join(', ') + '...\r\n');
            
            var appLibDir = process.env.APP_NATIVE_LIB_DIR;
            if (appLibDir) {
                var spawnCmd = path.join(appLibDir, 'libproot.so');
                var spawnArgs = [
                  '--link2symlink', '-0', '-r', res.path,
                  '-b', '/dev', '-b', '/proc', '-b', '/sys',
                  '-w', '/root',
                  '/bin/sh', '-c', 
                  'apk update && apk add ' + data.packages.join(' ')
                ];
                
                var env = Object.assign({}, process.env, { 
                  LD_LIBRARY_PATH: __dirname,
                  PROOT_NO_SECCOMP: '1',
                  PROOT_TMP_DIR: path.join(__dirname, 'tmp'), 
                  PROOT_LOADER: path.join(appLibDir, 'libproot-loader.so'),
                  PROOT_LOADER_32: path.join(appLibDir, 'libproot-loader32.so')
                });
                
                await new Promise(function(resolve) {
                    var proc = safeSpawn(spawnCmd, spawnArgs, { env: env });
                    if (!proc) {
                      onProgress('\r\n\u274C Falha ao iniciar proot para instalar pacotes.\r\n');
                      resolve();
                      return;
                    }
                    proc.stdout.on('data', function(d) { 
                      onProgress(d.toString().replace(/(?<!\r)\n/g, '\r\n')); 
                    });
                    proc.stderr.on('data', function(d) { 
                      onProgress(d.toString().replace(/(?<!\r)\n/g, '\r\n')); 
                    });
                    proc.on('close', function(code) {
                       if (code === 0) onProgress('\r\n\u2705 Pacotes instalados com sucesso!\r\n');
                       else onProgress('\r\n\u26A0\uFE0F Instalacao finalizou com codigo ' + code + '\r\n');
                       resolve();
                    });
                    proc.on('error', function(err2) {
                       onProgress('\r\n\u274C Erro executando proot: ' + err2.message + '\r\n');
                       resolve();
                    });
                });
            } else {
                onProgress('\r\n\u26A0\uFE0F APP_NATIVE_LIB_DIR nao definido, ignorando pacotes.\r\n');
            }
        }
        // Cache the successful bootstrap
        cachedBootstrapResult = res;
        rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_INSTALL_DONE' }));
      } else {
        rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_INSTALL_ERROR', payload: res.error }));
      }
    }
    
    // PTY Handling (XTerm) -- multi-session via ptyProcesses map
    else if (data.type === 'SHELL_PTY_START' || data.type === 'SHELL_PTY_ATTACH') {
      var sid = data.sessionId || 'default';
      
      // ATTACH: reuse existing session if alive
      if (data.type === 'SHELL_PTY_ATTACH' && ptyProcesses[sid]) {
         // Already running, just send a clear screen to refresh view
         rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '\x1b[2J\x1b[3J\x1b[H' }));
         // Force shell to reprint prompt so it doesn't look dead
         var pInfoAttach = ptyProcesses[sid];
         if (pInfoAttach.isPty) {
             pInfoAttach.proc.write('\r');
         } else if (pInfoAttach.proc.stdin) {
             pInfoAttach.proc.stdin.write('\n');
         }
         return;
      }
      
      // Kill existing session if any
      if (ptyProcesses[sid]) {
         try { ptyProcesses[sid].proc.kill(); } catch(e) {}
         delete ptyProcesses[sid];
      }
      
      var onProgressShell = function(text) { 
        rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: text })); 
      };
      
      // Use cached bootstrap result
      var res2 = await getBootstrapResult(onProgressShell);
      if (!res2.success) {
         rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '\r\nLinux bootstrap failed: ' + (res2.error || 'Unknown error') + '\r\n' }));
         return;
      }

      var appLibDir2 = process.env.APP_NATIVE_LIB_DIR;
      if (!appLibDir2) {
        rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '\r\n[ERRO] APP_NATIVE_LIB_DIR nao foi injetado pelo lado nativo. (Reinstale o APK!)\r\n' }));
        return;
      }

      var spawnCmd2 = path.join(appLibDir2, 'libproot.so');
      
      console.log('[DevFlux] Executing proot directly from appLibDir: ' + spawnCmd2);
      
      var spawnArgs2 = [
        '--link2symlink',
        '-0',
        '-r', res2.path,
        '-b', '/dev', '-b', '/proc', '-b', '/sys'
      ];
      if (data.projectsRoot) {
          spawnArgs2.push('-b', data.projectsRoot + ':/projects');
      }
      if (data.cwd && data.projectsRoot && data.cwd.startsWith(data.projectsRoot)) {
          var relativeCwd = data.cwd.replace(data.projectsRoot, '');
          spawnArgs2.push('-w', '/projects/' + relativeCwd);
      } else if (data.cwd) {
          spawnArgs2.push('-b', data.cwd + ':/workspace');
          spawnArgs2.push('-w', '/workspace');
      } else {
          spawnArgs2.push('-w', '/root');
      }
      spawnArgs2.push('/usr/bin/env', 'TERM=xterm-256color', '/bin/sh', '-i');
      
      var env2 = Object.assign({}, process.env, { 
        PS1: '[\\u@localhost \\W] \\$ ',
        TERM: 'xterm-256color', 
        LD_LIBRARY_PATH: __dirname,
        PROOT_NO_SECCOMP: '1',
        PROOT_TMP_DIR: path.join(__dirname, 'tmp'), 
        PROOT_LOADER: path.join(appLibDir2, 'libproot-loader.so'),
        PROOT_LOADER_32: path.join(appLibDir2, 'libproot-loader32.so'),
        CHOKIDAR_USEPOLLING: '1',
        WATCHPACK_POLLING: 'true'
      });

      // Ensure tmp dir exists for proot
      try { fs.mkdirSync(path.join(__dirname, 'tmp'), { recursive: true }); } catch(e) {}

      var ptyModule = null;
      try {
        ptyModule = require('node-pty');
      } catch (e) {
        console.log('[DevFlux] node-pty not found or not compiled. Falling back to child_process.');
      }

      var proc2 = null;
      var isPty2 = false;

      if (ptyModule) {
        isPty2 = true;
        try {
          proc2 = ptyModule.spawn(spawnCmd2, spawnArgs2, {
            name: 'xterm-256color',
            cols: data.cols || 80,
            rows: data.rows || 24,
            cwd: process.cwd(),
            env: env2
          });
        } catch(ptyErr) {
          console.error('[DevFlux] node-pty spawn failed:', ptyErr.message);
          rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '\r\n[ERRO] Falha ao iniciar PTY: ' + ptyErr.message + '\r\n' }));
          isPty2 = false;
          proc2 = null;
        }
      }
      
      // Fallback to child_process if node-pty failed or not available
      if (!proc2) {
        isPty2 = false;
        proc2 = safeSpawn(spawnCmd2, spawnArgs2, { env: env2 });
        if (!proc2) {
          rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '\r\n[ERRO] Falha ao iniciar processo shell. Verifique se o APK esta correto.\r\n' }));
          return;
        }
      }

      ptyProcesses[sid] = { proc: proc2, isPty: isPty2 };

      // I/O Batching mechanism to prevent bridge overload
      var outBuffer = '';
      var flushTimeout = null;

      var sendData = function(d) {
        var str = d.toString();
        // Ignore TTY warnings from Alpine sh if not real PTY
        if (!isPty2 && str.indexOf("can't access tty; job control turned off") !== -1) return;
        
        // Convert LFs to CRLFs if not using real PTY
        if (!isPty2) {
          str = str.replace(/(?<!\r)\n/g, '\r\n');
        }

        outBuffer += str;
        if (!flushTimeout) {
          flushTimeout = setTimeout(function() {
             if (outBuffer.length > 0) {
                 try {
                   rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: outBuffer }));
                 } catch(e) {
                   console.error('[DevFlux] Failed to send data to bridge:', e.message);
                 }
                 outBuffer = '';
             }
             flushTimeout = null;
          }, 50);
        }
      };

      if (isPty2) {
        proc2.on('data', sendData);
      } else {
        if (proc2.stdout) proc2.stdout.on('data', sendData);
        if (proc2.stderr) proc2.stderr.on('data', sendData);
      }
      
      var handleError = function(errMsg) {
        console.error('[DevFlux] PTY error for session ' + sid + ':', errMsg);
        // Force flush before error
        if (outBuffer.length > 0) {
            try {
              rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: outBuffer }));
            } catch(e) {}
            outBuffer = '';
            if (flushTimeout) clearTimeout(flushTimeout);
        }
        try {
          rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '\r\n[PTY Error: ' + errMsg + ']\r\n' }));
        } catch(e) {}
        delete ptyProcesses[sid];
      };

      if (isPty2) {
        proc2.on('error', function(err3) { handleError(err3.message); });
        proc2.on('exit', function(code) {
           if (flushTimeout) { clearTimeout(flushTimeout); flushTimeout = null; }
           if (outBuffer.length > 0) {
             try { rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: outBuffer })); } catch(e) {}
           }
           delete ptyProcesses[sid];
           try {
             rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '\r\n[Process exited with code ' + code + ']\r\n' }));
           } catch(e) {}
        });
      } else {
        proc2.on('error', function(err3) { handleError(err3.message); });
        proc2.on('close', function(code) {
           if (flushTimeout) { clearTimeout(flushTimeout); flushTimeout = null; }
           if (outBuffer.length > 0) {
             try { rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: outBuffer })); } catch(e) {}
           }
           delete ptyProcesses[sid];
           try {
             rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '\r\n[Process exited with code ' + code + ']\r\n' }));
           } catch(e) {}
        });
      }
    }
    else if (data.type === 'SHELL_PTY_DATA') {
      var sid3 = data.sessionId || 'default';
      var pInfo3 = ptyProcesses[sid3];
      if (pInfo3) {
         var input = data.payload;
         try {
           if (pInfo3.isPty) {
               pInfo3.proc.write(input);
           } else if (pInfo3.proc.stdin) {
               // Translate Enter (\r) to Newline (\n) because there is no PTY line discipline
               if (input === '\r') {
                   pInfo3.proc.stdin.write('\n');
                   rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid3, payload: '\r\n' }));
               } else {
                   pInfo3.proc.stdin.write(input);
                   // Basic local echo
                   var echo = input;
                   if (echo === '\x7F') echo = '\b \b'; // Handle backspace
                   else if (echo === '\x03') echo = '^C\r\n';
                   rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid3, payload: echo }));
               }
           }
         } catch(writeErr) {
           console.error('[DevFlux] Error writing to PTY session ' + sid3 + ':', writeErr.message);
         }
      }
    }
    else if (data.type === 'SHELL_PTY_RESIZE') {
      var sid4 = data.sessionId || 'default';
      var pInfo4 = ptyProcesses[sid4];
      if (pInfo4 && pInfo4.isPty) {
          try {
              pInfo4.proc.resize(data.cols, data.rows);
              console.log('[DevFlux] Resize PTY session ' + sid4 + ': ' + data.cols + 'x' + data.rows);
          } catch(e) {}
      } else {
          console.log('[DevFlux] Resize session ' + sid4 + ': ' + data.cols + 'x' + data.rows + ' (Informational only - no PTY)');
      }
    }
    else if (data.type === 'SHELL_PTY_STOP') {
      var sid5 = data.sessionId || 'default';
      if (ptyProcesses[sid5]) {
        try { ptyProcesses[sid5].proc.kill(); } catch(e) {}
        delete ptyProcesses[sid5];
      }
    }
    else if (data.type === 'GET_SYS_STATS') {
      try {
        var stats = {
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
      try {
        var child = exec(data.command, { cwd: data.cwd || process.cwd() });
        child.stdout.on('data', function(d) { 
          rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', payload: d.toString() })); 
        });
        child.stderr.on('data', function(d) { 
          rn_bridge.channel.send(JSON.stringify({ type: 'CMD_ERR', payload: d.toString() })); 
        });
        child.on('close', function(code) { 
          rn_bridge.channel.send(JSON.stringify({ type: 'CMD_CLOSE', code: code })); 
        });
        child.on('error', function(err4) {
          rn_bridge.channel.send(JSON.stringify({ type: 'CMD_ERR', payload: 'Command error: ' + err4.message + '\n' }));
        });
      } catch(cmdErr) {
        rn_bridge.channel.send(JSON.stringify({ type: 'CMD_ERR', payload: 'Failed to exec command: ' + cmdErr.message + '\n' }));
      }
    }
  } catch (err) {
    console.error('[DevFlux] Message handler error:', err.message);
    try {
      rn_bridge.channel.send(JSON.stringify({ type: 'CMD_ERR', payload: err.message + '\n' }));
    } catch(e) {
      console.error('[DevFlux] Failed to send error response:', e.message);
    }
  }
});

// =============================================================================
// READY signal — with status info
// =============================================================================
console.log('[DevFlux] Node.js backend initialized successfully.');
rn_bridge.channel.send(JSON.stringify({ 
  type: 'READY', 
  payload: {
    bootstrapAvailable: bootstrapLinux !== null,
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version
  }
}));
