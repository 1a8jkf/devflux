import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { ContextManager } from '../services/ContextManager';

export default function DebugRedirectScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeProjectId = ContextManager.getActiveProject();

  useEffect(() => {
    if (!activeProjectId) return;
    router.replace({ pathname: '/editor/debug', params: { projectId: activeProjectId } });
  }, [activeProjectId, router]);

  if (activeProjectId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={theme.colors.accentBlue} />
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.emptyContainer, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Icon name="Activity" size={36} color={theme.colors.textSecondary} />
      <Text style={styles.emptyTitle}>Debug do projeto</Text>
      <Text style={styles.emptyText}>Abra um projeto para visualizar os eventos reais daquele contexto.</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/projetos')}>
        <Text style={styles.primaryButtonText}>Abrir projetos</Text>
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgPrimary,
  },
  emptyContainer: {
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 12,
    fontFamily: theme.typography.uiBold,
    fontSize: 18,
    color: theme.colors.textPrimary,
  },
  emptyText: {
    marginTop: 8,
    maxWidth: 320,
    textAlign: 'center',
    fontFamily: theme.typography.ui,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSecondary,
  },
  primaryButton: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: theme.colors.accentBlue,
  },
  primaryButtonText: {
    color: '#FFF',
    fontFamily: theme.typography.uiBold,
    fontSize: 13,
  },
});