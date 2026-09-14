const assert = require('node:assert/strict');
const { renderEditor } = require('./editor-bridge.test.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 720 }, isMobile: true, hasTouch: true });
    await page.setContent(renderEditor('TerminalView', '').replace('<head>', `<head><script>
      window.__events=[]; window.__clipboard='';
      window.ReactNativeWebView={postMessage:raw=>{
        const event=JSON.parse(raw); window.__events.push(event);
        if(event.type==='clipboard'){
          if(event.operation==='copy') window.__clipboard=event.text;
          window.postMessage({type:'clipboardResult',requestId:event.requestId,text:window.__clipboard},'*');
        }
      }};
    </script>`));
    await page.waitForFunction(() => window.__events.some(e => e.type === 'READY'));
    await page.evaluate(() => {
      window.term.focus();
      window.__events = [];
      window.compose = text => {
        const ta = window.term.textarea;
        ta.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        ta.value = text;
        ta.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: text }));
        ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: text, isComposing: true }));
        ta.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: text }));
      };
      window.insert = text => {
        const ta = window.term.textarea;
        ta.value += text;
        ta.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
      };
      window.compose('server');
      window.insert('.');
      window.compose('js');
    });
    await page.waitForTimeout(30); // Allow any delayed xterm composition sender to run.
    const data = () => page.evaluate(() => window.__events.filter(e => e.type === 'DATA').map(e => e.payload).join(''));
    assert.equal(await data(), 'server.js');
    await page.evaluate(() => {
      window.__events = [];
      window.compose('ação');
      window.insert('ação'); // Android's trailing commit event.
      window.insert('/');
      window.insert('_-@:$');
    });
    assert.equal(await data(), 'ação/_-@:$');
    await page.evaluate(() => { window.__events=[]; window.term.textarea.value='server'; });
    await page.evaluate(() => {
      const ta=window.term.textarea;
      ta.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Unidentified',keyCode:229}));
      window.insert('.');
    });
    await page.waitForTimeout(30);
    assert.equal(await data(), '.');
    await page.evaluate(() => new Promise(resolve => window.term.write('copy this line', resolve)));
    await page.evaluate(() => { window.term.select(0,0,14); window.runTerminalKey({key:'c',ctrlKey:true,requestId:'copy'}); });
    await page.waitForFunction(() => window.__clipboard === 'copy this line');
    await page.evaluate(() => {
      window.term.clearSelection(); window.__clipboard='server.js\nnext'; window.__events=[];
      window.runTerminalKey({key:'v',ctrlKey:true,requestId:'paste'});
    });
    await page.waitForFunction(() => window.__events.some(e=>e.type==='actionComplete'&&e.requestId==='paste'));
    assert.equal(await data(), 'server.js\rnext');
    await page.evaluate(() => new Promise(resolve => window.term.write('\x1b[?2004h', resolve)));
    await page.evaluate(() => {
      window.__events=[];
      const clipboardData=new DataTransfer(); clipboardData.setData('text/plain','one\ntwo');
      window.term.textarea.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));
    });
    assert.equal(await data(), '\x1b[200~one\rtwo\x1b[201~');
    await page.evaluate(() => { window.__events=[]; window.term.clearSelection(); window.runTerminalKey({key:'c',ctrlKey:true}); });
    assert.equal(await page.evaluate(()=>window.__events.find(e=>e.type==='VIRTUAL_KEY').meta.key),'c');
    await page.keyboard.press('Control+v');
    await page.waitForFunction(() => window.__events.some(e=>e.type==='clipboard'&&e.operation==='paste'));
    await page.locator('.xterm-screen').dispatchEvent('contextmenu', {clientX:30,clientY:30});
    assert.ok(await page.getByRole('button',{name:'Copy',exact:true}).isVisible());
    await page.getByRole('button',{name:'Select all'}).click({timeout:3000});
    assert.ok(await page.evaluate(()=>window.term.hasSelection()));
    console.log('Shell: punctuation, Unicode, trailing IME commit, keyCode 229, clipboard shortcuts/menu, multiline and bracketed paste passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
