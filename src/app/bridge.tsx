import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { FileSystemService } from '../services/FileSystemService';
import { LiveSyncService } from '../services/LiveSyncService';
import { useLanguage } from '../contexts/LanguageContext';


export default function BridgeScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useKeepAwake();
  const { t } = useLanguage();

  const [roomCode, setRoomCode] = useState('');
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [logs, setLogs] = useState<{ id: string; time: string; msg: string }[]>([]);

  useEffect(() => {
    const unsubscribe = LiveSyncService.subscribe((newLogs) => {
      setLogs([...newLogs]);
      if (LiveSyncService.ws?.readyState === WebSocket.OPEN) {
        setStatus('connected');
      } else if (LiveSyncService.ws?.readyState === WebSocket.CONNECTING) {
        setStatus('connecting');
      } else {
        setStatus('disconnected');
      }
    });
    return unsubscribe;
  }, []);

  const handleConnect = async () => {
    if (status === 'connected') {
      LiveSyncService.disconnect();
      return;
    }
    setStatus('connecting');
    LiveSyncService.connect(roomCode);
  };

  const handleOpenWorkspace = async () => {
    let syncProjectId = LiveSyncService.syncProjectId;

    if (!syncProjectId) {
      const projects = await FileSystemService.getProjects();
      const project = projects.find(p => p.type === 'sync')
        || projects.find(p => p.id === 'live-sync-workspace')
        || projects.find(p => p.name === 'LiveSync Workspace');
      syncProjectId = project?.id || null;
    }

    if (syncProjectId) {
      router.push({ pathname: '/editor/codigo', params: { projectId: syncProjectId } });
    } else {
      alert(t('O Workspace ainda não foi criado. Conecte-se primeiro.'));
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Icon name="MonitorUp" size={48} color={theme.colors.accentBlue} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <Text style={styles.cardTitle}>{t('Conecte seu PC ao Celular')}</Text>
          <Text style={styles.cardDesc}>
            {t('Clique em "Start Live Sync" no VS Code e digite o Código da Sala abaixo para conectar via Cloud Relay.')}
          </Text>

          <View style={styles.extensionNotice}>
            <Icon name="Info" size={16} color={theme.colors.accentBlue} />
            <Text style={styles.extensionNoticeText}>
              {t('Para funcionar, o Sync Code precisa da extensão DevFlux instalada e ativa no VS Code do seu PC.')}
            </Text>
          </View>

          <Text style={styles.label}>{t('Código da Sala')}</Text>
          <TextInput
            style={styles.input}
            value={roomCode}
            onChangeText={setRoomCode}
            placeholder="Ex: J7X9-M2P4"
            keyboardType="default"
            autoCapitalize="characters"
            placeholderTextColor={theme.colors.textSecondary}
          />

          <TouchableOpacity
            style={[styles.btnPrimary, status === 'connected' && { backgroundColor: theme.colors.error }]}
            onPress={handleConnect}
          >
            <Text style={styles.btnText}>
              {status === 'connected' ? t('Desconectar') : status === 'connecting' ? t('Conectando...') : t('Conectar ao PC')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnSecondary} onPress={handleOpenWorkspace}>
            <Text style={styles.btnTextSecondary}>{t('Abrir Workspace')}</Text>
          </TouchableOpacity>

          {status === 'connected' && (
            <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 16 }}>
              <TouchableOpacity
                style={[styles.btnSecondary, { borderColor: theme.colors.accentBlue, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
                onPress={() => { LiveSyncService.requestFullWorkspace(); }}
              >
                <Icon name="DownloadCloud" size={18} color={theme.colors.accentBlue} />
                <Text style={[styles.btnTextSecondary, { color: theme.colors.accentBlue, marginLeft: 8 }]}>{t('Baixar Workspace (Offline)')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnSecondary, { borderColor: theme.colors.success, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
                onPress={() => LiveSyncService.pushLocalWorkspaceToPC()}
              >
                <Icon name="UploadCloud" size={18} color={theme.colors.success} />
                <Text style={[styles.btnTextSecondary, { color: theme.colors.success, marginLeft: 8 }]}>{t('Enviar Alterações Locais')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.logsContainer}>
          <Text style={styles.logsTitle}>{t('Logs de Sincronização')}</Text>
          {logs.map(log => (
            <View key={log.id} style={styles.logRow}>
              <Text style={styles.logTime}>[{log.time}]</Text>
              <Text style={styles.logMsg}>{log.msg}</Text>
            </View>
          ))}
          {logs.length === 0 && (
            <Text style={styles.logEmpty}>{t('Nenhum log ainda. Conecte para iniciar.')}</Text>
          )}
        </View>
      </ScrollView>
    </View>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
    fontSize: 18,
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  cardDesc: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  extensionNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  extensionNoticeText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.uiBold,
    fontSize: 12,
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.mono,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
  },
  btnPrimary: {
    backgroundColor: theme.colors.accentBlue,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnText: {
    color: '#FFF',
    fontFamily: theme.typography.uiBold,
    fontSize: 14,
  },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnTextSecondary: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
    fontSize: 14,
  },
  logsContainer: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  logsTitle: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
    fontSize: 14,
    marginBottom: 12,
  },
  logRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  logTime: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.mono,
    fontSize: 11,
    marginRight: 8,
  },
  logMsg: {
    color: theme.colors.accentBlue,
    fontFamily: theme.typography.mono,
    fontSize: 11,
    flex: 1,
  },
  logEmpty: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 16,
  },
  lockedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  lockedTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontFamily: theme.typography.uiBold,
    marginTop: 24,
    marginBottom: 12,
  },
  lockedDesc: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontFamily: theme.typography.ui,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  unlockBtn: {
    backgroundColor: theme.colors.accentAmber,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  unlockBtnText: {
    color: theme.colors.bgPrimary,
    fontFamily: theme.typography.uiBold,
    fontSize: 16,
  }
});
