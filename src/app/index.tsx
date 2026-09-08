import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Modal, TextInput, Alert, ActivityIndicator, Pressable, useWindowDimensions, KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { FileSystemService, ProjectInfo, FileNode } from '../services/FileSystemService';
import { LiveSyncService } from '../services/LiveSyncService';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { useLanguage } from '../contexts/LanguageContext';

const SAF = StorageAccessFramework || null;

const CORE_SETUP_PACKAGES = ['nodejs', 'npm', 'git', 'python3', 'build-base', 'curl', 'wget', 'openssh-client', 'sshpass'];
const LEGACY_TEST_PROJECT_KEYS = new Set(['teste', 'test', 'projeto', 'projeto teste', 'projeto de teste', 'test project']);
const FOLDER_PICKER_IGNORED_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'build', '.next', '.vinext', '.wrangler']);

const normalizeProjectKey = (value?: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const isLegacyTestProject = (project: ProjectInfo) => {
  const id = normalizeProjectKey(project.id);
  const name = normalizeProjectKey(project.name);
  return LEGACY_TEST_PROJECT_KEYS.has(id) || LEGACY_TEST_PROJECT_KEYS.has(name);
};

const MENU_SECTIONS = [
  {
    title: 'AÇÕES RÁPIDAS',
    items: [
      { id: 'new', label: 'Novo arquivo', icon: 'FilePlus', shortcut: 'Ctrl+N', route: '/editor/codigo' },
      { id: 'open', label: 'Abrir pasta', icon: 'FolderOpen', shortcut: 'Ctrl+O', route: null },
      { id: 'recent', label: 'Meus Projetos', icon: 'FolderRoot', shortcut: '', route: '/projetos' },
      { id: 'github', label: 'Baixar do GitHub', icon: 'Github', shortcut: '', route: null },
    ]
  },
  {
    title: 'WORKSPACES & SYNC',
    items: [
      { id: 'live-sync', label: 'Live Coding / Sync PC', icon: 'MonitorUp', shortcut: '', route: '/bridge' },
    ]
  },
  {
    title: 'FERRAMENTAS & IA',
    items: [
      { id: 'ai-chat', label: 'Chat de IA DevFlux', icon: 'Bot', shortcut: '', route: '/ai-panel' },
      { id: 'ai-api', label: 'Configurar API de IA', icon: 'Key', shortcut: '', route: '/ai-settings' },
      { id: 'database', label: 'Terminal SQL (DB)', icon: 'Database', shortcut: '', route: '/database' },
      { id: 'shell', label: 'Terminal Linux (Shell)', icon: 'Terminal', shortcut: '', route: '/shell' },
      { id: 'ssh', label: 'Conexão SSH Remota', icon: 'RadioTower', shortcut: '', route: '/ssh' },
      { id: 'servers', label: 'Servidores Locais', icon: 'Server', shortcut: '', route: '/servers' },
    ]
  },
  {
    title: 'AMBIENTE',
    items: [
      { id: 'settings', label: 'Configurações', icon: 'Settings', shortcut: '', route: '/editor/configuracoes' },
    ]
  },
  {
    title: 'RECURSOS',
    items: [
      { id: 'help', label: 'Ajuda', icon: 'HelpCircle', shortcut: '', route: '/ajuda' },
      { id: 'about', label: 'Sobre o DevFlux', icon: 'Info', shortcut: '', route: '/sobre' },
    ]
  }
];

export default function WelcomeScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const isWideLayout = width >= 720;

  const router = useRouter();

  const [modalState, setModalState] = React.useState<'closed' | 'open' | 'new-select-project' | 'new-file-name' | 'git-url' | 'duplicate-project-name'>('closed');
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [newFileName, setNewFileName] = React.useState('');
  const [newFileFolder, setNewFileFolder] = React.useState('');
  const [projectFolders, setProjectFolders] = React.useState<{ name: string; path: string }[]>([]);
  const [allProjects, setAllProjects] = React.useState<ProjectInfo[]>([]);
  const [gitUrl, setGitUrl] = React.useState('');
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [duplicateName, setDuplicateName] = React.useState('');
  const [projectOptions, setProjectOptions] = React.useState<ProjectInfo | null>(null);

  const [ghToken, setGhToken] = React.useState('');
  const [ghRepos, setGhRepos] = React.useState<any[]>([]);
  const [isGhLoading, setIsGhLoading] = React.useState(false);
  const [hasGhToken, setHasGhToken] = React.useState(false);

  const loadGhRepos = async (tokenStr: string) => {
    setIsGhLoading(true);
    try {
      const { GithubService } = await import('../services/GithubService');
      await GithubService.setToken(tokenStr);
      const repos = await GithubService.getRepos();
      setGhRepos(repos);
      setHasGhToken(true);
      setGhToken(tokenStr);
    } catch (e: any) {
      Alert.alert(t('Erro'), t('Falha ao autenticar ou buscar repositórios.'));
      setHasGhToken(false);
    } finally {
      setIsGhLoading(false);
    }
  };




  const normalizeRelativePath = React.useCallback((value: string) => {
    return String(value || '')
      .replace(/\\/g, '/')
      .split('/')
      .map(part => part.trim())
      .filter(part => part && part !== '.' && part !== '..')
      .join('/');
  }, []);

  const collectProjectFolders = React.useCallback((nodes: FileNode[], parentPath = ''): { name: string; path: string }[] => {
    const folders: { name: string; path: string }[] = [];
    for (const node of nodes) {
      if (node.type !== 'directory') continue;
      if (FOLDER_PICKER_IGNORED_DIRS.has(node.name)) continue;
      const fullPath = normalizeRelativePath(parentPath ? `${parentPath}/${node.name}` : (node.path || node.name));
      folders.push({ name: node.name, path: fullPath });
      if (node.children?.length) {
        folders.push(...collectProjectFolders(node.children, fullPath));
      }
    }
    return folders;
  }, [normalizeRelativePath]);

  const loadNewFileFolders = React.useCallback(async (projectId: string) => {
    const rootFolder = { name: t('Raiz do Projeto'), path: '' };
    setNewFileFolder('');
    try {
      const tree = await FileSystemService.getProjectFileTree(projectId);
      setProjectFolders([rootFolder, ...collectProjectFolders(tree)]);
    } catch (error) {
      setProjectFolders([rootFolder]);
    }
  }, [collectProjectFolders, t]);

  const handleProjectOptions = (project: ProjectInfo) => {
    setProjectOptions(project);
  };

  const handleDuplicateProjectOption = () => {
    if (!projectOptions) return;
    setSelectedProjectId(projectOptions.id);
    setDuplicateName(projectOptions.name + ' (' + t('Cópia') + ')');
    setProjectOptions(null);
    setModalState('duplicate-project-name');
  };

  const handleDeleteProjectOption = async () => {
    if (!projectOptions) return;
    const projectId = projectOptions.id;
    setProjectOptions(null);
    await FileSystemService.deleteProject(projectId);
  };




  const handlePress = async (id: string, route: string | null) => {
    if (id === 'new') {
      try {
        const data = await FileSystemService.getProjects();
        setAllProjects(data);
        setModalState('new-select-project');
      } catch (e) {
        Alert.alert(t('Erro'), t('Não foi possível carregar os projetos.'));
      }
    } else if (id === 'github') {
      router.push('/github/repos');
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
          Alert.alert(t('Indisponível'), t('Acesso a pastas externas não é suportado nesta versão.'));
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
              Alert.alert(t('Erro ao importar'), importError?.message || t('Falha ao importar a pasta selecionada.'));
            } finally {
              setIsDownloading(false);
            }
          } else {
            Alert.alert(
              t('Permissão Necessária'),
              t('Para abrir pastas do seu dispositivo, você precisa conceder permissão de acesso ao armazenamento. Toque em "Abrir Pasta" novamente e selecione uma pasta.'),
              [{ text: t('OK') }]
            );
          }
        } catch(e: any) {
          Alert.alert(t('Erro'), e?.message || t('Não foi possível acessar o armazenamento.'));
        }
      }
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

  const handleProjectSelect = async (projectId: string) => {
    if (modalState === 'open') {
      setModalState('closed');
      router.push({ pathname: '/editor/codigo', params: { projectId } });
    } else if (modalState === 'new-select-project') {
      setSelectedProjectId(projectId);
      await loadNewFileFolders(projectId);
      setModalState('new-file-name');
    }
  };

  const handleCreateFile = async () => {
    if (!selectedProjectId || !newFileName.trim()) return;
    const cleanName = normalizeRelativePath(newFileName.trim());
    const cleanFolder = normalizeRelativePath(newFileFolder);
    if (!cleanName) return;
    const targetPath = cleanFolder ? `${cleanFolder}/${cleanName}` : cleanName;
    await FileSystemService.writeFile(selectedProjectId, targetPath, '');
    setModalState('closed');
    const params = { projectId: selectedProjectId, openFile: targetPath };
    setNewFileName('');
    setNewFileFolder('');
    setProjectFolders([]);
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
      alert(e.message || t('Erro ao baixar o repositório'));
    } finally {
      setIsDownloading(false);
    }
  };

  const [recentProjects, setRecentProjects] = React.useState<ProjectInfo[]>([]);
  const [isLiveSyncActive, setIsLiveSyncActive] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const isSyncProject = React.useCallback((project: ProjectInfo) => {
    return project.type === 'sync' || project.id === 'live-sync-workspace' || project.name === 'LiveSync Workspace';
  }, []);

  const displayedProjects = searchQuery.trim()
    ? allProjects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : recentProjects;

  useFocusEffect(
    React.useCallback(() => {
      const load = async () => {
        let data = await FileSystemService.getProjects();

        setAllProjects(data);
        const syncProj = data.find(isSyncProject);
        const normalProjs = data.filter(p => !isSyncProject(p));

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
        } else {
          setIsLiveSyncActive(false);
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
    if (mins < 60) return t('time.minutesAgo', '{value}m ago').replace('{value}', String(mins));
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('time.hoursAgo', '{value}h ago').replace('{value}', String(hours));
    return t('time.daysAgo', '{value}d ago').replace('{value}', String(Math.floor(hours / 24)));
  };

  const SurfacePressable = ({ children, style, onPress, disabled = false }: { children: React.ReactNode; style?: any; onPress?: () => void; disabled?: boolean }) => {
    const [hovered, setHovered] = React.useState(false);
    return (
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed }) => [
          style,
          hovered && styles.hoverSurface,
          pressed && styles.pressSurface,
          disabled && { opacity: 0.5 },
        ]}
      >
        {children}
      </Pressable>
    );
  };

  return (
    <>

      <ScrollView style={styles.container} contentContainerStyle={[styles.content, isWideLayout && styles.contentWide]}>

        <View style={[styles.commandSearch, { marginTop: 24, marginBottom: 16 }]}>
          <Icon name="Search" size={16} color={theme.colors.textSecondary} />
          <TextInput
            style={[styles.commandSearchText, { flex: 1, padding: 0, outlineStyle: 'none' } as any]}
            placeholder={t('Buscar projetos...')}
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{searchQuery.trim() ? t('RESULTADOS DA BUSCA') : t('PROJETOS RECENTES')}</Text>
          <View style={[styles.recentProjectsContainer, isWideLayout && styles.recentProjectsGrid]}>
            {displayedProjects.length === 0 ? (
              <Text style={{ color: theme.colors.textSecondary, padding: 12, fontFamily: theme.typography.ui }}>{searchQuery.trim() ? t('Nenhum projeto encontrado.') : t('Nenhum projeto ainda. Crie um novo!')}</Text>
            ) : (
              displayedProjects.map(proj => (
                <SurfacePressable key={proj.id} style={[styles.recentProjectCard, isWideLayout && styles.recentProjectCardWide]} onPress={() => router.push({ pathname: '/editor/codigo', params: { projectId: proj.id } })}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={styles.recentIconBox}>
                      <Icon name={proj.type === 'node' ? 'Server' : proj.type === 'react' ? 'Layout' : 'Globe'} size={16} color={theme.colors.accentBlue} />
                    </View>
                    {!isSyncProject(proj) && (
                      <TouchableOpacity onPress={() => handleProjectOptions(proj)} style={{ padding: 4 }}>
                        <Icon name="MoreHorizontal" size={16} color={theme.colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.recentInfo}>
                    <Text style={styles.recentName} numberOfLines={1}>{proj.name}</Text>
                    {isSyncProject(proj) ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <View style={{ backgroundColor: theme.colors.success + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 8 }}>
                          <Text style={{ color: theme.colors.success, fontSize: 10, fontFamily: theme.typography.uiBold }}>SYNC CODE</Text>
                        </View>
                        <Text style={[styles.recentMeta, { marginTop: 0 }]}>{isLiveSyncActive ? t('Online') : t('Offline')}</Text>
                      </View>
                    ) : (
                      <Text style={styles.recentMeta}>{proj.type.toUpperCase()} • {formatTime(proj.updatedAt)}</Text>
                    )}
                  </View>
                </SurfacePressable>
              ))
            )}
          </View>
        </View>

        {!searchQuery.trim() && (
          <View style={[styles.menuGrid, isWideLayout && styles.menuGridWide]}>
            {MENU_SECTIONS.map((section, idx) => (
              <View key={idx} style={[styles.section, isWideLayout && styles.menuSectionCard]}>
                <Text style={styles.sectionTitle}>{t(section.title)}</Text>
                <View style={styles.sectionItems}>
                  {section.items.map(item => (
                    <SurfacePressable
                      key={item.id}
                      style={styles.menuItem}
                      onPress={() => handlePress(item.id, item.route)}
                    >
                      <View style={styles.menuLeft}>
                        <View style={styles.menuIconBox}>
                          <Icon name={item.icon as any} size={16} color={theme.colors.textSecondary} />
                        </View>
                        <Text style={styles.menuLabel}>{t(item.label)}</Text>
                      </View>
                      {item.id === 'live-sync' ? (
                        <Text style={[styles.shortcutText, { color: isLiveSyncActive ? theme.colors.success : theme.colors.textSecondary, fontFamily: theme.typography.uiBold }]}>
                          {isLiveSyncActive ? t('Conectado') : t('Desconectado')}
                        </Text>
                      ) : !!item.shortcut && (
                        <Text style={styles.shortcutText}>{item.shortcut}</Text>
                      )}
                    </SurfacePressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
    </ScrollView>

    <Modal visible={modalState !== 'closed'} transparent animationType="slide">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {modalState === 'open' ? t('Abrir Pasta') :
               modalState === 'new-select-project' ? t('Selecione o Projeto') :
               modalState === 'git-url' ? t('Baixar do GitHub') : t('Nome do Arquivo')}
            </Text>
            <TouchableOpacity onPress={() => setModalState('closed')}>
              <Icon name="X" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {(modalState === 'open' || modalState === 'new-select-project') && (
            <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
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
                      <Text style={styles.projectName}>{t('Criar Novo Projeto')}</Text>
                      <Text style={styles.projectMeta}>{t('Comece do zero')}</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity style={[styles.projectCard, styles.githubProjectCard]} onPress={() => {
                    setModalState('closed');
                    router.push('/github/repos');
                  }}>
                    <View style={[styles.projectIcon, styles.githubProjectIcon]}>
                      <Icon name="Github" size={24} color={theme.colors.textPrimary} />
                    </View>
                    <View style={styles.projectInfo}>
                      <Text style={styles.projectName}>{t('Baixar do GitHub')}</Text>
                      <Text style={styles.projectMeta}>{t('Clone repositórios como Zip')}</Text>
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
            </ScrollView>
          )}

          {modalState === 'new-file-name' && (
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={styles.inputLabel}>{t('Nome do arquivo')}</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="index.html"
                placeholderTextColor={theme.colors.textSecondary}
                value={newFileName}
                onChangeText={setNewFileName}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                importantForAutofill="no"
                keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
                disableFullscreenUI
                autoFocus
              />

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>{t('Criar em')}</Text>
              <View style={styles.folderPickerList}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 120 }}>
                  {projectFolders.map(folder => {
                    const isSelected = folder.path === newFileFolder;
                    return (
                      <TouchableOpacity
                        key={folder.path || '__project_root'}
                        style={[styles.folderPickerOption, isSelected && styles.folderPickerOptionActive]}
                        onPress={() => setNewFileFolder(folder.path)}
                      >
                        <Icon name="Folder" size={16} color={isSelected ? theme.colors.accentBlue : theme.colors.textSecondary} />
                        <Text style={[styles.folderPickerOptionText, isSelected && styles.folderPickerOptionTextActive]} numberOfLines={1}>
                          {folder.path ? folder.name : t('Raiz do Projeto')}
                        </Text>
                        {folder.path ? <Text style={styles.folderPickerPath} numberOfLines={1}>{folder.path}</Text> : null}
                        {isSelected && <Icon name="Check" size={14} color={theme.colors.accentBlue} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <TouchableOpacity
                style={[styles.recentProjectCard, { marginTop: 14, alignItems: 'center' }, !newFileName.trim() && { opacity: 0.5 }]}
                onPress={handleCreateFile}
                disabled={!newFileName.trim()}
              >
                <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.ui, fontWeight: 'bold' }}>{t('Criar')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {modalState === 'git-url' && (
            <View style={{ paddingHorizontal: 20, flex: 1, maxHeight: 500 }}>
              {!hasGhToken ? (
                <>
                  <Text style={[styles.inputLabel, { marginTop: 12 }]}>{t('GitHub Personal Access Token (ghp_...)')}</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={ghToken}
                    onChangeText={setGhToken}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    secureTextEntry
                  />
                  <TouchableOpacity
                    style={[styles.recentProjectCard, { marginTop: 16, alignItems: 'center' }]}
                    onPress={() => loadGhRepos(ghToken)}
                    disabled={isGhLoading || !ghToken}
                  >
                    <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.ui, fontWeight: 'bold' }}>
                      {isGhLoading ? t('Carregando...') : t('Conectar e Listar')}
                    </Text>
                  </TouchableOpacity>
                  
                  <View style={{ marginVertical: 16, height: 1, backgroundColor: theme.colors.border }} />
                  
                  <Text style={[styles.inputLabel, { marginBottom: 8 }]}>{t('Ou insira a URL do repositório manualmente')}</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="https://github.com/user/repo"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={gitUrl}
                    onChangeText={setGitUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    importantForAutofill="no"
                    keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
                    disableFullscreenUI
                    editable={!isDownloading}
                  />
                  <TouchableOpacity
                    style={[styles.recentProjectCard, { marginTop: 16, alignItems: 'center' }]}
                    onPress={handleGitDownload}
                    disabled={isDownloading || !gitUrl}
                  >
                    <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.ui, fontWeight: 'bold' }}>
                      {isDownloading ? t('Baixando...') : t('Baixar URL')}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={styles.inputLabel}>{t('Seus Repositórios')}</Text>
                    <TouchableOpacity onPress={async () => {
                      const { GithubService } = await import('../services/GithubService');
                      await GithubService.removeToken();
                      setHasGhToken(false);
                      setGhRepos([]);
                      setGhToken('');
                    }}>
                      <Text style={{ color: theme.colors.error, fontSize: 12 }}>{t('Desconectar')}</Text>
                    </TouchableOpacity>
                  </View>
                  {isGhLoading ? (
                    <ActivityIndicator size="small" color={theme.colors.accentBlue} />
                  ) : (
                    <ScrollView style={{ flex: 1, maxHeight: 300 }}>
                      {ghRepos.map(repo => (
                        <TouchableOpacity
                          key={repo.id}
                          style={[styles.recentProjectCard, { marginBottom: 8 }]}
                          onPress={async () => {
                            setGitUrl(repo.html_url);
                            setIsDownloading(true);
                            try {
                              const projectId = await FileSystemService.downloadGitRepo(repo.html_url);
                              setModalState('closed');
                              router.push({ pathname: '/editor/codigo', params: { projectId } });
                            } catch (e: any) {
                              Alert.alert(t('Erro'), e.message || t('Erro ao baixar o repositório'));
                            } finally {
                              setIsDownloading(false);
                            }
                          }}
                        >
                          <Text style={{ color: theme.colors.textPrimary, fontWeight: 'bold' }}>{repo.name}</Text>
                          {repo.description ? (
                            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 }}>{repo.description}</Text>
                          ) : null}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                  {isDownloading && (
                    <View style={{ marginTop: 12, alignItems: 'center' }}>
                      <Text style={{ color: theme.colors.accentBlue }}>{t('Baixando repositório...')}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {modalState === 'duplicate-project-name' && (
            <View style={{ paddingHorizontal: 20 }}>
              <TextInput
                style={styles.searchInput}
                placeholder={t('Nome do projeto duplicado')}
                placeholderTextColor={theme.colors.textSecondary}
                value={duplicateName}
                onChangeText={setDuplicateName}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                importantForAutofill="no"
                keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
                disableFullscreenUI
                autoFocus
              />
              <TouchableOpacity style={[styles.recentProjectCard, { marginTop: 16, alignItems: 'center' }]} onPress={async () => {
                if (!selectedProjectId || !duplicateName.trim()) return;
                await FileSystemService.duplicateProject(selectedProjectId, duplicateName.trim());
                setModalState('closed');
              }}>
                <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.ui, fontWeight: 'bold' }}>{t('Duplicar Projeto')}</Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
    <Modal visible={!!projectOptions} transparent animationType="fade">
      <View style={styles.projectOptionsOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setProjectOptions(null)} />
        <View style={styles.projectOptionsCard}>
          <View style={styles.projectOptionsHandle} />
          <View style={styles.projectOptionsHeader}>
            <View style={styles.projectOptionsIcon}>
              <Icon name={projectOptions?.type === 'node' ? 'Server' : projectOptions?.type === 'react' ? 'Layout' : 'Globe'} size={22} color={theme.colors.accentBlue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.projectOptionsTitle}>{t('Opções do Projeto')}</Text>
              <Text style={styles.projectOptionsName} numberOfLines={1}>{projectOptions?.name}</Text>
            </View>
            <TouchableOpacity style={styles.projectOptionsClose} onPress={() => setProjectOptions(null)}>
              <Icon name="X" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.projectOptionAction} onPress={handleDuplicateProjectOption}>
            <View style={[styles.projectOptionActionIcon, { backgroundColor: theme.colors.accentBlue + '18' }]}>
              <Icon name="Copy" size={18} color={theme.colors.accentBlue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.projectOptionActionTitle}>{t('Duplicar')}</Text>
              <Text style={styles.projectOptionActionSub}>{t('Criar uma cópia local deste projeto')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.projectOptionAction} onPress={handleDeleteProjectOption}>
            <View style={[styles.projectOptionActionIcon, { backgroundColor: theme.colors.error + '18' }]}>
              <Icon name="Trash2" size={18} color={theme.colors.error} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.projectOptionActionTitle, { color: theme.colors.error }]}>{t('Excluir')}</Text>
              <Text style={styles.projectOptionActionSub}>{t('Remover a pasta local do app')}</Text>
            </View>
          </TouchableOpacity>
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
    paddingVertical: 34,
    paddingHorizontal: 18,
  },
  contentWide: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    paddingHorizontal: 28,
  },
  homeIntro: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
    padding: 16,
    marginBottom: 18,
  },
  homeIntroWide: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'stretch',
    padding: 18,
  },
  homeIntroCopy: {
    flex: 1,
    minWidth: 0,
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 14,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: theme.typography.uiBold,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  homeIntroTitle: {
    fontFamily: theme.typography.uiBold,
    fontSize: 24,
    lineHeight: 29,
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  homeIntroText: {
    maxWidth: 540,
    fontFamily: theme.typography.ui,
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textSecondary,
  },
  homeIntroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  primaryMiniAction: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 9,
    paddingHorizontal: 13,
    backgroundColor: theme.colors.textPrimary,
  },
  primaryMiniActionText: {
    fontFamily: theme.typography.uiBold,
    fontSize: 12,
    color: theme.colors.bgPrimary,
  },
  secondaryMiniAction: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 9,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgSurface,
  },
  secondaryMiniActionText: {
    fontFamily: theme.typography.mono,
    fontSize: 12,
    color: theme.colors.textPrimary,
  },
  workbenchPreview: {
    flex: 1.1,
    minWidth: 420,
    minHeight: 178,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgPrimary,
  },
  previewRail: {
    width: 38,
    alignItems: 'center',
    gap: 16,
    paddingTop: 14,
    backgroundColor: theme.colors.bgSurface,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  previewTree: {
    width: 122,
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  previewTreeTitle: {
    fontFamily: theme.typography.uiBold,
    fontSize: 11,
    color: theme.colors.textPrimary,
    marginBottom: 12,
  },
  previewTreeItem: {
    fontFamily: theme.typography.ui,
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginBottom: 7,
  },
  previewTreeFile: {
    fontFamily: theme.typography.mono,
    fontSize: 10,
    color: theme.colors.textPrimary,
    marginLeft: 10,
    marginBottom: 6,
  },
  previewEditor: {
    flex: 1,
    minWidth: 0,
  },
  previewTabs: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  previewTabActive: {
    height: 30,
    paddingHorizontal: 12,
    textAlignVertical: 'center',
    fontFamily: theme.typography.uiBold,
    fontSize: 10,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.bgElevated,
  },
  previewTab: {
    paddingHorizontal: 12,
    fontFamily: theme.typography.ui,
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  previewCode: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 8,
  },
  previewCodeLine: {
    fontFamily: theme.typography.mono,
    fontSize: 11,
    color: theme.colors.textPrimary,
  },
  previewCodeMuted: {
    fontFamily: theme.typography.mono,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  previewStatusBar: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  previewStatusText: {
    fontFamily: theme.typography.mono,
    fontSize: 9,
    color: theme.colors.textSecondary,
  },
  previewAssistant: {
    width: 96,
    padding: 12,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
    backgroundColor: theme.colors.bgSurface,
  },
  previewAssistantTitle: {
    fontFamily: theme.typography.uiBold,
    fontSize: 10,
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  previewAssistantText: {
    fontFamily: theme.typography.ui,
    fontSize: 10,
    lineHeight: 14,
    color: theme.colors.textSecondary,
  },
  homeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  homeHeaderWide: {
    marginBottom: 18,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontFamily: theme.typography.mono,
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  brandSub: {
    fontFamily: theme.typography.ui,
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  deviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
  },
  deviceBadgeText: {
    fontFamily: theme.typography.uiBold,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  commandSearch: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    marginBottom: 24,
    gap: 10,
  },
  commandSearchText: {
    flex: 1,
    fontFamily: theme.typography.ui,
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  commandSearchShortcut: {
    fontFamily: theme.typography.mono,
    color: theme.colors.textSecondary,
    fontSize: 11,
    opacity: 0.7,
  },
  section: {
    marginBottom: 28,
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
  menuGrid: {
    width: '100%',
  },
  menuGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  menuSectionCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 300,
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 9,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  menuIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgSurface,
  },
  menuLabel: {
    marginLeft: 10,
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
    flexDirection: 'column',
    gap: 12,
  },
  recentProjectsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  recentProjectCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  recentProjectCardWide: {
    flexBasis: '31%',
    minWidth: 220,
  },
  hoverSurface: {
    backgroundColor: theme.colors.bgSurface,
    borderColor: '#2A2A2A',
  },
  pressSurface: {
    opacity: 0.78,
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
  projectOptionsOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.68)',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  projectOptionsCard: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  projectOptionsHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: 14,
  },
  projectOptionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  projectOptionsIcon: {
    width: 44,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectOptionsTitle: {
    fontFamily: theme.typography.uiBold,
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  projectOptionsName: {
    fontFamily: theme.typography.ui,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 3,
  },
  projectOptionsClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectOptionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginTop: 8,
    backgroundColor: theme.colors.bgSurface,
  },
  projectOptionActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectOptionActionTitle: {
    fontFamily: theme.typography.uiBold,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  projectOptionActionSub: {
    fontFamily: theme.typography.ui,
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
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
  githubProjectCard: {
    borderColor: theme.colors.textPrimary + '22',
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
  githubProjectIcon: {
    backgroundColor: '#000000',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.textPrimary + '28',
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
  inputLabel: {
    fontFamily: theme.typography.ui,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  folderPickerList: {
    backgroundColor: theme.colors.bgSurface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  folderPickerOption: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  folderPickerOptionActive: {
    backgroundColor: theme.colors.bgElevated,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.accentBlue,
  },
  folderPickerOptionText: {
    fontFamily: theme.typography.ui,
    fontSize: 13,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  folderPickerOptionTextActive: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
  },
  folderPickerPath: {
    fontFamily: theme.typography.mono,
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  searchInput: {
    fontFamily: theme.typography.ui,
    fontSize: 16,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.bgSurface,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 8,
  },
});
