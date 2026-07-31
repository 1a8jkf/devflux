import React, { useCallback, useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from './Icon';
import { FileSystemService } from '../services/FileSystemService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface TerminalLog {
  id: string;
  text: string;
  type: 'input' | 'output' | 'error' | 'success';
}

interface TerminalSheetProps {
  projectId: string;
  githubRepo?: string;
  onStartDevServer?: () => void;
  onFileSystemChange?: () => void;
}

export interface TerminalSheetRef {
  snapToIndex: (index: number) => void;
  expand: () => void;
  collapse: () => void;
}

export const TerminalSheet = forwardRef<TerminalSheetRef, TerminalSheetProps>(({ projectId, githubRepo, onStartDevServer, onFileSystemChange }, ref) => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();

  const bottomSheetRef = useRef<BottomSheet>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  useImperativeHandle(ref, () => ({
    snapToIndex: (index: number) => bottomSheetRef.current?.snapToIndex(index),
    expand: () => bottomSheetRef.current?.expand(),
    collapse: () => bottomSheetRef.current?.collapse(),
  }));

  const [logs, setLogs] = useState<TerminalLog[]>([
    { id: '0', text: 'DevFlux Pseudo-Shell v1.0.0\nType "help" for a list of available commands.', type: 'success' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const appendLog = (text: string, type: TerminalLog['type'] = 'output') => {
    setLogs(prev => [...prev, { id: Date.now().toString() + Math.random(), text, type }]);
  };

  React.useEffect(() => {
    if (LiveSyncService.ws && LiveSyncService.ws.readyState === 1) {
      LiveSyncService.onCommandOutput = (cmdId, output) => {
        const cleanOutput = output.replace(/\n$/, '');
        appendLog(cleanOutput, 'output');
      };
      LiveSyncService.onCommandExit = (cmdId, code) => {
        setIsProcessing(false);
        if (code !== 0) {
          appendLog(`Process exited with code ${code}`, 'error');
        }
        setTimeout(() => { inputRef.current?.focus(); }, 100);
      };
    }

    // NodeRunner Listener
    let unsubscribeNode = () => {};
    import('../utils/nodeRunner').then(({ NodeRunner }) => {
      unsubscribeNode = NodeRunner.addListener((msg) => {
        if (msg.type === 'CMD_OUT' || msg.type === 'CMD_ERR') {
           appendLog(msg.payload.replace(/\n$/, ''), msg.type === 'CMD_ERR' ? 'error' : 'output');
        } else if (msg.type === 'CMD_CLOSE') {
           setIsProcessing(false);
           setTimeout(() => { inputRef.current?.focus(); }, 100);
        }
      });
    });

    // Console Log Listener
    import('react-native').then(({ DeviceEventEmitter }) => {
      const sub = DeviceEventEmitter.addListener('TERMINAL_LOG', (data) => {
        appendLog(`[console.${data.level}] ${data.message}`, data.level === 'error' ? 'error' : 'output');
      });
      return () => sub.remove();
    });

    return () => {
      LiveSyncService.onCommandOutput = null;
      LiveSyncService.onCommandExit = null;
      unsubscribeNode();
    };
  }, []);

  const processCommand = async (cmdString: string) => {
    const args = cmdString.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    if (!cmd) return;

    if (cmd === 'clear') {
      setLogs([]);
      return;
    }

    // Remote Execution bypass
    if (LiveSyncService.ws && LiveSyncService.ws.readyState === 1) {
      const cmdId = Math.random().toString(36).substring(7);
      LiveSyncService.execCommand(cmdId, cmd, args.slice(1));
      // Return a promise that never resolves here because onCommandExit will reset isProcessing
      return new Promise<void>(() => {}); 
    }

    if (cmd === 'clear') {
      setLogs([]);
      return;
    }

    if (cmd === 'help') {
      appendLog('Available commands:\n  git status\n  git commit -m "msg"\n  git push\n  npm install <pkg>\n  npm start / npm run dev\n  ls\n  clear', 'output');
      return;
    }

    if (cmd === 'ls') {
      try {
        const tree = await FileSystemService.getProjectFileTree(projectId);
        const names = tree.map(n => n.name).join('  ');
        appendLog(names || '(empty)', 'output');
      } catch (e) {
        appendLog('Failed to list directory', 'error');
      }
      return;
    }

    if (cmd === 'git') {
      if (!githubRepo) {
        appendLog('Error: Not a git repository (githubRepo not found).', 'error');
        setIsProcessing(false);
        return;
      }
      const subCmd = args[1];
      const { GitService } = await import('../services/GitService');

      if (subCmd === 'status') {
        appendLog('Scanning files...', 'output');
        try {
          const changes = await GitService.getChangedFiles(projectId);
          if (changes.length === 0) {
            appendLog('working tree clean', 'success');
          } else {
            changes.forEach(c => {
              appendLog(`  ${c.status === 'added' ? 'A' : 'M'} ${c.path}`, c.status === 'added' ? 'success' : 'error');
            });
          }
        } catch(e: any) {
          appendLog(`git error: ${e.message}`, 'error');
        }
        setIsProcessing(false);
        return;
      }
      
      if (subCmd === 'commit') {
        const msgIndex = args.indexOf('-m');
        let msg = "Auto commit";
        if (msgIndex !== -1 && args[msgIndex + 1]) {
           msg = cmdString.substring(cmdString.indexOf('-m') + 2).trim().replace(/^["']|["']$/g, '');
        }
        appendLog(`Committing to ${githubRepo}...`, 'output');
        try {
          const changes = await GitService.getChangedFiles(projectId);
          if (changes.length === 0) {
            appendLog('Nothing to commit.', 'error');
            setIsProcessing(false);
            return;
          }
          const { GithubService } = await import('../services/GithubService');
          const user = await GithubService.getUser();
          await GitService.commit(projectId, msg, user.name || user.login, user.login + '@users.noreply.github.com');
          await GitService.push(projectId);
          appendLog(`[main] ${msg}`, 'success');
          appendLog('Pushed to remote successfully.', 'success');
        } catch(e: any) {
          appendLog(`commit error: ${e.message}`, 'error');
        }
        setIsProcessing(false);
        return;
      }

      if (subCmd === 'push') {
         appendLog('Already up to date. (Commits in DevFlux auto-push)', 'success');
         setIsProcessing(false);
         return;
      }

      appendLog(`git: '${subCmd}' is not a devflux command.`, 'error');
      setIsProcessing(false);
      return;
    }

    if (cmd === 'npm' && args[1] === 'start') {
       appendLog('Starting dev server...', 'success');
       onStartDevServer?.();
       setIsProcessing(false);
       return;
    }

    // Forward everything else to real native shell
    const { NodeRunner } = await import('../utils/nodeRunner');
    NodeRunner.send({ type: 'SHELL_INPUT', payload: cmdString + '\n', cwd: (await FileSystemService.getProjectPath(projectId)) });
    return new Promise<void>(() => {}); // wait for CMD_CLOSE
  };

  const handleSubmit = async () => {
    const val = inputValue.trim();
    if (!val || isProcessing) return;
    
    setInputValue('');
    appendLog(`$ ${val}`, 'input');
    setIsProcessing(true);
    
    await processCommand(val);
    
    setIsProcessing(false);
    setTimeout(() => { inputRef.current?.focus(); }, 100);
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={[24, '50%', '90%']}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.indicator}
      bottomInset={insets.bottom}
      enableContentPanningGesture={false}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetView style={styles.contentContainer}>
        <View style={styles.header}>
          <View style={{ flex: 1 }} />
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => setLogs([])}>
              <Icon name="Trash2" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
            <View style={{ width: 16 }} />
            <TouchableOpacity onPress={() => bottomSheetRef.current?.collapse()}>
              <Icon name="ChevronDown" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView 
          style={styles.terminalArea} 
          ref={scrollViewRef}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
        >
          {logs.map(log => (
            <Text 
              key={log.id} 
              style={[
                styles.terminalOutput, 
                log.type === 'error' && styles.terminalError,
                log.type === 'success' && styles.terminalSuccess,
                log.type === 'input' && styles.terminalInput,
              ]}
            >
              {log.text}
            </Text>
          ))}
          
          {/* Removed TextInput */}
        </ScrollView>
      </BottomSheetView>
    </BottomSheet>
  );
});

const getStyles = (theme: AppTheme) => StyleSheet.create({
  background: {
    backgroundColor: theme.colors.bgElevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  indicator: {
    backgroundColor: theme.colors.border,
    width: 40,
  },
  contentContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerText: {
    fontFamily: theme.typography.ui,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    letterSpacing: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  terminalArea: {
    flex: 1,
    padding: 16,
    paddingBottom: 40, // extra padding for keyboard
  },
  terminalOutput: {
    fontFamily: theme.typography.mono,
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
  },
  terminalInput: {
    color: theme.colors.textPrimary,
  },
  terminalError: {
    color: '#FF6B6B', // Red
  },
  terminalSuccess: {
    color: theme.colors.accentTeal,
  },
  prompt: {
    fontFamily: theme.typography.mono,
    color: theme.colors.accentTeal,
    fontSize: 13,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  textInput: {
    flex: 1,
    fontFamily: theme.typography.mono,
    color: theme.colors.textPrimary,
    fontSize: 13,
    lineHeight: 20,
    padding: 0,
    margin: 0,
    borderWidth: 0,
  },
});
