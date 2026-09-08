import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, ScrollView, ActivityIndicator, BackHandler, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { TerminalView } from '../components/TerminalView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NodeRunner } from '../utils/nodeRunner';
import { useLanguage } from '../contexts/LanguageContext';

type ShellTab = {
  id: string;
  title: string;
};

export default function ShellScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [alpineInstalled, setAlpineInstalled] = React.useState<boolean | null>(null);
  const [installing, setInstalling] = React.useState(false);
  const [installLog, setInstallLog] = React.useState('');
  const [shellTabs, setShellTabs] = React.useState<ShellTab[]>([{ id: 'shell-1', title: 'Shell 1' }]);
  const [activeShellId, setActiveShellId] = React.useState('shell-1');
  const [shellResetKeys, setShellResetKeys] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    const check = async () => {
      try {
        await NodeRunner.waitForEnvironment();
        const reqId = Math.random().toString();
        const unsub = NodeRunner.addListener((data: any) => {
          if (data.type === 'LINUX_CHECK_STATUS') {
            setAlpineInstalled(data.payload?.installed === true);
            unsub();
          }
        });
        NodeRunner.send({ type: 'CHECK_ALPINE', reqId });
      } catch (e) {
        setAlpineInstalled(false);
      }
    };
    check();
  }, []);

  // Android hardware back button
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBackPress = () => {
      if (router.canGoBack()) {
        router.back();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [router]);

  const handleInstallAlpine = async () => {
    setInstalling(true);
    setInstallLog('Installing Alpine Linux (offline)...\n');
    let unsubscribe: (() => void) | null = null;
    try {
      await NodeRunner.waitForEnvironment();
      const reqId = `shell-alpine-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      unsubscribe = NodeRunner.addListener((data: any) => {
        if (data?.reqId !== reqId) return;
        if (data.type === 'LINUX_INSTALL_LOG') {
          setInstallLog(prev => prev + data.payload);
        } else if (data.type === 'LINUX_INSTALL_DONE') {
          setInstallLog(prev => prev + '\nAlpine Linux installed successfully.\n');
          setAlpineInstalled(true);
          AsyncStorage.setItem('devflux_alpine_installed', 'true');
          setInstalling(false);
          unsubscribe?.();
        } else if (data.type === 'LINUX_INSTALL_ERROR') {
          setInstallLog(prev => prev + `\nError: ${data.payload}\n`);
          setInstalling(false);
          unsubscribe?.();
        }
      });
      if (!NodeRunner.send({ type: 'LINUX_INSTALL', reqId, packages: [] })) {
        throw new Error('Failed to send install request to Node backend.');
      }
    } catch(e) {
      unsubscribe?.();
      setInstallLog(prev => prev + `\nError: ${(e as any)?.message}\n`);
      setInstalling(false);
    }
  };

  const addShell = () => {
    if (shellTabs.length >= 3) {
      Alert.alert(t('Limite de shells'), t('Você pode manter até 3 shells abertos ao mesmo tempo.'));
      return;
    }

    const nextNumber = Math.max(...shellTabs.map(tab => Number(tab.id.replace('shell-', '')) || 0)) + 1;
    const nextTab = { id: `shell-${nextNumber}`, title: `Shell ${nextNumber}` };
    setShellTabs(prev => [...prev, nextTab]);
    setActiveShellId(nextTab.id);
  };

  const closeShell = (id: string) => {
    if (shellTabs.length <= 1) return;

    NodeRunner.send({ type: 'SHELL_PTY_STOP', sessionId: id });
    setShellTabs(prev => {
      const nextTabs = prev.filter(tab => tab.id !== id);
      if (activeShellId === id) {
        setActiveShellId(nextTabs[nextTabs.length - 1]?.id || 'shell-1');
      }
      return nextTabs;
    });
  };

  const resetActiveShell = () => {
    setShellResetKeys(prev => ({ ...prev, [activeShellId]: (prev[activeShellId] || 0) + 1 }));
  };

  // Show blocking overlay if Alpine is not installed
  if (alpineInstalled === null) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.accentBlue} />
      </View>
    );
  }

  if (alpineInstalled === false) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Icon name="ArrowLeft" size={24} color={theme.colors.textPrimary} />
            <Text style={styles.headerTitle}>{t('Terminal (Shell)')}</Text>
          </TouchableOpacity>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.blockerContainer}>
          <View style={styles.blockerIcon}>
            <Icon name="Terminal" size={48} color={theme.colors.accentBlue} />
          </View>
          <Text style={styles.blockerTitle}>{t('Alpine Linux Necessário')}</Text>
          <Text style={styles.blockerDesc}>
            {t('O terminal requer que o Alpine Linux esteja instalado. A instalação é rápida e feita offline (sem internet).')}
          </Text>

          {installLog ? (
            <ScrollView style={styles.logContainer}>
              <Text style={styles.logText}>{installLog}</Text>
            </ScrollView>
          ) : null}

          <TouchableOpacity
            style={[styles.installBtn, installing && { opacity: 0.6 }]}
            onPress={handleInstallAlpine}
            disabled={installing}
          >
            <Icon name={installing ? 'Loader' : 'Download'} size={18} color="#FFF" />
            <Text style={styles.installBtnText}>
              {installing ? t('Instalando...') : t('Instalar Alpine Linux')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={24} color={theme.colors.textPrimary} />
          <Text style={styles.headerTitle}>{t('Terminal (Shell)')}</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity style={[styles.actionBtn, shellTabs.length >= 3 && styles.disabledActionBtn]} onPress={addShell} disabled={shellTabs.length >= 3}>
            <Icon name="Plus" size={20} color={shellTabs.length >= 3 ? theme.colors.border : theme.colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={resetActiveShell}>
            <Icon name="RefreshCw" size={19} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Icon name="Settings" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.shellTabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shellTabsContent}>
          {shellTabs.map(tab => {
            const isActive = tab.id === activeShellId;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.shellTab, isActive && styles.shellTabActive]}
                onPress={() => setActiveShellId(tab.id)}
                activeOpacity={0.8}
              >
                <Text style={[styles.shellTabText, isActive && styles.shellTabTextActive]}>{tab.title}</Text>
                {shellTabs.length > 1 && (
                  <TouchableOpacity style={styles.shellTabClose} onPress={() => closeShell(tab.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="X" size={13} color={isActive ? '#FFF' : theme.colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.terminalContainer}>
        <TerminalView key={activeShellId} sessionId={activeShellId} resetKey={shellResetKeys[activeShellId] || 0} />
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
  disabledActionBtn: {
    opacity: 0.45,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shellTabs: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.bgPrimary,
  },
  shellTabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  shellTab: {
    minWidth: 86,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shellTabActive: {
    backgroundColor: theme.colors.accentBlue,
    borderColor: theme.colors.accentBlue,
  },
  shellTabText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.uiBold,
    fontSize: 12,
  },
  shellTabTextActive: {
    color: '#FFF',
  },
  shellTabClose: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  terminalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  blockerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  blockerIcon: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: theme.colors.accentBlue + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  blockerTitle: {
    fontFamily: theme.typography.uiBold || theme.typography.ui,
    fontSize: 22,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  blockerDesc: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  logContainer: {
    maxHeight: 160,
    width: '100%',
    backgroundColor: '#0D0D0D',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  logText: {
    fontFamily: theme.typography.mono,
    fontSize: 11,
    color: '#A0AEC0',
    lineHeight: 18,
  },
  installBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.colors.accentBlue,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
  },
  installBtnText: {
    fontFamily: theme.typography.uiBold || theme.typography.ui,
    fontSize: 16,
    color: '#FFF',
  },
});
