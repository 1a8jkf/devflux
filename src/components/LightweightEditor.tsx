import React, { useRef, useEffect, forwardRef } from 'react';
import { View, StyleSheet, DeviceEventEmitter } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAppTheme } from '../contexts/ThemeContext';
import { useSettings } from '../contexts/SettingsContext';
import { DebugService } from '../services/DebugService';
import { ContextManager } from '../services/ContextManager';
import { CodeEditorProps, CodeEditorRef } from './CodeEditor';

export const LightweightEditor = forwardRef<CodeEditorRef, CodeEditorProps>(
  ({ code, originalCode, language, onChangeCode, readOnly = false, filePath, onFocus, onBlur }, ref) => {
    const { theme, isDark } = useAppTheme();
    const { settings } = useSettings();
    const webViewRef = useRef<WebView>(null);
    const isLoaded = useRef(false);

    // Provide initial values without causing remounts when props change
    const initialCode = useRef(code);
    const initialLanguage = useRef(language);

    // Map extension to Ace mode
    const getAceMode = (lang: string) => {
      const map: Record<string, string> = {
        js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
        ts: 'typescript', tsx: 'typescript',
        html: 'html', htm: 'html',
        css: 'css', scss: 'scss', less: 'less',
        json: 'json', jsonc: 'json',
        markdown: 'markdown', md: 'markdown',
        py: 'python', python: 'python',
        java: 'java', c: 'c_cpp', h: 'c_cpp', cpp: 'c_cpp',
        cs: 'csharp', go: 'golang', rs: 'rust', rb: 'ruby',
        php: 'php', swift: 'swift', sh: 'sh', bash: 'sh',
        xml: 'xml', yaml: 'yaml', yml: 'yaml',
        sql: 'sql',
      };
      return map[lang] || 'text';
    };

    // Build DevFlux palette based on the app's design system theme colors
    const buildThemeColors = () => {
      if (isDark) {
        return {
          bg: '#000000',
          bgGutter: '#0A0A0A',
          border: '#1A1A1A',
          cursor: '#2563EB',
          text: '#F8FAFC',
          selection: '#2563EB33',
          activeLine: '#111111',
          keyword: '#7C3AED',
          string: '#10B981',
          comment: '#4A4A4A',
          number: '#D97706',
          func: '#0EA5A9',
          variable: '#F8FAFC',
          type: '#2563EB',
          operator: '#A1A1AA',
          error: '#EF4444',
          gutterText: '#333333',
        };
      } else {
        return {
          bg: '#F8FAFC',
          bgGutter: '#F1F5F9',
          border: '#CBD5E1',
          cursor: '#2563EB',
          text: '#0F172A',
          selection: '#2563EB22',
          activeLine: '#EEF4FF',
          keyword: '#7C3AED',
          string: '#059669',
          comment: '#94A3B8',
          number: '#D97706',
          func: '#0EA5A9',
          variable: '#0F172A',
          type: '#2563EB',
          operator: '#64748B',
          error: '#EF4444',
          gutterText: '#CBD5E1',
        };
      }
    };

    const c = buildThemeColors();
    const fontSize = settings.fontSize || 14;
    const fontFamily = settings.fontFamily || 'monospace';

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <style>
    html, body {
      margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden;
      background-color: ${c.bg};
    }
    #editor {
      margin: 0; position: absolute; top: 0; bottom: 0; left: 0; right: 0;
    }
    /* DevFlux Ace Theme CSS - applied before render to prevent flash */
    .ace-devflux .ace_editor,
    .ace-devflux { background-color: ${c.bg} !important; color: ${c.text} !important; }
    .ace-devflux .ace_gutter { background: ${c.bgGutter} !important; color: ${c.gutterText} !important; border-right: 1px solid ${c.border} !important; }
    .ace-devflux .ace_gutter-active-line { background: ${c.activeLine} !important; }
    .ace-devflux .ace_marker-layer .ace_selection { background: ${c.selection} !important; }
    .ace-devflux .ace_marker-layer .ace_active-line { background: ${c.activeLine} !important; }
    .ace-devflux .ace_cursor { color: ${c.cursor} !important; border-color: ${c.cursor} !important; }
    .ace-devflux .ace_keyword { color: ${c.keyword} !important; font-weight: bold; }
    .ace-devflux .ace_string { color: ${c.string} !important; }
    .ace-devflux .ace_comment { color: ${c.comment} !important; font-style: italic; }
    .ace-devflux .ace_numeric, .ace-devflux .ace_constant.ace_numeric { color: ${c.number} !important; }
    .ace-devflux .ace_entity.ace_name.ace_function,
    .ace-devflux .ace_support.ace_function { color: ${c.func} !important; }
    .ace-devflux .ace_variable { color: ${c.variable} !important; }
    .ace-devflux .ace_support.ace_type, .ace-devflux .ace_storage.ace_type { color: ${c.type} !important; }
    .ace-devflux .ace_keyword.ace_operator { color: ${c.operator} !important; }
    .ace-devflux .ace_constant.ace_language { color: ${c.keyword} !important; }
    .ace-devflux .ace_entity.ace_name.ace_tag { color: ${c.func} !important; }
    .ace-devflux .ace_entity.ace_other.ace_attribute-name { color: ${c.keyword} !important; }
    .ace-devflux .ace_invalid { background-color: ${c.error}33 !important; color: ${c.error} !important; }
    .ace-devflux .ace_scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .ace-devflux .ace_scrollbar::-webkit-scrollbar-track { background: ${c.bgGutter}; }
    .ace-devflux .ace_scrollbar::-webkit-scrollbar-thumb { background: ${c.border}; border-radius: 3px; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.7/ace.js" onerror="window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: 'Failed to load Ace' }))"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.7/ext-language_tools.js"></script>
