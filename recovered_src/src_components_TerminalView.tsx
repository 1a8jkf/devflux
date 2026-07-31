import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { NodeRunner } from '../utils/nodeRunner';
import { PROJECTS_ROOT } from '../services/FileSystemService';

const HTML_CONTENT = `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css" />
    <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
    <style>
      body, html { margin: 0; padding: 0; height: 100%; width: 100%; background-color: #000; overflow: hidden; }
      #terminal-container { height: 100%; width: 100%; padding: 4px; box-sizing: border-box; }
      #error-log { color: red; font-family: monospace; position: absolute; top: 0; left: 0; z-index: 9999; pointer-events: none; }
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

      // We must wait for Xterm to load from CDN
      const init = () => {
        if (typeof Terminal === 'undefined') {
           setTimeout(init, 100);
           return;
        }

        term = new Terminal({
          theme: { background: '#000000' },
          fontFamily: 'monospace',
          fontSize: 14,
          cursorBlink: true
        });
        
        const fitAddon = new FitAddon.FitAddon();
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
          fitAddon.fit();
        });

        // Disable standard autocorrect on terminal textareas
        setTimeout(() => {
          const textareas = document.querySelectorAll('textarea');
          textareas.forEach(ta => {
            ta.setAttribute('autocorrect', 'off');
            ta.setAttribute('autocapitalize', 'none');
            ta.setAttribute('spellcheck', 'false');
            ta.setAttribute('autocomplete', 'off');
          });
        }, 500);

        term.onData(data => {
          sendMessage({ type: 'DATA', payload: data });
        });
      };

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

export const TerminalView = ({ projectId, sessionId = 'global-1' }: TerminalViewProps) => {
  const webviewRef = useRef<WebView>(null);
  const isStarted = useRef(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = NodeRunner.addListener((msg) => {
      if ((msg.type === 'CMD_OUT' || msg.type === 'CMD_ERR') && msg.sessionId === sessionId) {
        const safePayload = JSON.stringify(msg.payload);
        const js = `window.postMessage(JSON.stringify({ type: 'WRITE', payload: ${safePayload} }), '*'); true;`;
        webviewRef.current?.injectJavaScript(js);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [sessionId]);

  const onMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'READY') {
        if (!isStarted.current) {
          isStarted.current = true;
          NodeRunner.init().then(() => {
            const globalCwd = PROJECTS_ROOT.replace('file://', '');
            NodeRunner.send({ 
              type: 'SHELL_PTY_START', 
              cwd: globalCwd, 
              projectsRoot: globalCwd, 
              projectName: 'DevFlux', 
              sessionId: sessionId 
            });
          });
        }
      } else if (msg.type === 'DATA') {
        NodeRunner.send({ type: 'SHELL_PTY_DATA', payload: msg.payload, sessionId: sessionId });
      } else if (msg.type === 'JS_ERROR') {
        setErrorMsg(msg.payload);
        console.error("Terminal Webview JS Error:", msg.payload);
      }
    } catch(e) {
      console.error(e);
    }
  };

  return (
    <View style={styles.container}>
      {errorMsg && (
        <View style={styles.errorContainer}>
           <Text style={styles.errorText}>WebView Error: {errorMsg}</Text>
        </View>
      )}
      <WebView 
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html: HTML_CONTENT, baseUrl: 'https://cdn.jsdelivr.net' }}
        onMessage={onMessage}
        style={{ flex: 1, backgroundColor: '#000000' }}
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
};

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
    color: '#ff4444',
    fontFamily: 'monospace',
    fontSize: 12,
  }
});
