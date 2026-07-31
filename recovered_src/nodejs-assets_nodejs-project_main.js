const rn_bridge = require('rn-bridge');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { bootstrapLinux } = require('./linux-bootstrap');

let ptyProcess = null;

rn_bridge.channel.on('message', async (msg) => {
  try {
    const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
    
    if (data.type === 'PING') {
      rn_bridge.channel.send(JSON.stringify({ type: 'PONG', payload: 'Node.js backend is alive!' }));
    }
    
    // Set environment variables from React Native
    else if (data.type === 'INIT_ENV') {
      if (data.nativeLibraryDir) {
        process.env.APP_NATIVE_LIB_DIR = data.nativeLibraryDir;
        console.log("[DevFlux] Injected nativeLibraryDir: " + data.nativeLibraryDir);
      }
      // Wait for INIT_ENV before sending READY
console.log("[DevFlux] Node.js backend started, waiting for environment injection...");
    }
    
    // Install Linux
    else if (data.type === 'LINUX_INSTALL') {
      const onProgress = (text) => rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_INSTALL_LOG', payload: text }));
      const res = await bootstrapLinux(onProgress);
      if (res.success) {
        rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_INSTALL_DONE' }));
      } else {
        rn_bridge.channel.send(JSON.stringify({ type: 'LINUX_INSTALL_ERROR', payload: res.error }));
      }
    }
    
    // PTY Handling (XTerm)
    else if (data.type === 'SHELL_PTY_START' || data.type === 'SHELL_PTY_ATTACH') {
      const sid = data.sessionId || 'default';
      
      if (data.type === 'SHELL_PTY_ATTACH' && ptyProcesses[sid]) {
         // Already running, just send a clear screen to refresh view
         rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '\x1b[2J\x1b[3J\x1b[H' }));
         // Force shell to reprint prompt so it doesn't look dead
         if (ptyProcesses[sid].stdin) {
             ptyProcesses[sid].stdin.write('\n');
         }
         return;
      }
      
      if (ptyProcesses[sid]) {
         ptyProcesses[sid].kill();
         delete ptyProcesses[sid];
      }
      
      const onProgress = (text) => rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: text }));
      
      const res = await bootstrapLinux(onProgress);
      if (!res.success) {
         rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '\r\nLinux bootstrap failed.\r\n' }));
         return;
      }

      const appLibDir = process.env.APP_NATIVE_LIB_DIR;
      if (!appLibDir) {
        rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', sessionId: sid, payload: '\r\n[ERRO] APP_NATIVE_LIB_DIR não foi injetado pelo lado nativo. (Reinstale o APK!)\r\n' }));
        return;
      }


      
      let spawnCmd = path.join(appLibDir, 'libproot.so');
      
      console.log("[DevFlux] Executing proot directly from appLibDir: " + spawnCmd);
      
      let spawnArgs = [
        '--link2symlink',
        '-0',
        '-r', res.path,
        '-b', '/dev', '-b', '/proc', '-b', '/sys'
      ];
      if (data.projectsRoot) {
          spawnArgs.push('-b', `${data.projectsRoot}:/projects`);
      }
      if (data.cwd && data.projectsRoot && data.cwd.startsWith(data.projectsRoot)) {
          const relativeCwd = data.cwd.replace(data.projectsRoot, '');
          spawnArgs.push('-w', `/projects/${relativeCwd}`);
      } else if (data.cwd) {
          spawnArgs.push('-b', `${data.cwd}:/workspace`);
          spawnArgs.push('-w', '/workspace');
      } else {
          spawnArgs.push('-w', '/root');
      }
      const projectName = data.projectName || 'workspace';
      spawnArgs.push('/usr/bin/env', 'TERM=xterm-256color', '/bin/sh', '-i');
      
      ptyProcess = spawn(spawnCmd, spawnArgs, {
        env: { 
          ...process.env, 
          PS1: `[\\u@localhost \\W] \\$ `,
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

      ptyProcess.stdout.on('data', d => rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', payload: d.toString().replace(/(?<!\r)\n/g, '\r\n') })));
      ptyProcess.stderr.on('data', d => {
        let str = d.toString();
        // Ignore TTY warnings from Alpine sh
        if (str.includes("can't access tty; job control turned off")) return;
        rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', payload: str.replace(/(?<!\r)\n/g, '\r\n') }));
      });
      
      ptyProcess.on('error', err => {

      ptyProcess.on('close', code => {
         ptyProcess = null;
         rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', payload: `\r\n[Process exited with code ${code}]\r\n` }));
      });
    }
    else if (data.type === 'SHELL_PTY_DATA') {
      if (ptyProcess && ptyProcess.stdin) {
         let input = data.payload;
         // Translate Enter (\r) to Newline (\n) because there is no PTY line discipline
         if (input === '\r') {
             ptyProcess.stdin.write('\n');
             rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', payload: '\r\n' }));
         } else {
             ptyProcess.stdin.write(input);
             // Basic local echo
             let echo = input;
             if (echo === '\x7F') echo = '\b \b'; // Handle backspace
             else if (echo === '\x03') echo = '^C\r\n';
             rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', payload: echo }));
         }
      }
    }
    else if (data.type === 'SHELL_PTY_STOP') {
      if (ptyProcess) ptyProcess.kill();
      ptyProcess = null;
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
