const path = require('node:path');
const esbuild = require(process.env.ESBUILD_PACKAGE || 'esbuild');
const root = process.cwd();
const modules = {
  'native-host': `
    export * from 'react-native-web';
    const listeners = new Map();
    export const DeviceEventEmitter = {
      addListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return { remove: () => listeners.get(type).delete(fn) }; },
      emit(type, data) { for (const fn of listeners.get(type) || []) fn(data); }
    };
    export const Keyboard = { ...DeviceEventEmitter, metrics: () => ({ height: 300, screenY: innerHeight - 300 }) };
    export const Platform = { OS: 'android', select: options => options.android || options.default };
    window.__bus = DeviceEventEmitter;
    window.__actions = [];
    DeviceEventEmitter.addListener('KEYBOARD_TOOLBAR_ACTION', action => window.__actions.push(action));
  `,
  ThemeContext: "import { devfluxDarkTheme } from '" + path.join(root, 'src/theme.ts') + "'; export const useAppTheme = () => ({ theme: devfluxDarkTheme });",
  LanguageContext: 'const t = (key, fallback) => fallback || key; export const useLanguage = () => ({ t });',
  SettingsContext: 'const settings = {}; export const useSettings = () => ({ settings });',
  AISettingsContext: 'const settings = {}; export const useAISettings = () => ({ settings });',
  CommandPaletteContext: 'export const useCommandPalette = () => ({ openPalette() {} });',
  ContextManager: 'export const ContextManager = { setActiveProject() {}, setActiveFile() {} };',
  EditorChangeState: 'export const EditorChangeState = { publish() {}, clearProject() {} };',
  DebugService: 'export const DebugService = { log(...event) { (window.__logs ||= []).push(event); } };',
  FileSystemService: `
    export const FileSystemService = {
      getProjects: async () => [{ id: 'test', name: 'Test project' }],
      getProjectFileTree: async () => [], subscribe: () => () => {},
      getProjectPath() { if (window.__previewError) throw new Error('Preview fixture read failed'); return '/projects/test/'; },
      readFile: async (_project, file) => {
        if (window.__holdRead) await new Promise(resolve => { window.__finishRead = resolve; });
        return file === 'index.html' ? '<html><body>Real preview fixture</body></html>' : '';
      },
    };
  `,
  LiveSyncService: 'export const LiveSyncService = { getProject: async () => ({}), isRemoteSyncProject: () => false, subscribe: () => () => {} };',
  'expo-router': `
    const params = { projectId: 'test', openFile: 'index.html' };
    const router = { setParams() {}, push() {}, replace() {} };
    const nav = { getParent() {}, isFocused: () => true };
    export const useRouter = () => router;
    export const useNavigation = () => nav;
    export const useLocalSearchParams = () => params;
    export const useFocusEffect = () => {};
    export const Drawer = () => null;
  `,
  'react-native-safe-area-context': 'export const useSafeAreaInsets = () => window.__insets || ({ top: 24, bottom: 24, left: 0, right: 0 });',
  '@react-native-async-storage/async-storage': 'export default { getItem: async () => null, setItem: async () => {} };',
  CodeEditor: "import React from 'react'; export const CodeEditor = React.forwardRef(({ code }, ref) => <pre data-testid='code'>{code}</pre>);",
  TerminalSheet: 'import React from "react"; export const TerminalSheet = React.forwardRef(() => null);',
  TerminalView: 'export const TerminalView = () => null;',
  EditorSidebar: 'export const EditorSidebar = () => null;',
  'react-native-webview': 'import React from "react"; export const WebView = React.forwardRef(() => <div data-testid="preview" />);',
  Icon: `import React from 'react'; import * as Icons from 'lucide-react-native';
    export const Icon = ({ name, size, color, outline = true }) => {
      const Component = Icons[name]; return Component ? <Component size={size} color={color} strokeWidth={1.5} fill={outline ? 'none' : color} accessibilityLabel={name} /> : null;
    };`,
};
esbuild.build({
  stdin: {
    contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import Screen from './src/app/editor/codigo'; import { KeyboardToolbar } from './src/components/KeyboardToolbar';
      createRoot(document.getElementById('app')).render(<><Screen /><KeyboardToolbar /></>);`,
    loader: 'tsx', resolveDir: root,
  },
  bundle: true, minify: false, format: 'iife',
  loader: { '.png': 'dataurl' },
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
  outfile: process.env.CONTROLS_BUNDLE || '/tmp/devflux-ui-validation/controls.js',
  define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false', global: 'window' },
  alias: { 'react-native-svg': path.join(root, 'node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js') },
  plugins: [{
    name: 'native-test-host',
    setup(build) {
      build.onResolve({ filter: /.*/ }, args => {
        const key = args.path === 'react-native' ? 'native-host' : Object.keys(modules).find(key => args.path === key || args.path.endsWith('/' + key));
        return key ? { path: key, namespace: 'fixture' } : undefined;
      });
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: modules[args.path], loader: 'tsx', resolveDir: root }));
    },
  }],
}).catch(error => { console.error(error); process.exitCode = 1; });
