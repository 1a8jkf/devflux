const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const JSZip = require('jszip');
const { loadService } = require('./service-harness.cjs');

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'devflux-github-'));
  let requests = 0;
  let failWrite = false;
  const reads = [];
  const zip = new JSZip();
  zip.file('owner-repo-sha/devflux.json', JSON.stringify({ id: 'wrong-folder', name: 'Remote', type: 'node' }));
  zip.file('owner-repo-sha/src/server.js', 'console.log("persisted");');
  zip.file('owner-repo-sha/empty.txt', '');
  zip.file('owner-repo-sha/image.png', Buffer.from([0, 255, 128, 1, 2]));
  const archive = await zip.generateAsync({ type: 'nodebuffer' });
  const native = {
    documentDirectory: pathToFileURL(directory + '/').href,
    getInfoAsync: async uri => {
      try { const stat = await fs.stat(fileURLToPath(uri)); return { exists: true, isDirectory: stat.isDirectory(), modificationTime: stat.mtimeMs / 1000 }; }
      catch (error) { if (error.code === 'ENOENT') return { exists: false }; throw error; }
    },
    makeDirectoryAsync: uri => fs.mkdir(fileURLToPath(uri), { recursive: true }),
    readDirectoryAsync: uri => { reads.push(uri); return fs.readdir(fileURLToPath(uri)); },
    readAsStringAsync: uri => fs.readFile(fileURLToPath(uri), 'utf8'),
    writeAsStringAsync: async (uri, data, options) => {
      if (failWrite && uri.endsWith('server.js')) throw new Error('disk full');
      await fs.writeFile(fileURLToPath(uri), data, options?.encoding || 'utf8');
    },
    moveAsync: ({ from, to }) => fs.rename(fileURLToPath(from), fileURLToPath(to)),
    deleteAsync: uri => fs.rm(fileURLToPath(uri), { force: true, recursive: true }),
  };
  const load = () => loadService('src/services/FileSystemService.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-file-system/legacy': native, 'expo-file-system': {},
    './GithubService': { GithubService: { getToken: async () => null } },
    './GitService': {}, './DebugService': { DebugService: { log() {} } },
  }, { fetch: async () => { requests++; return { ok: true, arrayBuffer: async () => archive }; } }).FileSystemService;
  return { directory, load, reads, requests: () => requests, fail: () => { failWrite = true; },
    cleanup: () => fs.rm(directory, { recursive: true, force: true }) };
}

test('GitHub import survives reload, protects local identity, keeps binary and empty files, reuses download', async () => {
  const f = await fixture();
  try {
    const service = f.load();
    const id = await service.downloadGitRepo('https://github.com/owner/repo');
    const restarted = f.load();
    const projects = await restarted.getProjects();
    assert.equal(projects.length, 1);
    assert.equal(projects[0].id, id);
    assert.equal(projects[0].type, 'git');
    assert.equal(projects[0].githubRepo, 'owner/repo');
    assert.equal(await restarted.readFile(id, 'src/server.js'), 'console.log("persisted");');
    assert.equal(await restarted.readFile(id, 'empty.txt'), '');
    assert.deepEqual(await fs.readFile(fileURLToPath(restarted.getProjectPath(id)) + 'image.png'), Buffer.from([0, 255, 128, 1, 2]));
    assert.equal(await restarted.downloadGitRepo('owner/repo'), id);
    assert.equal(f.requests(), 1);
    // Recover a checkout created before this fix whose ZIP overwrote devflux.json.
    await fs.writeFile(fileURLToPath(restarted.getProjectPath(id)) + 'devflux.json', JSON.stringify({ id: 'wrong', name: 'old', type: 'git' }));
    assert.equal((await f.load().getProjects())[0].id, id);
    assert.equal(await restarted.readFile(id, 'src/server.js'), 'console.log("persisted");');
  } finally { await f.cleanup(); }
});

test('failed import never appears as a completed project', async () => {
  const f = await fixture();
  try {
    f.fail();
    await assert.rejects(f.load().downloadGitRepo('owner/repo'), /disk full/);
    assert.equal((await f.load().getProjects()).length, 0);
  } finally { await f.cleanup(); }
});

test('Explorer defers dependency scans while allowing expansion and full backup traversal', async () => {
  const f = await fixture();
  try {
    const service = f.load();
    const id = await service.downloadGitRepo('owner/repo');
    await service.makeDirectory(id, 'node_modules/dep');
    await service.writeFile(id, 'node_modules/dep/index.js', 'dependency');
    f.reads.length = 0;
    const tree = await service.getProjectFileTree(id, { deferDirectories: ['node_modules', '.git'] });
    assert.equal(tree.find(node => node.name === 'node_modules').children, undefined);
    assert.ok(!f.reads.some(uri => uri.includes('/node_modules/')));
    const dependencies = await service.getProjectFileTree(id, { relativePath: 'node_modules', shallow: true });
    assert.equal(dependencies[0].path, 'node_modules/dep');
    const expanded = await service.getProjectFileTree(id, { relativePath: 'node_modules/dep', shallow: true });
    assert.equal(expanded[0].path, 'node_modules/dep/index.js');
    const full = await service.getProjectFileTree(id);
    assert.equal(full.find(node => node.name === 'node_modules').children[0].children[0].name, 'index.js');
  } finally { await f.cleanup(); }
});
