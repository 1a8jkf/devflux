import React, { useRef, useEffect, forwardRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform, DeviceEventEmitter, Keyboard } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAppTheme } from '../contexts/ThemeContext';
import { useSettings } from '../contexts/SettingsContext';
import { DebugService } from '../services/DebugService';
import { ContextManager } from '../services/ContextManager';

import { CodeEditorProps, CodeEditorRef } from './CodeEditor';

export const MonacoEditor = forwardRef<CodeEditorRef, CodeEditorProps>(({ code, originalCode, language, onChangeCode, readOnly = false, filePath, onFocus, onBlur }, ref) => {
  const { theme, isDark } = useAppTheme();
  const { settings } = useSettings();
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
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden;
      position: fixed; top: 0; left: 0;
      background-color: ${theme.colors.bgSurface};
    }
    #container {
      margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden;
      position: absolute; top: 0; left: 0;
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
    window.__isReadOnly = ${readOnly};
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
      // Android WebView: keep textarea but disable IME suggestions/autocorrect
      var origCreateElement = document.createElement;
      document.createElement = function(tag, options) {
        if (tag === 'textarea' || tag === 'TEXTAREA') {
          var el = origCreateElement.call(document, tag, options);
          el.setAttribute('autocorrect', 'off');
          el.setAttribute('autocapitalize', 'none');
          el.setAttribute('spellcheck', 'false');
          el.setAttribute('autocomplete', 'off');
          el.setAttribute('autofill', 'off');
          el.setAttribute('aria-autocomplete', 'none');
          el.setAttribute('inputmode', 'text');
          el.setAttribute('type', 'text');
          // Let native keyboard handle predictive text and composition events
          el.setAttribute('data-gramm', 'false');
          el.setAttribute('enterkeyhint', 'enter');
          el.setAttribute('tabindex', '0');

          // --- ANDROID IME FIX ---
          // Prevent Monaco from modifying the textarea value or selection during composition.
          // This stops Android Gboard from dropping characters when typing fast.
          var isComposing = false;
          el.addEventListener('compositionstart', function() { isComposing = true; });
          el.addEventListener('compositionend', function() { isComposing = false; });
          
          var originalSetSelectionRange = el.setSelectionRange;
          el.setSelectionRange = function(start, end, direction) {
            // If composing, do NOT let Monaco touch the selection, as this cancels Gboard composition!
            if (isComposing) return;
            return originalSetSelectionRange.call(this, start, end, direction);
          };

          var valueDesc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
          if (valueDesc && valueDesc.set) {
            Object.defineProperty(el, 'value', {
              get: function() { return valueDesc.get.call(this); },
              set: function(val) {
                if (isComposing && val === '') {
                  // Ignore value resets during composition to prevent dropping characters
                  return;
                }
                valueDesc.set.call(this, val);
              }
            });
          }
          // -----------------------

          return el;
        }
        return origCreateElement.call(document, tag, options);
      };

      function normalizePastedCode(text) {
        return String(text || '')
          .replace(/^\\uFEFF/, '')
          .replace(/\\r\\n/g, '\\n')
          .replace(/\\r/g, '\\n');
      }

      function hasVisibleSuggestion() {
        return !!document.querySelector('.suggest-widget.visible');
      }

      function acceptVisibleSuggestion() {
        if (!hasVisibleSuggestion()) return false;
        modelEditor.trigger('keyboard', 'acceptSelectedSuggestion', null);
        return true;
      }

      function focusMonacoInput() {
        var input = document.querySelector('.monaco-editor textarea.inputarea, textarea.inputarea, .monaco-editor .inputarea, .inputarea');
        if (!input) return false;
        try {
          // Remove readonly temporarily if Monaco set it
          var wasReadOnly = input.hasAttribute('readonly');
          if (wasReadOnly) input.removeAttribute('readonly');
          
          input.focus({ preventScroll: true });
          input.click();
          
          if (wasReadOnly && window.__isReadOnly) input.setAttribute('readonly', 'readonly');
        } catch(e) {
          try { input.focus(); } catch(inner) {}
        }
        return document.activeElement === input;
      }

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
          readOnly: window.__isReadOnly,
          renderSideBySide: false,
          scrollBeyondLastLine: false,
          padding: { top: 16 },
          renderLineHighlight: 'line',
          formatOnPaste: false,
          folding: false,
          links: false,
          occurrencesHighlight: false,
          quickSuggestions: { other: true, comments: false, strings: true },
          quickSuggestionsDelay: 120,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          tabCompletion: 'on',
          contextmenu: false,
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
          readOnly: window.__isReadOnly,
          scrollBeyondLastLine: false,
          padding: { top: 16 },
          renderLineHighlight: 'line',
          formatOnPaste: false,
          folding: false,
          links: false,
          occurrencesHighlight: false,
          quickSuggestions: { other: true, comments: false, strings: true },
          quickSuggestionsDelay: 120,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          tabCompletion: 'on',
          contextmenu: false,
          'bracketPairColorization.enabled': true
        });
      }

      var modelEditor = isDiff ? editor.getModifiedEditor() : editor;

      // Handle touch events to ensure keyboard opens on Android.
      // We track touchstart position and only trigger the keyboard if the
      // finger barely moved (tap), not when the user is scrolling.
      // IMPORTANT: We MUST use the capture phase (true) because Monaco calls
      // stopPropagation() on touch events internally, which would prevent
      // these listeners from ever firing if they relied on bubbling!
      var touchStartX = 0, touchStartY = 0;
      var containerEl = document.getElementById('container');
      containerEl.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }, true);
      containerEl.addEventListener('touchend', function(e) {
        if (window.__isReadOnly) return;
        var dx = 0, dy = 0;
        if (e.changedTouches.length === 1) {
          dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
          dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
        }
        // Only treat as a tap (not a scroll) if movement < 15px
        if (dx > 15 || dy > 15) return;
        
        // Focus MUST be synchronous in the same user gesture to trigger the soft keyboard
        var focused = focusMonacoInput();
        if (focused) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'requestNativeKeyboard' }));
        }
      }, true);

      // Send updates to React Native with a short debounce to avoid serializing massive JSON on every keystroke
      var typingTimeout = null;
      modelEditor.onDidChangeModelContent(function() {
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(function() {
          var content = modelEditor.getValue();
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'change', content: content }));
        }, 20);
      });

      modelEditor.onDidFocusEditorText(function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'focus' }));
      });

      modelEditor.onDidBlurEditorText(function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'blur' }));
      });

      document.addEventListener('paste', function(event) {
        if (window.__isReadOnly) return;
        var clipboard = event.clipboardData || window.clipboardData;
        var raw = clipboard && clipboard.getData ? clipboard.getData('text/plain') : '';
        if (!raw || (raw.indexOf('\\n') === -1 && raw.indexOf('\\r') === -1)) return;

        event.preventDefault();
        var selection = modelEditor.getSelection();
        if (!selection) return;

        modelEditor.pushUndoStop();
        modelEditor.executeEdits('devflux-paste', [{
          range: selection,
          text: normalizePastedCode(raw),
          forceMoveMarkers: true
        }]);
        modelEditor.pushUndoStop();
      }, true);

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
        } else if (msg.type === 'updateReadOnly') {
          window.__isReadOnly = !!msg.readOnly;
          editor.updateOptions({ readOnly: window.__isReadOnly });
          if (isDiff) {
            editor.getOriginalEditor().updateOptions({ readOnly: window.__isReadOnly });
            editor.getModifiedEditor().updateOptions({ readOnly: window.__isReadOnly });
          }
        } else if (msg.type === 'triggerAction') {
          if (msg.action === 'undo') modelEditor.trigger('keyboard', 'undo', null);
          if (msg.action === 'redo') modelEditor.trigger('keyboard', 'redo', null);
        } else if (msg.type === 'toolbarAction') {
          focusMonacoInput();
          if (modelEditor && typeof modelEditor.focus === 'function') modelEditor.focus();
          if (msg.actionType === 'modifier') {
            window.keyboardModifiers = msg.meta;
            return;
          }
          if (msg.actionType === 'keypress') {
            var key = msg.meta.key;
            if (msg.meta.ctrlKey) {
              if (key === 'c') { modelEditor.trigger('keyboard', 'editor.action.clipboardCopyAction', null); return; }
              if (key === 'x') { modelEditor.trigger('keyboard', 'editor.action.clipboardCutAction', null); return; }
              if (key === 'v') { modelEditor.trigger('keyboard', 'editor.action.clipboardPasteAction', null); return; }
              if (key === 'z') { modelEditor.trigger('keyboard', 'undo', null); return; }
              if (key === 'y') { modelEditor.trigger('keyboard', 'redo', null); return; }
              if (key === 'a') { modelEditor.setSelection(modelEditor.getModel().getFullModelRange()); return; }
              if (key === 'f') { modelEditor.trigger('keyboard', 'actions.find', null); return; }
              if (key === 's') { return; }
            }
            if (key === 'Escape') { modelEditor.trigger('keyboard', 'closeFindWidget', null); return; }
            if (key === 'Enter') { if (acceptVisibleSuggestion()) return; modelEditor.trigger('keyboard', 'type', { text: '\n' }); return; }
            if (key === 'Tab') { modelEditor.trigger('keyboard', 'tab', null); return; }
            if (key === 'Backspace') { modelEditor.trigger('keyboard', 'deleteLeft', null); return; }
            if (key === 'Undo' || key === 'undo') { modelEditor.trigger('keyboard', 'undo', null); return; }
            if (key === 'Redo' || key === 'redo') { modelEditor.trigger('keyboard', 'redo', null); return; }
            if (key === 'Search' || key === 'search') { modelEditor.trigger('keyboard', 'actions.find', null); return; }
            if (key === 'ArrowLeft') { modelEditor.trigger('keyboard', 'cursorLeft', null); return; }
            if (key === 'ArrowRight') { modelEditor.trigger('keyboard', 'cursorRight', null); return; }
            if (key === 'ArrowUp') { modelEditor.trigger('keyboard', 'cursorUp', null); return; }
            if (key === 'ArrowDown') { modelEditor.trigger('keyboard', 'cursorDown', null); return; }
            if (key.length >= 1) {
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
         if (e.key === 'Enter' && acceptVisibleSuggestion()) {
           e.preventDefault();
           e.stopPropagation();
           return;
         }
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

      if (window.visualViewport) {
        var updateViewport = function() {
          var container = document.getElementById('container');
          container.style.height = window.visualViewport.height + 'px';
          container.style.top = window.visualViewport.offsetTop + 'px';
          if (editor) {
            editor.layout();
            var pos = modelEditor.getPosition();
            if (pos) {
              modelEditor.revealPositionInCenterIfOutsideViewport(pos);
            }
          }
        };
        window.visualViewport.addEventListener('resize', updateViewport);
        window.visualViewport.addEventListener('scroll', updateViewport);
        setTimeout(updateViewport, 100);
      }
      
      window.addEventListener('message', handleMsg);
      document.addEventListener('message', handleMsg);
      
      // Notify React Native that editor is ready
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
    });
  </script>
</body>
</html>
  `, []); // Static dependency array: the WebView HTML mounts ONCE. All dynamic states are synced via postMessage.

  const latestCode = useRef(code);
  const onChangeCodeRef = useRef(onChangeCode);

  useEffect(() => {
    onChangeCodeRef.current = onChangeCode;
  }, [onChangeCode]);

  // We handle [code] updates in a single useEffect below

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'change') {
        recentInternalChanges.current.push(data.content);
        if (recentInternalChanges.current.length > 10) {
          recentInternalChanges.current.shift();
        }
        latestCode.current = data.content;
        onChangeCode(data.content);
      } else if (data.type === 'requestNativeKeyboard') {
        if (!readOnly && Platform.OS !== 'web') {
          (global as any).activeInputTarget = 'editor';
          DeviceEventEmitter.emit('SHOW_KEYBOARD_TOOLBAR', { target: 'editor', keyboardExpected: true });
          if (webViewRef.current && typeof (webViewRef.current as any).requestFocus === 'function') {
            (webViewRef.current as any).requestFocus();
          }
        }
      } else if (data.type === 'focus') {
        // Only set the global target; do NOT emit SHOW_KEYBOARD_TOOLBAR here.
        // The toolbar is shown via requestNativeKeyboard (user tap) only.
        // Emitting on every internal Monaco 'focus' event causes the keyboard
        // toolbar to pop up while scrolling.
        (global as any).activeInputTarget = 'editor';
        if (onFocus) onFocus();
      } else if (data.type === 'blur') {
        if (onBlur) onBlur();
      } else if (data.type === 'ready') {
        isLoaded.current = true;
        postToEditor({ type: 'updateValue', value: latestCode.current });
        postToEditor({ type: 'updateTheme', theme: monacoThemeName });
        postToEditor({ type: 'updateLanguage', language: getMonacoLanguage(language) });
      } else if (data.type === 'error') {
        console.error('Monaco Editor Error:', data.message);
        DebugService.log('editor', 'error', 'Monaco Editor Error: ' + data.message, { project: ContextManager.getActiveProject() || undefined, file: filePath, engine: 'monaco' });
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
              recentInternalChanges.current.push(data.content);
              if (recentInternalChanges.current.length > 10) {
                recentInternalChanges.current.shift();
              }
              latestCode.current = data.content;
              onChangeCodeRef.current(data.content);
            } else if (data.type === 'ready') {
              isLoaded.current = true;
              postToEditor({ type: 'updateValue', value: latestCode.current });
              // For web, we need to pass the current dynamic states when ready
              postToEditor({ type: 'updateTheme', theme: isDark ? 'devflux-dark' : 'vs' });
              postToEditor({ type: 'updateLanguage', language: getMonacoLanguage(initialLanguage.current) });
            }
          }
        } catch (e) {}
      };
      window.addEventListener('message', handleWebMessage);
      return () => window.removeEventListener('message', handleWebMessage);
    }
  }, []); // Run only once

  useEffect(() => {
    postToEditor({ type: 'updateReadOnly', readOnly });
  }, [readOnly]);

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

  const recentInternalChanges = useRef<string[]>([]);

  useEffect(() => {
    // If the incoming code is in our recent internal changes history, it's just a delayed echo of user typing.
    // Ignore it to prevent race conditions that break IME composition.
    const index = recentInternalChanges.current.indexOf(code);
    if (index !== -1) {
      // Remove this and older echoes to keep history clean
      recentInternalChanges.current.splice(0, index + 1);
      return;
    }

    // Otherwise, this is a genuine external change (Live Sync, undo/redo from React, or new file)
    latestCode.current = code;
    recentInternalChanges.current = []; // Clear history on external change
    postToEditor({ type: 'updateValue', value: code });
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
          scrollEnabled={false}
          nestedScrollEnabled={false}
          keyboardDisplayRequiresUserAction={false}
          androidLayerType="hardware"
          scalesPageToFit={false}
          autoManageStatusBarEnabled={false}
          allowsFullscreenVideo={false}
          textZoom={100}
          javaScriptEnabled={true}
          originWhitelist={['*']}
          allowFileAccess={true}
          domStorageEnabled={true}
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
});

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

MonacoEditor.displayName = 'MonacoEditor';