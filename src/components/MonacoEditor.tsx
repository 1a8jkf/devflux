import React, { useRef, useEffect, forwardRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform, DeviceEventEmitter } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAppTheme } from '../contexts/ThemeContext';
import { useSettings } from '../contexts/SettingsContext';
import { AppTheme } from '../theme';

interface MonacoEditorProps {
  code: string;
  originalCode?: string;
  language: string;
  onChangeCode: (code: string) => void;
  readOnly?: boolean;
}

export interface MonacoEditorRef {
  undo: () => void;
  redo: () => void;
  handleToolbarAction?: (type: string, meta?: any) => void;
}

const MonacoEditorBase = ({ code, originalCode, language, onChangeCode, readOnly = false }: MonacoEditorProps, ref: React.ForwardedRef<MonacoEditorRef>) => {
  const { theme, variant } = useAppTheme();
  const { settings } = useSettings();
  const isDark = variant === 'dark';
  const webViewRef = useRef<WebView>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isLoaded = useRef(false);

  // Map our language names to Monaco language IDs
  const getMonacoLanguage = (lang: string) => {
    const map: Record<string, string> = {
      js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
      ts: 'typescript', tsx: 'typescript',
      html: 'html', htm: 'html',
      css: 'css', scss: 'scss', less: 'less',
      json: 'json', jsonc: 'json',
      markdown: 'markdown', md: 'markdown',
      py: 'python', python: 'python',
      java: 'java',
      c: 'c', h: 'c',
      cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
      cs: 'csharp',
      go: 'go',
      rs: 'rust',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin', kts: 'kotlin',
      xml: 'xml', svg: 'xml', plist: 'xml',
      yaml: 'yaml', yml: 'yaml',
      sh: 'shell', bash: 'shell', zsh: 'shell',
      sql: 'sql',
      r: 'r',
      lua: 'lua',
      dart: 'dart',
      dockerfile: 'dockerfile',
      graphql: 'graphql', gql: 'graphql',
      ini: 'ini', conf: 'ini',
      txt: 'plaintext',
    };
    return map[lang.toLowerCase()] || 'plaintext';
  };

  const monacoThemeName = isDark ? 'devflux-dark' : 'vs';

  const initialCode = useRef(code);
  const initialLanguage = useRef(language);
  const initialOriginalCode = useRef(originalCode);

  const htmlContent = React.useMemo(() => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    * {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }
    html, body, #container { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background-color: ${theme.colors.bgSurface}; }
    /* Android Keyboard Fix: ensure textarea is technically visible but transparent */
    .monaco-editor .inputarea {
      opacity: 0.01 !important;
      background: transparent !important;
      color: transparent !important;
      font-size: 16px !important;
    }
    /* Fix bold/cut text rendering on Android WebView */
    .monaco-editor .view-lines,
    .monaco-editor .view-line,
    .monaco-editor .view-line span,
    .monaco-editor [class^="mtk"] {
      font-weight: 400 !important;
      -webkit-font-smoothing: antialiased !important;
    }
    .monaco-editor .lines-content {
      font-weight: normal !important;
    }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/loader.min.js" onerror="window.ReactNativeWebView.postMessage(JSON.stringify({type: 'error', message: 'Failed to load Monaco'}))"></script>
</head>
<body>
  <div id="container"></div>
  <script>
    if (!window.ReactNativeWebView) {
      window.ReactNativeWebView = {
        postMessage: function(msg) {
          window.parent.postMessage(msg, '*');
        }
      };
    }
    require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' }});
    require(['vs/editor/editor.main'], function() {
      // Define VS Code Dark+ inspired theme
      monaco.editor.defineTheme('devflux-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'C586C0' },
          { token: 'keyword.control', foreground: 'C586C0' },
          { token: 'storage', foreground: '569CD6' },
          { token: 'storage.type', foreground: '569CD6' },
          { token: 'type', foreground: '4EC9B0' },
          { token: 'type.identifier', foreground: '4EC9B0' },
          { token: 'string', foreground: 'CE9178' },
          { token: 'string.escape', foreground: 'D7BA7D' },
          { token: 'number', foreground: 'B5CEA8' },
          { token: 'number.hex', foreground: 'B5CEA8' },
          { token: 'regexp', foreground: 'D16969' },
          { token: 'variable', foreground: '9CDCFE' },
          { token: 'variable.predefined', foreground: '4FC1FF' },
          { token: 'constant', foreground: '4FC1FF' },
          { token: 'identifier', foreground: '9CDCFE' },
          { token: 'delimiter', foreground: 'D4D4D4' },
          { token: 'delimiter.bracket', foreground: 'FFD700' },
          { token: 'tag', foreground: '569CD6' },
          { token: 'attribute.name', foreground: '9CDCFE' },
          { token: 'attribute.value', foreground: 'CE9178' },
          { token: 'metatag', foreground: '569CD6' },
          { token: 'metatag.content', foreground: 'CE9178' },
          { token: 'annotation', foreground: 'DCDCAA' },
          { token: 'function', foreground: 'DCDCAA' },
          { token: 'function.declaration', foreground: 'DCDCAA' },
          { token: 'predefined', foreground: '4EC9B0' },
          { token: 'operator', foreground: 'D4D4D4' },
          { token: 'namespace', foreground: '4EC9B0' },
        ],
        colors: {
          'editor.background': '#1E1E1E',
          'editor.foreground': '#D4D4D4',
          'editor.lineHighlightBackground': '#2A2D2E',
          'editor.selectionBackground': '#264F78',
          'editor.inactiveSelectionBackground': '#3A3D41',
          'editorCursor.foreground': '#AEAFAD',
          'editorWhitespace.foreground': '#3B3B3B',
          'editorLineNumber.foreground': '#858585',
          'editorLineNumber.activeForeground': '#C6C6C6',
          'editorIndentGuide.background': '#404040',
          'editorIndentGuide.activeBackground': '#707070',
          'editor.selectionHighlightBackground': '#ADD6FF26',
        }
      });
      // Force Android WebViews to use password input for Monaco helper to kill IME composition, word suggestions & double-space period
      var origCreateElement = document.createElement;
      document.createElement = function(tag, options) {
        if (tag && tag.toLowerCase() === 'textarea') {
          var input = origCreateElement.call(document, 'input', options);
          try { input.type = 'password'; } catch(e) {}
          input.setAttribute('autocorrect', 'off');
          input.setAttribute('autocapitalize', 'none');
          input.setAttribute('spellcheck', 'false');
          input.setAttribute('autocomplete', 'off');
          input.setAttribute('data-gramm', 'false');
          return input;
        }
        return origCreateElement.call(document, tag, options);
      };

      var originalCodeStr = '${encodeURIComponent(initialOriginalCode.current || '').replace(/'/g, "%27")}';
      var isDiff = originalCodeStr !== '';
      var editor;

      if (isDiff) {
        var originalModel = monaco.editor.createModel(decodeURIComponent(originalCodeStr), '${getMonacoLanguage(initialLanguage.current)}');
        var modifiedModel = monaco.editor.createModel(decodeURIComponent('${encodeURIComponent(initialCode.current).replace(/'/g, "%27")}'), '${getMonacoLanguage(initialLanguage.current)}');
        
        editor = monaco.editor.createDiffEditor(document.getElementById('container'), {
          theme: '${monacoThemeName}',
          automaticLayout: true,
          minimap: { enabled: ${settings.minimap} },
          fontSize: ${settings.fontSize},
          fontFamily: "'Droid Sans Mono', 'monospace', 'Courier New', monospace",
          fontWeight: 'normal',
          fontLigatures: false,
          wordWrap: '${settings.wordWrap}',
          readOnly: ${readOnly},
          renderSideBySide: false,
          scrollBeyondLastLine: false,
          padding: { top: 16 },
          renderLineHighlight: 'line',
          'bracketPairColorization.enabled': true
        });
        editor.setModel({
          original: originalModel,
          modified: modifiedModel
        });
      } else {
        editor = monaco.editor.create(document.getElementById('container'), {
          value: decodeURIComponent('${encodeURIComponent(initialCode.current).replace(/'/g, "%27")}'),
          language: '${getMonacoLanguage(initialLanguage.current)}',
          theme: '${monacoThemeName}',
          automaticLayout: true,
          minimap: { enabled: ${settings.minimap} },
          fontSize: ${settings.fontSize},
          fontFamily: "'Droid Sans Mono', 'monospace', 'Courier New', monospace",
          fontWeight: 'normal',
          fontLigatures: false,
          wordWrap: '${settings.wordWrap}',
          readOnly: ${readOnly},
          scrollBeyondLastLine: false,
          padding: { top: 16 },
          renderLineHighlight: 'line',
          'bracketPairColorization.enabled': true
        });
      }

      var modelEditor = isDiff ? editor.getModifiedEditor() : editor;

      // Android WebView Keyboard Fix
      document.addEventListener('touchend', function() {
         if (!${readOnly}) {
           setTimeout(function() {
             var input = document.querySelector('textarea.inputarea');
             if (input && document.activeElement !== input) {
                input.focus();
             }
           }, 50);
         }
      }, false);

      // Send updates to React Native
      modelEditor.onDidChangeModelContent(function() {
        var content = modelEditor.getValue();
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'change', content: content }));
      });

      // Listen for updates from React Native
      var handleMsg = function(event) {
        var msg;
        try { msg = JSON.parse(event.data); } catch(e) { return; }
        if (msg.type === 'updateValue') {
          if (modelEditor.getValue() !== msg.value) {
            modelEditor.setValue(msg.value);
          }
        } else if (msg.type === 'updateTheme') {
          monaco.editor.setTheme(msg.theme);
        } else if (msg.type === 'updateLanguage') {
          monaco.editor.setModelLanguage(modelEditor.getModel(), msg.language);
          if (isDiff) {
            monaco.editor.setModelLanguage(editor.getOriginalEditor().getModel(), msg.language);
          }
        } else if (msg.type === 'updateSettings') {
          editor.updateOptions(msg.settings);
        } else if (msg.type === 'triggerAction') {
          if (msg.action === 'undo') modelEditor.trigger('keyboard', 'undo', null);
          if (msg.action === 'redo') modelEditor.trigger('keyboard', 'redo', null);
        } else if (msg.type === 'toolbarAction') {
          if (typeof focusMonacoTextarea === 'function') focusMonacoTextarea();
          if (modelEditor && typeof modelEditor.focus === 'function') modelEditor.focus();
          if (msg.actionType === 'modifier') {
            window.keyboardModifiers = msg.meta;
          } else if (msg.actionType === 'keypress') {
            var key = msg.meta.key;
            if (msg.meta.ctrlKey) {
              if (key === 'c') { modelEditor.trigger('keyboard', 'editor.action.clipboardCopyAction', null); return; }
              if (key === 'x') { modelEditor.trigger('keyboard', 'editor.action.clipboardCutAction', null); return; }
              if (key === 'v') { modelEditor.trigger('keyboard', 'editor.action.clipboardPasteAction', null); return; }
              if (key === 'z') { modelEditor.trigger('keyboard', 'undo', null); return; }
              if (key === 'y') { modelEditor.trigger('keyboard', 'redo', null); return; }
              if (key === 'a') { modelEditor.setSelection(modelEditor.getModel().getFullModelRange()); return; }
              if (key === 'f') { modelEditor.trigger('keyboard', 'actions.find', null); return; }
              if (key === 's') { /* save handled externally usually */ return; }
            }
            if (key === 'Escape') { modelEditor.trigger('keyboard', 'closeFindWidget', null); return; }
            if (key === 'Tab') { modelEditor.trigger('keyboard', 'tab', null); return; }
            if (key === 'Undo' || key === 'undo') { modelEditor.trigger('keyboard', 'undo', null); return; }
            if (key === 'Redo' || key === 'redo') { modelEditor.trigger('keyboard', 'redo', null); return; }
            if (key === 'Search' || key === 'search') { modelEditor.trigger('keyboard', 'actions.find', null); return; }
            if (key === 'ArrowLeft') { modelEditor.trigger('keyboard', 'cursorLeft', null); return; }
            if (key === 'ArrowRight') { modelEditor.trigger('keyboard', 'cursorRight', null); return; }
            if (key === 'ArrowUp') { modelEditor.trigger('keyboard', 'cursorUp', null); return; }
            if (key === 'ArrowDown') { modelEditor.trigger('keyboard', 'cursorDown', null); return; }
            if (key.length === 1) {
              modelEditor.trigger('keyboard', 'type', { text: key }); return;
            }
          }
        } else if (msg.type === 'gotoLine') {
          modelEditor.setPosition({ lineNumber: msg.line, column: 1 });
          modelEditor.revealLineInCenter(msg.line);
          modelEditor.focus();
        }
      };
      
      window.keyboardModifiers = { ctrlKey: false, shiftKey: false, altKey: false };
      document.addEventListener('keydown', function(e) {
         if (window.keyboardModifiers.ctrlKey && e.key && e.key.length === 1) {
           var key = e.key.toLowerCase();
           if (key === 'c') { modelEditor.trigger('keyboard', 'editor.action.clipboardCopyAction', null); e.preventDefault(); }
           if (key === 'v') { modelEditor.trigger('keyboard', 'editor.action.clipboardPasteAction', null); e.preventDefault(); }
           if (key === 'x') { modelEditor.trigger('keyboard', 'editor.action.clipboardCutAction', null); e.preventDefault(); }
           if (key === 'z') { modelEditor.trigger('keyboard', 'undo', null); e.preventDefault(); }
           if (key === 'a') { modelEditor.setSelection(modelEditor.getModel().getFullModelRange()); e.preventDefault(); }
         }
      }, true);
      
      // Removing custom focusInput listeners as they interfere with Android soft keyboard
      // Let Monaco handle its own focus events natively.
      
      window.addEventListener('message', handleMsg);
      document.addEventListener('message', handleMsg);
      
      // Notify React Native that editor is ready
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
    });
  </script>
