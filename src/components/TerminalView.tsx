import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Text, DeviceEventEmitter } from 'react-native';
import { WebView } from 'react-native-webview';
import { NodeRunner } from '../utils/nodeRunner';
import { PROJECTS_ROOT } from '../services/FileSystemService';
import { xtermCSS, xtermJS, fitAddonJS } from './xtermBundle';

const HTML_CONTENT = `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <style>${xtermCSS}</style>
    <script>${xtermJS}</script>
    <script>${fitAddonJS}</script>
    <style>
      body, html { margin: 0; padding: 0; height: 100%; width: 100%; background-color: #000; overflow: hidden; }
      #terminal-container { height: 100%; width: 100%; padding: 6px; box-sizing: border-box; }
      #error-log { color: red; background: white; font-family: monospace; position: absolute; top: 0; left: 0; z-index: 9999; pointer-events: none; }
    </style>
  </head>
  <body>
    <div id="error-log"></div>
    <div id="terminal-container"></div>
    <script>
      let term;
      
      window.onerror = function(message, source, lineno, colno, error) {
         document.getElementById('error-log').innerText += "\\n" + message;
         window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'JS_ERROR', payload: message }));
      };

      const sendMessage = (msg) => {
         window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      };

      // Initialize Xterm immediately
      const init = () => {
         if (typeof Terminal === 'undefined') {
            document.getElementById('error-log').innerText = "WAITING FOR TERMINAL...";
            setTimeout(init, 500);
            return;
         }
         document.getElementById('error-log').innerText = "";

         term = new Terminal({
           theme: { background: '#000000' },
           fontFamily: 'monospace',
           fontSize: 13,
           cursorBlink: true,
           convertEol: true,
           wordWrap: true,
           scrollback: 1000
         });
         
         const fitAddon = new FitAddon.FitAddon();
         window.fitAddon = fitAddon;
         window.term = term;
         term.loadAddon(fitAddon);
         term.open(document.getElementById('terminal-container'));
         
         term.onResize(size => {
           sendMessage({ type: 'RESIZE', cols: size.cols, rows: size.rows });
         });

         setTimeout(() => {
           fitAddon.fit();
           sendMessage({ type: 'READY', cols: term.cols, rows: term.rows });
         }, 150);

         window.addEventListener('resize', () => {
           if (window.fitAddon) { window.fitAddon.fit(); }
         });

         // Disable standard autocorrect and IME suggestions on terminal textareas
         const disableIME = () => {
           document.querySelectorAll('textarea, input').forEach(ta => {
             if (ta.getAttribute('data-terminal-fixed') !== 'true') {
               ta.setAttribute('data-terminal-fixed', 'true');
               ta.setAttribute('autocorrect', 'off');
               ta.setAttribute('autocapitalize', 'none');
               ta.setAttribute('spellcheck', 'false');
               ta.setAttribute('autocomplete', 'off');
               ta.setAttribute('inputmode', 'text');
               ta.setAttribute('type', 'text');
               ta.setAttribute('data-gramm', 'false');
               ta.setAttribute('data-enable-grammarly', 'false');
               ta.style.imeMode = 'disabled';
             }
           });
         };
         disableIME();
         const observer = new MutationObserver(disableIME);
         observer.observe(document.body, { childList: true, subtree: true });

         term.onData(data => {
           sendMessage({ type: 'DATA', payload: data });
         });
      };

      const focusTerminalTextarea = () => {
        if (window.term) { window.term.focus(); }
        const ta = document.querySelector('.xterm-helper-textarea') || document.querySelector('textarea');
        if (ta) {
          ta.setAttribute('autocorrect', 'off');
          ta.setAttribute('autocapitalize', 'none');
          ta.setAttribute('spellcheck', 'false');
          ta.setAttribute('autocomplete', 'off');
          ta.setAttribute('inputmode', 'text');
          ta.setAttribute('type', 'text');
          if (document.activeElement !== ta) {
            ta.focus();
            ta.click();
          }
        }
      };

      window.addEventListener('focus', () => { focusTerminalTextarea(); sendMessage({ type: 'FOCUS' }); }, true);
      window.addEventListener('blur', () => { sendMessage({ type: 'BLUR' }); }, true);
      document.addEventListener('click', () => { focusTerminalTextarea(); sendMessage({ type: 'FOCUS' }); }, true);
      document.addEventListener('touchstart', () => { focusTerminalTextarea(); sendMessage({ type: 'FOCUS' }); }, true);

      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
          if (window.visualViewport.height < window.innerHeight * 0.85) {
            sendMessage({ type: 'FOCUS' });
          } else {
            sendMessage({ type: 'BLUR' });
          }
        });
      }

      window.addEventListener('message', event => {
         try {
            const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (msg.type === 'WRITE' && term) {
               term.write(msg.payload);
            }
         } catch(e) {}
      });

      window.onload = init;
    </script>
  </body>
</html>
`;

