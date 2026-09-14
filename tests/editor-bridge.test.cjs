const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

function renderEditor(name, code) {
  const filename = path.resolve('src/components', name + '.tsx');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const react = {
    forwardRef: fn => fn, useRef: current => ({ current }), useEffect: () => {},
    useMemo: fn => fn(), useState: value => [value, () => {}], useImperativeHandle: () => {},
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  const exports = {};
  const context = {
    exports, console, setTimeout, clearTimeout,
    require: name => {
      if (name === 'react') return react;
      if (name === 'react-native') return { Platform: { OS: 'android' }, StyleSheet: { create: x => x }, View: 'View', DeviceEventEmitter: { emit() {} } };
      if (name === 'react-native-webview') return { WebView: 'WebView' };
      if (name === 'expo-router/react-navigation') return { useIsFocused: () => true };
      if (name.includes('ThemeContext')) return { useAppTheme: () => ({ isDark: true, theme: { colors: { bgSurface: '#000' } } }) };
      if (name.includes('SettingsContext')) return { useSettings: () => ({ settings: { fontSize: 14, fontFamily: 'monospace', wordWrap: 'on', lineNumbers: 'on', minimap: false } }) };
      if (name.includes('LanguageContext')) return { useLanguage: () => ({ t: x => x }) };
      if (name.includes('editorWebBridge') || name.includes('terminalKeys') || name.includes('terminalWebInput') || name.includes('xtermBundle')) {
        const modulePath = path.resolve(path.dirname(filename), name + '.ts');
        const output = ts.transpileModule(fs.readFileSync(modulePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        const dependency = { exports: {} };
        vm.runInNewContext(output, dependency);
        return dependency.exports;
      }
      return {};
    },
  };
  vm.runInNewContext(source, context, { filename });
  const root = exports[name]({ code, language: 'js', onChangeCode() {} }, {});
  function find(node) {
    if (node?.props?.source?.html) return node.props.source.html;
    for (const child of node?.children || []) {
      const found = find(child);
      if (found) return found;
    }
  }
  return find(root);
}

module.exports = { renderEditor };

if (require.main === module) for (const engine of ['MonacoEditor', 'LightweightEditor', 'TerminalView']) {
  test(engine + ' generates executable scripts for the first file', () => {
    const html = renderEditor(engine, 'const message = "conteudo inicial";\n');
    assert.ok(html);
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length);
    for (const [, source] of scripts) new vm.Script(source, { filename: engine + '.html' });
  });
}
