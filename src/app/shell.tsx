import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { TerminalView } from '../components/TerminalView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ShellScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [alpineInstalled, setAlpineInstalled] = React.useState<boolean | null>(null);
  const [installing, setInstalling] = React.useState(false);
  const [installLog, setInstallLog] = React.useState('');

  React.useEffect(() => {
    const check = async () => {
      const done = await AsyncStorage.getItem('devflux_alpine_installed');
      if (done === 'true') {
        setAlpineInstalled(true);
      } else {
        setAlpineInstalled(false);
      }
    };
    check();
  }, []);

  const handleInstallAlpine = () => {
    setInstalling(true);
    setInstallLog('⏳ Instalando Alpine Linux (offline)...\n');
    try {
      const nodejs = require('nodejs-mobile-react-native');
      const logListener = (msg: string) => {
        try {
          const data = JSON.parse(msg);
          if (data.type === 'LINUX_INSTALL_LOG') {
            setInstallLog(prev => prev + data.payload);
          } else if (data.type === 'LINUX_INSTALL_DONE') {
            setInstallLog(prev => prev + '\n✅ Alpine Linux instalado com sucesso!\n');
            setAlpineInstalled(true);
            AsyncStorage.setItem('devflux_alpine_installed', 'true');
            setInstalling(false);
          } else if (data.type === 'LINUX_INSTALL_ERROR') {
            setInstallLog(prev => prev + `\n❌ Erro: ${data.payload}\n`);
            setInstalling(false);
          }
        } catch(e) {}
      };
      nodejs.channel.addListener('message', logListener);
      nodejs.channel.send(JSON.stringify({ type: 'LINUX_INSTALL', packages: [] }));
    } catch(e) {
      setInstallLog(prev => prev + `\n❌ Erro: ${(e as any)?.message}\n`);
      setInstalling(false);
    }
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
            <Text style={styles.headerTitle}>Terminal (Shell)</Text>
          </TouchableOpacity>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.blockerContainer}>
          <View style={styles.blockerIcon}>
            <Icon name="Terminal" size={48} color={theme.colors.accentBlue} />
          </View>
          <Text style={styles.blockerTitle}>Alpine Linux Necessário</Text>
          <Text style={styles.blockerDesc}>
            O terminal requer que o Alpine Linux esteja instalado. A instalação é rápida e feita offline (sem internet).
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
              {installing ? 'Instalando...' : 'Instalar Alpine Linux'}
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