interface TerminalViewProps {
  projectId?: string;
  sessionId?: string;
}

export interface TerminalViewRef {
  runCommand: (cmd: string) => void;
}

export const TerminalView = React.forwardRef<TerminalViewRef, TerminalViewProps>(({ projectId, sessionId = 'global-1' }, ref) => {
  const webviewRef = useRef<WebView>(null);
  const isReadyRef = useRef(false);
  const isShellReadyRef = useRef(false);
  const commandQueueRef = useRef<string[]>([]);
  const lastSizeRef = useRef({ cols: 80, rows: 24 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const startPtySession = (cols = 80, rows = 24) => {
    if (!isReadyRef.current) return;

    NodeRunner.init().then(() => {
      const cleanRoot = PROJECTS_ROOT.replace('file://', '').replace(/\/+$/, '');
      const cleanProject = projectId ? projectId.replace(/^\/+/, '').replace(/\/+$/, '') : '';
      const targetCwd = cleanProject ? `${cleanRoot}/${cleanProject}` : cleanRoot;
      NodeRunner.send({ 
        type: 'SHELL_PTY_START', 
        cwd: targetCwd, 
        projectsRoot: cleanRoot, 
        projectName: cleanProject || 'DevFlux', 
        sessionId: sessionId,
        cols: cols,
        rows: rows
      });
    });
  };

  useEffect(() => {
    if (isReadyRef.current) {
      // Clear the xterm display visually (client-side only)
      webviewRef.current?.injectJavaScript(`if (window.term) { window.term.clear(); window.term.reset(); } true;`);
      // startPtySession sends SHELL_PTY_START which handles cd in the backend
      startPtySession(lastSizeRef.current.cols, lastSizeRef.current.rows);
    }
  }, [sessionId, projectId]);

  React.useImperativeHandle(ref, () => ({
    runCommand: (cmd: string) => {
      if (isShellReadyRef.current) {
        NodeRunner.send({ type: 'SHELL_PTY_DATA', payload: cmd + '\r\n', sessionId });
      } else {
        commandQueueRef.current.push(cmd);
      }
    }
  }));

  useEffect(() => {
    (global as any).activeInputTarget = sessionId;
    DeviceEventEmitter.emit('SHOW_KEYBOARD_TOOLBAR', { target: sessionId });
    const unsubscribe = NodeRunner.addListener((msg) => {
      if ((msg.type === 'CMD_OUT' || msg.type === 'CMD_ERR') && msg.sessionId === sessionId) {
        const safePayload = JSON.stringify(msg.payload);
        const js = `window.postMessage(JSON.stringify({ type: 'WRITE', payload: ${safePayload} }), '*'); true;`;
        webviewRef.current?.injectJavaScript(js);

        const text = msg.payload || '';
        if (!isShellReadyRef.current && (text.includes('$ ') || text.includes('# ') || text.includes('~'))) {
          isShellReadyRef.current = true;
        }

        if (isShellReadyRef.current && commandQueueRef.current.length > 0) {
          const cmds = [...commandQueueRef.current];
          commandQueueRef.current = [];
          setTimeout(() => {
            cmds.forEach(cmd => {
              NodeRunner.send({ type: 'SHELL_PTY_DATA', payload: cmd + '\r\n', sessionId });
            });
          }, 300);
        }
      }
    });

    const toolbarSub = DeviceEventEmitter.addListener('KEYBOARD_TOOLBAR_ACTION', (action) => {
      const currentTarget = (global as any).activeInputTarget;
      if (currentTarget && currentTarget !== sessionId && currentTarget !== 'terminal-' + sessionId && !String(currentTarget).startsWith('terminal')) {
        return;
      }
      if (action.actionType === 'keypress') {
        const { key, ctrlKey } = action.meta;
        let charToSend = '';
        if (ctrlKey) {
          if (key.length === 1 && key >= 'a' && key <= 'z') {
            charToSend = String.fromCharCode(key.charCodeAt(0) - 96);
          } else if (key.length === 1 && key >= 'A' && key <= 'Z') {
            charToSend = String.fromCharCode(key.charCodeAt(0) - 64);
          }
        } else if (key === 'Tab') {
          charToSend = '\t';
        } else if (key === 'Escape') {
          charToSend = '\x1b';
        } else if (key === 'ArrowUp') {
          charToSend = '\x1b[A';
        } else if (key === 'ArrowDown') {
          charToSend = '\x1b[B';
        } else if (key === 'ArrowRight') {
          charToSend = '\x1b[C';
        } else if (key === 'ArrowLeft') {
          charToSend = '\x1b[D';
        } else if (key.length === 1) {
          charToSend = key;
        }
        if (charToSend) {
          webviewRef.current?.injectJavaScript(`
            if (window.term) { window.term.focus(); }
            var ta = document.querySelector('.xterm-helper-textarea') || document.querySelector('textarea');
            if (ta) { ta.focus(); }
            true;
          `);
          NodeRunner.send({ type: 'SHELL_PTY_DATA', payload: charToSend, sessionId: sessionId });
        }
      }
    });

    return () => {
      unsubscribe();
      toolbarSub.remove();
      DeviceEventEmitter.emit('HIDE_KEYBOARD_TOOLBAR');
    };
  }, [sessionId]);

  const onMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'READY') {
        isReadyRef.current = true;
        const c = msg.cols || 80;
        const r = msg.rows || 24;
        lastSizeRef.current = { cols: c, rows: r };
        (global as any).activeInputTarget = sessionId;
        DeviceEventEmitter.emit('SHOW_KEYBOARD_TOOLBAR', { target: sessionId });
        startPtySession(c, r);
        // Commands are now handled in PTY_DATA when prompt appears
      } else if (msg.type === 'RESIZE') {
        lastSizeRef.current = { cols: msg.cols, rows: msg.rows };
        (global as any).activeInputTarget = sessionId;
        DeviceEventEmitter.emit('SHOW_KEYBOARD_TOOLBAR', { target: sessionId });
        NodeRunner.send({ type: 'SHELL_PTY_RESIZE', cols: msg.cols, rows: msg.rows, sessionId: sessionId });
      } else if (msg.type === 'DATA') {
        (global as any).activeInputTarget = sessionId;
        DeviceEventEmitter.emit('SHOW_KEYBOARD_TOOLBAR', { target: sessionId });
        NodeRunner.send({ type: 'SHELL_PTY_DATA', payload: msg.payload, sessionId: sessionId });
      } else if (msg.type === 'FOCUS') {
        (global as any).activeInputTarget = sessionId;
        DeviceEventEmitter.emit('SHOW_KEYBOARD_TOOLBAR', { target: sessionId });
      } else if (msg.type === 'BLUR') {
        DeviceEventEmitter.emit('HIDE_KEYBOARD_TOOLBAR');
      } else if (msg.type === 'JS_ERROR') {
        setErrorMsg(msg.payload);
        console.error("Terminal Webview JS Error:", msg.payload);
      }
    } catch(e) {
      console.error(e);
    }
  };

  return (
    <View 
      style={styles.container} 
      onTouchStart={() => {
        (global as any).activeInputTarget = sessionId;
        DeviceEventEmitter.emit('SHOW_KEYBOARD_TOOLBAR', { target: sessionId });
        webviewRef.current?.injectJavaScript(`
          if (window.term) { window.term.focus(); }
          var ta = document.querySelector('.xterm-helper-textarea') || document.querySelector('textarea');
          if (ta) { ta.focus(); }
          true;
        `);
      }}
      onLayout={() => {
        webviewRef.current?.injectJavaScript(`
          if (window.term && window.fitAddon) {
            window.fitAddon.fit();
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'RESIZE', cols: window.term.cols, rows: window.term.rows }));
          }
          true;
        `);
      }}
    >
      {errorMsg && (
        <View style={styles.errorContainer}>
           <Text style={styles.errorText}>WebView Error: {errorMsg}</Text>
        </View>
      )}
      <WebView 
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html: HTML_CONTENT }}
        onMessage={onMessage}
        style={{ flex: 1, backgroundColor: '#000000', width: '100%', height: '100%' }}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView={true}
        mixedContentMode="always"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  errorContainer: {
    padding: 10,
    backgroundColor: 'rgba(255,0,0,0.2)',
  },
  errorText: {
    color: 'red',
    fontFamily: 'monospace',
    fontSize: 12,
  },
});
