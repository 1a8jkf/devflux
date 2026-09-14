const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./component-harness.cjs');

function editor(read) {
  let params = { projectId: 'one', openFile: 'a.js', t: '1' };
  const reads = [];
  const state = harness('src/app/editor/codigo.tsx', {
    'expo-router': { useRouter: () => ({ setParams() {} }), useNavigation: () => ({ getParent() {}, isFocused: () => true }),
      useLocalSearchParams: () => params, useFocusEffect() {} },
    '../../contexts/SettingsContext': { useSettings: () => ({ settings: {} }) },
    '../../contexts/AISettingsContext': { useAISettings: () => ({ settings: {} }) },
    '../../contexts/CommandPaletteContext': { useCommandPalette: () => ({}) },
    '../../services/ContextManager': { ContextManager: { setActiveProject() {}, setActiveFile() {} } },
    '../../services/EditorChangeState': { EditorChangeState: { publish() {}, clearProject() {} } },
    '../../services/LiveSyncService': { LiveSyncService: { getProject: async () => ({}), isRemoteSyncProject: () => false, subscribe: () => () => {} } },
    '../../services/FileSystemService': { FileSystemService: {
      getProjects: async () => [], getProjectFileTree: async () => [], subscribe: () => () => {},
      readFile: async (project, file) => { reads.push([project, file]); return read ? read(project, file) : project + '/' + file; },
    } },
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {} },
    '../../components/CodeEditor': { CodeEditor: 'CodeEditor' },
    '../../components/CodeTabs': { CodeTabs: 'CodeTabs' },
  });
  state.native.PanResponder = { create: () => ({ panHandlers: {} }) };
  state.native.Animated = { Value: class { interpolate() { return 0; } }, timing: () => ({ start() {} }) };
  state.mount('default', {});
  return { state, reads, select: async changes => { params = { ...params, ...changes }; state.render(); await state.flush(); } };
}

test('same path in a different project is loaded without switching away and back', async () => {
  const e = editor();
  await e.state.flush();
  assert.equal(e.state.nodes(n => n.type === 'CodeEditor')[0]?.props.code, 'one/a.js');
  await e.select({ projectId: 'two', t: '2' });
  assert.equal(e.state.nodes(n => n.type === 'CodeEditor')[0]?.props.code, 'two/a.js');
});

test('every Explorer selection is honored even when openFile has not changed', async () => {
  const e = editor();
  await e.state.flush();
  e.state.nodes(n => n.type === 'CodeTabs')[0].props.onTabPress('b.js');
  await e.state.flush();
  assert.equal(e.state.nodes(n => n.type === 'CodeEditor')[0]?.props.code, 'one/b.js');
  await e.select({ openFile: 'a.js', t: '2' });
  assert.equal(e.state.nodes(n => n.type === 'CodeEditor')[0]?.props.code, 'one/a.js');
});

test('a source file named shell.js is not treated as a Shell tab', async () => {
  const e = editor();
  await e.state.flush();
  await e.select({ openFile: 'shell.js', t: '2' });
  assert.equal(e.state.nodes(n => n.type === 'CodeEditor')[0]?.props.code, 'one/shell.js');
});

test('late content from a previous file cannot overwrite the selected file', async () => {
  let complete;
  const e = editor((_project, file) => file === 'a.js' ? new Promise(resolve => { complete = resolve; }) : 'confirmed-b');
  await e.state.flush();
  await e.select({ openFile: 'b.js', t: '2' });
  assert.equal(e.state.nodes(n => n.type === 'CodeEditor')[0]?.props.code, 'confirmed-b');
  complete('late-a');
  await e.state.flush();
  assert.equal(e.state.nodes(n => n.type === 'CodeEditor')[0]?.props.code, 'confirmed-b');
});

test('reselecting a file rereads confirmed content, including an empty file', async () => {
  let content = 'before';
  const e = editor(() => content);
  await e.state.flush();
  content = '';
  await e.select({ t: '2' });
  assert.equal(e.state.nodes(n => n.type === 'CodeEditor')[0]?.props.code, '');
  assert.equal(e.reads.length, 2);
});

test('saved dependency tabs reopen even when their directory is deferred by the index', async () => {
  const e=editor();
  await e.state.flush();
  const file='node_modules/dep/index.js';
  e.state.mocks['@react-native-async-storage/async-storage'].getItem=async()=>JSON.stringify({tabs:[{id:file,name:'index.js',type:'js'}],activeTab:file});
  e.state.mocks['../../services/FileSystemService'].FileSystemService.pathExists=async(_project,relative)=>relative===file;
  await e.select({projectId:'two',openFile:undefined,t:'2'});
  await e.state.flush();
  assert.equal(e.state.nodes(n=>n.type==='CodeEditor')[0]?.props.code,'two/'+file);
});
