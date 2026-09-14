const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadService } = require('./service-harness.cjs');

function projectFS() {
  const entries = new Map();
  const logs = [];
  const { FileSystemService, webGetInfo } = loadService('src/services/FileSystemService.ts', {
    'react-native': { Platform: { OS: 'web' } },
    'expo-file-system/legacy': {}, 'expo-file-system': {},
    './GithubService': {}, './GitService': {},
    './DebugService': { DebugService: { log: (...args) => logs.push(args) } },
  }, { window: { localStorage: { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) } } });
  return { fs: FileSystemService, webGetInfo, logs };
}

for (const [type, files] of Object.entries({
  react: ['package.json', 'index.html', 'src/main.jsx', 'src/App.jsx', 'src/style.css'],
  node: ['package.json', 'server.js'],
  html: ['index.html', 'style.css', 'script.js'],
})) {
  test(type + ' creates real source files before returning', async () => {
    const { fs } = projectFS();
    const project = await fs.createProject('Test ' + type, type, type === 'node' ? ['express'] : []);
    for (const file of files) assert.ok((await fs.readFile(project.id, file)).length > 0, file);
    if (type !== 'html') {
      const pkg = JSON.parse(await fs.readFile(project.id, 'package.json'));
      assert.ok(pkg.scripts[type === 'node' ? 'start' : 'dev']);
      if (type === 'node') assert.ok(pkg.dependencies.express);
    }
  });
}

test('blank stays blank, duplicate names never overwrite, empty files exist', async () => {
  const { fs, webGetInfo } = projectFS();
  const project = await fs.createProject('blank', 'blank');
  assert.equal(await fs.pathExists(project.id, 'index.html'), false);
  await fs.writeFile(project.id, 'empty.txt', '');
  assert.equal(webGetInfo(fs.getProjectPath(project.id) + 'empty.txt').exists, true);
  await assert.rejects(fs.createProject('blank', 'react'), /existe/i);
});

test('Google normalizes models/ and sends exactly the saved key and model', async () => {
  const calls = [];
  const { AIService } = loadService('src/services/AIService.ts', {
    '@react-native-async-storage/async-storage': {},
    './DebugService': { DebugService: { log() {} } },
  }, { fetch: async (...args) => {
    calls.push(args);
    return { ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'OK' } }] }) };
  } });
  await AIService.fetchChat({ provider: 'google', apiKey: ' test-key ', model: ' models/gemini-test ', name: 'Test' }, [{ role: 'user', content: 'Hi' }]);
  assert.match(calls[0][0], /v1beta\/openai\/chat\/completions$/);
  assert.equal(calls[0][1].headers.Authorization, 'Bearer test-key');
  assert.equal(JSON.parse(calls[0][1].body).model, 'gemini-test');
});
