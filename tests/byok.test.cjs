const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadService } = require('./service-harness.cjs');
const { harness } = require('./component-harness.cjs');
const config = { name: 'Google saved', provider: 'google', apiKey: 'fixture-key', model: 'models/gemini-test' };
function api(fetch) {
  const logs = [];
  return { logs, ...loadService('src/services/AIService.ts', {
    '@react-native-async-storage/async-storage': {},
    './DebugService': { DebugService: { log: (...args) => logs.push(args) } },
  }, { fetch }) };
}
const ok = json => ({ ok: true, status: 200, json: async () => json });

test('model catalog uses saved key, follows pages and excludes non-generation models', async () => {
  const calls = [];
  const { AIService } = api(async (url, options) => {
    calls.push([url, options]);
    return ok(calls.length === 1 ? {
      models: [{ name: 'models/gemini-test', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/embedding-test', supportedGenerationMethods: ['embedContent'] }], nextPageToken: 'page 2',
    } : { models: [{ name: 'models/gemini-second', supportedGenerationMethods: ['generateContent'] }] });
  });
  const models = await AIService.listModels(config);
  assert.equal(models.length, 2);
  assert.equal(calls[0][1].headers['x-goog-api-key'], config.apiKey);
  assert.ok(!calls[0][0].includes(config.apiKey));
  assert.match(calls[1][0], /pageToken=page%202/);
});

for (const provider of ['google', 'openai', 'openrouter']) {
  test(provider + ' test connection and Chat use the same request configuration', async () => {
    const calls = [];
    const { AIService } = api(async (url, options) => { calls.push([url, options]); return ok({ choices: [{ message: { content: 'OK' } }] }); });
    const settings = { ...config, provider, model: provider === 'google' ? config.model : 'exact-model' };
    await AIService.testConnection(settings);
    await AIService.fetchChat(settings, [{ role: 'user', content: 'Hello' }]);
    assert.equal(calls[0][0], calls[1][0]);
    assert.deepEqual(calls[0][1].headers, calls[1][1].headers);
    assert.equal(JSON.parse(calls[0][1].body).model, JSON.parse(calls[1][1].body).model);
    assert.equal(JSON.parse(calls[0][1].body).max_tokens, undefined);
  });
}

for (const [status, text] of [[401, /Chave recusada/], [403, /Sem permissao/], [404, /Modelo indisponivel/], [429, /cota/]]) {
  test('API status ' + status + ' is reported without exposing the key', async () => {
    const { AIService, logs } = api(async () => ({ ok: false, status, json: async () => ({ error: { message: 'rejected fixture-key' } }) }));
    await assert.rejects(AIService.testConnection(config), text);
    assert.ok(!JSON.stringify(logs).includes(config.apiKey));
  });
}
test('unknown providers do not silently send a key to OpenAI', async () => {
  let sent = false;
  const { AIService } = api(async () => { sent = true; });
  await assert.rejects(AIService.fetchChat({ ...config, provider: 'invalid' }, []), /desconhecido/);
  assert.equal(sent, false);
});

test('concurrent settings updates are serialized and a provider switch cannot reuse another provider key', async () => {
  const writes = [];
  const state = harness('src/contexts/AISettingsContext.tsx', {
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async (_key, value) => { writes.push(JSON.parse(value)); } },
  });
  state.mount('AISettingsProvider', {});
  await state.flush();
  const settings = () => state.nodes(n => n.type === 'ContextProvider')[0].props.value;
  const id = settings().activeConfigId;
  const first = settings().updateSettings({ id, apiKey: 'saved-key' });
  const second = settings().updateSettings({ id, model: 'saved-model' });
  await Promise.all([first, second]);
  await state.flush();
  assert.equal(settings().settings.apiKey, 'saved-key');
  assert.equal(settings().settings.model, 'saved-model');
  await settings().updateSettings({ id, provider: 'google' });
  await state.flush();
  assert.equal(settings().settings.apiKey, '');
  assert.equal(settings().settings.model, '');
  assert.equal(writes.at(-1).configs[0].provider, 'google');
});

test('failed storage write is not shown as a saved configuration', async () => {
  const state = harness('src/contexts/AISettingsContext.tsx', {
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => { throw new Error('storage-full'); } },
  });
  state.mount('AISettingsProvider', {});
  await state.flush();
  const settings = () => state.nodes(n => n.type === 'ContextProvider')[0].props.value;
  const before = settings().settings.model;
  await assert.rejects(settings().updateSettings({ model: 'not-saved' }), /storage-full/);
  await state.flush();
  assert.equal(settings().settings.model, before);
});

test('BYOK edits a draft, selects a catalog model, saves exact config and reuses it for testing', async () => {
  const calls = [];
  const saved = { ...config, id: 'saved-one' };
  const state = harness('src/app/ai-settings.tsx', {
    'expo-router/react-navigation': { useHeaderHeight: () => 80 },
    '../contexts/AISettingsContext': { useAISettings: () => ({
      settings: saved, configs: [saved], activeConfigId: saved.id, isLoading: false,
      updateSettings: async value => calls.push(['save', value]),
    }) },
    '../services/AIService': { AIService: {
      normalizeModel: settings => settings.model.replace(/^models\//, ''),
      listModels: async settings => { calls.push(['list', { ...settings }]); return [{ id: 'model-from-api', name: 'Model' }]; },
      testConnection: async settings => calls.push(['test', { ...settings }]),
    } },
  });
  state.mount('default', {});
  await state.flush();
  state.nodes(n => n.props.accessibilityLabel === 'Nome da configuração')[0].props.onChangeText('new-name');
  await state.flush();
  assert.equal(calls.length, 0, 'typing must not persist partial configurations');
  await state.nodes(n => n.props.accessibilityLabel === 'Selecionar modelo do provedor')[0].props.onPress();
  await state.flush();
  const list = state.nodes(n => n.type === 'FlatList')[0];
  list.props.renderItem({ item: list.props.data[0] }).props.onPress();
  await state.flush();
  const button = label => state.nodes(n => n.type === 'TouchableOpacity' && state.nodes(c => c.type === 'Text' && c.children.includes(label), n).length)[0];
  button('Salvar').props.onPress();
  await state.flush();
  assert.equal(calls.find(c => c[0] === 'save')[1].model, 'model-from-api');
  assert.equal(calls.find(c => c[0] === 'save')[1].apiKey, config.apiKey);
  button('Testar modelo').props.onPress();
  await state.flush();
  assert.equal(calls.find(c => c[0] === 'test')[1].model, 'model-from-api');
});
