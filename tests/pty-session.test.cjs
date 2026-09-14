const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { scriptArguments, writePtyInput } = require('../nodejs-assets/nodejs-project/pty-session');

test('real PTY edits the command at the cursor, resizes, interrupts and handles EOF', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'devflux-pty-test-'));
  const ttyFile = path.join(dir, 'tty');
  const proc = spawn('script', scriptArguments({
    cols: 80, rows: 24, ttyFile, shellCommand: "env PS1='TEST_PROMPT> ' /bin/bash --noprofile --norc -i",
  }), { env: { ...process.env, TERM: 'xterm-256color', PS1: 'TEST_PROMPT> ' } });
  let output = '';
  const waiters = new Set();
  proc.stdout.on('data', data => { output += data; for (const check of waiters) check(); });
  proc.stderr.on('data', data => { output += data; });
  const exited = new Promise(resolve => proc.once('exit', resolve));
  async function expectOutput(pattern) {
    if (pattern.test(output)) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(check); reject(new Error('Missing ' + pattern + '\n' + output)); }, 4000);
      function check() {
        if (pattern.test(output)) { clearTimeout(timer); waiters.delete(check); resolve(); }
      }
      waiters.add(check);
    });
  }
  try {
    await expectOutput(/TEST_PROMPT>/);
    writePtyInput(proc, "printf '<%s>\\n' ac");
    writePtyInput(proc, '\x1b[Db\r');
    await expectOutput(/<abc>\r?\n/);
    const tty = readFileSync(ttyFile, 'utf8').trim();
    assert.match(tty, /^\/dev\/pts\/\d+$/);
    await new Promise((resolve, reject) => {
      const resize = spawn('stty', ['-F', tty, 'cols', '91', 'rows', '31']);
      resize.on('exit', code => code === 0 ? resolve() : reject(new Error('stty failed')));
    });
    writePtyInput(proc, 'stty size\r');
    await expectOutput(/31 91/);
    // Emit readiness from the foreground job, not from the parent shell before job control switches.
    writePtyInput(proc, "sh -c 'printf \"RUNNING\\n\"; exec sleep 30'\r");
    await expectOutput(/RUNNING\r?\n/);
    output = '';
    writePtyInput(proc, '\x03');
    await expectOutput(/TEST_PROMPT>/);
    writePtyInput(proc, "printf '<%s>\\n' xy\x1b[D\x1b[3~Z\r");
    await expectOutput(/<xZ>\r?\n[\s\S]*TEST_PROMPT>/);
    output = '';
    writePtyInput(proc, '\x1b[A\r');
    await expectOutput(/<xZ>\r?\n[\s\S]*TEST_PROMPT>/);
    writePtyInput(proc, "printf '<%s>\\n' history-current\x1b[A\x1b[B\r");
    await expectOutput(/<history-current>\r?\n[\s\S]*TEST_PROMPT>/);
    writePtyInput(proc, '\x04');
    const result = await Promise.race([exited, new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('EOF did not close shell: ' + JSON.stringify(output))), 2000);
      timer.unref();
    })]);
    assert.equal(result, 0);
  } finally {
    proc.stdin.end();
    proc.kill('SIGKILL');
    await exited;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Shell prompt follows physical cwd through cd, failed cd and a symlink', { timeout: 10000 }, async () => {
  const fs = require('node:fs');
  const dir = mkdtempSync(path.join(tmpdir(), 'devflux-path-test-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.symlinkSync(path.join(dir, 'src'), path.join(dir, 'alias'));
  const backend = readFileSync(path.join(__dirname, '../nodejs-assets/nodejs-project/main.js'), 'utf8');
  const prompt = backend.match(/const promptString = '([^']+)';/)[1];
  const proc = spawn('script', scriptArguments({
    cols: 120, rows: 24, ttyFile: path.join(dir, 'tty'),
    shellCommand: "env PS1='" + prompt + "' /bin/bash --noprofile --norc -i",
  }), { cwd: dir, env: { ...process.env, TERM: 'xterm-256color', PS1: prompt } });
  let output = '';
  proc.stdout.on('data', data => { output += data; });
  const exited = new Promise(resolve => proc.once('exit', resolve));
  async function expectPrompt(expected) {
    const deadline = Date.now() + 2000;
    while (!output.includes(expected + '# ') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(output.includes(expected + '# '), output);
  }
  try {
    await expectPrompt(dir);
    output = ''; writePtyInput(proc, 'cd src/\r'); await expectPrompt(dir + '/src');
    output = ''; writePtyInput(proc, 'cd missing/\r'); await expectPrompt(dir + '/src');
    output = ''; writePtyInput(proc, 'cd ../alias\r'); await expectPrompt(dir + '/src');
    output = ''; writePtyInput(proc, 'cd ..\r'); await expectPrompt(dir);
    writePtyInput(proc, '\x04');
    await exited;
  } finally {
    proc.kill('SIGKILL');
    await exited;
    rmSync(dir, { recursive: true, force: true });
  }
});
