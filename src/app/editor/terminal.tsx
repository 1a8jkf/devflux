import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { TerminalView } from '../../components/TerminalView';
import { Icon } from '../../components/Icon';
import { NodeRunner } from '../../utils/nodeRunner';

export default function TerminalScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);

  React.useEffect(() => {
    NodeRunner.init().catch(console.error);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Terminal</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn}>
            <Icon name="Trash2" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
      <TerminalView />
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
