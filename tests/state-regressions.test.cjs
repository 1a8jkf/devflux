const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./component-harness.cjs');

test('terminal resize never steals focus and data only reaches the focused session', async () => {
  const sent = [];
  const h = harness('src/components/TerminalView.tsx', {
    'expo-router/react-navigation': { useIsFocused: () => true },
    '../utils/terminalKeys': harness('src/utils/terminalKeys.ts').exports,
    '../utils/nodeRunner': { NodeRunner: {
      init: async () => {}, send: message => { sent.push(message); return true; }, addListener: () => () => {},
    } },
    '../services/LiveSyncService': { LiveSyncService: {} },
    '../services/FileSystemService': { PROJECTS_ROOT: '/projects/' },
  });
  h.native.NativeModules = {};
  h.native.AppState = { addEventListener: () => ({ remove() {} }) };
  h.globals.activeInputTarget = 'editor';
  h.mount('TerminalView', { projectId: 'project', sessionId: 'one' });
  const web = h.nodes(node => node.type === 'WebView')[0];
  const receive = data => web.props.onMessage({ nativeEvent: { data: JSON.stringify(data) } });
  receive({ type: 'RESIZE', cols: 70, rows: 15 });
  assert.equal(h.globals.activeInputTarget, 'editor');
  receive({ type: 'DATA', payload: 'ignored' });
  assert.equal(sent.filter(event => event.type === 'SHELL_PTY_DATA').length, 0);
  receive({ type: 'FOCUS' });
  assert.equal(h.globals.activeInputTarget, 'shell:project:one');
  receive({ type: 'DATA', payload: '\x03' });
  assert.equal(sent.at(-1).payload, '\x03');
  assert.equal(sent.at(-1).sessionId, 'project:one');
  receive({ type: 'VIRTUAL_KEY', meta: { key: 'ArrowLeft', applicationCursorKeys: true, requestId: 'cursor' } });
  assert.equal(sent.at(-1).payload, '\x1bOD');
  h.globals.activeInputTarget = 'chat';
  receive({ type: 'DATA', payload: 'ignored too' });
  assert.equal(sent.filter(event => event.type === 'SHELL_PTY_DATA').length, 2);
});

test('clipboard bridge uses the system API and rejects a paste after focus changes', async () => {
  let clipboard = '';
  let finishRead;
  const h = harness('src/components/editorNativeBridge.ts', {
    'expo-clipboard': {
      setStringAsync: async value => { clipboard = value; },
      getStringAsync: () => new Promise(resolve => { finishRead = resolve; }),
    },
  });
  const replies = [];
  let focused = true;
  const dispatch = data => h.exports.handleEditorNativeMessage(data, event => replies.push(event), () => focused, 'test.js');
  await dispatch({ type: 'clipboard', operation: 'copy', text: 'selected text', requestId: 'copy' });
  assert.equal(clipboard, 'selected text');
  const paste = dispatch({ type: 'clipboard', operation: 'paste', requestId: 'paste' });
  focused = false;
  finishRead('stale clipboard text');
  await paste;
  assert.equal(replies.length, 1);
  assert.equal(replies[0].requestId, 'copy');
});

