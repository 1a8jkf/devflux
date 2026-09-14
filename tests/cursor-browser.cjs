const assert = require('node:assert/strict');
const { renderEditor } = require('./editor-bridge.test.cjs');
const { harness } = require('./component-harness.cjs');
const { terminalKeySequence } = harness('src/utils/terminalKeys.ts').exports;
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');

async function main() {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
  const failures = [];
  function check(fn) { try { fn(); } catch (error) { failures.push(error.message); } }
  try {
    for (const name of ['MonacoEditor', 'LightweightEditor', 'TerminalView']) {
      const page = await browser.newPage({ viewport: { width: 412, height: 480 }, isMobile: true, hasTouch: true });
      await page.setContent(renderEditor(name, 'alpha beta\nsecond line').replace('<head>', '<head><script>window.__events=[];window.ReactNativeWebView={postMessage:raw=>window.__events.push(JSON.parse(raw))};</script>'));
      await page.waitForFunction(() => window.__events.some(e => e.type.toLowerCase() === 'ready'));
      if (name !== 'TerminalView') {
        await page.evaluate(name => {
          window.__editor = name === 'MonacoEditor' ? window.monaco.editor.getEditors()[0] : window.ace.edit('editor');
          window.__setCursor = () => name === 'MonacoEditor' ? window.__editor.setPosition({ lineNumber: 1, column: 11 }) : window.__editor.moveCursorTo(0, 10);
          window.__column = () => name === 'MonacoEditor' ? window.__editor.getPosition().column - 1 : window.__editor.getCursorPosition().column;
        }, name);
        let seq = 0;
        const key = async (key, extra = {}) => {
          const meta = { key, ...extra, requestId: 'cursor-' + ++seq };
          await page.evaluate(meta => window.postMessage(JSON.stringify({ type: 'toolbarAction', actionType: 'keypress', meta }), '*'), meta);
          await page.waitForFunction(id => window.__events.some(e => e.type === 'actionComplete' && e.requestId === id), meta.requestId);
        };
        await page.evaluate(() => window.__setCursor());
        for (let i = 0; i < 5; i++) await key('ArrowLeft');
        const left = await page.evaluate(() => window.__column());
        check(() => assert.equal(left, 5, name + ': repeated left arrows'));
        for (let i = 0; i < 5; i++) await key('ArrowRight');
        const right = await page.evaluate(() => window.__column());
        check(() => assert.equal(right, 10, name + ': repeated right arrows'));
        await page.evaluate(() => window.__setCursor());
        await key('ArrowLeft', { ctrlKey: true });
        const word = await page.evaluate(() => window.__column());
        check(() => assert.equal(word, 6, name + ': Ctrl+Left must move by word, not one character'));
        await page.evaluate(() => window.__setCursor());
        await key('ArrowLeft', { ctrlKey: true, shiftKey: true });
        const selected = await page.evaluate(name => name === 'MonacoEditor' ? window.__editor.getModel().getValueInRange(window.__editor.getSelection()) : window.__editor.getSelectedText(), name);
        check(() => assert.equal(selected, 'beta', name + ': Ctrl+Shift+Left selects the word'));
        await page.evaluate(() => window.__setCursor());
        await key('ArrowDown');
        await key('ArrowLeft');
        await key('ArrowUp');
        const vertical = await page.evaluate(() => window.__column());
        check(() => assert.equal(vertical, 9, name + ': vertical arrows preserve the edited cursor column'));
        console.log(name, { left, right, word });
      } else {
        await page.evaluate(() => {
          const ta = window.term.textarea;
          window.term.focus();
          window.__events = [];
          ta.value = '';
          ta.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
          ta.value = 'abc';
          ta.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: 'abc' }));
        });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const events = await page.evaluate(() => {
          window.runTerminalKey({ key: 'ArrowLeft', requestId: 'composing-arrow' });
          return window.__events;
        });
        const output = events.filter(e => e.type === 'DATA' || e.type === 'VIRTUAL_KEY').map(e => e.type === 'DATA' ? e.payload : terminalKeySequence(e.meta));
        check(() => assert.deepEqual(output, ['abc', '\x1b[D'], 'Shell must commit composing text before the arrow reaches the PTY'));
        console.log('xterm composing arrow output', JSON.stringify(output));
        await page.evaluate(() => window.term.textarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'abc' })));
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const committed = await page.evaluate(() => window.__events.filter(e => e.type === 'DATA').map(e => e.payload));
        check(() => assert.deepEqual(committed, ['abc', '\x1b[D'], 'An IME compositionend after the arrow must not duplicate text'));
        const burst = await page.evaluate(() => {
          window.term.textarea.blur();
          window.__events = [];
          for (let i = 0; i < 20; i++) window.runTerminalKey({ key: 'ArrowLeft', requestId: 'burst-' + i });
          return window.__events;
        });
        check(() => assert.equal(burst.filter(e => e.type === 'DATA' && e.payload === '\x1b[D').length, 20, 'One PTY sequence per repeated arrow'));
        check(() => assert.equal(burst.filter(e => e.type === 'KEY_COMPLETE').length, 20, 'Every arrow must be acknowledged'));
        check(() => assert.equal(burst.filter(e => e.type === 'FOCUS').length, 0, 'A toolbar injection cannot reclaim native focus'));
      }
      await page.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(failures, []);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
