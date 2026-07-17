import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { TerminalView } from '../components/TerminalView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ShellScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={24} color={theme.colors.textPrimary} />
          <Text style={styles.headerTitle}>Terminal (Shell)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Icon name="Settings" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.terminalContainer}>
        <TerminalView />
      </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontFamily: theme.typography.ui,
    fontSize: 18,
    color: theme.colors.textPrimary,
  },
  actionBtn: {
    padding: 8,
  },
  terminalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  }
});
