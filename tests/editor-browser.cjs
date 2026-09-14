const assert = require('node:assert/strict');
const { renderEditor } = require('./editor-bridge.test.cjs');
const { harness } = require('./component-harness.cjs');
const { terminalKeySequence } = harness('src/utils/terminalKeys.ts').exports;
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');

async function main() {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
  try {
    for (const name of ['MonacoEditor', 'LightweightEditor']) {
      const page = await browser.newPage({ viewport: { width: 412, height: 780 }, isMobile: true, hasTouch: true });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const setup = `<script>
        window.__events = [];
        window.__clipboard = '';
        window.ReactNativeWebView = { postMessage: function(raw) {
          var event = JSON.parse(raw);
          window.__events.push(event);
          if (event.type === 'clipboard') {
            if (event.operation !== 'paste') window.__clipboard = event.text;
            window.postMessage(JSON.stringify({ type: 'clipboardResult', requestId: event.requestId, text: window.__clipboard }), '*');
          }
        } };
      </script>`;
      await page.setContent(renderEditor(name, 'alpha beta').replace('<head>', '<head>' + setup), { waitUntil: 'load' });
      await page.waitForFunction(() => window.__events.some(event => event.type === 'ready'), { timeout: 30000 });
      const getValue = () => page.evaluate(name => name === 'MonacoEditor'
        ? window.monaco.editor.getModels().at(-1).getValue()
        : window.ace.edit('editor').getValue(), name);
      assert.equal(await getValue(), 'alpha beta', name + ' first load');
      let seq = 0;
      async function key(key, ctrlKey = false, shiftKey = false) {
        const meta = { key, ctrlKey, shiftKey, requestId: 'test-' + (++seq) };
        await page.evaluate(meta => window.postMessage(JSON.stringify({ type: 'toolbarAction', actionType: 'keypress', meta }), '*'), meta);
        await page.waitForFunction(id => window.__events.some(event => event.requestId === id && (event.type === 'actionComplete' || event.type === 'save')), meta.requestId);
      }
      await key('a', true);
      await key('c', true);
      assert.equal(await page.evaluate(() => window.__clipboard), 'alpha beta');
      await key('x', true);
      assert.equal(await getValue(), '');
      await key('v', true);
      assert.equal(await getValue(), 'alpha beta');
      await key('Enter');
      await key('s', true);
      assert.equal(await page.evaluate(() => window.__events.filter(event => event.type === 'save').at(-1).content), await getValue());
      await key('z', true);
      assert.equal(await getValue(), 'alpha beta');
      await page.evaluate(() => window.postMessage(JSON.stringify({ type: 'updateValue', value: 'second file\nwith content' }), '*'));
      await page.waitForFunction(name => (name === 'MonacoEditor' ? window.monaco.editor.getModels().at(-1).getValue() : window.ace.edit('editor').getValue()) === 'second file\nwith content', name);
      await key('a', true);
      await page.evaluate(() => {
        window.devfluxSetModifiers({ ctrlKey: true });
        document.querySelector('textarea').dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'c' }));
      });
      await page.waitForFunction(() => window.__clipboard === 'second file\nwith content');
      assert.equal(await getValue(), 'second file\nwith content');
      await key('a', true);
      await page.evaluate(() => {
        const ta = document.querySelector('textarea');
        window.devfluxSetModifiers({ ctrlKey: true });
        ta.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        ta.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: 'x' }));
        ta.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertCompositionText', data: 'x', isComposing: true }));
        ta.value = 'x';
        ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: 'x', isComposing: true }));
        ta.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'x' }));
      });
      await page.waitForFunction(name => (name === 'MonacoEditor' ? window.monaco.editor.getModels().at(-1).getValue() : window.ace.edit('editor').getValue()) === '', name);
      await key('v', true);
      await page.setViewportSize({ width: 412, height: 360 });
      assert.equal(await getValue(), 'second file\nwith content');
      const visibleText = name === 'MonacoEditor' ? '.view-lines' : '.ace_text-layer';
      assert.ok(await page.locator(visibleText).first().isVisible());
      assert.deepEqual(errors, [], name + ' page errors');
      console.log(name + ': initial content, copy/cut/paste, undo, save, external update, IME modifiers and resize passed');
      await page.close();
    }
    const terminal = await browser.newPage({ viewport: { width: 412, height: 780 }, isMobile: true, hasTouch: true });
    await terminal.setContent(renderEditor('TerminalView', '').replace('<head>', `<head><script>
      window.__events = [];
      window.ReactNativeWebView = { postMessage: raw => window.__events.push(JSON.parse(raw)) };
    </script>`));
    await terminal.waitForFunction(() => window.__events.some(event => event.type === 'READY'));
    await terminal.evaluate(() => new Promise(resolve => window.term.write(Array.from({ length: 80 }, (_, i) => 'test output ' + i).join('\r\n') + '\r\nroot# ', resolve)));
    const normalRows = await terminal.evaluate(() => window.term.rows);
    await terminal.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'devflux-shell-normal.png') });
    assert.ok(await terminal.evaluate(() => {
      const box = document.querySelector('.xterm-screen').getBoundingClientRect();
      return box.height > 0 && innerHeight - box.bottom >= 100;
    }), 'normal Shell reserves at least 100px below the terminal rows');
    for (const [key, ctrlKey, expected] of [
      ['c', true, '\x03'], ['d', true, '\x04'], ['ArrowLeft', false, '\x1b[D'],
      ['ArrowRight', false, '\x1b[C'], ['Enter', false, '\r'], ['Tab', false, '\t'],
    ]) {
      const event = await terminal.evaluate(({ key, ctrlKey }) => {
        window.__events = [];
        window.runTerminalKey({ key, ctrlKey, requestId: 'xterm-check' });
        return window.__events.filter(event => event.type === 'VIRTUAL_KEY' || event.type === 'DATA').at(-1);
      }, { key, ctrlKey });
      assert.equal(event.type === 'DATA' ? event.payload : terminalKeySequence(event.meta), expected);
    }
    await terminal.evaluate(() => new Promise(resolve => window.term.write('\x1b[?1h', resolve)));
    assert.equal(await terminal.evaluate(() => {
      window.__events = [];
      window.runTerminalKey({ key: 'ArrowLeft' });
      return window.__events.filter(event => event.type === 'DATA').at(-1).payload;
    }), '\x1bOD');
    await terminal.evaluate(() => {
      window.devfluxSetModifiers({ ctrlKey: true });
      window.term.textarea.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'c' }));
    });
    assert.equal(terminalKeySequence(await terminal.evaluate(() => window.__events.filter(event => event.type === 'VIRTUAL_KEY').at(-1).meta)), '\x03');
    await terminal.setViewportSize({ width: 412, height: 360 });
    await terminal.waitForFunction(rows => window.term.rows < rows, normalRows);
    assert.ok(await terminal.evaluate(() => {
      const box = document.querySelector('.xterm-screen').getBoundingClientRect();
      return box.height > 0 && box.top >= 0 && innerHeight - box.bottom >= 60;
    }), 'resized Shell fits its rows and preserves typing space');
    await terminal.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'devflux-shell-keyboard-viewport.png') });
    console.log('xterm: Ctrl+C/D, arrows, Enter/Tab, application cursor mode, IME modifier and resize passed');
    await terminal.close();
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
