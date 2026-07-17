import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';

interface TerminalLog {
  id: string;
  text: string;
  type: 'output' | 'error' | 'success' | 'input';
}

export interface TerminalSheetRef {
  expand: () => void;
  collapse: () => void;
  log: (text: string, type?: TerminalLog['type']) => void;
}

interface TerminalSheetProps {
  projectId: string;
}

export const TerminalSheet = forwardRef<TerminalSheetRef, TerminalSheetProps>(({ projectId }, ref) => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const [logs, setLogs] = useState<TerminalLog[]>([]);

  const appendLog = (text: string, type: TerminalLog['type'] = 'output') => {
    setLogs(prev => [...prev, { id: Date.now().toString() + Math.random(), text, type }]);
  };

  useImperativeHandle(ref, () => ({
    expand: () => bottomSheetRef.current?.expand(),
    collapse: () => bottomSheetRef.current?.collapse(),
    log: appendLog,
  }));

  React.useEffect(() => {
    // Console Log Listener
    import('react-native').then(({ DeviceEventEmitter }) => {
      const sub = DeviceEventEmitter.addListener('TERMINAL_LOG', (data) => {
        appendLog(`[console.${data.level}] ${data.message}`, data.level === 'error' ? 'error' : 'output');
      });
      return () => sub.remove();
    });
  }, []);

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={[24, '50%', '90%']}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.indicator}
      bottomInset={insets.bottom}
    >
      <BottomSheetView style={styles.contentContainer}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}><Text style={styles.headerText}>WEB CONSOLE</Text></View>
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
          <View style={{ height: 20 }} />
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
    color: '#FF6B6B',
  },
  terminalSuccess: {
    color: theme.colors.accentTeal,
  },
});