</body>
</html>
  `, [theme, isDark, readOnly, settings]);

  const latestCode = useRef(code);
  const internalUpdate = useRef(false);

  // We handle [code] updates in a single useEffect below

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'change') {
        internalUpdate.current = true;
        latestCode.current = data.content;
        onChangeCode(data.content);
      } else if (data.type === 'ready') {
        isLoaded.current = true;
        postToEditor({ type: 'updateValue', value: latestCode.current });
        postToEditor({ type: 'updateTheme', theme: monacoThemeName });
        postToEditor({ type: 'updateLanguage', language: getMonacoLanguage(language) });
      } else if (data.type === 'error') {
        console.error('Monaco Editor Error:', data.message);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleWebMessage = (event: any) => {
        try {
          if (typeof event.data === 'string') {
            const data = JSON.parse(event.data);
            if (data.type === 'change') {
              internalUpdate.current = true;
              latestCode.current = data.content;
              onChangeCode(data.content);
            } else if (data.type === 'ready') {
              isLoaded.current = true;
              postToEditor({ type: 'updateValue', value: code });
              postToEditor({ type: 'updateTheme', theme: monacoThemeName });
              postToEditor({ type: 'updateLanguage', language: getMonacoLanguage(language) });
            }
          }
        } catch (e) {}
      };
      window.addEventListener('message', handleWebMessage);
      return () => window.removeEventListener('message', handleWebMessage);
    }
  }); // Remove [] so it captures latest code, monacoThemeName, language in the closure

  const postToEditor = (msg: any) => {
    if (!isLoaded.current) return;
    if (Platform.OS === 'web') {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage(JSON.stringify(msg), '*');
      }
    } else {
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify(msg));
      }
    }
  };

  React.useImperativeHandle(ref, () => ({
    undo: () => postToEditor({ type: 'triggerAction', action: 'undo' }),
    redo: () => postToEditor({ type: 'triggerAction', action: 'redo' }),
    handleToolbarAction: (type: string, meta: any) => {
      if (type === 'gotoLine') {
        postToEditor({ type: 'gotoLine', line: meta });
      } else {
        postToEditor({ type: 'toolbarAction', actionType: type, meta });
      }
    }
  }));

  useEffect(() => {
    // Only send to WebView if this change came from OUTSIDE (e.g., Live Sync PC)
    // If it came from the user typing, internalUpdate is true, so we skip it to prevent cursor jumping!
    if (internalUpdate.current) {
      internalUpdate.current = false; // Reset for next time
    } else {
      latestCode.current = code;
      postToEditor({ type: 'updateValue', value: code });
    }
  }, [code]);

  useEffect(() => {
    postToEditor({ type: 'updateTheme', theme: monacoThemeName });
  }, [monacoThemeName]);

  useEffect(() => {
    postToEditor({ type: 'updateLanguage', language: getMonacoLanguage(language) });
  }, [language]);

  useEffect(() => {
    postToEditor({ 
      type: 'updateSettings', 
      settings: {
        fontSize: settings.fontSize,
        wordWrap: settings.wordWrap,
        minimap: { enabled: settings.minimap }
      }
    });
  }, [settings]);

  return (
    <View 
      style={styles.container}
      onTouchStart={() => {
        (global as any).activeInputTarget = 'editor';
        DeviceEventEmitter.emit('SHOW_KEYBOARD_TOOLBAR', { target: 'editor' });
      }}
    >
      {Platform.OS === 'web' ? (
        <iframe
          ref={iframeRef as any}
          srcDoc={htmlContent}
          style={{ flex: 1, border: 'none', width: '100%', height: '100%' }}
          sandbox="allow-scripts allow-same-origin"
        />
      ) : (
        <WebView
          ref={webViewRef}
          source={{ html: htmlContent }}
          onMessage={handleMessage}
          style={styles.webview}
          bounces={false}
          scrollEnabled={true}
          nestedScrollEnabled={true}
          keyboardDisplayRequiresUserAction={false}
          androidLayerType="none"
          scalesPageToFit={false}
          textZoom={100}
          javaScriptEnabled={true}
          originWhitelist={['*']}
          allowFileAccess={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={theme.colors.accentBlue} />
            </View>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loading: {
    ...StyleSheet.absoluteFill as any,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  }
});

export const MonacoEditor = forwardRef(MonacoEditorBase);