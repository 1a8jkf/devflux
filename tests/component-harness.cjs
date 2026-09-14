const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function harness(filename, overrides = {}) {
  const slots = [];
  let cursor = 0;
  let pending = [];
  let dirty = false;
  const same = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const react = {
    createContext: value => ({ Provider: 'ContextProvider', value }),
    useContext: context => context.value,
    forwardRef: fn => fn,
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(child => child != null) }),
    useRef: value => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { current: value };
      return slots[i];
    },
    useState: value => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof value === 'function' ? value() : value };
      return [slots[i].value, next => {
        const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useEffect: (fn, deps) => {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        pending.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
      }
    },
    useMemo: (fn, deps) => {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useCallback: (fn, deps) => react.useMemo(() => fn, deps),
    useImperativeHandle: (ref, fn) => { if (ref) ref.current = fn(); },
  };
  const emitted = [];
  const listeners = new Map();
  const emitter = {
    emit: (type, ...args) => {
      emitted.push([type, ...args]);
      for (const listener of listeners.get(type) || []) listener(...args);
    },
    addListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return { remove: () => listeners.get(type).delete(fn) };
    },
  };
  const native = {
    Platform: { OS: 'android' }, StyleSheet: { create: x => x, hairlineWidth: 1 },
    View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', FlatList: 'FlatList', ScrollView: 'ScrollView',
    TextInput: 'TextInput', Modal: 'Modal', ActivityIndicator: 'ActivityIndicator',
    Dimensions: { get: () => ({ height: 800, width: 412 }) },
    Keyboard: emitter, DeviceEventEmitter: emitter,
    useWindowDimensions: () => ({ width: 412, height: 800 }),
  };
  const theme = { colors: {}, typography: {} };
  const mocks = {
    react,
    'react-native': native,
    'react-native-webview': { WebView: 'WebView' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) },
    ...overrides,
  };
  const exports = {};
  const globals = {};
  const requireMock = name => {
    if (name in mocks) return mocks[name];
    if (name.includes('ThemeContext')) return { useAppTheme: () => ({ isDark: true, theme }) };
    if (name.includes('LanguageContext')) return { useLanguage: () => ({ t: x => x }) };
    if (name.includes('editorWebBridge')) return { EDITOR_WEB_BRIDGE: '' };
    if (name.includes('editorNativeBridge')) return { handleEditorNativeMessage: async () => false };
    if (name.includes('DebugService')) return { DebugService: { log() {} } };
    if (name.includes('ContextManager')) return { ContextManager: { getActiveProject: () => 'project-current' } };
    return {};
  };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, require: requireMock, global: globals, console, setTimeout, clearTimeout, AbortController }, { filename });
  let root;
  let currentProps;
  let component;
  const ref = {};
  function render(props = currentProps) {
    currentProps = props;
    cursor = 0;
    dirty = false;
    root = component(props, ref);
    const effects = pending;
    pending = [];
    effects.forEach(effect => effect());
    return root;
  }
  async function flush() {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      if (dirty) render();
    }
  }
  function nodes(predicate, node = root) {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...(node.children || []).flatMap(child => nodes(predicate, child))];
  }
  return {
    react, native, emitted, globals, ref, exports, mocks,
    mount: (name, props) => { component = exports[name]; return render(props); },
    render, flush, nodes, root: () => root,
  };
}
module.exports = { harness };
