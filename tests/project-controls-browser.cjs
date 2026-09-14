const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');

async function main() {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
  const failures = [];
  function check(fn) { try { fn(); } catch (error) { failures.push(error.message); } }
  try {
    for (const width of [320, 360, 369, 412, 900, 1024]) {
      const page = await browser.newPage({ viewport: { width, height: 780 }, isMobile: true, hasTouch: true });
      page.on('pageerror', error => console.error(error.message));
      await page.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#app{margin:0;width:100%;height:100%}#app{display:flex;flex-direction:column}</style></head><body><div id="app"></div></body></html>');
      await page.addScriptTag({ path: process.env.CONTROLS_BUNDLE });
      await page.waitForSelector('[data-testid=code]');
      const icon = name => page.locator('svg[aria-label="' + name + '"]').first();
      const play = page.getByRole('button', { name: 'Play preview', exact: true });
      const before = await play.boundingBox();
      const header = await play.locator('xpath=../..').boundingBox();
      const undoBefore = await icon('Undo').boundingBox();
      check(() => assert.ok(before.x + before.width <= header.x + header.width - 12, width + ': Play exceeds its pane right inset while idle: ' + JSON.stringify(before)));
      await page.evaluate(() => { window.__holdRead = true; });
      await play.click({ force: true });
      await page.waitForFunction(() => typeof window.__finishRead === 'function');
      await page.waitForSelector('[role=progressbar]');
      const loading = await play.boundingBox();
      check(() => assert.deepEqual(loading, before, width + ': loading changes the Play slot'));
      const undoLoading = await icon('Undo').boundingBox();
      check(() => assert.deepEqual(undoLoading, undoBefore, width + ': loading shifts the header actions'));
      await page.screenshot({ path: path.join(os.tmpdir(), 'devflux-play-loading-' + width + '.png') });
      await page.evaluate(() => { window.__holdRead = false; window.__finishRead(); });
      await page.waitForSelector('[data-testid=preview]', { state: 'attached' });
      await icon('X').locator('xpath=ancestor::*[@tabindex][1]').click();
      await page.waitForSelector('[data-testid=code]');
      const after = await play.boundingBox();
      check(() => assert.deepEqual(after, before, width + ': returning from preview changes the Play slot'));
      await page.evaluate(() => { window.__previewError = true; });
      await play.click();
      await page.waitForFunction(() => window.__logs.some(e => e[0] === 'browser' && e[1] === 'error'));
      await icon('AlertTriangle').waitFor();
      const failed = await play.boundingBox();
      check(() => assert.deepEqual(failed, before, width + ': preview failure changes the Play slot'));
      await page.evaluate(() => { window.__previewError = false; });
      await play.click();
      await page.waitForSelector('[data-testid=preview]', { state: 'attached' });
      await icon('X').locator('xpath=ancestor::*[@tabindex][1]').click();
      await page.waitForSelector('[data-testid=code]');
      if (width === 412) {
        await page.evaluate(() => {
          window.activeInputTarget = 'shell:test:one';
          window.__bus.emit('SHOW_KEYBOARD_TOOLBAR', { target: window.activeInputTarget });
          window.__bus.emit('keyboardDidShow', { endCoordinates: { height: 300, screenY: 480 } });
        });
        const arrow = page.getByRole('button', { name: 'ArrowLeft', exact: true });
        await arrow.scrollIntoViewIfNeeded();
        const arrowBefore = await arrow.boundingBox();
        await arrow.click();
        await page.waitForFunction(() => window.__actions.some(action => action.actionType === 'keypress'));
        const arrowPending = await arrow.boundingBox();
        check(() => assert.deepEqual(arrowPending, arrowBefore, 'Pending shortcut moves the arrow hit target'));
        await page.evaluate(() => {
          const action = window.__actions.filter(action => action.actionType === 'keypress').at(-1);
          window.__bus.emit('KEYBOARD_TOOLBAR_ACTION_COMPLETE', action);
        });
        const arrowAfter = await arrow.boundingBox();
        check(() => assert.deepEqual(arrowAfter, arrowBefore, 'Shortcut acknowledgement moves the arrow hit target'));
        for (let i = 0; i < 5; i++) {
          await page.touchscreen.tap(arrowBefore.x + arrowBefore.width / 2, arrowBefore.y + arrowBefore.height / 2);
          await page.waitForFunction(count => window.__actions.filter(a => a.actionType === 'keypress').length === count, i + 2);
        }
        const actions = await page.evaluate(() => window.__actions.filter(a => a.actionType === 'keypress'));
        check(() => assert.ok(actions.every(a => a.meta.key === 'ArrowLeft' && a.target === 'shell:test:one'), 'Repeated taps must hit the same arrow and context'));
        await page.getByRole('button', { name: 'CTRL', exact: true }).dispatchEvent('click');
        const armed = await arrow.boundingBox();
        check(() => assert.deepEqual(armed, arrowBefore, 'Arming Ctrl moves the arrow hit target'));
        await page.screenshot({ path: path.join(os.tmpdir(), 'devflux-shortcuts-pending.png') });
      }
      await page.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(failures, []);
  console.log('Project header: idle/loading/preview/return/error/retry at six widths; arrows stable during pending/ack/Ctrl and repeated touch.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