</head>
<body>
  <div id="editor"></div>
  <script>
    if (!window.ReactNativeWebView) {
      window.ReactNativeWebView = { postMessage: function(msg) { window.parent.postMessage(msg, '*'); } };
    }

    // Register DevFlux theme synchronously — theme CSS is already injected in <style> above
    // This just tells Ace which cssClass to use. No async theme loading = no flash.
    ace.define('ace/theme/devflux', ['require', 'exports', 'module', 'ace/lib/dom'], function(acereq, exports, module) {
      exports.isDark = ${isDark};
      exports.cssClass = 'ace-devflux';
      exports.cssText = '';
    });

    ace.require("ace/ext/language_tools");
    var editor = ace.edit("editor");

    // Apply theme immediately (synchronous, already defined above)
    editor.setTheme("ace/theme/devflux");

    var mode = "ace/mode/${getAceMode(initialLanguage.current)}";
    editor.session.setMode(mode);

    editor.setOptions({
      enableBasicAutocompletion: true,
      enableSnippets: true,
      enableLiveAutocompletion: true,
      showPrintMargin: false,
      wrap: ${settings.wordWrap === 'on'},
      showLineNumbers: ${settings.lineNumbers === 'on'},
      readOnly: ${readOnly},
      tabSize: 2,
      useSoftTabs: true,
      fontFamily: '${fontFamily}, "JetBrains Mono", "Cascadia Code", monospace',
      fontSize: ${fontSize},
    });

    // Android IME: disable autocorrect on Ace's hidden textarea input
    var ta = editor.textInput.getElement();
    ta.setAttribute('autocorrect', 'off');
    ta.setAttribute('autocapitalize', 'none');
    ta.setAttribute('spellcheck', 'false');
    ta.setAttribute('autocomplete', 'off');
    ta.setAttribute('inputmode', 'text');

    // Decode and set initial value
    var initialVal = decodeURIComponent('${encodeURIComponent(initialCode.current).replace(/'/g, "%27")}');
    editor.setValue(initialVal, -1);

    editor.session.on('change', function(delta) {
      if (window.changeTimeout) clearTimeout(window.changeTimeout);
      window.changeTimeout = setTimeout(function() {
        var val = editor.getValue();
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'change', value: val }));
      }, 300);
    });

    editor.on('focus', function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'focus' }));
    });

    editor.on('blur', function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'blur' }));
    });

    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));

    window.updateCode = function(newCode) {
      var current = editor.getValue();
      if (newCode !== current) {
        var pos = editor.getCursorPosition();
        editor.setValue(newCode, -1);
        editor.moveCursorToPosition(pos);
      }
    };

    window.updateFont = function(size, family) {
      if (size) editor.setOption('fontSize', size);
      if (family) editor.setOption('fontFamily', family + ', "JetBrains Mono", monospace');
    };

    window.doUndo = function() { editor.undo(); };
    window.doRedo = function() { editor.redo(); };

    window.handleToolbarAction = function(type, meta) {
      if (type === 'insert') {
        editor.insert(meta.text || '');
      } else if (type === 'keypress') {
        var key = meta.key;
        if (meta.ctrlKey) {
          if (key === 'c') { editor.execCommand('copy'); return; }
          if (key === 'x') { editor.execCommand('cut'); return; }
          if (key === 'v') { editor.execCommand('paste'); return; }
          if (key === 'z') { editor.undo(); return; }
          if (key === 'y') { editor.redo(); return; }
          if (key === 'a') { editor.selectAll(); return; }
          if (key === 'f') { editor.execCommand('find'); return; }
          if (key === 's') { return; }
        }
        if (key === 'Tab') { editor.indent(); }
        else if (key === 'Enter') { editor.insert('\n'); }
        else if (key === 'Backspace') { editor.remove('left'); }
        else if (key === 'Escape') { editor.blur(); }
        else if (key === 'Undo') { editor.undo(); }
        else if (key === 'Redo') { editor.redo(); }
        else if (key === 'Search') { editor.execCommand('find'); }
        else if (key === 'ArrowLeft') { editor.navigateLeft(1); }
        else if (key === 'ArrowRight') { editor.navigateRight(1); }
        else if (key === 'ArrowUp') { editor.navigateUp(1); }
        else if (key === 'ArrowDown') { editor.navigateDown(1); }
        else if (key.length === 1) { editor.insert(key); }
      }
    };
  </script>