test('toolbar arms Android Ctrl, waits for acknowledgement and cancels on target change', async () => {
  const h = harness('src/components/KeyboardToolbar.tsx');
  const bus = h.native.DeviceEventEmitter;
  const text = node => typeof node === 'string' ? node : (node?.children || []).map(text).join('');
  const press = label => {
    const node = h.nodes(node => node.type === 'TouchableOpacity' && text(node) === label)[0];
    assert.ok(node, label);
    node.props.onPress();
    h.render();
  };
  h.mount('KeyboardToolbar', {});
  h.globals.activeInputTarget = 'editor';
  bus.emit('SHOW_KEYBOARD_TOOLBAR', { target: 'editor' });
  bus.emit('keyboardDidShow', { endCoordinates: { height: 300, screenY: 500 } });
  await h.flush();
  press('CTRL');
  const arm = h.emitted.filter(([type]) => type === 'KEYBOARD_TOOLBAR_ACTION').at(-1)[1];
  assert.equal(arm.actionType, 'modifier');
  assert.equal(arm.meta.ctrlKey, true);
  press('C');
  const action = h.emitted.filter(([type]) => type === 'KEYBOARD_TOOLBAR_ACTION').at(-1)[1];
  assert.equal(action.meta.ctrlKey, true);
  assert.equal(action.target, 'editor');
  press('C');
  const repeat = h.emitted.filter(([type]) => type === 'KEYBOARD_TOOLBAR_ACTION').at(-1)[1];
  assert.equal(repeat.meta.ctrlKey, true, 'a pending Ctrl action must remain a Ctrl action when repeated');
  bus.emit('KEYBOARD_TOOLBAR_ACTION_COMPLETE', { target: 'editor', requestId: action.requestId });
  await h.flush();
  assert.ok(h.nodes(node => node.props?.accessibilityLabel === 'C' && node.props.accessibilityState.selected).length);
  bus.emit('KEYBOARD_TOOLBAR_ACTION_COMPLETE', { target: 'editor', requestId: repeat.requestId });
  await h.flush();
  assert.equal(h.nodes(node => node.props?.accessibilityLabel === 'C' && node.props.accessibilityState.selected).length, 0);
  press('CTRL');
  h.globals.activeInputTarget = 'shell:project:one';
  bus.emit('SHOW_KEYBOARD_TOOLBAR', { target: 'shell:project:one' });
  await h.flush();
  press('ENTER');
  const shellAction = h.emitted.filter(([type]) => type === 'KEYBOARD_TOOLBAR_ACTION').at(-1)[1];
  assert.equal(shellAction.target, 'shell:project:one');
  assert.equal(shellAction.meta.ctrlKey, false);
  h.globals.activeInputTarget = 'chat';
  bus.emit('HIDE_KEYBOARD_TOOLBAR');
  await h.flush();
  assert.equal(h.root(), null);
});

for (const engine of ['MonacoEditor', 'LightweightEditor']) {
  test(engine + ' applies latest confirmed content on ready, including empty files', async () => {
    const h = harness('src/components/' + engine + '.tsx', {
      '../contexts/SettingsContext': { useSettings: () => ({ settings: { fontSize: 14, fontFamily: 'monospace' } }) },
    });
    const props = { code: 'initial', language: 'js', onChangeCode() {} };
    h.mount(engine, props);
    const sent = [];
    const webview = () => h.nodes(node => node.type === 'WebView')[0];
    const html = webview().props.source.html;
    webview().props.ref.current = { postMessage: raw => sent.push(JSON.parse(raw)) };
    h.render({ ...props, code: 'loaded while engine booted' });
    assert.equal(sent.length, 0);
    webview().props.onMessage({ nativeEvent: { data: '{"type":"ready"}' } });
    assert.equal(sent.find(event => event.type === 'updateValue').value, 'loaded while engine booted');
    assert.equal(webview().props.source.html, html);
    h.render({ ...props, code: '' });
    assert.equal(sent.filter(event => event.type === 'updateValue').at(-1).value, '');
    assert.equal(webview().props.source.html, html);
  });
}

