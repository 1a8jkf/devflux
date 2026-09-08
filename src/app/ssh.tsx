import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { readDirectoryAsync, getInfoAsync } from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { TerminalView, TerminalViewRef } from '../components/TerminalView';
import { FileNode, PROJECTS_ROOT } from '../services/FileSystemService';
import { useLanguage } from '../contexts/LanguageContext';

type Tab = 'files' | 'terminal';

type ConnectionInfo = {
  user: string;
  host: string;
  port: number;
};

type LinuxSshRequestType = 'LINUX_SSH_LIST' | 'LINUX_SSH_UPLOAD' | 'LINUX_SSH_DOWNLOAD';

const SSH_RESULT_TYPES: Record<LinuxSshRequestType, string> = {
  LINUX_SSH_LIST: 'LINUX_SSH_LIST_RESULT',
  LINUX_SSH_UPLOAD: 'LINUX_SSH_UPLOAD_RESULT',
  LINUX_SSH_DOWNLOAD: 'LINUX_SSH_DOWNLOAD_RESULT',
};

const getParentLocalPath = (path: string) => {
  if (!path) return '';
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
};

const getParentRemotePath = (path: string) => {
  if (!path || path === '/') return '/';
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join('/')}` : '/';
};

const joinRemotePath = (base: string, name: string) => `${base === '/' ? '' : base}/${name}`;

const quoteShell = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";

export default function SSHScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const { t } = useLanguage();
  const terminalRef = useRef<TerminalViewRef>(null);
  const requestSeqRef = useRef(0);

  const [connectionString, setConnectionString] = useState('');
  const [password, setPassword] = useState('');
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('files');
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);

  const [localFiles, setLocalFiles] = useState<FileNode[]>([]);
  const [remoteFiles, setRemoteFiles] = useState<FileNode[]>([]);
  const [localPath, setLocalPath] = useState('');
  const [remotePath, setRemotePath] = useState('/');
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [selectedLocal, setSelectedLocal] = useState<FileNode | null>(null);
  const [selectedRemote, setSelectedRemote] = useState<FileNode | null>(null);
  const [sftpReady, setSftpReady] = useState(false);
  const [sftpStatus, setSftpStatus] = useState(t('Aguardando conexão.'));
  const [transferring, setTransferring] = useState(false);

  const parseConnection = (): ConnectionInfo | null => {
    let clean = connectionString.trim().replace(/^ssh\s+/, '');
    if (!clean) return null;

    let port = 22;
    const portFlag = clean.match(/(?:^|\s)-p\s+(\d+)/);
    if (portFlag) {
      port = Number(portFlag[1]) || 22;
      clean = clean.replace(portFlag[0], ' ').trim();
    }

    const target = clean.split(/\s+/).filter(Boolean).pop() || '';
    let user = 'root';
    let host = target;
    if (target.includes('@')) {
      const parts = target.split('@');
      user = parts[0] || 'root';
      host = parts.slice(1).join('@');
    }

    const hostPort = host.match(/^(.+):(\d+)$/);
    if (hostPort && !hostPort[1].includes(':')) {
      host = hostPort[1];
      port = Number(hostPort[2]) || port;
    }

    if (!host) return null;
    return { user, host, port };
  };

  const buildSshPayload = (info: ConnectionInfo) => ({
    host: info.host,
    user: info.user,
    port: info.port,
    password,
    projectsRoot: PROJECTS_ROOT,
  });

  async function sendLinuxRequest<T>(type: LinuxSshRequestType, payload: Record<string, any>): Promise<T> {
    const { NodeRunner } = await import('../utils/nodeRunner');
    await NodeRunner.init();
    const reqId = `ssh-${Date.now()}-${requestSeqRef.current++}`;
    const expectedType = SSH_RESULT_TYPES[type];

    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;
      let removeListener: (() => void) | null = null;
      const cleanup = () => {
        clearTimeout(timeout);
        removeListener?.();
        removeListener = null;
      };
      const listener = (data: any) => {
        if (data?.reqId !== reqId || data?.type !== expectedType || settled) return;
        settled = true;
        cleanup();
        if (data.error) reject(new Error(data.error));
        else resolve(data.payload as T);
      };
      timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(t('Timed out while talking to the internal Linux environment.')));
      }, 120000);

      removeListener = NodeRunner.addListener(listener);
      NodeRunner.send({ type, reqId, ...payload });
    });
  }

  const loadLocalDirectory = async (nextPath = localPath) => {
    setLoadingLocal(true);
    try {
      const cleanPath = nextPath.replace(/^\/+|\/+$/g, '');
      const dirUri = `${PROJECTS_ROOT}${cleanPath ? `${cleanPath}/` : ''}`;
      const entries = await readDirectoryAsync(dirUri);
      const nodes = await Promise.all(entries.map(async (name) => {
        const relativePath = cleanPath ? `${cleanPath}/${name}` : name;
        const uri = `${PROJECTS_ROOT}${relativePath}`;
        const info = await getInfoAsync(uri);
        const isDirectory = Boolean((info as any).isDirectory);
        const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined;
        return {
          id: relativePath,
          name,
          type: isDirectory ? 'directory' : 'file',
          fileType: isDirectory ? undefined : ext,
          path: relativePath,
        } as FileNode;
      }));
      nodes.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1);
      setLocalPath(cleanPath);
      setLocalFiles(nodes);
      setSelectedLocal(null);
    } catch (e: any) {
      Alert.alert(t('Erro local'), e?.message || t('Não foi possível abrir a pasta local.'));
    } finally {
      setLoadingLocal(false);
    }
  };

  const loadRemoteDirectory = async (nextPath = remotePath, info = connectionInfo) => {
    if (!info) return;
    setLoadingRemote(true);
    try {
      const nodes = await sendLinuxRequest<FileNode[]>('LINUX_SSH_LIST', {
        ...buildSshPayload(info),
        remotePath: nextPath || '/',
      });
      setRemotePath(nextPath || '/');
      setRemoteFiles(nodes);
      setSelectedRemote(null);
      setSftpReady(true);
      setSftpStatus(t('SSH/SCP conectado. Toque em arquivos para selecionar; pastas abrem com um toque.'));
    } catch (e: any) {
      setSftpReady(false);
      setRemoteFiles([]);
      setSftpStatus(e?.message || t('Não foi possível listar o diretório remoto.'));
      Alert.alert(t('Erro remoto'), e?.message || t('Não foi possível abrir a pasta remota.'));
    } finally {
      setLoadingRemote(false);
    }
  };

  const runTerminalSsh = (info = connectionInfo) => {
    if (!info) return;
    setActiveTab('terminal');
    const installScript = 'if ! command -v ssh >/dev/null 2>&1 || ! command -v sshpass >/dev/null 2>&1; then echo "Installing OpenSSH and sshpass..."; apk add --no-cache openssh-client sshpass; fi';
    const sshTarget = `${info.user}@${info.host}`;
    const connectScript = password
      ? `SSHPASS=${quoteShell(password)} sshpass -e ssh -o StrictHostKeyChecking=accept-new -p ${info.port} ${sshTarget}`
      : `ssh -o StrictHostKeyChecking=accept-new -p ${info.port} ${sshTarget}`;

    setTimeout(() => {
      terminalRef.current?.runCommand(`${installScript}; ${connectScript}`);
    }, 650);
  };

  const handleConnect = async () => {
    const parsed = parseConnection();
    if (!parsed) {
      Alert.alert(t('Dados incompletos'), t('Informe algo como ssh root@192.168.0.1 ou root@meu-servidor.com:2222.'));
      return;
    }

    setConnected(true);
    setActiveTab('files');
    setConnectionInfo(parsed);
    setSftpStatus(t('Conectando via SSH/SCP...'));
    await loadLocalDirectory('');
    await loadRemoteDirectory('/', parsed);
  };

  const handleDisconnect = () => {
    setConnected(false);
    setConnectionInfo(null);
    setSftpReady(false);
    setRemoteFiles([]);
    setLocalFiles([]);
    setSelectedLocal(null);
    setSelectedRemote(null);
    setSftpStatus(t('Aguardando conexão.'));
  };

  const uploadSelected = async () => {
    if (!selectedLocal || selectedLocal.type !== 'file') {
      Alert.alert(t('Selecione um arquivo local'), t('Toque em um arquivo local antes de enviar para a VPS.'));
      return;
    }
    if (!connectionInfo || !sftpReady) {
      Alert.alert(t('SSH não conectado'), t('Conecte a VPS antes de mover arquivos.'));
      return;
    }
    setTransferring(true);
    try {
      await sendLinuxRequest('LINUX_SSH_UPLOAD', {
        ...buildSshPayload(connectionInfo),
        localPath: selectedLocal.path,
        remotePath: joinRemotePath(remotePath, selectedLocal.name),
      });
      await loadRemoteDirectory(remotePath, connectionInfo);
      setSftpStatus(`${t('Upload concluído:')} ${selectedLocal.name}`);
    } catch (e: any) {
      Alert.alert(t('Erro no upload'), e?.message || t('Não foi possível enviar o arquivo.'));
    } finally {
      setTransferring(false);
    }
  };

  const downloadSelected = async () => {
    if (!selectedRemote || selectedRemote.type !== 'file') {
      Alert.alert(t('Selecione um arquivo remoto'), t('Toque em um arquivo da VPS antes de baixar para o celular.'));
      return;
    }
    if (!connectionInfo || !sftpReady) {
      Alert.alert(t('SSH não conectado'), t('Conecte a VPS antes de mover arquivos.'));
      return;
    }
    setTransferring(true);
    try {
      await sendLinuxRequest('LINUX_SSH_DOWNLOAD', {
        ...buildSshPayload(connectionInfo),
        remotePath: selectedRemote.path,
        localPath: localPath ? `${localPath}/${selectedRemote.name}` : selectedRemote.name,
      });
      await loadLocalDirectory(localPath);
      setSftpStatus(`${t('Download concluído:')} ${selectedRemote.name}`);
    } catch (e: any) {
      Alert.alert(t('Erro no download'), e?.message || t('Não foi possível baixar o arquivo.'));
    } finally {
      setTransferring(false);
    }
  };

  const handleLocalPress = (file: FileNode) => {
    if (file.type === 'directory') {
      loadLocalDirectory(file.path);
      return;
    }
    setSelectedLocal(file);
  };

  const handleRemotePress = (file: FileNode) => {
    if (file.type === 'directory') {
      loadRemoteDirectory(file.path);
      return;
    }
    setSelectedRemote(file);
  };

  const renderTabs = () => (
    <View style={styles.tabBar}>
      <TouchableOpacity style={[styles.tabItem, activeTab === 'files' && styles.tabActive]} onPress={() => setActiveTab('files')}>
        <Icon name="PanelLeftRight" size={18} color={activeTab === 'files' ? theme.colors.accentBlue : theme.colors.textSecondary} />
        <Text style={[styles.tabText, activeTab === 'files' && { color: theme.colors.accentBlue }]}>{t('Arquivos')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tabItem, activeTab === 'terminal' && styles.tabActive]} onPress={() => setActiveTab('terminal')}>
        <Icon name="Terminal" size={18} color={activeTab === 'terminal' ? theme.colors.accentBlue : theme.colors.textSecondary} />
        <Text style={[styles.tabText, activeTab === 'terminal' && { color: theme.colors.accentBlue }]}>{t('Terminal')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFileRows = (
    files: FileNode[],
    selected: FileNode | null,
    onPress: (file: FileNode) => void,
    loading: boolean,
    emptyText: string,
  ) => {
    if (loading) {
      return <ActivityIndicator size="large" color={theme.colors.accentBlue} style={styles.panelLoader} />;
    }
    if (!files.length) {
      return <Text style={styles.emptyPanelText}>{emptyText}</Text>;
    }
    return files.map((file) => {
      const isSelected = selected?.path === file.path;
      return (
        <TouchableOpacity key={file.id} style={[styles.fileRow, isSelected && styles.fileRowSelected]} onPress={() => onPress(file)} activeOpacity={0.72}>
          <Icon name={file.type === 'directory' ? 'Folder' : 'File'} size={16} color={file.type === 'directory' ? theme.colors.accentBlue : theme.colors.textSecondary} />
          <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
          {file.type === 'directory' && <Icon name="ChevronRight" size={15} color={theme.colors.textSecondary} />}
        </TouchableOpacity>
      );
    });
  };

  const renderFilePanel = (kind: 'local' | 'remote') => {
    const isLocal = kind === 'local';
    const title = isLocal ? t('Celular') : 'VPS';
    const pathLabel = isLocal ? `projects/${localPath || ''}` : remotePath;
    const files = isLocal ? localFiles : remoteFiles;
    const selected = isLocal ? selectedLocal : selectedRemote;
    const loading = isLocal ? loadingLocal : loadingRemote;
    const canGoUp = isLocal ? Boolean(localPath) : remotePath !== '/';
    const refresh = () => isLocal ? loadLocalDirectory(localPath) : loadRemoteDirectory(remotePath);
    const goUp = () => isLocal ? loadLocalDirectory(getParentLocalPath(localPath)) : loadRemoteDirectory(getParentRemotePath(remotePath));

    return (
      <View style={[styles.filePanel, !isWide && styles.filePanelStacked]}>
        <View style={styles.panelHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.panelTitle}>{title}</Text>
            <Text style={styles.panelPath} numberOfLines={1}>{pathLabel}</Text>
          </View>
          {canGoUp && (
            <TouchableOpacity style={styles.panelIconBtn} onPress={goUp}>
              <Icon name="ArrowUp" size={16} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.panelIconBtn} onPress={refresh} disabled={!isLocal && !sftpReady}>
            <Icon name="RefreshCw" size={16} color={!isLocal && !sftpReady ? theme.colors.border : theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.fileList} contentContainerStyle={styles.fileListContent}>
          {renderFileRows(files, selected, isLocal ? handleLocalPress : handleRemotePress, loading, isLocal ? t('Nenhum arquivo local.') : t('Nenhum arquivo remoto carregado.'))}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => { handleDisconnect(); router.back(); }}>
          <Icon name="ArrowLeft" size={24} color={theme.colors.textPrimary} />
          <Text style={styles.headerTitle}>SSH / SFTP</Text>
        </TouchableOpacity>
        {connected && (
          <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
            <Text style={styles.disconnectText}>{t('Desconectar')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {!connected ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.formContainer}>
          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <Icon name="RadioTower" size={44} color={theme.colors.accentBlue} />
            </View>
            <Text style={styles.title}>{t('Conectar a VPS')}</Text>
            <Text style={styles.subtitle}>{t('Use SSH para terminal e SCP visual para mover arquivos entre o celular e o servidor.')}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('Usuário e host')}</Text>
              <TextInput
                style={styles.input}
                value={connectionString}
                onChangeText={setConnectionString}
                placeholder={t('ssh root@192.168.0.1 ou root@host:2222')}
                placeholderTextColor={theme.colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                keyboardType="url"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('Senha')}</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder={t('Opcional se usar chave no ambiente Linux')}
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            <TouchableOpacity style={styles.connectBtn} onPress={handleConnect} activeOpacity={0.82}>
              <Icon name="PlugZap" size={19} color="#000" />
              <Text style={styles.connectBtnText}>{t('Conectar')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.workspace}>
          {renderTabs()}
          {activeTab === 'files' ? (
            <View style={styles.filesWorkspace}>
              <View style={styles.connectionStrip}>
                <View style={styles.statusDot} />
                <Text style={styles.connectionText} numberOfLines={2}>
                  {connectionInfo ? `${connectionInfo.user}@${connectionInfo.host}:${connectionInfo.port}` : t('Servidor')} - {sftpStatus}
                </Text>
                <TouchableOpacity style={styles.terminalShortcut} onPress={() => runTerminalSsh()}>
                  <Icon name="Terminal" size={15} color={theme.colors.textPrimary} />
                </TouchableOpacity>
              </View>

              <View style={[styles.panels, !isWide && styles.panelsStacked]}>
                {renderFilePanel('local')}
                {renderFilePanel('remote')}
              </View>

              <View style={styles.transferBar}>
                <TouchableOpacity style={[styles.transferBtn, (!selectedLocal || !sftpReady || transferring) && styles.transferBtnDisabled]} onPress={uploadSelected} disabled={!selectedLocal || !sftpReady || transferring}>
                  <Icon name="Upload" size={16} color="#000" />
                  <Text style={styles.transferBtnText}>{t('Enviar para VPS')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.transferBtn, (!selectedRemote || !sftpReady || transferring) && styles.transferBtnDisabled]} onPress={downloadSelected} disabled={!selectedRemote || !sftpReady || transferring}>
                  <Icon name="Download" size={16} color="#000" />
                  <Text style={styles.transferBtnText}>{t('Baixar para celular')}</Text>
                </TouchableOpacity>
              </View>
              {transferring && <Text style={styles.transferStatus}>{t('Transferindo arquivo...')}</Text>}
            </View>
          ) : (
            <TerminalView ref={terminalRef} sessionId="ssh-session" />
          )}
        </View>
      )}
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
    paddingBottom: 12,
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: theme.typography.uiBold,
    color: theme.colors.textPrimary,
    marginLeft: 12,
  },
  disconnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: theme.colors.bgSurface,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  disconnectText: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
    fontSize: 13,
  },
  formContainer: {
    flex: 1,
    padding: 22,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 10,
    padding: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 23,
    fontFamily: theme.typography.uiBold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: theme.typography.ui,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    marginTop: 8,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontFamily: theme.typography.uiBold,
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  input: {
    minHeight: 46,
    backgroundColor: theme.colors.bgPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.mono,
    fontSize: 13,
  },
  connectBtn: {
    backgroundColor: theme.colors.accentBlue,
    minHeight: 48,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  connectBtnText: {
    color: '#000',
    fontFamily: theme.typography.uiBold,
    fontSize: 15,
  },
  workspace: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.colors.accentBlue,
  },
  tabText: {
    fontFamily: theme.typography.uiBold,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  filesWorkspace: {
    flex: 1,
    padding: 12,
    gap: 10,
  },
  connectionStrip: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 9,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accentBlue,
  },
  connectionText: {
    flex: 1,
    fontFamily: theme.typography.mono,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  terminalShortcut: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: theme.colors.bgSurface,
  },
  panels: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  panelsStacked: {
    flexDirection: 'column',
  },
  filePanel: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  filePanelStacked: {
    minHeight: 190,
  },
  panelHeader: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    gap: 8,
  },
  panelTitle: {
    fontFamily: theme.typography.uiBold,
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  panelPath: {
    marginTop: 2,
    fontFamily: theme.typography.mono,
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  panelIconBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: theme.colors.bgSurface,
  },
  fileList: {
    flex: 1,
  },
  fileListContent: {
    paddingVertical: 6,
  },
  fileRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 9,
  },
  fileRowSelected: {
    backgroundColor: theme.colors.bgSurface,
  },
  fileName: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.ui,
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  panelLoader: {
    marginTop: 32,
  },
  emptyPanelText: {
    padding: 18,
    textAlign: 'center',
    fontFamily: theme.typography.ui,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  transferBar: {
    flexDirection: 'row',
    gap: 10,
  },
  transferBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: theme.colors.accentBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  transferBtnDisabled: {
    opacity: 0.42,
  },
  transferBtnText: {
    fontFamily: theme.typography.uiBold,
    fontSize: 13,
    color: '#000',
  },
  transferStatus: {
    textAlign: 'center',
    fontFamily: theme.typography.mono,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
});