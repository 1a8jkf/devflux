import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { FileSystemService, ProjectInfo } from '../services/FileSystemService';
import { LiveSyncService } from '../services/LiveSyncService';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageAccessFramework } from 'expo-file-system/legacy';

const SAF = StorageAccessFramework || null;

const MENU_SECTIONS = [
  {
    title: 'AÇÕES RÁPIDAS',
    items: [
      { id: 'new', label: 'Novo arquivo', icon: 'FilePlus', shortcut: 'Ctrl+N', route: '/editor/codigo' },
      { id: 'open', label: 'Abrir pasta', icon: 'FolderOpen', shortcut: 'Ctrl+O', route: null },
      { id: 'recent', label: 'Meus Projetos', icon: 'FolderRoot', shortcut: '', route: '/projetos' },
      { id: 'palette', label: 'Paleta de Comandos', icon: 'Command', shortcut: 'Ctrl+Shift+P', route: null },
    ]
  },
  {
    title: 'WORKSPACES & SYNC',
    items: [
      { id: 'live-sync', label: 'Live Coding / Sync PC', icon: 'MonitorUp', shortcut: '', route: '/bridge' },
      { id: 'github', label: 'Conectar GitHub', icon: 'GitBranch', shortcut: '', route: null },
    ]
  },
  {
    title: 'FERRAMENTAS & IA',
    items: [
      { id: 'ai-chat', label: 'Chat de IA CodeFlex', icon: 'Bot', shortcut: '', route: '/ai-panel' },
      { id: 'ai-api', label: 'Configurar API de IA', icon: 'Key', shortcut: '', route: '/ai-settings' },
      { id: 'database', label: 'Terminal SQL (DB)', icon: 'Database', shortcut: '', route: '/database' },
      { id: 'shell', label: 'Terminal Linux (Shell)', icon: 'Terminal', shortcut: '', route: '/shell' },
    ]
  },
  {
    title: 'AMBIENTE',
    items: [
      { id: 'settings', label: 'Configurações', icon: 'Settings', shortcut: '', route: '/editor/configuracoes' },
      { id: 'plugins', label: 'Explorar Plugins', icon: 'Puzzle', shortcut: '', route: null },
    ]
  },
  {
    title: 'RECURSOS',
    items: [
      { id: 'help', label: 'Ajuda', icon: 'HelpCircle', shortcut: '', route: '/ajuda' },
      { id: 'about', label: 'Sobre o CodeFlex', icon: 'Info', shortcut: '', route: '/sobre' },
    ]
  }
];

