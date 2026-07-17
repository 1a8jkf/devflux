import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from './Icon';
import { NodeRunner } from '../utils/nodeRunner';
import { FileSystemService, PROJECTS_ROOT } from '../services/FileSystemService';

interface TerminalViewProps {
  projectId?: string;
  isNewProject?: boolean;
}

const HTML_CONTENT = `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css" />
    <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
    <style>
      body, html { margin: 0; padding: 0; height: 100%; width: 100%; background-color: #1E1E1E; }
      #terminal { height: 100%; width: 100%; padding: 8px; box-sizing: border-box; }
      .xterm .xterm-viewport { overflow-y: auto !important; }
    </style>
  </head>
  <body>
    <div id="terminal"></div>
    <script>
      let term;
      window.onload = () => {
        term = new Terminal({
          theme: { background: '#1E1E1E' },
          fontFamily: 'monospace',
          fontSize: 13,
          cursorBlink: true
        });
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        term.open(document.getElementById('terminal'));
        fitAddon.fit();
        
        window.addEventListener('resize', () => fitAddon.fit());

        term.onData(data => {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'data', payload: data }));
        });

        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
      };
      
      document.addEventListener('message', event => {
         try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'write' && term) term.write(msg.payload);
         } catch(e) {}
      });
      window.addEventListener('message', event => {
         try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'write' && term) term.write(msg.payload);
         } catch(e) {}
      });
    </script>
  </body>
</html>
`;

export const TerminalView: React.FC<TerminalViewProps> = ({ projectId, isNewProject }) => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const webviewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    
    // Send PTY start command
    if (projectId) {
      FileSystemService.getProjectPath(projectId).then(cwd => {
         NodeRunner.send({ type: 'SHELL_PTY_START', cwd });
      });
    } else {
      const globalCwd = PROJECTS_ROOT.replace('file://', '');
      NodeRunner.send({ type: 'SHELL_PTY_START', cwd: globalCwd });
    }

    const unsubscribe = NodeRunner.addListener((msg) => {
      if (msg.type === 'CMD_OUT' || msg.type === 'CMD_ERR') {
         const js = `window.postMessage(JSON.stringify({ type: 'write', payload: ${JSON.stringify(msg.payload)} }), '*');`;
         webviewRef.current?.injectJavaScript(js);
      }
    });

    return () => {
       unsubscribe();
       NodeRunner.send({ type: 'SHELL_PTY_STOP' });
    };
  }, [isReady, projectId]);

  const onMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'ready') {
        setIsReady(true);
      } else if (msg.type === 'data') {
        NodeRunner.send({ type: 'SHELL_PTY_DATA', payload: msg.payload });
      }
    } catch(e) {}
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        <View style={[styles.tab, styles.activeTab]}>
          <Text style={[styles.tabText, styles.activeTabText]}>ubuntu (proot)</Text>
        </View>
        <TouchableOpacity style={styles.addBtn}>
          <Icon name="Plus" size={16} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={styles.terminalArea}>
         <WebView 
            ref={webviewRef}
            source={{ html: HTML_CONTENT }}
            onMessage={onMessage}
            style={{ flex: 1, backgroundColor: theme.colors.bgSurface }}
            scrollEnabled={false}
            bounces={false}
         />
      </View>
    </View>
  );
};

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgSurface,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  activeTab: {
    backgroundColor: theme.colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.accentBlue,
  },
  tabText: {
    fontFamily: theme.typography.mono,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginRight: 8,
  },
  activeTabText: {
    color: theme.colors.textPrimary,
  },
  addBtn: {
    padding: 10,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
  },
  terminalArea: {
    flex: 1,
  },
});
