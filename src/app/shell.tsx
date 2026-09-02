import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { TerminalView } from '../components/TerminalView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEnvironment } from '../hooks/useEnvironment';
import { InitialSetupScreen } from '../components/InitialSetup/InitialSetup';

export default function ShellScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hasCompletedSetup, loading, refresh } = useEnvironment();

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!hasCompletedSetup) {
    return <InitialSetupScreen onComplete={refresh} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Compact header bar — Alpine branding */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={styles.statusDot} />
          <Text style={styles.headerTitle}>Alpine Linux</Text>
          <Text style={styles.headerSub}>shell</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/settings')}>
            <Icon name="Settings" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Terminal takes the full remaining space */}
      <View style={styles.terminalContainer}>
        <TerminalView sessionId="alpine-shell-global" />
      </View>
    </View>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    padding: 6,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
  },
  headerTitle: {
    fontFamily: theme.typography.uiBold || theme.typography.ui,
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  headerSub: {
    fontFamily: theme.typography.mono,
    fontSize: 11,
    color: theme.colors.textSecondary,
    backgroundColor: theme.colors.bgSurface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    padding: 6,
  },
  terminalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