export default function WelcomeScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);

  const router = useRouter();
  const navigation = useNavigation();

  const [modalState, setModalState] = React.useState<'closed' | 'open' | 'new-select-project' | 'new-file-name' | 'git-url' | 'duplicate-project-name'>('closed');
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [newFileName, setNewFileName] = React.useState('');
  const [allProjects, setAllProjects] = React.useState<ProjectInfo[]>([]);
  const [gitUrl, setGitUrl] = React.useState('');
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [duplicateName, setDuplicateName] = React.useState('');

  const handleProjectOptions = (projectId: string, projectName: string) => {
    Alert.alert(
      'Opções do Projeto',
      projectName,
      [
        { text: 'Duplicar', onPress: () => {
           setSelectedProjectId(projectId);
           setDuplicateName(projectName + ' (Cópia)');
           setModalState('duplicate-project-name');
        } },
        { text: 'Excluir', style: 'destructive', onPress: () => {
           Alert.alert('Confirmar Exclusão', 'Tem certeza que deseja excluir este projeto?', [
             { text: 'Cancelar', style: 'cancel' },
             { text: 'Excluir', style: 'destructive', onPress: async () => {
                await FileSystemService.deleteProject(projectId);
             }}
           ]);
        } },
        { text: 'Cancelar', style: 'cancel' }
      ]
    );
  };

  useEffect(() => {
    // Onboarding removido
  }, []);

  const handlePress = async (id: string, route: string | null) => {
    if (id === 'new') {
      try {
        const data = await FileSystemService.getProjects();
        setAllProjects(data);
        setModalState('new-select-project');
      } catch (e) {
        Alert.alert('Erro', 'Não foi possível carregar os projetos.');
      }
    } else if (id === 'open') {
      if (Platform.OS === 'web') {
        try {
          const input = document.createElement('input');
          input.type = 'file';
          input.webkitdirectory = true;
          input.multiple = true;
          input.onchange = async (e: any) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              const firstFile = files[0];
              const folderName = firstFile.webkitRelativePath.split('/')[0] || 'Imported_Project';
              
              const projectInfo = await FileSystemService.createEmptyProject(folderName, 'html');
              const projectId = projectInfo.id;
              
              const maxFiles = Math.min(files.length, 50);
              for (let i = 0; i < maxFiles; i++) {
                const file = files[i];
                if (file.name.includes('.DS_Store') || file.webkitRelativePath.includes('node_modules')) continue;
                
                const relativePath = file.webkitRelativePath.substring(folderName.length + 1);
                if (relativePath) {
                   const text = await file.text().catch(() => '');
                   
                   const parts = relativePath.split('/');
                   if (parts.length > 1) {
                     let cur = '';
                     for (let j = 0; j < parts.length - 1; j++) {
                       cur += (j === 0 ? '' : '/') + parts[j];
                       try { await FileSystemService.makeDirectory(projectId, cur); } catch(err) {}
                     }
                   }
                   await FileSystemService.writeFile(projectId, relativePath, text);
                }
              }
              
              router.push({ pathname: '/editor/codigo', params: { projectId } });
            }
          };
          input.click();
        } catch (e) {
          const data = await FileSystemService.getProjects();
          setAllProjects(data);
          setModalState('open');
        }
      } else {
        // Android: Request SAF directory permission to browse folders
        if (!SAF) {
          Alert.alert('Indisponível', 'Acesso a pastas externas não é suportado nesta versão.');
          return;
        }
        try {
          const permissions = await SAF.requestDirectoryPermissionsAsync();
          if (permissions.granted) {
            setIsDownloading(true);
            try {
              let folderName = 'ExternalProject';
              try {
                 let decoded = decodeURIComponent(permissions.directoryUri);
                 let lastPart = decoded.split('/').pop() || 'ExternalProject';
                 if (lastPart.includes(':')) {
                   lastPart = lastPart.split(':').pop() || lastPart;
                 }
                 folderName = lastPart;
              } catch(e) {}
              
              const projectId = await FileSystemService.importSAFDirectory(permissions.directoryUri, folderName);
              router.push({ pathname: '/editor/codigo', params: { projectId } });
            } catch (importError: any) {
              Alert.alert('Erro ao importar', importError?.message || 'Falha ao importar a pasta selecionada.');
            } finally {
              setIsDownloading(false);
            }
          } else {
            Alert.alert(
              'Permissão Necessária',
              'Para abrir pastas do seu dispositivo, você precisa conceder permissão de acesso ao armazenamento. Toque em "Abrir Pasta" novamente e selecione uma pasta.',
              [{ text: 'OK' }]
            );
          }
        } catch(e: any) {
          Alert.alert('Erro', e?.message || 'Não foi possível acessar o armazenamento.');
        }
      }
    } else if (id === 'github') {
      (navigation as any).openDrawer();
    } else if (route === '/ai-panel') {
      const syncId = LiveSyncService.syncProjectId;
      if (syncId) {
        router.push({ pathname: '/ai-panel', params: { projectId: syncId } });
      } else {
        router.push(route as any);
      }
    } else if (route) {
      router.push(route as any);
    }
  };

  const handleProjectSelect = (projectId: string) => {
    if (modalState === 'open') {
      setModalState('closed');
      router.push({ pathname: '/editor/codigo', params: { projectId } });
    } else if (modalState === 'new-select-project') {
      setSelectedProjectId(projectId);
      setModalState('new-file-name');
    }
  };

  const handleCreateFile = async () => {
    if (!selectedProjectId || !newFileName.trim()) return;
    await FileSystemService.writeFile(selectedProjectId, newFileName.trim(), '');
    setModalState('closed');
    const params = { projectId: selectedProjectId, openFile: newFileName.trim() };
    setNewFileName('');
    router.push({ pathname: '/editor/codigo', params });
  };

  const handleGitDownload = async () => {
    if (!gitUrl.trim()) return;
    setIsDownloading(true);
    try {
      const projectId = await FileSystemService.downloadGitRepo(gitUrl.trim());
      setModalState('closed');
      setGitUrl('');
      router.push({ pathname: '/editor/codigo', params: { projectId } });
    } catch (e: any) {
      alert(e.message || 'Erro ao baixar o repositório');
    } finally {
      setIsDownloading(false);
    }
  };

  const [recentProjects, setRecentProjects] = React.useState<ProjectInfo[]>([]);
  const [syncProject, setSyncProject] = React.useState<ProjectInfo | null>(null);
  const [isLiveSyncActive, setIsLiveSyncActive] = React.useState(false);
  const [syncIp, setSyncIp] = React.useState('');

  useFocusEffect(
    React.useCallback(() => {
      const load = async () => {
        const data = await FileSystemService.getProjects();
        const syncProj = data.find(p => p.name === 'LiveSync Workspace');
        const normalProjs = data.filter(p => p.name !== 'LiveSync Workspace');
        setSyncProject(syncProj || null);
        
        // Put sync proj first in recent if it exists
        if (syncProj) {
          setRecentProjects([syncProj, ...normalProjs].slice(0, 3));
        } else {
          setRecentProjects(normalProjs.slice(0, 3));
        }
      };
      load();

      const unsubscribeLiveSync = LiveSyncService.subscribe(() => {
        if (LiveSyncService.ws?.readyState === WebSocket.OPEN) {
          setIsLiveSyncActive(true);
          const url = LiveSyncService.ws.url;
          setSyncIp(url.replace('ws://', ''));
        } else {
          setIsLiveSyncActive(false);
          setSyncIp('');
        }
        // Also reload projects when LiveSync status changes (project may have been created)
        load();
      });

      const unsubscribeFS = FileSystemService.subscribe(load);

      return () => {
        unsubscribeLiveSync();
        unsubscribeFS();
      };
    }, [])
  );

  const formatTime = (ms: number) => {
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    return `${Math.floor(hours / 24)}d atrás`;
  };

  return (
    <>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        


        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PROJETOS RECENTES</Text>
          <View style={styles.recentProjectsContainer}>
            {recentProjects.length === 0 ? (
              <Text style={{ color: theme.colors.textSecondary, padding: 12, fontFamily: theme.typography.ui }}>Nenhum projeto ainda. Crie um novo!</Text>
            ) : (
              recentProjects.map(proj => (
                <TouchableOpacity key={proj.id} style={styles.recentProjectCard} onPress={() => router.push({ pathname: '/editor/codigo', params: { projectId: proj.id } })}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={styles.recentIconBox}>
                      <Icon name={proj.type === 'node' ? 'Server' : proj.type === 'react' ? 'Layout' : 'Globe'} size={16} color={theme.colors.accentBlue} />
                    </View>
                    {proj.name !== 'LiveSync Workspace' && (
                      <TouchableOpacity onPress={() => handleProjectOptions(proj.id, proj.name)} style={{ padding: 4 }}>
                        <Icon name="MoreHorizontal" size={16} color={theme.colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.recentInfo}>
                    <Text style={styles.recentName} numberOfLines={1}>{proj.name}</Text>
                    {proj.name === 'LiveSync Workspace' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <View style={{ backgroundColor: theme.colors.success + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 8 }}>
                          <Text style={{ color: theme.colors.success, fontSize: 10, fontFamily: theme.typography.uiBold }}>SYNC CODE</Text>
                        </View>
                        <Text style={[styles.recentMeta, { marginTop: 0 }]}>{isLiveSyncActive ? 'Online' : 'Offline'}</Text>
                      </View>
                    ) : (
                      <Text style={styles.recentMeta}>{proj.type.toUpperCase()} • {formatTime(proj.updatedAt)}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>

        {MENU_SECTIONS.map((section, idx) => (
        <View key={idx} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.sectionItems}>
            {section.items.map(item => (
              <TouchableOpacity 
                key={item.id} 
                style={styles.menuItem}
                onPress={() => handlePress(item.id, item.route)}
              >
                <View style={styles.menuLeft}>
                  <Icon name={item.icon as any} size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.menuLabel}>{item.label}</Text>
                </View>
                {item.id === 'live-sync' ? (
                  <Text style={[styles.shortcutText, { color: isLiveSyncActive ? theme.colors.success : theme.colors.textSecondary, fontFamily: theme.typography.uiBold }]}>
                    {isLiveSyncActive ? 'Conectado' : 'Desconectado'}
                  </Text>
                ) : !!item.shortcut && (
                  <Text style={styles.shortcutText}>{item.shortcut}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>

    <Modal visible={modalState !== 'closed'} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {modalState === 'open' ? 'Abrir Pasta' : 
               modalState === 'new-select-project' ? 'Selecione o Projeto' : 
               modalState === 'git-url' ? 'Baixar do GitHub' : 'Nome do Arquivo'}
            </Text>
            <TouchableOpacity onPress={() => setModalState('closed')}>
              <Icon name="X" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {(modalState === 'open' || modalState === 'new-select-project') && (
            <View style={{ paddingHorizontal: 20 }}>
              {modalState === 'new-select-project' && (
                <>
                  <TouchableOpacity style={styles.projectCard} onPress={() => {
                    setModalState('closed');
                    router.push('/novo-projeto');
                  }}>
                    <View style={styles.projectIcon}>
                      <Icon name="FolderPlus" size={24} color={theme.colors.accentPurple} />
                    </View>
                    <View style={styles.projectInfo}>
                      <Text style={styles.projectName}>Criar Novo Projeto</Text>
                      <Text style={styles.projectMeta}>Comece do zero</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.projectCard} onPress={async () => {
                    setModalState('closed');
                    if (!SAF) {
                      Alert.alert('Indisponível', 'Acesso a pastas externas não é suportado nesta versão.');
                      return;
                    }
                    try {
                      const permissions = await SAF.requestDirectoryPermissionsAsync();
                      if (permissions.granted) {
                        let folderName = 'Novo_Projeto_Android';
                        try {
                           folderName = decodeURIComponent(permissions.directoryUri.split('%2F').pop() || 'Novo_Projeto_Android');
                        } catch(e) {}
                        const projectId = await FileSystemService.createSAFProject(permissions.directoryUri, folderName);
                        router.push({ pathname: '/editor/codigo', params: { projectId } });
                      }
                    } catch(e: any) {
                      Alert.alert('Erro', e?.message || 'Falha ao criar projeto em pasta externa.');
                    }
                  }}>
                    <View style={styles.projectIcon}>
                      <Icon name="FolderPlus" size={24} color={theme.colors.accentGreen || '#4ADE80'} />
                    </View>
                    <View style={styles.projectInfo}>
                      <Text style={styles.projectName}>Criar em Pasta Externa</Text>
                      <Text style={styles.projectMeta}>Escolha uma pasta do celular</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.projectCard} onPress={() => setModalState('git-url')}>
                    <View style={styles.projectIcon}>
                      <Icon name="Github" size={24} color={theme.colors.textPrimary} />
                    </View>
                    <View style={styles.projectInfo}>
                      <Text style={styles.projectName}>Baixar do GitHub</Text>
                      <Text style={styles.projectMeta}>Clone repositórios como Zip</Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}
              {allProjects.map(proj => (
                <TouchableOpacity key={proj.id} style={styles.projectCard} onPress={() => handleProjectSelect(proj.id)}>
                  <View style={styles.projectIcon}>
                    <Icon name={proj.type === 'node' ? 'Server' : proj.type === 'react' ? 'Layout' : 'Globe'} size={24} color={theme.colors.accentBlue} />
                  </View>
                  <View style={styles.projectInfo}>
                    <Text style={styles.projectName}>{proj.name}</Text>
                    <Text style={styles.projectMeta}>{proj.type.toUpperCase()}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {modalState === 'new-file-name' && (
            <View style={{ paddingHorizontal: 20 }}>
              <TextInput
                style={styles.searchInput}
                placeholder="Nome do arquivo (ex: script.js)"
                placeholderTextColor={theme.colors.textSecondary}
                value={newFileName}
                onChangeText={setNewFileName}
                autoFocus
              />
              <TouchableOpacity style={[styles.recentProjectCard, { marginTop: 16, alignItems: 'center' }]} onPress={handleCreateFile}>
                <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.ui, fontWeight: 'bold' }}>Criar e Abrir</Text>
              </TouchableOpacity>
            </View>
          )}

          {modalState === 'git-url' && (
            <View style={{ paddingHorizontal: 20 }}>
              <TextInput
                style={styles.searchInput}
                placeholder="https://github.com/user/repo"
                placeholderTextColor={theme.colors.textSecondary}
                value={gitUrl}
                onChangeText={setGitUrl}
                autoCapitalize="none"
                editable={!isDownloading}
              />
              <TouchableOpacity 
                style={[styles.recentProjectCard, { marginTop: 16, alignItems: 'center' }]} 
                onPress={handleGitDownload}
                disabled={isDownloading || !gitUrl}
              >
                <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.ui, fontWeight: 'bold' }}>
                  {isDownloading ? 'Baixando...' : 'Baixar e Abrir'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {modalState === 'duplicate-project-name' && (
            <View style={{ paddingHorizontal: 20 }}>
              <TextInput
                style={styles.searchInput}
                placeholder="Nome do projeto duplicado"
                placeholderTextColor={theme.colors.textSecondary}
                value={duplicateName}
                onChangeText={setDuplicateName}
                autoFocus
              />
              <TouchableOpacity style={[styles.recentProjectCard, { marginTop: 16, alignItems: 'center' }]} onPress={async () => {
                if (!selectedProjectId || !duplicateName.trim()) return;
                await FileSystemService.duplicateProject(selectedProjectId, duplicateName.trim());
                setModalState('closed');
              }}>
                <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.ui, fontWeight: 'bold' }}>Duplicar Projeto</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>

    </>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary, // now #000000
  },
  content: {
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
    letterSpacing: 2,
    marginBottom: 12,
    fontFamily: theme.typography.ui,
    marginLeft: 8,
  },
  sectionItems: {
    backgroundColor: 'transparent',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuLabel: {
    marginLeft: 12,
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
  },
  shortcutText: {
    fontFamily: theme.typography.mono,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  recentProjectsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  recentProjectCard: {
    flex: 1,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  recentIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  recentInfo: {
    justifyContent: 'center',
  },
  recentName: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  recentMeta: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.bgElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  modalTitle: {
    fontFamily: theme.typography.ui,
    fontSize: 20,
    color: theme.colors.textPrimary,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgSurface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  projectIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontFamily: theme.typography.ui,
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  projectMeta: {
    fontFamily: theme.typography.ui,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  searchInput: {
    fontFamily: theme.typography.ui,
    fontSize: 15,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.bgSurface,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 8,
  },
});
