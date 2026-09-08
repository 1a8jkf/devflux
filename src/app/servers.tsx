import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { NodeRunner } from '../utils/nodeRunner';
import { useLanguage } from '../contexts/LanguageContext';

interface ServerInfo {
  port: string;
  process: string;
  address: string;
}

export default function ServersScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const { t } = useLanguage();

  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchServers = () => {
    setLoading(true);
    NodeRunner.send({ type: 'LINUX_GET_SERVERS' });
  };

  useEffect(() => {
    const removeListener = NodeRunner.addListener((data: any) => {
      try {
        if (data.type === 'LINUX_SERVERS_RESULT') {
          setServers(data.payload || []);
          setLoading(false);
          setRefreshing(false);
        }
      } catch (e) {}
    });
    fetchServers();

    return () => {
      removeListener();
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchServers();
  };

  const handleOpenPreview = (port: string) => {
    Linking.openURL(`http://localhost:${port}`).catch(() => {
      Alert.alert(t('Erro'), `${t('Não foi possível abrir')} http://localhost:${port}`);
    });
  };

  const handleKill = (port: string, processName: string) => {
    Alert.alert(
      t('Derrubar Servidor'),
      t('server.killConfirm', 'Tem certeza que deseja tentar matar o processo na porta {port} ({process})?').replace('{port}', port).replace('{process}', processName),
      [
        { text: t('Cancelar'), style: 'cancel' },
        { 
          text: t('Kill'), 
          style: 'destructive',
          onPress: () => {
               NodeRunner.send({ type: 'SHELL_PTY_START', sessionId: 'kill-task', cwd: '/root' });
             setTimeout(() => {
                 NodeRunner.send({ type: 'SHELL_PTY_DATA', sessionId: 'kill-task', payload: `fuser -k ${port}/tcp || killall ${processName}\r\n` });
                 setTimeout(fetchServers, 1000);
             }, 500);
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accentBlue} />}
      >
        <Text style={styles.description}>
          {t('Abaixo estão os processos e servidores web ativos dentro do seu ambiente local Alpine Linux.')}
        </Text>

        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={theme.colors.accentBlue} style={{ marginTop: 40 }} />
        ) : servers.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="ServerOff" size={48} color={theme.colors.textSecondary} />
            <Text style={styles.emptyTitle}>{t('Nenhum servidor ativo')}</Text>
            <Text style={styles.emptyDesc}>{t('Inicie um servidor (ex: npm run dev ou python3 -m http.server) no terminal para vê-lo aqui.')}</Text>
          </View>
        ) : (
          servers.map((s, idx) => (
            <View key={idx} style={styles.serverCard}>
              <View style={styles.serverInfo}>
                <View style={styles.serverIcon}>
                  <Icon name="Radio" size={24} color={theme.colors.accentTeal} />
                </View>
                <View>
                  <Text style={styles.serverPort}>{t('Porta')} {s.port}</Text>
                  <Text style={styles.serverProcess}>{s.process} ({s.address})</Text>
                </View>
              </View>
              
              <View style={styles.serverActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleOpenPreview(s.port)}>
                  <Icon name="ExternalLink" size={20} color={theme.colors.accentBlue} />
                  <Text style={[styles.actionText, { color: theme.colors.accentBlue }]}>{t('Preview')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { marginLeft: 16 }]} onPress={() => handleKill(s.port, s.process)}>
                  <Icon name="Power" size={20} color={theme.colors.accentRed} />
                </TouchableOpacity>
              </View>
            </View>
          ))
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: theme.typography.uiBold,
    color: theme.colors.textPrimary,
    marginLeft: 12,
  },
  refreshBtn: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  description: {
    fontSize: 14,
    fontFamily: theme.typography.ui,
    color: theme.colors.textSecondary,
    marginBottom: 24,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: theme.typography.uiBold,
    color: theme.colors.textPrimary,
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: theme.typography.ui,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  serverCard: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  serverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serverIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  serverPort: {
    fontSize: 16,
    fontFamily: theme.typography.uiBold,
    color: theme.colors.textPrimary,
  },
  serverProcess: {
    fontSize: 12,
    fontFamily: theme.typography.mono,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  serverActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  actionText: {
    fontSize: 14,
    fontFamily: theme.typography.uiBold,
    marginLeft: 6,
  }
});
