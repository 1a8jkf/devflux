import React, { useRef, useEffect, useState, forwardRef } from 'react';
import { View, Text, StyleSheet, DeviceEventEmitter, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAppTheme } from '../contexts/ThemeContext';
import { useSettings } from '../contexts/SettingsContext';
import { DebugService } from '../services/DebugService';
import { ContextManager } from '../services/ContextManager';
import { CodeEditorProps, CodeEditorRef } from './CodeEditor';
import { EDITOR_WEB_BRIDGE } from './editorWebBridge';
import { handleEditorNativeMessage } from './editorNativeBridge';

export const LightweightEditor = forwardRef<CodeEditorRef, CodeEditorProps>(
  ({ code, language, onChangeCode, onSaveCode, readOnly = false, filePath, onFocus, onBlur }, ref) => {
    const { isDark } = useAppTheme();
    const { settings } = useSettings();
    const webViewRef = useRef<WebView>(null);
    const isLoaded = useRef(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const latestCode = useRef(code);
    const mounted = useRef(true);
    const [editorError, setEditorError] = useState('');
    useEffect(() => {
      mounted.current = true;
      return () => { mounted.current = false; isLoaded.current = false; };
    }, []);

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

    const htmlContent = React.useMemo(() => `<!DOCTYPE html>
<html>
<head>
  <script>${EDITOR_WEB_BRIDGE}</script>
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

    var changeTimer = null;
    editor.session.on('change', function() {
      if (window.devfluxExternalUpdate) return;
      if (changeTimer) clearTimeout(changeTimer);
      changeTimer = setTimeout(function() {
        changeTimer = null;
        window.devfluxPost({ type: 'change', value: editor.getValue() });
      }, 80);
    });

    editor.on('focus', function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'focus' }));
    });

    editor.on('blur', function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'blur' }));
    });

    window.updateCode = function(newCode) {
      var current = editor.getValue();
      if (newCode !== current) {
        window.devfluxExternalUpdate = true;
        var pos = editor.getCursorPosition();
        var scrollTop = editor.session.getScrollTop();
        editor.setValue(newCode, -1);
        try {
          var maxRow = editor.session.getLength() - 1;
          if (pos.row <= maxRow) {
            var maxCol = editor.session.getLine(pos.row).length;
            editor.moveCursorToPosition({ row: pos.row, column: Math.min(pos.column, maxCol) });
          }
          editor.session.setScrollTop(scrollTop);
        } catch(e) {}
        window.devfluxExternalUpdate = false;
      }
    };

    window.updateFont = function(size, family) {
      if (size) editor.setOption('fontSize', size);
      if (family) editor.setOption('fontFamily', family + ', "JetBrains Mono", monospace');
    };

    window.doUndo = function() { editor.undo(); };
    window.doRedo = function() { editor.redo(); };

    window.handleToolbarAction = function(type, meta) {
      if (type === 'modifier') {
        window.devfluxSetModifiers(meta);
        if (meta.ctrlKey || meta.shiftKey || meta.altKey) editor.focus();
        return;
      }
      window.devfluxSetModifiers({});
      editor.focus();
      if (type === 'insert') {
        editor.insert(meta.text || '');
      } else if (type === 'gotoLine') {
        editor.gotoLine(Number(meta.line || meta), 0, true);
      } else if (type === 'keypress') {
        var key = meta.key;
        try {
        if (meta.ctrlKey) {
          if (key.length === 1) key = key.toLowerCase();
          if (key === 'c' || key === 'x' || key === 'v') {
            var selection = editor.getSelectionRange().clone();
            var value = editor.getValue();
            if (key !== 'v' && selection.isEmpty()) {
              selection.start.column = 0;
              selection.end.row = Math.min(selection.start.row + 1, editor.session.getLength() - 1);
              selection.end.column = selection.end.row > selection.start.row ? 0 : editor.session.getLine(selection.end.row).length;
            }
            window.devfluxClipboard(key === 'v' ? 'paste' : 'copy', editor.session.getTextRange(selection), meta, function(text) {
              if (key === 'c') return;
              if (editor.getReadOnly() || editor.getValue() !== value) throw new Error('Editor changed while clipboard was pending.');
              editor.session.markUndoGroup();
              editor.selection.setSelectionRange(selection);
              editor.insert(key === 'x' ? '' : String(text || '').replace(/\\r\\n?/g, '\\n'));
              editor.session.markUndoGroup();
            });
            return;
          }
          if (key === 'z') { meta.shiftKey ? editor.redo() : editor.undo(); return; }
          if (key === 'y') { editor.redo(); return; }
          if (key === 'a') { editor.selectAll(); return; }
          if (key === 'd') { editor.execCommand('selectMoreAfter'); return; }
          if (key === 'f') { editor.execCommand('find'); return; }
          if (key === 's') { window.devfluxPost({ type: 'save', content: editor.getValue(), requestId: meta.requestId }); return; }
        }
        if (key === 'Tab') { meta.shiftKey ? editor.blockOutdent() : editor.indent(); }
        else if (key === 'Enter') { editor.insert('\\n'); }
        else if (key === 'Backspace') { editor.remove('left'); }
        else if (key === 'Escape') { if (editor.completer) editor.completer.detach(); }
        else if (key === 'Undo') { editor.undo(); }
        else if (key === 'Redo') { editor.redo(); }
        else if (key === 'Search') { editor.execCommand('find'); }
        else if (key === 'ArrowLeft') { editor.execCommand(meta.ctrlKey ? (meta.shiftKey ? 'selectwordleft' : 'gotowordleft') : (meta.shiftKey ? 'selectleft' : 'gotoleft')); }
        else if (key === 'ArrowRight') { editor.execCommand(meta.ctrlKey ? (meta.shiftKey ? 'selectwordright' : 'gotowordright') : (meta.shiftKey ? 'selectright' : 'gotoright')); }
        else if (key === 'ArrowUp') { meta.shiftKey ? editor.selection.selectUp() : editor.navigateUp(1); }
        else if (key === 'ArrowDown') { meta.shiftKey ? editor.selection.selectDown() : editor.navigateDown(1); }
        else if (key.length === 1 && !meta.ctrlKey && !meta.altKey && !editor.getReadOnly()) { editor.insert(meta.shiftKey ? key.toUpperCase() : key); }
        } catch (error) {
          window.devfluxComplete(meta, String(error));
        } finally {
          if (!(meta.ctrlKey && ['c', 'x', 'v', 's'].indexOf(key) >= 0)) window.devfluxComplete(meta);
        }
      }
    };
    window.devfluxInstallModifiers(function(meta) { window.handleToolbarAction('keypress', meta); });
    function handleMessage(event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (error) { return; }
      if (msg.type === 'updateValue') window.updateCode(msg.value);
      else if (msg.type === 'clipboardResult') window.devfluxClipboardResult(msg);
      else if (msg.type === 'toolbarAction') window.handleToolbarAction(msg.actionType, msg.meta);
      else if (msg.type === 'settings') {
        editor.setReadOnly(msg.readOnly);
        editor.session.setMode('ace/mode/' + msg.mode);
        editor.setOptions(msg.options);
      }
    }
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage);
    window.devfluxPost({ type: 'ready' });
  </script>
</body>
</html>
    `, []);

    const post = (msg: any) => {
      if (!isLoaded.current || !mounted.current) return;
      if (Platform.OS === 'web') iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), '*');
      else webViewRef.current?.postMessage(JSON.stringify(msg));
    };

    const syncSettings = () => post({
      type: 'settings', readOnly, mode: getAceMode(language),
      options: { fontSize, fontFamily, wrap: settings.wordWrap === 'on', showLineNumbers: settings.lineNumbers === 'on' },
    });

    // Track the last value Ace reported so we can skip echoing it back.
    // Without this guard, every keystroke causes: Ace change -> React setCode ->
    // useEffect[code] -> postMessage(updateValue) -> Ace setValue -> cursor reset.
    const lastAceValue = useRef(code);

    // Sync code changes to the editor — only for EXTERNAL changes (file load,
    // LiveSync, AI edit). Typing-originated values already exist in Ace.
    useEffect(() => {
      latestCode.current = code;
      if (code === lastAceValue.current) return;
      post({ type: 'updateValue', value: code });
    }, [code]);

    // Sync font size/family changes dynamically (no remount)
    useEffect(() => {
      syncSettings();
    }, [fontSize, fontFamily, language, readOnly, settings.wordWrap, settings.lineNumbers]);

    React.useImperativeHandle(ref, () => ({
      undo: () => {
        webViewRef.current?.injectJavaScript(`window.doUndo && window.doUndo(); true;`);
      },
      redo: () => {
        webViewRef.current?.injectJavaScript(`window.doRedo && window.doRedo(); true;`);
      },
      handleToolbarAction: (type, meta) => {
        post({ type: 'toolbarAction', actionType: type, meta: meta || {} });
      }
    }));

    const handleMessage = (event: any) => {
      if (!mounted.current) return;
      try {
        const data = JSON.parse(event.nativeEvent.data);
        void handleEditorNativeMessage(data, post, () => mounted.current && (global as any).activeInputTarget === 'editor', filePath, onSaveCode);
        if (data.type === 'ready') {
          isLoaded.current = true;
          post({ type: 'updateValue', value: latestCode.current });
          syncSettings();
          DebugService.log('editor', 'info', 'Ace pronto.', { file: filePath, bytes: latestCode.current.length });
        } else if (data.type === 'error') {
          setEditorError(data.message);
          DebugService.log('editor', 'error', data.message, { project: ContextManager.getActiveProject() || undefined, file: filePath, engine: 'ace' });
        } else if (data.type === 'change') {
          lastAceValue.current = data.value;
          latestCode.current = data.value;
          onChangeCode(data.value);
        } else if (data.type === 'focus' && !readOnly) {
          (global as any).activeInputTarget = 'editor';
          DeviceEventEmitter.emit('SHOW_KEYBOARD_TOOLBAR', { target: 'editor', keyboardExpected: true });
          onFocus?.();
        } else if (data.type === 'blur') onBlur?.();
      } catch (error) {
        DebugService.log('editor', 'error', 'Mensagem invalida do Ace.', { file: filePath, error: String(error) });
      }
    };
    const messageHandler = useRef(handleMessage);
    useEffect(() => { messageHandler.current = handleMessage; });
    useEffect(() => {
      if (Platform.OS !== 'web') return;
      const receive = (event: MessageEvent) => {
        if (event.source === iframeRef.current?.contentWindow) messageHandler.current({ nativeEvent: { data: event.data } });
      };
      window.addEventListener('message', receive);
      return () => window.removeEventListener('message', receive);
    }, []);

    return (
      <View style={styles.container}>
        {!!editorError && <Text style={{ color: '#EF4444', padding: 12 }}>{editorError}</Text>}
        {Platform.OS === 'web' ? (
          <iframe ref={iframeRef} srcDoc={htmlContent} style={{ border: 0, width: '100%', height: '100%', flex: 1 }} />
        ) : <WebView
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
          onMessage={handleMessage}
        />}
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
