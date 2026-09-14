const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const backendDir = path.resolve(__dirname, '../nodejs-assets/nodejs-project');
const source = fs.readFileSync(path.join(backendDir, 'main.js'), 'utf8');
const androidPath = '/product/bin:/apex/com.android.runtime/bin:/system/bin:/system/xbin';

function backendFixture({ preparationResults = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devflux-startup-test-'));
  fs.mkdirSync(path.join(root, 'tmp'));
  const messages = [];
  const children = [];
  const launches = [];
  let receive;
  const fakeBridge = { channel: {
    on: (_, handler) => { receive = handler; },
    send: message => messages.push(JSON.parse(message)),
  } };
  vm.runInNewContext(source, {
    __dirname: backendDir,
    process: { env: { PATH: androidPath, HOME: '/data/user/0/devflux', APP_NATIVE_LIB_DIR: '/native/lib' } },
    console: { log() {}, warn() {}, error() {} },
    setInterval: () => 0,
    require(name) {
      if (name === 'rn-bridge') return fakeBridge;
      if (name === './linux-bootstrap') return {
        bootstrapLinux: async () => ({ success: true, path: root }),
        isLinuxInstalled: () => true,
        getLinuxDir: () => root,
      };
      if (name === './pty-session') return require(path.join(backendDir, name));
      if (name !== 'child_process') return require(name);
      return { spawn(_binary, args, options) {
        launches.push({ args, options });
        const scriptIndex = args.indexOf('/usr/bin/script');
        if (scriptIndex === -1) {
          // Package availability is isolated; PTY startup below uses real Linux processes.
          const child = new EventEmitter();
          child.stdout = new EventEmitter();
          child.stderr = new EventEmitter();
          const result = preparationResults.shift() || { code: 0 };
          queueMicrotask(() => {
            if (result.stderr) child.stderr.emit('data', result.stderr);
            child.emit('close', result.code);
          });
          return child;
        }
        const scriptArgs = args.slice(scriptIndex + 1);
        const commandIndex = scriptArgs.indexOf('-c') + 1;
        scriptArgs[commandIndex] = scriptArgs[commandIndex]
          .replace('/tmp/devflux-tty-', root + '/tmp/devflux-tty-')
          .replace('exec /bin/sh -l -i', "exec /bin/sh -c 'printf \"SHELL_READY\\n\"; stty size'");
        // PRoot is Android-specific. Execute its exact script command and environment on Linux.
        const child = spawn('/usr/bin/script', scriptArgs, options);
        const closed = new Promise((resolve, reject) => {
          child.once('close', resolve);
          child.once('error', reject);
        });
        children.push({ child, closed });
        return child;
      } };
    },
  }, { filename: 'main.js' });
  return {
    root, messages, launches,
    receive: message => receive(JSON.stringify(message)),
    async closed() {
      assert.equal(children.length, 1, JSON.stringify(messages));
      return children[0].closed;
    },
    async cleanup() {
      for (const { child, closed } of children) {
        if (child.exitCode === null) child.kill('SIGKILL');
        await closed;
      }
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

for (const mode of ['global', 'project', 'expanded']) {
  test(mode + ' Shell starts with an Android parent PATH before the login profile loads', { timeout: 5000 }, async () => {
    const fixture = backendFixture();
    try {
      await fixture.receive({
        type: mode === 'expanded' ? 'SHELL_PTY_ATTACH' : 'SHELL_PTY_START', sessionId: mode, cols: 80, rows: 24,
        ...(mode !== 'global' ? { projectsRoot: fixture.root + '/projects', cwd: fixture.root + '/projects/teste' } : {}),
      });
      const code = await fixture.closed();
      const output = fixture.messages.filter(msg => msg.type === 'CMD_OUT').map(msg => msg.payload).join('');
      assert.equal(code, 0, output);
      assert.match(output, /SHELL_READY\r?\n24 80/);
      assert.doesNotMatch(output, /not found/);
      const preparation = fixture.launches[0].options.env;
      const terminal = fixture.launches[1].options.env;
      assert.equal(terminal.PATH, preparation.PATH);
      assert.equal(terminal.HOME, preparation.HOME);
    } finally {
      await fixture.cleanup();
    }
  });
}

test('PTY preflight verifies stty and tty without a network or apk dependency when script exists', async () => {
  const fixture = backendFixture();
  try {
    await fixture.receive({ type: 'SHELL_PTY_START' });
    await fixture.closed();
    const command = fixture.launches[0].args.at(-1);
    const bin = path.join(fixture.root, 'tools');
    fs.mkdirSync(bin);
    const stty = path.join(bin, 'stty');
    const tty = path.join(bin, 'tty');
    fs.symlinkSync('/bin/stty', stty);
    fs.symlinkSync('/usr/bin/tty', tty);
    const check = () => spawnSync('/bin/sh', ['-c', command], { env: { PATH: bin }, encoding: 'utf8', timeout: 2000 });
    assert.equal(check().status, 0);
    fs.unlinkSync(stty);
    let result = check();
    assert.equal(result.status, 127);
    assert.match(result.stderr, /indisponivel.*stty/);
    fs.symlinkSync('/bin/stty', stty);
    fs.unlinkSync(tty);
    result = check();
    assert.equal(result.status, 127);
    assert.match(result.stderr, /indisponivel.*tty/);
    fs.symlinkSync('/usr/bin/tty', tty);
    assert.equal(check().status, 0);
  } finally {
    await fixture.cleanup();
  }
});

for (const outcome of ['installed', 'installer-failed', 'missing-after-install']) {
  test('PTY preflight handles script package result: ' + outcome, async () => {
    const fixture = backendFixture();
    try {
      await fixture.receive({ type: 'SHELL_PTY_START' });
      await fixture.closed();
      const bin = path.join(fixture.root, 'tools');
      fs.mkdirSync(bin);
      fs.symlinkSync('/bin/stty', path.join(bin, 'stty'));
      fs.symlinkSync('/usr/bin/tty', path.join(bin, 'tty'));
      // Simulate apk only; never modify the host's packages or access the network in this test.
      fs.writeFileSync(path.join(bin, 'apk'), [
        '#!/bin/sh',
        'printf "%s\\n" "$*" >> "$INSTALL_LOG"',
        '[ "$INSTALL_RESULT" = installer-failed ] && exit 23',
        '[ "$INSTALL_RESULT" = missing-after-install ] && exit 0',
        'exec /bin/ln -s /usr/bin/script "$SCRIPT_PATH"',
      ].join('\n'), { mode: 0o755 });
      const scriptPath = path.join(bin, 'script');
      const installLog = path.join(fixture.root, 'apk.log');
      const command = fixture.launches[0].args.at(-1).replaceAll('/usr/bin/script', "'" + scriptPath + "'");
      const check = () => spawnSync('/bin/sh', ['-c', command], {
        env: { PATH: bin, SCRIPT_PATH: scriptPath, INSTALL_LOG: installLog, INSTALL_RESULT: outcome },
        encoding: 'utf8', timeout: 2000,
      });
      const result = check();
      assert.equal(result.status, outcome === 'installed' ? 0 : outcome === 'installer-failed' ? 23 : 127);
      if (outcome === 'missing-after-install') assert.match(result.stderr, /script indisponivel/);
      if (outcome === 'installed') assert.equal(check().status, 0);
      assert.equal(fs.readFileSync(installLog, 'utf8'), 'add --no-cache util-linux-misc\n');
    } finally {
      await fixture.cleanup();
    }
  });
}

test('preparation failure reports the cause without starting a dead Shell and allows retry', async () => {
  const reason = 'Utilitario de terminal indisponivel no PATH do Alpine: stty\n';
  const fixture = backendFixture({ preparationResults: [{ code: 127, stderr: reason }] });
  try {
    const request = { type: 'SHELL_PTY_START', sessionId: 'retry' };
    await fixture.receive(request);
    assert.equal(fixture.launches.length, 1);
    assert.ok(fixture.messages.some(msg => msg.type === 'SHELL_PTY_ERROR' && msg.sessionId === 'retry' && msg.error === reason));
    assert.ok(!fixture.messages.some(msg => msg.type === 'CMD_OUT'));
    await fixture.receive(request);
    assert.equal(await fixture.closed(), 0);
    assert.equal(fixture.launches.length, 3);
  } finally {
    await fixture.cleanup();
  }
});
