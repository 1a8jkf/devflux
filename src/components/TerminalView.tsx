import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Text, DeviceEventEmitter, Keyboard, Platform, AppState, AppStateStatus, NativeModules } from 'react-native';
import { WebView } from 'react-native-webview';
import { NodeRunner } from '../utils/nodeRunner';
import { PROJECTS_ROOT } from '../services/FileSystemService';
import { LiveSyncService } from '../services/LiveSyncService';
import { DebugService } from '../services/DebugService';
import { xtermCSS, xtermJS, fitAddonJS } from './xtermBundle';
import { useLanguage } from '../contexts/LanguageContext';

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
      #terminal-container { height: 100%; width: 100%; padding: 10px 10px 76px; box-sizing: border-box; }
      .xterm { letter-spacing: 0; height: 100%; }
      .xterm-rows { line-height: 1.28 !important; }
      .xterm-viewport { overflow-y: scroll !important; -webkit-overflow-scrolling: touch; touch-action: pan-y; }
      .xterm-screen { transform: translateZ(0); }
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
           theme: { background: '#000000', foreground: '#F4F4F5', cursor: '#7DD3FC' },
           fontFamily: '"Cascadia Mono", "JetBrains Mono", "SFMono-Regular", monospace',
           fontSize: 12,
           lineHeight: 1.28,
           letterSpacing: 0,
           cursorBlink: true,
           cursorStyle: 'block',
           convertEol: true,
           wordWrap: true,
           scrollback: 4000,
           fastScrollModifier: 'alt',
           fastScrollSensitivity: 5,
           smoothScrollDuration: 80
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
               ta.setAttribute('autofill', 'off');
               ta.setAttribute('enterkeyhint', 'enter');
               ta.setAttribute('aria-autocomplete', 'none');
               ta.setAttribute('inputmode', 'text'); // Changed from email to prevent dot completion issues
               ta.setAttribute('type', 'text');
               ta.setAttribute('data-gramm', 'false');
               ta.setAttribute('data-enable-grammarly', 'false');
               ta.setAttribute('data-lpignore', 'true');
               ta.setAttribute('data-form-type', 'other');
               ta.style.imeMode = 'disabled';
             }
           });
         };
         disableIME();
         const observer = new MutationObserver(disableIME);
         observer.observe(document.body, { childList: true, subtree: true });

         term.onData(data => {
           if (data) {
             sendMessage({ type: 'DATA', payload: data });
           }
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
          ta.setAttribute('autofill', 'off');
          ta.setAttribute('enterkeyhint', 'enter');
          ta.setAttribute('aria-autocomplete', 'none');
          ta.setAttribute('inputmode', 'text');
          ta.setAttribute('type', 'text');
          if (document.activeElement !== ta) {
            ta.focus();
            ta.click();
          }
        }
      };

      let terminalTouchStart = null;
      let terminalTouchMoved = false;
      // Track whether the terminal was explicitly tapped by the user
      window._terminalExplicitlyFocused = false;
      window.addEventListener('focus', () => {
        if (window._terminalExplicitlyFocused) { focusTerminalTextarea(); }
      }, true);
      window.addEventListener('blur', () => { sendMessage({ type: 'BLUR' }); window._terminalExplicitlyFocused = false; }, true);
      // Only send FOCUS when user explicitly touches the terminal container
      document.addEventListener('touchstart', (event) => {
        const touch = event.touches && event.touches[0];
        terminalTouchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
        terminalTouchMoved = false;
        window._terminalExplicitlyFocused = true;
      }, { passive: true, capture: true });
      document.addEventListener('touchmove', (event) => {
        if (!terminalTouchStart) return;
        const touch = event.touches && event.touches[0];
        if (!touch) return;
        if (Math.abs(touch.clientX - terminalTouchStart.x) > 8 || Math.abs(touch.clientY - terminalTouchStart.y) > 8) {
          terminalTouchMoved = true;
        }
      }, { passive: true, capture: true });
      document.addEventListener('touchend', () => {
        if (!terminalTouchMoved && window._terminalExplicitlyFocused) {
          focusTerminalTextarea();
          sendMessage({ type: 'FOCUS' });
        }
        terminalTouchStart = null;
      }, { passive: true, capture: true });
      // REMOVED: visualViewport resize listener — it was causing false FOCUS when
      // Ace editor opened the keyboard, making the terminal steal input.

      window.addEventListener('message', event => {
         try {
            const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (msg.type === 'WRITE' && term) {
               term.write(msg.payload);
            } else if (msg.type === 'CLEAR' && term) {
               term.clear();
               term.reset();
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
  resetKey?: number;
}

export interface TerminalViewRef {
  runCommand: (cmd: string) => void;
  resetTerminal: () => void;
}

export const TerminalView = React.forwardRef<TerminalViewRef, TerminalViewProps>(({ projectId, sessionId = 'global-1', resetKey = 0 }, ref) => {
  const webviewRef = useRef<WebView>(null);
  const isReadyRef = useRef(false);
  const isShellReadyRef = useRef(false);
  const commandQueueRef = useRef<string[]>([]);
  const lastSizeRef = useRef({ cols: 80, rows: 24 });
  const [errorMsg, setErrorMsg] = useState('');
  const { t } = useLanguage();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const remoteShellId = `remote-${sessionId}`;
  const isLiveSyncProject = !!projectId && (
    projectId === 'live-sync-workspace' ||
    projectId === 'LiveSync Workspace'
  );

  const writeToTerminal = (payload: string) => {
    const safePayload = JSON.stringify(payload || '');
    const js = `window.postMessage(JSON.stringify({ type: 'WRITE', payload: ${safePayload} }), '*'); true;`;
    webviewRef.current?.injectJavaScript(js);
  };

  const clearTerminalDisplay = () => {
    webviewRef.current?.injectJavaScript(`window.postMessage(JSON.stringify({ type: 'CLEAR' }), '*'); true;`);
  };

  const sendTerminalData = (payload: string) => {
    if (isLiveSyncProject) {
      LiveSyncService.sendRemoteShellInput(remoteShellId, payload);
    } else {
      const sent = NodeRunner.send({ type: 'SHELL_PTY_DATA', payload, sessionId });
      if (!sent) {
        DebugService.log('shell', 'error', 'Falha ao enviar entrada para o shell local.', { project: projectId, sessionId, bytes: payload.length });
      }
    }
  };

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      // Tell xterm to resize after keyboard opens
      setTimeout(() => {
        webviewRef.current?.injectJavaScript(`
          if (window.term && window.fitAddon) {
            window.fitAddon.fit();
            window.term.scrollToBottom();
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'RESIZE', cols: window.term.cols, rows: window.term.rows }));
          }
          true;
        `);
      }, 100);
    });
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setKeyboardHeight(0);
      setTimeout(() => {
        webviewRef.current?.injectJavaScript(`
          if (window.term && window.fitAddon) {
            window.fitAddon.fit();
            window.term.scrollToBottom();
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'RESIZE', cols: window.term.cols, rows: window.term.rows }));
          }
          true;
        `);
      }, 100);
    });

    // Background resume logic
    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // Trigger resize to force refresh Xterm canvas if it died
        webviewRef.current?.injectJavaScript(`
          if (window.term && window.fitAddon) {
            window.fitAddon.fit();
          }
          true;
        `);
        // We can also poll nodejs backend to ensure session is alive
      }
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      appStateSub.remove();
    };
  }, []);

  useEffect(() => {
    try {
      if (Platform.OS === 'android' && NativeModules.DevFluxForeground) {
         NativeModules.DevFluxForeground.startService();
      }
    } catch (e) {
      console.warn('Failed to start DevFluxForeground service:', e);
    }
    return () => {
       try {
         if (Platform.OS === 'android' && NativeModules.DevFluxForeground) {
            NativeModules.DevFluxForeground.stopService();
         }
       } catch (e) {
         console.warn('Failed to stop DevFluxForeground service:', e);
       }
    };
  }, []);

  const startPtySession = (cols = 80, rows = 24) => {
    if (!isReadyRef.current) return;

    if (isLiveSyncProject) {
      isShellReadyRef.current = true;
      LiveSyncService.startRemoteShell(remoteShellId, cols, rows);
      return;
    }

    isShellReadyRef.current = false;
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

  const resetTerminal = () => {
    isShellReadyRef.current = false;
    commandQueueRef.current = [];
    clearTerminalDisplay();

    if (isLiveSyncProject) {
      LiveSyncService.stopRemoteShell(remoteShellId);
      setTimeout(() => startPtySession(lastSizeRef.current.cols, lastSizeRef.current.rows), 180);
      return;
    }

    NodeRunner.init().then(() => {
      NodeRunner.send({ type: 'SHELL_PTY_RESET', sessionId });
    });
  };

  useEffect(() => {
    if (isReadyRef.current) {
      clearTerminalDisplay();
      // startPtySession sends SHELL_PTY_START which handles cd in the backend
      startPtySession(lastSizeRef.current.cols, lastSizeRef.current.rows);
    }
  }, [sessionId, projectId]);

  const lastResetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (lastResetKeyRef.current === resetKey) return;
    lastResetKeyRef.current = resetKey;
    resetTerminal();
  }, [resetKey]);

  React.useImperativeHandle(ref, () => ({
    runCommand: (cmd: string) => {
      if (isShellReadyRef.current) {
        sendTerminalData(cmd + '\r\n');
      } else {
        commandQueueRef.current.push(cmd);
      }
    },
    resetTerminal
  }));

  useEffect(() => {
    (global as any).activeInputTarget = sessionId;
    DeviceEventEmitter.emit('SHOW_KEYBOARD_TOOLBAR', { target: sessionId });
    const previousRemoteOutput = LiveSyncService.onRemoteShellOutput;
    const previousRemoteExit = LiveSyncService.onRemoteShellExit;
    const handleRemoteShellOutput = (shellId: string, output: string) => {
      if (shellId === remoteShellId) {
        writeToTerminal(output);
      } else if (previousRemoteOutput) {
        previousRemoteOutput(shellId, output);
      }
    };
    const handleRemoteShellExit = (shellId: string, code: number | null) => {
      if (shellId === remoteShellId) {
        writeToTerminal(`\r\n[LiveSync shell encerrado${code === null ? '' : `: ${code}`}]\r\n`);
      } else if (previousRemoteExit) {
        previousRemoteExit(shellId, code);
      }
    };
    LiveSyncService.onRemoteShellOutput = handleRemoteShellOutput;
    LiveSyncService.onRemoteShellExit = handleRemoteShellExit;

    const unsubscribe = NodeRunner.addListener((msg) => {
      if (msg.type === 'SHELL_PTY_RESET_DONE' && msg.sessionId === sessionId) {
        startPtySession(lastSizeRef.current.cols, lastSizeRef.current.rows);
        return;
      }
      if (msg.type === 'SHELL_PTY_ERROR' && msg.sessionId === sessionId) {
        setErrorMsg(msg.error || t('Falha ao iniciar o terminal Linux.'));
        DebugService.log('shell', 'error', msg.error || 'Falha ao iniciar o terminal Linux.', { project: projectId, sessionId });
      }
      if (isLiveSyncProject) return;
      if ((msg.type === 'CMD_OUT' || msg.type === 'CMD_ERR') && msg.sessionId === sessionId) {
        writeToTerminal(msg.payload);

        const text = msg.payload || '';
        if (!isShellReadyRef.current && (text.includes('$ ') || text.includes('# ') || text.includes('~'))) {
          isShellReadyRef.current = true;
        }

        if (isShellReadyRef.current && commandQueueRef.current.length > 0) {
          const cmds = [...commandQueueRef.current];
          commandQueueRef.current = [];
          setTimeout(() => {
            cmds.forEach(cmd => {
              sendTerminalData(cmd + '\r\n');
            });
          }, 300);
        }
      }
    });

    const toolbarSub = DeviceEventEmitter.addListener('KEYBOARD_TOOLBAR_ACTION', (action) => {
      const currentTarget = (global as any).activeInputTarget;
      const actionTarget = action?.target;
      if (actionTarget && actionTarget !== sessionId) return;
      if (!actionTarget && currentTarget !== sessionId) return;
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
        } else if (key === 'Enter') {
          charToSend = '\r';
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
          sendTerminalData(charToSend);
          DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_ACTION_COMPLETE', { requestId: action.requestId, target: sessionId });
        }
      }
    });

    return () => {
      unsubscribe();
      toolbarSub.remove();
      if (LiveSyncService.onRemoteShellOutput === handleRemoteShellOutput) {
        LiveSyncService.onRemoteShellOutput = previousRemoteOutput;
      }
      if (LiveSyncService.onRemoteShellExit === handleRemoteShellExit) {
        LiveSyncService.onRemoteShellExit = previousRemoteExit;
      }
      if (isLiveSyncProject) {
        LiveSyncService.stopRemoteShell(remoteShellId);
      }
      DeviceEventEmitter.emit('HIDE_KEYBOARD_TOOLBAR');
    };
  }, [sessionId, remoteShellId, isLiveSyncProject, projectId]);

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
        if (isLiveSyncProject) {
          LiveSyncService.resizeRemoteShell(remoteShellId, msg.cols, msg.rows);
        } else {
          NodeRunner.send({ type: 'SHELL_PTY_RESIZE', cols: msg.cols, rows: msg.rows, sessionId: sessionId });
        }
      } else if (msg.type === 'DATA') {
        // Only route terminal data if the terminal is the active target (avoid stealing from Ace)
        if ((global as any).activeInputTarget === sessionId || !(global as any).activeInputTarget || String((global as any).activeInputTarget).startsWith('terminal') || String((global as any).activeInputTarget) === sessionId) {
          (global as any).activeInputTarget = sessionId;
          DeviceEventEmitter.emit('SHOW_KEYBOARD_TOOLBAR', { target: sessionId, keyboardExpected: true });
          if (webviewRef.current && typeof (webviewRef.current as any).requestFocus === 'function') { (webviewRef.current as any).requestFocus(); }
        }
        sendTerminalData(msg.payload);
      } else if (msg.type === 'FOCUS') {
        // FOCUS comes from user explicitly touching the terminal (we set _terminalExplicitlyFocused in JS)
        // This is a genuine terminal focus — claim activeInputTarget
        (global as any).activeInputTarget = sessionId;
        DeviceEventEmitter.emit('SHOW_KEYBOARD_TOOLBAR', { target: sessionId, keyboardExpected: true });
        if (webviewRef.current && typeof (webviewRef.current as any).requestFocus === 'function') { (webviewRef.current as any).requestFocus(); }
      } else if (msg.type === 'BLUR') {
        DeviceEventEmitter.emit('HIDE_KEYBOARD_TOOLBAR');
      } else if (msg.type === 'JS_ERROR') {
        setErrorMsg(msg.payload);
        console.error("Terminal Webview JS Error:", msg.payload);
        DebugService.log('shell', 'error', 'Erro JavaScript no terminal WebView.', { project: projectId, sessionId, error: msg.payload });
      }
    } catch(e) {
      console.error(e);
    }
  };

  return (
    <View
      style={[styles.container, { paddingBottom: Platform.OS === 'ios' ? keyboardHeight : 0 }]}
      onTouchStart={() => {
        (global as any).activeInputTarget = sessionId;
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
           <Text style={styles.errorText}>{t('WebView Error:')} {errorMsg}</Text>
        </View>
      )}
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html: HTML_CONTENT }}
        onMessage={onMessage}
        style={{ flex: 1, backgroundColor: '#000000', width: '100%', height: '100%' }}
        scrollEnabled={true}
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


TerminalView.displayName = 'TerminalView';