</body>
</html>
    `;

    // Sync code changes to the editor without remounting
    useEffect(() => {
      if (isLoaded.current && webViewRef.current) {
        const encoded = encodeURIComponent(code).replace(/'/g, "%27");
        webViewRef.current.injectJavaScript(`
          if (window.updateCode) {
            window.updateCode(decodeURIComponent('${encoded}'));
          }
          true;
        `);
      }
    }, [code]);

    // Sync font size/family changes dynamically (no remount)
    useEffect(() => {
      if (isLoaded.current && webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          if (window.updateFont) {
            window.updateFont(${fontSize}, '${fontFamily}');
          }
          true;
        `);
      }
    }, [fontSize, fontFamily]);

    React.useImperativeHandle(ref, () => ({
      undo: () => {
        webViewRef.current?.injectJavaScript(`window.doUndo && window.doUndo(); true;`);
      },
      redo: () => {
        webViewRef.current?.injectJavaScript(`window.doRedo && window.doRedo(); true;`);
      },
      handleToolbarAction: (type, meta) => {
        const payload = JSON.stringify({ type, meta: meta || {} });
        webViewRef.current?.injectJavaScript(`
          if (window.handleToolbarAction) {
            var p = ${payload};
            window.handleToolbarAction(p.type, p.meta);
          }
          true;
        `);
      }
    }));

    return (
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{ html: htmlContent }}
          style={styles.webview}
          originWhitelist={['*']}
          bounces={false}
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView={true}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'ready') {
                isLoaded.current = true;
              } else if (data.type === 'error') {
                DebugService.log('editor', 'error', data.message || 'Erro no editor Ace.', { project: ContextManager.getActiveProject() || undefined, file: filePath, engine: 'ace' });
              } else if (data.type === 'change') {
                onChangeCode(data.value);
              } else if (data.type === 'focus') {
                // Ace got explicit focus — claim activeInputTarget so Shell toolbar is suppressed
                (global as any).activeInputTarget = 'editor';
                DeviceEventEmitter.emit('SHOW_KEYBOARD_TOOLBAR', { target: 'editor' });
                onFocus?.();
              } else if (data.type === 'blur') {
                onBlur?.();
              }
            } catch (e) {}
          }}
        />
      </View>
    );
  }
);

LightweightEditor.displayName = 'LightweightEditor';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative'
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent'
  }
});
