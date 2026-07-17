import React, { useRef, useEffect, forwardRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAppTheme } from '../contexts/ThemeContext';
import { useSettings } from '../contexts/SettingsContext';
import { AppTheme } from '../theme';

interface MonacoEditorProps {
  code: string;
  originalCode?: string;
  language: string;
  onChangeCode: (code: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  readOnly?: boolean;
}

export interface MonacoEditorRef {
  undo: () => void;
  redo: () => void;
  handleToolbarAction?: (type: string, meta?: any) => void;
}

const MonacoEditorBase = ({ code, originalCode, language, onChangeCode, onFocus, onBlur, readOnly = false }: MonacoEditorProps, ref: React.ForwardedRef<MonacoEditorRef>) => {
  const { theme, variant } = useAppTheme();
  const { settings } = useSettings();
  const isDark = variant === 'dark';
  const webViewRef = useRef<WebView>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isLoaded = useRef(false);

  // Map our language names to Monaco language IDs
  const getMonacoLanguage = (lang: string) => {
    switch (lang) {
      case 'js':
      case 'jsx': return 'javascript';
      case 'ts':
      case 'tsx': return 'typescript';
      case 'html': return 'html';
      case 'css': return 'css';
      case 'json': return 'json';
      case 'markdown': return 'markdown';
      default: return 'javascript';
    }
  };

  const monacoTheme = isDark ? 'vs-dark' : 'vs';

  const initialCode = useRef(code);
  const initialLanguage = useRef(language);
  const initialOriginalCode = useRef(originalCode);

  const htmlContent = React.useMemo(() => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    html, body, #container { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background-color: ${theme.colors.bgSurface}; }
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
      var originalCodeStr = '${encodeURIComponent(initialOriginalCode.current || '').replace(/'/g, "%27")}';
      var isDiff = originalCodeStr !== '';
      var editor;

      if (isDiff) {
        var originalModel = monaco.editor.createModel(decodeURIComponent(originalCodeStr), '${getMonacoLanguage(initialLanguage.current)}');
        var modifiedModel = monaco.editor.createModel(decodeURIComponent('${encodeURIComponent(initialCode.current).replace(/'/g, "%27")}'), '${getMonacoLanguage(initialLanguage.current)}');
        
        editor = monaco.editor.createDiffEditor(document.getElementById('container'), {
          theme: '${monacoTheme}',
          automaticLayout: true,
          minimap: { enabled: ${settings.minimap} },
          fontSize: ${settings.fontSize},
          wordWrap: '${settings.wordWrap}',
          readOnly: ${readOnly},
          renderSideBySide: false,
          scrollBeyondLastLine: false,
          padding: { top: 16 }
        });
        editor.setModel({
          original: originalModel,
          modified: modifiedModel
        });
      } else {
        editor = monaco.editor.create(document.getElementById('container'), {
          value: decodeURIComponent('${encodeURIComponent(initialCode.current).replace(/'/g, "%27")}'),
          language: '${getMonacoLanguage(initialLanguage.current)}',
          theme: '${monacoTheme}',
          automaticLayout: true,
          minimap: { enabled: ${settings.minimap} },
          fontSize: ${settings.fontSize},
          wordWrap: '${settings.wordWrap}',
          readOnly: ${readOnly},
          scrollBeyondLastLine: false,
          padding: { top: 16 }
        });
      }

      var modelEditor = isDiff ? editor.getModifiedEditor() : editor;

      // Send updates to React Native
      modelEditor.onDidChangeModelContent(function() {
        var content = modelEditor.getValue();
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'change', content: content }));
      });

      modelEditor.onDidFocusEditorText(function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'focus' }));
      });

      modelEditor.onDidBlurEditorText(function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'blur' }));
      });

      // Remove aggressive document-level listeners that break scrolling
      // Android WebView Keyboard robust hack - only trigger on actual editor interaction
      var focusMonacoTextarea = function() {
        var textarea = document.querySelector('textarea');
        if (textarea && document.activeElement !== textarea) {
          textarea.focus();
          textarea.click();
        }
      };
      
      // Let Monaco tell us when a genuine tap/click happens, ignoring scrolls!
      modelEditor.onMouseUp(function(e) {
         focusMonacoTextarea();
      });

      // Prevent native WebView scrolling which causes cursor to jump to line 0 on Android
      window.addEventListener('scroll', function() { window.scrollTo(0, 0); });

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
            if (key === 'ArrowLeft') { modelEditor.trigger('keyboard', 'cursorLeft', null); return; }
            if (key === 'ArrowRight') { modelEditor.trigger('keyboard', 'cursorRight', null); return; }
            if (key === 'ArrowUp') { modelEditor.trigger('keyboard', 'cursorUp', null); return; }
            if (key === 'ArrowDown') { modelEditor.trigger('keyboard', 'cursorDown', null); return; }
            if (key.length === 1) {
              modelEditor.trigger('keyboard', 'type', { text: key }); return;
            }
          }
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
      
      window.addEventListener('message', handleMsg);
      document.addEventListener('message', handleMsg);
      
      // Notify React Native that editor is ready
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
    });
  </script>
</body>
</html>
  `, [theme.colors.bgSurface, monacoTheme, settings.minimap, settings.fontSize, settings.wordWrap, readOnly]);

  const internalCode = useRef(code);
  const isTyping = useRef(false);
  const typingTimeout = useRef<any>(null);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'change') {
        isTyping.current = true;
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => { isTyping.current = false; }, 800);
        
        internalCode.current = data.content;
        onChangeCode(data.content);
      } else if (data.type === 'focus') {
        if (Platform.OS !== 'web' && webViewRef.current) {
          webViewRef.current.requestFocus();
        }
        if (onFocus) onFocus();
      } else if (data.type === 'blur') {
        if (onBlur) onBlur();
      } else if (data.type === 'ready') {
        isLoaded.current = true;
        postToEditor({ type: 'updateValue', value: code });
        postToEditor({ type: 'updateTheme', theme: monacoTheme });
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
              isTyping.current = true;
              if (typingTimeout.current) clearTimeout(typingTimeout.current);
              typingTimeout.current = setTimeout(() => { isTyping.current = false; }, 800);

              internalCode.current = data.content;
              onChangeCode(data.content);
            } else if (data.type === 'focus') {
              if (onFocus) onFocus();
            } else if (data.type === 'blur') {
              if (onBlur) onBlur();
            } else if (data.type === 'ready') {
              isLoaded.current = true;
              postToEditor({ type: 'updateValue', value: code });
              postToEditor({ type: 'updateTheme', theme: monacoTheme });
              postToEditor({ type: 'updateLanguage', language: getMonacoLanguage(language) });
            }
          }
        } catch (e) {}
      };
      window.addEventListener('message', handleWebMessage);
      return () => window.removeEventListener('message', handleWebMessage);
    }
  }); 

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
    handleToolbarAction: (type: string, meta: any) => postToEditor({ type: 'toolbarAction', actionType: type, meta })
  }));

  useEffect(() => {
    if (!isTyping.current && code !== internalCode.current) {
      internalCode.current = code;
      postToEditor({ type: 'updateValue', value: code });
    }
  }, [code]);

  useEffect(() => {
    postToEditor({ type: 'updateTheme', theme: monacoTheme });
  }, [monacoTheme]);

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
    <View style={styles.container}>
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
          hideKeyboardAccessoryView={true}
          keyboardDisplayRequiresUserAction={false}
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
