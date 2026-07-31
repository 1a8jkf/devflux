import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { TerminalView } from '../../components/TerminalView';
import { Icon } from '../../components/Icon';
import { NodeRunner } from '../../utils/nodeRunner';

export default function TerminalScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const params = useLocalSearchParams();
  const projectId = params.projectId as string;

  React.useEffect(() => {
    NodeRunner.init().catch(console.error);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="Terminal" size={18} color={theme.colors.accentBlue} />
          <Text style={styles.title}>Terminal do Projeto</Text>
        </View>
        <Text style={{ fontFamily: theme.typography.mono, fontSize: 12, color: theme.colors.textSecondary }}>
          /projects/{projectId || 'workspace'}
        </Text>
      </View>
      <TerminalView projectId={projectId} sessionId={`editor-tab-${projectId || 'global'}`} />
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
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontFamily: theme.typography.ui,
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
  },
  actionBtn: {
    marginLeft: 16,
  },
});
