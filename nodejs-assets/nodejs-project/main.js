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
    
    // PTY Handling (XTerm)
    else if (data.type === 'SHELL_PTY_START') {
      if (ptyProcess) {
         ptyProcess.kill();
         ptyProcess = null;
      }
      
      const onProgress = (text) => rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', payload: text }));
      
      const res = await bootstrapLinux(onProgress);
      if (!res.success) {
         rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', payload: '\r\nLinux bootstrap failed.\r\n' }));
         return;
      }

      ptyProcess = spawn(res.proot, [
        '-0',
        '-r', res.path,
        '-b', '/dev', '-b', '/proc', '-b', '/sys',
        '-w', '/root',
        '/usr/bin/env', 'TERM=xterm-256color', '/bin/sh', '-l'
      ], {
        env: { ...process.env, TERM: 'xterm-256color' }
      });

      ptyProcess.stdout.on('data', d => rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', payload: d.toString() })));
      ptyProcess.stderr.on('data', d => rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', payload: d.toString() })));
      
      ptyProcess.on('close', code => {
         ptyProcess = null;
         rn_bridge.channel.send(JSON.stringify({ type: 'CMD_OUT', payload: \`\r\n[Process exited with code \${code}]\r\n\` }));
      });
    }
    else if (data.type === 'SHELL_PTY_DATA') {
      if (ptyProcess && ptyProcess.stdin) {
         ptyProcess.stdin.write(data.payload);
      }
    }
    else if (data.type === 'SHELL_PTY_STOP') {
      if (ptyProcess) ptyProcess.kill();
      ptyProcess = null;
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
