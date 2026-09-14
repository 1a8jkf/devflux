const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadService } = require('./service-harness.cjs');

test('expanded Shell stays within resized parent bounds', () => {
  const { terminalSheetHeights } = loadService('src/utils/terminalLayout.ts');
  for (const height of [780, 360, 220, 900]) {
    const [min, mid, max] = terminalSheetHeights(height, 24);
    assert.ok(min <= mid && mid <= max && max < height);
    assert.equal(mid, max * 0.65);
  }
});

for (const outcome of ['success', 'failure', 'send-failed']) {
  test('NPM ' + outcome + ' is acknowledged and releases listeners', async () => {
    let listener, request, removed = false;
    let notifySent;
    const sent = new Promise(resolve => { notifySent = resolve; });
    const { NpmService } = loadService('src/services/NpmService.ts', {
      '../utils/nodeRunner': { NodeRunner: {
        waitForEnvironment: async () => {},
        addListener: fn => { listener = fn; return () => { removed = true; }; },
        send: message => { request = message; notifySent(); return outcome !== 'send-failed'; },
      } },
      './FileSystemService': { PROJECTS_ROOT: '/projects/' },
      './DebugService': { DebugService: { log() {} } },
    });
    const result = NpmService.runCommand('selected-project', ['install']);
    result.catch(() => {});
    await sent;
    assert.equal(request.cwd, '/projects/selected-project');
    if (outcome !== 'send-failed') listener({ type: 'LINUX_NPM_RESULT', reqId: request.reqId, code: outcome === 'success' ? 0 : 1, payload: 'done' });
    if (outcome === 'success') assert.equal(await result, 'done');
    else await assert.rejects(result);
    assert.equal(removed, true);
  });
}
