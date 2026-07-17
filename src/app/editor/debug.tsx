import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { Icon } from '../../components/Icon';
import { LogService, LogEntry } from '../../services/LogService';

export default function DebugScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    const unsubscribe = LogService.subscribe((newLogs) => {
      setLogs([...newLogs]);
    });
    return unsubscribe;
  }, []);

  const getIconForLevel = (level: string) => {
    switch(level) {
      case 'error': return <Icon name="XCircle" size={16} color={theme.colors.error} />;
      case 'warn': return <Icon name="AlertTriangle" size={16} color={theme.colors.accentAmber} />;
      case 'info': return <Icon name="Info" size={16} color={theme.colors.accentBlue} />;
      case 'system': return <Icon name="Settings" size={16} color={theme.colors.textSecondary} />;
      default: return <Icon name="Terminal" size={16} color={theme.colors.accentTeal} />;
    }
  };

  const getColorForLevel = (level: string) => {
    switch(level) {
      case 'error': return theme.colors.error;
      case 'warn': return theme.colors.accentAmber;
      case 'info': return theme.colors.accentBlue;
      case 'system': return theme.colors.textSecondary;
      default: return theme.colors.textPrimary;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Console / Debug</Text>
        <TouchableOpacity onPress={() => LogService.clearLogs()} style={{ padding: 8 }}>
          <Icon name="Trash2" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.content}>
        {logs.map(log => (
          <View key={log.id} style={styles.logRow}>
            {getIconForLevel(log.level)}
            <Text style={[styles.logText, { color: getColorForLevel(log.level) }]}>{log.message}</Text>
          </View>
        ))}
        {logs.length === 0 && (
          <Text style={[styles.logText, { color: theme.colors.textSecondary, textAlign: 'center', marginTop: 40 }]}>
            Nenhum log capturado.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
  },
  title: {
    fontFamily: theme.typography.ui,
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  logText: {
    fontFamily: theme.typography.mono,
    color: theme.colors.textPrimary,
    fontSize: 13,
    marginLeft: 12,
    flex: 1,
  },
});
