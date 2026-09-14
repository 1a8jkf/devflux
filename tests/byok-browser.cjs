const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');

async function main() {
  const bundle = fs.readFileSync(process.env.BYOK_BUNDLE || '/tmp/devflux-ui-validation/byok.js', 'utf8');
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
  try {
    for (const width of [360, 412, 1024]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      const requests = [];
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://**/*', route => {
        const request = route.request();
        if (!/generativelanguage.googleapis.com|openrouter.ai/.test(request.url())) return route.abort();
        requests.push({ url: request.url(), headers: request.headers(), data: request.postDataJSON() });
        return route.fulfill({ headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(request.url().includes('/models')
          ? { models: [{ name: 'models/gemini-fixture', displayName: 'Fixture Gemini', supportedGenerationMethods: ['generateContent'] }] }
          : { choices: [{ message: { role: 'assistant', content: 'OK' } }] }) });
      });
      await page.setContent('<html><head><style>html,body{margin:0;height:100%;background:#000}#header{height:56px;box-sizing:border-box;color:white;font:18px system-ui;padding:16px}#app{height:calc(100% - 56px);display:flex;flex-direction:column}</style></head><body><header id="header">Provedores de IA</header><div id="app"></div></body></html>');
      await page.evaluate(() => {
        window.__storage = { '@devflux_ai_provider_configs_v1': JSON.stringify({
          activeConfigId: 'google',
          configs: [
            { id: 'google', name: 'Google saved', provider: 'google', apiKey: 'fixture-google-key', model: 'retired-model', createdAt: 1, updatedAt: 1 },
            { id: 'router', name: 'OpenRouter saved', provider: 'openrouter', apiKey: 'fixture-router-key', model: 'vendor/fixture-model', createdAt: 1, updatedAt: 1 },
          ],
        }) };
      });
      await page.addScriptTag({ content: bundle });
      await page.getByLabel('Chave de API', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Chave de API', { exact: true }).inputValue(), 'fixture-google-key');
      await page.getByLabel('Selecionar modelo do provedor').click();
      await page.getByText('Fixture Gemini', { exact: true }).click();
      await page.getByText('Salvar', { exact: true }).click();
      await page.waitForFunction(() => window.__saved?.configs?.find(c => c.id === 'google')?.model === 'gemini-fixture');
      await page.getByText('Testar modelo', { exact: true }).click();
      await page.getByText('Modelo respondeu com sucesso.', { exact: true }).waitFor();
      const google = requests.find(r => r.data?.model);
      assert.equal(google.data.model, 'gemini-fixture');
      assert.equal(google.headers.authorization, 'Bearer fixture-google-key');
      await page.getByText('OpenRouter saved', { exact: true }).click();
      assert.equal(await page.getByLabel('Chave de API', { exact: true }).inputValue(), 'fixture-router-key');
      await page.getByText('Testar modelo', { exact: true }).click();
      await page.getByText('Modelo respondeu com sucesso.', { exact: true }).waitFor();
      assert.equal(requests.at(-1).data.model, 'vendor/fixture-model');
      assert.equal(requests.at(-1).headers.authorization, 'Bearer fixture-router-key');
      assert.equal(await page.locator('header').count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(os.tmpdir(), 'devflux-byok-' + width + '.png') });
      await page.setViewportSize({ width, height: 380 });
      const model = page.getByLabel('Modelo', { exact: true });
      await model.scrollIntoViewIfNeeded();
      await model.focus();
      const box = await model.boundingBox();
      assert.ok(box.y >= 56 && box.y + box.height <= 380, 'input fits in resized viewport');
      assert.deepEqual(errors, []);
      console.log('BYOK ' + width + ': saved key, catalog selection, persistence, exact test request, one header and resized input passed');
      await page.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
