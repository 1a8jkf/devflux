const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { loadService } = require('./service-harness.cjs');

async function command(args, cwd) {
  const child = spawn('npm', args, { cwd, stdio: 'inherit' });
  const [code] = await once(child, 'close');
  assert.equal(code, 0, 'npm ' + args.join(' '));
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devflux-template-'));
  try {
    const { FileSystemService } = loadService('src/services/FileSystemService.ts', {
      'react-native': { Platform: { OS: 'android' } },
      'expo-file-system/legacy': {
        documentDirectory: root + '/',
        getInfoAsync: async file => {
          try { const info = await fs.stat(file); return { exists: true, isDirectory: info.isDirectory() }; }
          catch (error) { if (error.code === 'ENOENT') return { exists: false }; throw error; }
        },
        makeDirectoryAsync: file => fs.mkdir(file, { recursive: true }),
        writeAsStringAsync: (file, text) => fs.writeFile(file, text),
        readAsStringAsync: file => fs.readFile(file, 'utf8'),
      },
      'expo-file-system': {}, './GithubService': {}, './GitService': {},
      './DebugService': { DebugService: { log() {} } },
    });
    for (const type of ['html', 'node', 'react', 'blank']) {
      const project = await FileSystemService.createProject('runtime-' + type, type, type === 'node' ? ['express'] : []);
      const cwd = FileSystemService.getProjectPath(project.id);
      if (type === 'react') {
        assert.match(await FileSystemService.readFile(project.id, 'src/App.jsx'), /runtime-react/);
        await command(['install', '--no-audit', '--no-fund'], cwd);
        await command(['run', 'build'], cwd);
        assert.match(await fs.readFile(path.join(cwd, 'dist/index.html'), 'utf8'), /assets\/index-/);
      } else if (type === 'node') {
        await command(['install', '--no-audit', '--no-fund'], cwd);
        // Port 0 requests an unused port; print it from the real HTTP server.
        const child = spawn(process.execPath, ['-e', "const original = require('http').Server.prototype.listen; require('http').Server.prototype.listen = function(...args) { this.on('listening', () => console.log('PORT=' + this.address().port)); return original.apply(this, args); }; require('./server.js');"], { cwd, env: { ...process.env, PORT: '0' } });
        const closed = once(child, 'close');
        try {
          const port = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 10000);
            child.on('error', error => { clearTimeout(timeout); reject(error); });
            child.stdout.on('data', data => { const match = String(data).match(/PORT=(\d+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
          });
          const response = await fetch('http://127.0.0.1:' + port);
          assert.deepEqual(await response.json(), { message: 'OK' });
        } finally { child.kill(); await closed; }
      }
      console.log(type + ': native filesystem template verified');
    }
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'devflux-template-'));
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
