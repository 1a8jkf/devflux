const path = require('node:path');
const esbuild = require(process.env.ESBUILD_PACKAGE || 'esbuild');
const root = process.cwd();
const moduleSources = {
  ThemeContext: "export { devfluxDarkTheme as theme } from '" + path.join(root, 'src/theme.ts') + "'; import { devfluxDarkTheme } from '" + path.join(root, 'src/theme.ts') + "'; export const useAppTheme = () => ({ theme: devfluxDarkTheme });",
  LanguageContext: "export const useLanguage = () => ({ t: (key, fallback) => fallback || key });",
  DebugService: "export const DebugService = { log() {} };",
  'expo-router/react-navigation': "export const useHeaderHeight = () => 56;",
  'react-native-safe-area-context': "export const useSafeAreaInsets = () => ({ top: 24, bottom: 24, left: 0, right: 0 });",
  '@react-native-async-storage/async-storage': "const data = new Map(Object.entries(window.__storage || {})); export default { getItem: async k => data.get(k) || null, setItem: async (k,v) => { data.set(k,v); window.__saved = JSON.parse(v); } };",
};
esbuild.build({
  stdin: {
    contents: "import React from 'react'; import { createRoot } from 'react-dom/client'; import Screen from './src/app/ai-settings'; import { AISettingsProvider } from './src/contexts/AISettingsContext'; createRoot(document.getElementById('app')).render(<AISettingsProvider><Screen /></AISettingsProvider>);",
    loader: 'tsx', resolveDir: root,
  },
  bundle: true, minify: true, format: 'iife',
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
  outfile: process.env.BYOK_BUNDLE || '/tmp/devflux-ui-validation/byok.js',
  define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false' },
  alias: { 'react-native': 'react-native-web', 'react-native-svg': path.join(root, 'node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js') },
  plugins: [{
    name: 'native-test-host',
    setup(build) {
      build.onResolve({ filter: /ThemeContext|LanguageContext|DebugService|expo-router\/react-navigation|react-native-safe-area-context|@react-native-async-storage\/async-storage/ }, args => {
        const key = Object.keys(moduleSources).find(key => args.path.includes(key));
        return key ? { path: key, namespace: 'fixture' } : undefined;
      });
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: moduleSources[args.path], resolveDir: root }));
    },
  }],
}).catch(error => { console.error(error); process.exitCode = 1; });