test('Chat uses the open project and distinguishes two saved keys with the same model', async () => {
  let activeProject = 'current-project';
  let activeId = 'key-one';
  const configs = [
    { id: 'key-one', name: 'Pessoal', provider: 'openrouter', apiKey: 'test-key-1', model: 'same-model' },
    { id: 'key-two', name: 'Trabalho', provider: 'openrouter', apiKey: 'test-key-2', model: 'same-model' },
  ];
  const histories = [];
  const routes = [];
  const requests = [];
  const savedHistories = [];
  const router = {};
  const h = harness('src/app/ai-panel.tsx', {
    'expo-router': router,
    '../contexts/AISettingsContext': { useAISettings: () => ({
      settings: configs.find(c => c.id === activeId), configs, activeConfigId: activeId,
      isConfigured: true, isLoading: false, selectConfig: async id => { activeId = id; },
    }) },
    '../services/ContextManager': { ContextManager: {
      getActiveProject: () => activeProject, setActiveProject: id => { activeProject = id; }, setActiveFile() {},
      buildContextString: async () => activeProject,
    } },
    '../services/FileSystemService': { FileSystemService: { getProjects: async () => [
      { id: 'first-project', name: 'Primeiro' }, { id: 'current-project', name: 'Atual' },
    ] } },
    '../services/AIService': { AIService: {
      loadHistory: async id => { histories.push(id); return [{ role: 'assistant', content: id }]; },
      fetchChat: async (config, conversation) => {
        requests.push({ config, conversation });
        return { choices: [{ message: { role: 'assistant', content: 'answer' } }] };
      },
      saveHistory: async (id, messages) => savedHistories.push({ id, messages }),
    } },
  });
  Object.assign(router, {
    useRouter: () => ({ replace: path => routes.push(path) }), useLocalSearchParams: () => ({}),
    useFocusEffect: fn => h.react.useEffect(fn, [fn]),
  });
  // Router hooks are looked up when the component renders.
  h.mount('default', {});
  await h.flush();
  assert.equal(activeProject, 'current-project');
  assert.deepEqual(histories, ['current-project']);
  assert.deepEqual(routes, []);
  const text = node => typeof node === 'string' ? node : (node?.children || []).map(text).join('');
  const keyButton = h.nodes(node => node.type === 'TouchableOpacity' && text(node).includes('Trabalho'))[0];
  assert.ok(keyButton);
  await keyButton.props.onPress();
  h.render();
  await h.flush();
  assert.equal(activeId, 'key-two');
  assert.equal(activeProject, 'current-project');
  const projectButton = h.nodes(node => node.type === 'TouchableOpacity' && text(node) === 'Primeiro')[0];
  projectButton.props.onPress();
  h.render();
  await h.flush();
  assert.equal(activeProject, 'first-project');
  assert.deepEqual(histories, ['current-project', 'first-project']);
  assert.equal(h.nodes(node => node.type === 'FlatList')[0].props.data[0].content, 'first-project');
  h.nodes(node => node.type === 'TextInput')[0].props.onChangeText('hello');
  h.render();
  const send = h.nodes(node => node.type === 'TouchableOpacity' && node.children.some(child => child?.props?.name === 'Send'))[0];
  await send.props.onPress();
  await h.flush();
  assert.equal(requests[0].config.apiKey, 'test-key-2');
  assert.match(requests[0].conversation[0].content, /first-project/);
  assert.equal(savedHistories[0].id, 'first-project');
});

test('Shell clipboard uses the native API and drops replies after focus changes', async () => {
  let value = '';
  let finishRead;
  let focused = true;
  const h = harness('src/components/TerminalView.tsx', {
    'expo-router/react-navigation': { useIsFocused: () => focused },
    'expo-clipboard': { setStringAsync: async text => { value=text; }, getStringAsync: () => new Promise(resolve=>{finishRead=resolve;}) },
    '../utils/nodeRunner': { NodeRunner: { addListener:()=>()=>{} } },
    '../services/LiveSyncService': { LiveSyncService:{} },
  });
  h.native.AppState={addEventListener:()=>({remove(){}})};
  h.mount('TerminalView',{projectId:'project',sessionId:'one'});
  const web=h.nodes(node=>node.type==='WebView')[0];
  const replies=[];
  web.props.ref.current={injectJavaScript:script=>replies.push(script)};
  const receive=message=>web.props.onMessage({nativeEvent:{data:JSON.stringify(message)}});
  await receive({type:'FOCUS'});
  await receive({type:'clipboard',operation:'copy',text:'server.js',requestId:'copy'});
  assert.equal(value,'server.js');
  assert.ok(replies[0].includes('clipboardResult'));
  const paste=receive({type:'clipboard',operation:'paste',requestId:'paste'});
  focused=false; h.render();
  finishRead('late'); await paste;
  assert.equal(replies.length,1);
});
