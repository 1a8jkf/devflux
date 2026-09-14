import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert, Modal, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from './Icon';
import { FileTree } from './FileTree';
import { useRouter, useGlobalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileSystemService, FileNode, ProjectInfo } from '../services/FileSystemService';
import { useAIContext } from '../contexts/AIContext';
import { MonacoEditor } from './MonacoEditor';
import { useLanguage } from '../contexts/LanguageContext';
import { EditorChangeState, LineChangeStats } from '../services/EditorChangeState';
import * as DocumentPicker from 'expo-document-picker';

const FOLDER_PICKER_IGNORED_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'build', '.next', '.vinext', '.wrangler']);

const isLiveSyncLocalMirrorProject = (project?: ProjectInfo | null) => project?.type === 'sync-local' || project?.liveSyncMode === 'local';

const emptyLineChangeStats = (): LineChangeStats => ({
  addedLines: 0,
  removedLines: 0,
  modifiedLines: 0,
  totalChangedLines: 0,
});

const numberOrZero = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const normalizeLineChangeStats = (file: any, liveStats?: LineChangeStats): LineChangeStats | undefined => {
  if (liveStats && liveStats.totalChangedLines > 0) return liveStats;

  const addedLines = numberOrZero(file?.addedLines ?? file?.additions ?? file?.added);
  const removedLines = numberOrZero(file?.removedLines ?? file?.deletions ?? file?.removed);
  const modifiedLines = numberOrZero(file?.modifiedLines ?? file?.changedLines ?? file?.modified);
  const totalChangedLines = numberOrZero(file?.totalChangedLines ?? (addedLines + removedLines + modifiedLines));

  if (totalChangedLines <= 0) return undefined;
  return { addedLines, removedLines, modifiedLines, totalChangedLines };
};

const sumLineChangeStats = (statsList: Array<LineChangeStats | undefined>) => {
  return statsList.reduce<LineChangeStats>((total, stats) => {
    if (!stats) return total;
    total.addedLines += stats.addedLines;
    total.removedLines += stats.removedLines;
    total.modifiedLines += stats.modifiedLines;
    total.totalChangedLines += stats.totalChangedLines;
    return total;
  }, emptyLineChangeStats());
};

interface EditorSidebarProps {
  onClose: () => void;
  onOpenDrawer?: () => void;
  embedded?: boolean;
}

interface DevFluxImportNode extends Omit<FileNode, 'children'> {
  children?: DevFluxImportNode[];
  sourceProjectId?: string;
}

export const EditorSidebar: React.FC<EditorSidebarProps> = ({ onClose, onOpenDrawer, embedded = false }) => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useGlobalSearchParams();
  const projectId = params.projectId as string;
  const { t } = useLanguage();

  const { pendingChanges, approveChange, rejectChange } = useAIContext();

  const [activeTab, setActiveTab] = useState<'files' | 'search' | 'git'>('files');
  const [caseSensitive, setCaseSensitive] = useState(false);


  const [fileFilter, setFileFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{path: string, name: string, matches?: {line: number, text: string}[]}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fileLoadSequence = useRef(0);
  const loadedProjectId = useRef<string | null>(null);

  const [isCreating, setIsCreating] = useState<'file'|'folder'|null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [createDestination, setCreateDestination] = useState('');
  const [githubUser, setGithubUser] = useState<any>(null);
  const [repos, setRepos] = useState<any[]>([]);
  const [isCloning, setIsCloning] = useState(false);
  const [cloneProgress, setCloneProgress] = useState('');

  const [showRepoModal, setShowRepoModal] = useState(false);
  const [repoModalMode, setRepoModalMode] = useState<'clone' | 'link'>('clone');
  const [newRepoName, setNewRepoName] = useState('');
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);

  // New state for Action Modal and Move Folder Picker
  const [actionTargetNode, setActionTargetNode] = useState<FileNode | null>(null);
  const [moveTargetNode, setMoveTargetNode] = useState<FileNode | null>(null);
  const [moveDestination, setMoveDestination] = useState<string>('');
  const [renameTargetNode, setRenameTargetNode] = useState<FileNode | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isImportModalVisible, setIsImportModalVisible] = useState(false);
  const [importDestination, setImportDestination] = useState('');
  const [devfluxImportTree, setDevfluxImportTree] = useState<DevFluxImportNode[]>([]);
  const [isLoadingDevfluxImport, setIsLoadingDevfluxImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [changedFiles, setChangedFiles] = useState<any[]>([]);
  const [isCheckingGit, setIsCheckingGit] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');

  // New state for WinSCP-style sync
  const [syncSelectedFiles, setSyncSelectedFiles] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLiveSyncConnected, setIsLiveSyncConnected] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [editorChangeSnapshot, setEditorChangeSnapshot] = useState(() => EditorChangeState.getSnapshot());
  const isLiveSyncLocalMirror = isLiveSyncLocalMirrorProject(projectInfo);
  const isCurrentEditorProject = editorChangeSnapshot.projectId === projectId;
  const editorDirtyFileIds = isCurrentEditorProject ? editorChangeSnapshot.dirtyFileIds : [];
  const editorDirtyFileIdSet = new Set(editorDirtyFileIds);
  const editorChangeStatsByPath = isCurrentEditorProject ? editorChangeSnapshot.changeStatsByPath : {};
  const unsavedChangeEntries = Object.entries(editorChangeStatsByPath).filter(([, stats]) => stats.totalChangedLines > 0);
  const changedFilePaths = new Set(changedFiles.map((file: any) => file.path).filter(Boolean));
  const sourceControlBadgeCount = new Set([...Array.from(changedFilePaths), ...editorDirtyFileIds]).size;
  const getLineStatsForFile = (file: any) => normalizeLineChangeStats(file, editorChangeStatsByPath[file.path]);
  const sourceControlLineTotals = sumLineChangeStats([
    ...changedFiles.map((file: any) => getLineStatsForFile(file)),
    ...unsavedChangeEntries.filter(([path]) => !changedFilePaths.has(path)).map(([, stats]) => stats),
  ]);

  useEffect(() => EditorChangeState.subscribe(setEditorChangeSnapshot), []);

  useEffect(() => {
    // Clear state when switching projects
    setProjectInfo(null);
    setChangedFiles([]);
    setSelectedFiles([]);
    setSyncSelectedFiles(new Set());

    if (projectId) {
      FileSystemService.getProjects().then(projs => {
        const p = projs.find(p => p.id === projectId);
        if (p) {
          setProjectInfo(p as ProjectInfo);
        }
      });
    }
  }, [projectId]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    import('../services/LiveSyncService').then(({ LiveSyncService }) => {
      const refreshStatus = () => {
        if (mounted) setIsLiveSyncConnected(LiveSyncService.isConnected());
      };
      unsubscribe = LiveSyncService.subscribe(refreshStatus);
      refreshStatus();
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const { LiveSyncService } = await import('../services/LiveSyncService');
      const currentProject = projectInfo || await LiveSyncService.getProject(projectId);
      if (LiveSyncService.isRemoteSyncProject(projectId, currentProject) && LiveSyncService.isConnected()) {
        const ws = LiveSyncService.ws;
        if (!ws) {
          setIsSearching(false);
          return;
        }
        const handler = (event: any) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'search_results' && data.query === query) {
               setSearchResults(data.results);
               setIsSearching(false);
               ws.removeEventListener('message', handler);
            }
          } catch(e) {}
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ type: 'search_workspace', query }));
        setTimeout(() => {
           setIsSearching(false);
           ws.removeEventListener('message', handler);
        }, 10000);
        return;
      }

      // Parse file filter patterns (e.g. "*.tsx, *.css")
      const filterPatterns = fileFilter.trim()
        ? fileFilter.split(',').map(f => f.trim().replace('*.', '.').toLowerCase()).filter(Boolean)
        : [];

      const results: {path: string, name: string, matches?: {line: number, text: string}[]}[] = [];
      const searchableExts = ['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'md', 'txt', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'xml', 'yaml', 'yml', 'sh', 'sql', 'lua', 'dart', 'ini', 'conf', 'gradle', 'properties', 'env'];
      const searchRecursive = async (nodes: FileNode[]) => {
        for (const node of nodes) {
          if (node.type === 'file') {
            const ext = node.fileType || '';

            // Apply file filter
            if (filterPatterns.length > 0) {
              const nameLC = node.name.toLowerCase();
              const matchesFilter = filterPatterns.some(p => nameLC.endsWith(p));
              if (!matchesFilter) continue;
            }

            let fileMatched = false;
            let fileMatches: {line: number, text: string}[] = [];

            const nameCheck = caseSensitive
              ? node.name.includes(query)
              : node.name.toLowerCase().includes(query.toLowerCase());
            if (nameCheck) {
              fileMatched = true;
            }

            if (searchableExts.includes(ext)) {
              try {
                const content = await FileSystemService.readFile(projectId, node.path!);
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                  const lineMatch = caseSensitive
                    ? lines[i].includes(query)
                    : lines[i].toLowerCase().includes(query.toLowerCase());
                  if (lineMatch) {
                    fileMatched = true;
                    fileMatches.push({ line: i + 1, text: lines[i].trim().substring(0, 80) });
                  }
                }
              } catch(e) {}
            }

            if (fileMatched) {
              results.push({ path: node.path!, name: node.name, matches: fileMatches });
            }
          } else if (node.children) {
            await searchRecursive(node.children);
          }
        }
      };
      await searchRecursive(fileTree);
      setSearchResults(results);
    } catch(e) {}
    setIsSearching(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, fileTree, caseSensitive, fileFilter]);

  const getFilesRecursive = (nodes: FileNode[], currentPath = ''): string[] => {
    let result: string[] = [];
    for (const node of nodes) {
      const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;
      if (node.type === 'directory') {
        if (node.children) {
          result = result.concat(getFilesRecursive(node.children, fullPath));
        }
      } else {
        result.push(fullPath);
      }
    }
    return result;
  };

  const loadGitChanges = async () => {
    if (!projectId) return;
    setIsCheckingGit(true);
    try {
      const { LiveSyncService } = await import('../services/LiveSyncService');
      const currentProject = projectInfo || await LiveSyncService.getProject(projectId);

      if (isLiveSyncLocalMirrorProject(currentProject)) {
        const changes = await LiveSyncService.getLocalChangedFiles(projectId);
        setChangedFiles(changes);
        setSyncSelectedFiles(new Set());
        setIsLiveSyncConnected(LiveSyncService.isConnected());
        return;
      }

      if (LiveSyncService.isRemoteSyncProject(projectId, currentProject)) {
        setChangedFiles([]);
        setSyncSelectedFiles(new Set());
        return;
      }

      if (!currentProject?.githubRepo) {
        setChangedFiles([]);
        return;
      }

      if (currentProject?.type === 'git') {
        const localChanges = currentProject.changedFiles || {};
        const changes = Object.keys(localChanges).map(path => ({
          path,
          status: localChanges[path]
        }));
        setChangedFiles(changes as any);
        setSelectedFiles(changes.map(c => c.path));
        return;
      }

      const { GitService } = await import('../services/GitService');
      const changes = await GitService.getChangedFiles(projectId);
      setChangedFiles(changes);
      setSelectedFiles(changes.map((c: any) => c.path));
    } catch (e) {
      console.log('Erro ao buscar alterações do git:', e);
    } finally {
      setIsCheckingGit(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'git') {
      loadGitChanges();
    }
  }, [activeTab, projectInfo?.githubRepo, projectInfo?.type, projectInfo?.liveSyncMode, projectId, isLiveSyncConnected]);

  useEffect(() => {
    if (projectId && isLiveSyncLocalMirror && isLiveSyncConnected) {
      loadGitChanges();
    }
  }, [projectId, isLiveSyncLocalMirror, isLiveSyncConnected, fileTree.length]);

  const handleCommit = async () => {
    const { LiveSyncService } = await import('../services/LiveSyncService');
    const currentProject = projectInfo || await LiveSyncService.getProject(projectId);
    if (LiveSyncService.isRemoteSyncProject(projectId, currentProject)) {
        Alert.alert(t('Live Sync'), t('Utilize o Terminal do DevFlux ou o próprio VS Code para rodar comandos Git no modo remoto.'));
        return;
    }

    if (!projectInfo?.githubRepo || !commitMessage.trim()) return;
    setIsCommitting(true);
    try {
      const { GithubService } = await import('../services/GithubService');
      const user = await GithubService.getUser();

      if (projectInfo.type === 'git') {
        // Direct GitHub REST API commit
        const filesToCommit = [];
        for (const file of changedFiles) {
          const content = await FileSystemService.readFile(projectId, file.path);
          filesToCommit.push({ path: file.path, content });
        }
        await GithubService.commitFiles(projectInfo.githubRepo, 'main', commitMessage, filesToCommit);
        
        // Clear local changes
        await FileSystemService.updateProject(projectId, { changedFiles: {} });
      } else {
        // Standard Git commit
        const { GitService } = await import('../services/GitService');
        await GitService.commit(projectId, commitMessage, user.name || user.login, user.login + '@users.noreply.github.com');
        await GitService.push(projectId);
      }

      Alert.alert(t('Sucesso'), t('Commit realizado com sucesso!'));
      setCommitMessage('');
      loadGitChanges();
    } catch(e: any) {
      Alert.alert(t('Erro'), `${t('Falha ao fazer commit:')} ${e.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleRevertFile = (path: string, status: string) => {
    Alert.alert(
      t('Descartar Alterações'),
      `${t('Tem certeza que deseja reverter as alterações de')} ${path}?`,
      [
        { text: t('Cancelar'), style: 'cancel' },
        {
          text: t('Descartar'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (status === 'added') {
                await FileSystemService.deleteFile(projectId, path);
              } else {
                const { GithubService } = await import('../services/GithubService');
                const content = await GithubService.getFileContent(projectInfo!.githubRepo!, path);
                await FileSystemService.writeFile(projectId, path, content);
              }
              loadGitChanges();
            } catch (e: any) {
              Alert.alert(t('Erro'), `${t('Não foi possível reverter:')} ${e.message}`);
            }
          }
        }
      ]
    );
  };

  useEffect(() => {
    import('../services/GithubService').then(({ GithubService }) => {
      GithubService.getUser().then(setGithubUser).catch(() => setGithubUser(null));
      const unsubscribe = GithubService.subscribe(() => {
        GithubService.getUser().then(setGithubUser).catch(() => setGithubUser(null));
      });
      return unsubscribe;
    });
  }, []);

  const handleOpenRepos = async (mode: 'clone' | 'link' = 'clone') => {
    setIsLoading(true);
    setRepoModalMode(mode);
    setNewRepoName('');
    try {
      const { GithubService } = await import('../services/GithubService');
      const data = await GithubService.getRepos();
      setRepos(data);
      setShowRepoModal(true);
    } catch (e) {
      Alert.alert(t('Erro'), t('Falha ao buscar repositórios.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkRepo = async (repoName: string) => {
    if (!projectInfo) return;
    setIsCreatingRepo(true);
    try {
      const { GitService } = await import('../services/GitService');
      const cloneUrl = `https://github.com/${repoName}.git`;

      // Initialize locally and add remote
      await GitService.initAndAddRemote(projectId, cloneUrl, 'main');

      // Save metadata
      const metaContent = await FileSystemService.readFile(projectId, 'devflux.json');
      const meta = JSON.parse(metaContent);
      meta.githubRepo = repoName;
      meta.type = 'git';
      await FileSystemService.writeFile(projectId, 'devflux.json', JSON.stringify(meta, null, 2));
      setProjectInfo(meta);

      Alert.alert(t('Sucesso'), `${t('Projeto vinculado a')} ${repoName}!`);
      setShowRepoModal(false);
      loadGitChanges();
    } catch (e: any) {
      Alert.alert(t('Erro'), `${t('Falha ao vincular:')} ${e.message}`);
    } finally {
      setIsCreatingRepo(false);
    }
  };

  const handleCreateNewRepo = async () => {
    if (!newRepoName.trim() || !projectInfo) return;
    setIsCreatingRepo(true);
    try {
      const { GithubService } = await import('../services/GithubService');
      const repo = await GithubService.createRepo(newRepoName.trim(), `Criado via DevFlux`, false);
      await handleLinkRepo(repo.full_name);
    } catch(e: any) {
      Alert.alert(t('Erro'), `${t('Falha ao criar repositório no GitHub:')} ${e.message}`);
      setIsCreatingRepo(false);
    }
  };

  const handleClone = async (repo: any) => {
    setShowRepoModal(false);
    setIsCloning(true);
    setCloneProgress(`${t('Baixando')} ${repo.name}...`);
    try {
      const newProjectId = await FileSystemService.downloadGitRepo(repo.full_name);

      setCloneProgress(t('Clone finalizado!'));
      setTimeout(() => {
        setIsCloning(false);
        router.replace({ pathname: '/editor/codigo', params: { projectId: newProjectId } });
      }, 1000);

    } catch (e: any) {
      Alert.alert(t('Erro ao clonar'), e.message);
      setIsCloning(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadFiles();
      // Debounce subscribe calls: FileSystemService.notify() fires once per file
      // during live sync which causes the sidebar to blink. We coalesce rapid
      // successive calls into a single refresh after 300ms of silence.
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      const debouncedLoad = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { loadFiles(); }, 300);
      };
      const unsubscribe = FileSystemService.subscribe(debouncedLoad);
      return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        unsubscribe();
        fileLoadSequence.current++;
      };
    }
  }, [projectId]);

  const buildTreeFromPaths = (paths: string[]): FileNode[] => {
    const root: any[] = [];
    for (const path of paths) {
      const parts = path.split('/');
      let currentLevel = root;
      let currentPath = '';
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        let existing = currentLevel.find((n: any) => n.name === part);
        if (!existing) {
          const currentIsFile = i === parts.length - 1;
          existing = {
            id: currentPath,
            name: part,
            type: currentIsFile ? 'file' : 'directory',
            path: currentPath,
            fileType: currentIsFile ? part.split('.').pop() : undefined,
            children: currentIsFile ? undefined : [],
            isRemote: true,
            isExpanded: false // Start closed as requested
          };
          currentLevel.push(existing);
        }
        if (!existing.children && existing.type !== 'file') existing.children = [];
        currentLevel = existing.children;
      }
    }
    const sortTree = (nodes: any[]) => {
      nodes.sort((a, b) => {
        if (a.type === 'directory' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });
      for (const node of nodes) {
        if (node.children) {
          sortTree(node.children);
        }
      }
    };
    sortTree(root);
    return root;
  };

  const loadFiles = async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }
    const sequence = ++fileLoadSequence.current;
    if (loadedProjectId.current !== projectId) setIsLoading(true);
    try {
      const { LiveSyncService } = await import('../services/LiveSyncService');
      const currentProject = await LiveSyncService.getProject(projectId);
      if (sequence !== fileLoadSequence.current) return;
      if (currentProject) setProjectInfo(currentProject as ProjectInfo);

      const isRemoteLiveSync = LiveSyncService.isRemoteSyncProject(projectId, currentProject);
      const treeProjectId = LiveSyncService.remoteTreeProjectId || LiveSyncService.syncProjectId;

      if (isRemoteLiveSync && treeProjectId === projectId) {
        const cachedTree = LiveSyncService.remoteTree;
        if (cachedTree.length > 0) {
          setFileTree(buildTreeFromPaths(cachedTree));
          setIsLoading(false);
        }

        if (LiveSyncService.isConnected()) {
          LiveSyncService.requestRemoteTree();
          if (cachedTree.length > 0) return;
          return;
        }

        if (cachedTree.length > 0) return;
      }

      const tree = await FileSystemService.getProjectFileTree(projectId, { deferDirectories: ['node_modules', '.git'] });
      if (sequence !== fileLoadSequence.current) return;
      loadedProjectId.current = projectId;
      setFileTree(tree || []);
      setIsLoading(false);
    } catch (e) {
      if (sequence !== fileLoadSequence.current) return;
      console.error('loadFiles error:', e);
      setFileTree([]);
      setIsLoading(false);
    }
  };

  // Keep remote tree updates scoped to the active Live Sync project.
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    import('../services/LiveSyncService').then(({ LiveSyncService }) => {
      const oldHandler = LiveSyncService.onRemoteTreeUpdate;
      const handler = (paths: string[], remoteProjectId: string) => {
        const targetProjectId = remoteProjectId || LiveSyncService.remoteTreeProjectId || LiveSyncService.syncProjectId;
        if (mounted && projectId && projectId === targetProjectId && !isLiveSyncLocalMirrorProject(projectInfo)) {
          setFileTree(buildTreeFromPaths(paths));
          setIsLoading(false);
        }
        if (oldHandler) oldHandler(paths, remoteProjectId);
      };

      LiveSyncService.onRemoteTreeUpdate = handler;
      const targetProjectId = LiveSyncService.remoteTreeProjectId || LiveSyncService.syncProjectId;
      if (projectId && projectId === targetProjectId && !isLiveSyncLocalMirrorProject(projectInfo) && LiveSyncService.remoteTree.length > 0) {
        setFileTree(buildTreeFromPaths(LiveSyncService.remoteTree));
        setIsLoading(false);
      }

      unsubscribe = () => {
        if (LiveSyncService.onRemoteTreeUpdate === handler) {
          LiveSyncService.onRemoteTreeUpdate = oldHandler;
        }
      };
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [projectId, projectInfo?.type, projectInfo?.liveSyncMode]);

  // Poll for local file system changes when the current project is not a remote Live Sync view.
  useEffect(() => {
    let interval: NodeJS.Timeout;
    let active = true;
    if (projectId) {
      import('../services/LiveSyncService').then(({ LiveSyncService }) => {
        const isRemoteLiveSync = LiveSyncService.isRemoteSyncProject(projectId, projectInfo);
        if (!isRemoteLiveSync && active) {
          let reading = false;
          interval = setInterval(async () => {
            if (reading || !active) return;
            reading = true;
            try {
              const tree = await FileSystemService.getProjectFileTree(projectId, { deferDirectories: ['node_modules', '.git'] });
              if (active) setFileTree(tree || []);
            } catch (error) { console.error('refreshFiles error:', error); }
            finally { reading = false; }
          }, 2500);
        }
      });
    }
    return () => {
      active = false;
      if (interval) clearInterval(interval);
    };
  }, [projectId, projectInfo?.type, projectInfo?.liveSyncMode]);

  const handleFilePress = (file: any) => {
    if (file.type === 'file') {
      router.setParams({ openFile: file.path, t: Date.now().toString() });
      onClose();
    }
  };

  const isRemoteSyncProject = (liveSyncService: any) => liveSyncService.isRemoteSyncProject(projectId, projectInfo);

  const normalizeFolderPath = (value: string) => {
    return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/(^|\/)\.(?=\/|$)/g, '').replace(/(^|\/)\.\.(?=\/|$)/g, '');
  };

  const getParentPath = (path: string) => normalizeFolderPath(path).split('/').slice(0, -1).join('/');

  const normalizeSingleItemName = (value: string) => {
    const clean = normalizeFolderPath(value.trim());
    if (!clean || clean.includes('/')) return '';
    return clean;
  };

  const getPickedAssetName = (asset: { name?: string; uri?: string }) => {
    const rawName = asset.name || decodeURIComponent(String(asset.uri || '').split('/').pop()?.split('?')[0] || 'arquivo-importado');
    return normalizeSingleItemName(rawName) || 'arquivo-importado';
  };

  const getImportTargetPath = (fileName: string) => {
    const cleanFileName = normalizeSingleItemName(fileName) || 'arquivo-importado';
    const cleanFolder = normalizeFolderPath(importDestination);
    return cleanFolder ? `${cleanFolder}/${cleanFileName}` : cleanFileName;
  };

  const mirrorImportedFileToRemote = async (path: string) => {
    const { LiveSyncService } = await import('../services/LiveSyncService');
    if (!isRemoteSyncProject(LiveSyncService)) return;
    try {
      const content = await FileSystemService.readFile(projectId, path);
      LiveSyncService.sendFileUpdate(path, content);
      LiveSyncService.requestSaveFile(path);
      LiveSyncService.requestRemoteTree();
    } catch (e) {
      Alert.alert(t('Live Sync'), t('Arquivo importado no celular, mas não foi possível enviar este formato ao PC automaticamente.'));
    }
  };

  const attachImportSource = (nodes: FileNode[], sourceProjectId: string): DevFluxImportNode[] => {
    return nodes.map(node => ({
      ...node,
      id: `import:${sourceProjectId}:${node.path}`,
      sourceProjectId,
      children: node.children ? attachImportSource(node.children, sourceProjectId) : undefined,
    }));
  };

  const loadDevFluxImportSources = async () => {
    setIsLoadingDevfluxImport(true);
    try {
      const projects = await FileSystemService.getProjects();
      const roots: DevFluxImportNode[] = [];
      const importableProjects = projects.filter(project => project.id !== projectId);
      for (const project of importableProjects) {
        const children = attachImportSource(await FileSystemService.getProjectFileTree(project.id), project.id);
        roots.push({
          id: `project:${project.id}`,
          name: project.name,
          type: 'directory',
          path: '',
          sourceProjectId: project.id,
          children,
          isExpanded: false,
        });
      }
      setDevfluxImportTree(roots);
    } catch (e: any) {
      Alert.alert(t('Erro'), e.message || t('Não foi possível carregar os arquivos do DevFlux.'));
    } finally {
      setIsLoadingDevfluxImport(false);
    }
  };

  const openImportModal = (destination = '') => {
    setImportDestination(normalizeFolderPath(destination));
    setDevfluxImportTree([]);
    setIsImportModalVisible(true);
    loadDevFluxImportSources();
  };

  const importFilesFromDevice = async () => {
    if (!projectId || isImporting) return;
    setIsImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const importedPaths: string[] = [];
      for (const asset of result.assets || []) {
        const targetPath = getImportTargetPath(getPickedAssetName(asset));
        const importedPath = await FileSystemService.importFileFromUri(projectId, asset.uri, targetPath);
        await mirrorImportedFileToRemote(importedPath);
        importedPaths.push(importedPath);
      }

      if (importedPaths.length > 0) {
        setIsImportModalVisible(false);
        await loadFiles();
        router.setParams({ openFile: importedPaths[0], t: Date.now().toString() });
        Alert.alert(t('Importado'), `${importedPaths.length} ${t('arquivo(s) importado(s).')}`);
      }
    } catch (e: any) {
      Alert.alert(t('Erro'), e.message || t('Não foi possível importar o arquivo.'));
    } finally {
      setIsImporting(false);
    }
  };

  const importDevFluxFile = async (node: DevFluxImportNode) => {
    if (!projectId || isImporting || node.type !== 'file' || !node.sourceProjectId || !node.path) return;
    setIsImporting(true);
    try {
      const importedPath = await FileSystemService.copyFileBetweenProjects(
        node.sourceProjectId,
        node.path,
        projectId,
        getImportTargetPath(node.name)
      );
      await mirrorImportedFileToRemote(importedPath);
      setIsImportModalVisible(false);
      await loadFiles();
      router.setParams({ openFile: importedPath, t: Date.now().toString() });
      Alert.alert(t('Importado'), t('Arquivo importado para o projeto.'));
    } catch (e: any) {
      Alert.alert(t('Erro'), e.message || t('Não foi possível importar o arquivo do DevFlux.'));
    } finally {
      setIsImporting(false);
    }
  };

  const openRenameModal = (node: FileNode) => {
    setRenameTargetNode(node);
    setRenameValue(node.name);
  };

  const renameNode = async () => {
    if (!projectId || !renameTargetNode?.path || isImporting) return;
    const nextName = normalizeSingleItemName(renameValue);
    if (!nextName) {
      Alert.alert(t('Renomear'), t('Digite apenas o novo nome, sem barras.'));
      return;
    }

    const parentPath = getParentPath(renameTargetNode.path);
    const nextPath = parentPath ? `${parentPath}/${nextName}` : nextName;
    if (nextPath === renameTargetNode.path) {
      setRenameTargetNode(null);
      setRenameValue('');
      return;
    }

    try {
      const exists = await FileSystemService.pathExists(projectId, nextPath).catch(() => false);
      if (exists) {
        Alert.alert(t('Renomear'), t('Já existe um item com esse nome nesta pasta.'));
        return;
      }

      const { LiveSyncService } = await import('../services/LiveSyncService');
      const syncProject = isRemoteSyncProject(LiveSyncService);
      try {
        await FileSystemService.movePath(projectId, renameTargetNode.path, nextPath);
      } catch (localError) {
        if (!syncProject) throw localError;
      }
      if (syncProject) {
        LiveSyncService.moveRemotePath(renameTargetNode.path, nextPath);
        LiveSyncService.requestRemoteTree();
      }

      const wasFile = renameTargetNode.type === 'file';
      setRenameTargetNode(null);
      setRenameValue('');
      await loadFiles();
      if (wasFile) router.setParams({ openFile: nextPath, t: Date.now().toString() });
    } catch (e: any) {
      Alert.alert(t('Erro'), e.message || t('Não foi possível renomear este item.'));
    }
  };

  const deleteNode = async (node: FileNode) => {
    if (!projectId || !node.path) return;
    try {
      await FileSystemService.deleteFile(projectId, node.path);
      const { LiveSyncService } = await import('../services/LiveSyncService');
      if (isRemoteSyncProject(LiveSyncService)) {
        LiveSyncService.deleteRemotePath(node.path);
      }
      loadFiles();
    } catch (e: any) {
      Alert.alert(t('Erro'), e.message || t('Não foi possível excluir este item.'));
    }
  };

  const moveNodeToFolder = async (node: FileNode, folderPath: string) => {
    if (!projectId || !node.path) return;
    const targetFolder = normalizeFolderPath(folderPath);
    if (node.type === 'directory' && (targetFolder === node.path || targetFolder.startsWith(`${node.path}/`))) {
      Alert.alert(t('Mover item'), t('Escolha uma pasta fora da própria pasta que você está movendo.'));
      return;
    }

    const targetPath = targetFolder ? `${targetFolder}/${node.name}` : node.name;
    if (targetPath === node.path) return;

    try {
      const { LiveSyncService } = await import('../services/LiveSyncService');
      const syncProject = isRemoteSyncProject(LiveSyncService);

      try {
        await FileSystemService.movePath(projectId, node.path, targetPath);
      } catch (localError) {
        if (!syncProject) throw localError;
      }

      if (syncProject) {
        LiveSyncService.moveRemotePath(node.path, targetPath);
      }
      setMoveTargetNode(null);
      setMoveDestination('');
      loadFiles();
    } catch (e: any) {
      Alert.alert(t('Erro'), e.message || t('Não foi possível mover este item.'));
    }
  };

  const openMoveModal = (node: FileNode) => {
    setMoveTargetNode(node);
    setMoveDestination('');
  };

  const openNodeActions = (node: FileNode) => {
    setActionTargetNode(node);
  };

  // Helper to extract all folders recursively for the picker
  const getFoldersRecursive = (nodes: FileNode[], currentPath = ''): { name: string; path: string }[] => {
    let result: { name: string; path: string }[] = [];
    for (const node of nodes) {
      if (node.type === 'directory') {
        if (FOLDER_PICKER_IGNORED_DIRS.has(node.name)) continue;
        const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;
        result.push({ name: node.name, path: fullPath });
        if (node.children) {
          result = result.concat(getFoldersRecursive(node.children, fullPath));
        }
      }
    }
    return result;
  };

  const folderList = [{ name: t('Raiz do Projeto'), path: '' }, ...getFoldersRecursive(fileTree)];

  const renderFiles = () => (
    <>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('EXPLORER')}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => { setIsCreating('file'); setNewItemName(''); setCreateDestination(''); }}>
            <Icon name="FilePlus" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ width: 12 }} />
          <TouchableOpacity onPress={() => { setIsCreating('folder'); setNewItemName(''); setCreateDestination(''); }}>
            <Icon name="FolderPlus" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ width: 12 }} />
          <TouchableOpacity onPress={() => openImportModal('')}>
            <Icon name="FileUp" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ width: 12 }} />
          <TouchableOpacity onPress={loadFiles}>
            <Icon name="RefreshCw" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
      {isLoading ? (
        <ActivityIndicator size="small" color={theme.colors.accentBlue} style={{ marginTop: 20 }} />
      ) : (
        <FileTree
          key={projectId}
          data={fileTree}
          onLoadChildren={node => FileSystemService.getProjectFileTree(projectId, { relativePath: node.path, shallow: true })}
          dirtyFileIds={editorDirtyFileIdSet}
          onFilePress={handleFilePress}
          onFileLongPress={openNodeActions}
          onFileDrop={(source, target) => {
            const targetFolder = target.type === 'directory'
              ? (target.path || '')
              : (target.path || '').split('/').slice(0, -1).join('/');
            moveNodeToFolder(source, targetFolder);
          }}
        />
      )}

      {isCreating && (
        <View style={styles.createPanel}>
          <View style={styles.createPanelHeader}>
            <Text style={styles.createPanelLabel}>{t('Criar em')}</Text>
            <TouchableOpacity onPress={() => { setCreateDestination(''); setIsCreating(null); }}>
              <Icon name="X" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.createFolderList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {folderList.map(folder => {
              const isSelected = folder.path === createDestination;
              return (
                <TouchableOpacity
                  key={folder.path || '__project_root'}
                  style={[styles.createFolderOption, isSelected && styles.createFolderOptionActive]}
                  onPress={() => setCreateDestination(folder.path)}
                >
                  <Icon name="Folder" size={14} color={isSelected ? theme.colors.accentBlue : theme.colors.textSecondary} />
                  <Text style={[styles.createFolderText, isSelected && styles.createFolderTextActive]} numberOfLines={1}>
                    {folder.path || t('Raiz do Projeto')}
                  </Text>
                  {isSelected && <Icon name="Check" size={14} color={theme.colors.accentBlue} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.createInputContainer}>
            <Icon name={isCreating === 'folder' ? 'Folder' : 'File'} size={14} color={theme.colors.textSecondary} />
            <TextInput
              style={styles.createInput}
              value={newItemName}
              onChangeText={setNewItemName}
              placeholder={isCreating === 'folder' ? 'folder_name' : 'file_name.ext'}
              placeholderTextColor={theme.colors.border}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              importantForAutofill="no"
              keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
              disableFullscreenUI
              autoFocus
              onSubmitEditing={async () => {
                if (newItemName.trim() && projectId) {
                  const cleanName = normalizeFolderPath(newItemName.trim());
                  const cleanFolder = normalizeFolderPath(createDestination);
                  if (!cleanName) return;
                  const path = cleanFolder ? `${cleanFolder}/${cleanName}` : cleanName;
                  if (isCreating === 'folder') {
                    await FileSystemService.makeDirectory(projectId, path);
                  } else {
                    await FileSystemService.writeFile(projectId, path, '');
                  }
                  import('../services/LiveSyncService').then(({ LiveSyncService }) => {
                    if (isRemoteSyncProject(LiveSyncService)) {
                      if (isCreating === 'file') {
                        LiveSyncService.sendFileUpdate(path, '');
                        LiveSyncService.requestSaveFile(path);
                      } else {
                        LiveSyncService.createRemoteDirectory(path);
                      }
                    }
                  });
                }
                setCreateDestination('');
                setIsCreating(null);
              }}
            />
          </View>
        </View>
      )}
    </>
  );

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return <Text>{text}</Text>;
    const regex = caseSensitive
      ? new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'g')
      : new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return (
      <Text>
        {parts.map((part, idx) => {
          const isMatch = caseSensitive ? part === query : part.toLowerCase() === query.toLowerCase();
          return isMatch
            ? <Text key={idx} style={{ backgroundColor: theme.colors.accentAmber + '55', color: theme.colors.accentAmber, fontFamily: theme.typography.uiBold }}>{part}</Text>
            : <Text key={idx}>{part}</Text>;
        })}
      </Text>
    );
  };

  const totalMatches = searchResults.reduce((acc, r) => acc + (r.matches?.length || 0), 0);

  const renderSearch = () => (
    <View style={styles.panelContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('SEARCH')}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => performSearch(searchQuery)}>
            <Icon name="RefreshCw" size={14} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.searchBox}>
        <Icon name="Search" size={16} color={theme.colors.textSecondary} style={{ marginLeft: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('Search')}
          placeholderTextColor={theme.colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          importantForAutofill="no"
          disableFullscreenUI
          returnKeyType="search"
        />
        <TouchableOpacity onPress={() => setCaseSensitive(!caseSensitive)} style={{ marginRight: 4, padding: 4, backgroundColor: caseSensitive ? theme.colors.accentBlue + '33' : 'transparent', borderRadius: 4 }}>
          <Text style={{ color: caseSensitive ? theme.colors.accentBlue : theme.colors.textSecondary, fontFamily: theme.typography.uiBold, fontSize: 12 }}>Aa</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSearchQuery('')}>
          <Icon name="XCircle" size={16} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchBox, { marginTop: 6 }]}>
        <Icon name="Filter" size={14} color={theme.colors.textSecondary} style={{ marginLeft: 8 }} />
        <TextInput
          style={[styles.searchInput, { fontSize: 13 }]}
          value={fileFilter}
          onChangeText={setFileFilter}
          placeholder={t('Files to include (e.g. *.tsx, *.css)')}
          placeholderTextColor={theme.colors.border}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          importantForAutofill="no"
          keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
          disableFullscreenUI
        />
        {fileFilter.length > 0 && (
          <TouchableOpacity onPress={() => setFileFilter('')}>
            <Icon name="XCircle" size={14} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>{t('RESULTS')}</Text>
        <Text style={styles.resultsSubtitle}>{isSearching ? t('Searching...') : `${searchResults.length} ${t('files')} · ${totalMatches} ${t('matches')}`}</Text>
      </View>
      <ScrollView style={{ flex: 1 }}>
        {isSearching ? (
          <ActivityIndicator size="small" color={theme.colors.accentBlue} style={{ marginTop: 20 }} />
        ) : (
          searchResults.map((res, i) => (
            <View key={i} style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }}>
              <TouchableOpacity
                style={{ padding: 12, backgroundColor: theme.colors.bgElevated, flexDirection: 'row', alignItems: 'center' }}
                onPress={() => {
                  router.setParams({ openFile: res.path, t: Date.now().toString() });
                  onClose();
                }}
              >
                <Icon name="File" size={14} color={theme.colors.accentBlue} style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.uiBold, fontSize: 13 }}>{res.name}</Text>
                  <Text style={{ color: theme.colors.textSecondary, fontFamily: theme.typography.ui, fontSize: 11, marginTop: 2 }}>{res.path}</Text>
                </View>
                {res.matches && res.matches.length > 0 && (
                  <View style={{ backgroundColor: theme.colors.accentBlue + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ color: theme.colors.accentBlue, fontFamily: theme.typography.uiBold, fontSize: 10 }}>{res.matches.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
              {res.matches && res.matches.length > 0 && res.matches.map((m, j) => (
                <TouchableOpacity
                  key={j}
                  style={{ paddingVertical: 6, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, backgroundColor: theme.colors.bgSurface, flexDirection: 'row', alignItems: 'center' }}
                  onPress={() => {
                     router.setParams({ openFile: res.path, goToLine: m.line.toString(), t: Date.now().toString() });
                     onClose();
                  }}
                >
                  <Text style={{ color: theme.colors.accentBlue, fontFamily: theme.typography.mono, fontSize: 11, width: 36, marginRight: 8 }}>{m.line}</Text>
                  <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.ui, fontSize: 11, flex: 1 }} numberOfLines={1}>
                    {highlightMatch(m.text, searchQuery)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );

  const renderLineStats = (stats?: LineChangeStats) => {
    if (!stats || stats.totalChangedLines <= 0) return null;

    return (
      <View style={styles.gitLineStats}>
        {stats.addedLines > 0 && <Text style={[styles.gitLineStat, { color: theme.colors.success }]}>+{stats.addedLines}</Text>}
        {stats.modifiedLines > 0 && <Text style={[styles.gitLineStat, { color: theme.colors.accentAmber }]}>~{stats.modifiedLines}</Text>}
        {stats.removedLines > 0 && <Text style={[styles.gitLineStat, { color: theme.colors.error }]}>-{stats.removedLines}</Text>}
        {stats.isUnsaved && <Text style={[styles.gitLineStat, { color: theme.colors.accentBlue }]}>{t('rascunho')}</Text>}
      </View>
    );
  };

  const renderLineChangesSummary = () => {
    if (sourceControlLineTotals.totalChangedLines <= 0) return null;

    return (
      <View style={styles.gitSummaryCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Icon name="GitBranch" size={14} color={theme.colors.accentBlue} />
          <Text style={styles.gitSummaryTitle}>{t('Linhas no trabalho atual')}</Text>
        </View>
        {renderLineStats(sourceControlLineTotals)}
      </View>
    );
  };

  const renderUnsavedChangeRows = () => {
    if (unsavedChangeEntries.length === 0) return null;

    return (
      <View style={styles.unsavedGitSection}>
        <Text style={styles.resultsTitle}>{t('RASCUNHOS NÃO SALVOS')}</Text>
        {unsavedChangeEntries.map(([path, stats]) => (
          <TouchableOpacity
            key={`unsaved-${path}`}
            style={styles.unsavedGitRow}
            onPress={() => {
              router.setParams({ openFile: path, t: Date.now().toString() });
              onClose();
            }}
          >
            <View style={styles.unsavedDot} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.ui, fontSize: 13 }} numberOfLines={1}>
                {path}
              </Text>
              {renderLineStats(stats)}
            </View>
            <Text style={{ color: theme.colors.accentBlue, fontFamily: theme.typography.uiBold, fontSize: 12, marginLeft: 8 }}>U</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderLiveSyncLocalChanges = () => (
    <View style={{ flex: 1, padding: 12 }}>
      <View style={{ padding: 12, backgroundColor: theme.colors.bgSurface, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Icon name="UploadCloud" size={16} color={theme.colors.accentBlue} />
          <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.uiBold, fontSize: 13, marginLeft: 8 }}>
            {t('Mudanças locais do Live Sync')}
          </Text>
        </View>
        <Text style={{ color: theme.colors.textSecondary, fontFamily: theme.typography.ui, fontSize: 12, lineHeight: 17 }}>
          {isLiveSyncConnected ? t('Conectado ao PC. Selecione arquivos para substituir no computador.') : t('Conecte ao PC pelo Bridge para enviar mudanças locais.')}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 8 }}>
        <Text style={styles.resultsTitle}>{t('CHANGES')}</Text>
        {changedFiles.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              if (syncSelectedFiles.size === changedFiles.length) {
                setSyncSelectedFiles(new Set());
              } else {
                setSyncSelectedFiles(new Set(changedFiles.map((f: any) => f.path)));
              }
            }}
            style={{ paddingVertical: 4, paddingHorizontal: 6 }}
          >
            <Text style={{ color: theme.colors.accentBlue, fontFamily: theme.typography.uiBold, fontSize: 12 }}>
              {syncSelectedFiles.size === changedFiles.length ? t('Desmarcar Todos') : t('Marcar Todos')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {isCheckingGit ? (
        <View style={{ padding: 16, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={theme.colors.accentBlue} />
          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 8 }}>{t('Buscando alterações...')}</Text>
        </View>
      ) : changedFiles.length === 0 ? (
        <View style={{ padding: 18, alignItems: 'center' }}>
          <Icon name="CheckCircle2" size={32} color={theme.colors.textSecondary} />
          <Text style={{ color: theme.colors.textSecondary, fontFamily: theme.typography.ui, fontSize: 13, marginTop: 10, textAlign: 'center' }}>
            {t('Nenhuma mudança local para enviar.')}
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          {changedFiles.map((file, i) => {
            const isSelected = syncSelectedFiles.has(file.path);
            const statusColor = file.status === 'deleted' ? theme.colors.error : file.status === 'added' ? theme.colors.accentTeal : theme.colors.accentPurple;
            const statusLabel = file.status === 'deleted' ? 'D' : file.status === 'added' ? 'A' : 'M';
            const lineStats = getLineStatsForFile(file);
            return (
              <TouchableOpacity
                key={`${file.path}-${i}`}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }}
                onPress={() => {
                  const next = new Set(syncSelectedFiles);
                  if (isSelected) next.delete(file.path);
                  else next.add(file.path);
                  setSyncSelectedFiles(next);
                }}
              >
                <Icon name={isSelected ? 'CheckSquare' : 'Square'} size={18} color={isSelected ? theme.colors.accentBlue : theme.colors.textSecondary} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.ui, fontSize: 13 }} numberOfLines={1}>
                    {file.path}
                  </Text>
                  {renderLineStats(lineStats)}
                </View>
                <Text style={{ color: statusColor, fontFamily: theme.typography.uiBold, fontSize: 12, marginLeft: 8, width: 18, textAlign: 'center' }}>
                  {statusLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={{ paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }}>
        <TouchableOpacity
          style={[{ backgroundColor: theme.colors.accentBlue, paddingVertical: 12, borderRadius: 8, alignItems: 'center', opacity: 1 }, (isSyncing || syncSelectedFiles.size === 0 || !isLiveSyncConnected) && { opacity: 0.5 }]}
          disabled={isSyncing || syncSelectedFiles.size === 0 || !isLiveSyncConnected}
          onPress={async () => {
            setIsSyncing(true);
            try {
              const { LiveSyncService } = await import('../services/LiveSyncService');
              await LiveSyncService.pushFilesToPC(Array.from(syncSelectedFiles), projectId);
              setSyncSelectedFiles(new Set());
              await loadGitChanges();
              loadFiles();
            } finally {
              setIsSyncing(false);
            }
          }}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={{ color: '#FFF', fontFamily: theme.typography.uiBold, fontSize: 14 }}>
              {isLiveSyncConnected ? `${t('Enviar')} ${syncSelectedFiles.size} ${t('arquivo(s) para o PC')}` : t('PC desconectado')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
  const renderGit = () => (
    <View style={styles.panelContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('SOURCE CONTROL')}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={loadGitChanges} disabled={isCheckingGit}>
            <Icon name="RefreshCw" size={14} color={isCheckingGit ? theme.colors.border : theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {isLiveSyncLocalMirror ? renderLiveSyncLocalChanges() : githubUser ? (
          projectInfo?.githubRepo ? (
            <View style={{ flex: 1, padding: 12 }}>
              <TextInput
                style={[styles.searchInput, { height: 60, textAlignVertical: 'top', padding: 8, marginBottom: 12 }]}
                value={commitMessage}
                onChangeText={setCommitMessage}
                placeholder={t('Message (Commit & Push)')}
                placeholderTextColor={theme.colors.border}
                multiline
              />
              <TouchableOpacity
                style={{ backgroundColor: theme.colors.accentBlue, paddingVertical: 8, alignItems: 'center', borderRadius: 4, marginBottom: 16, opacity: (isCommitting || !commitMessage.trim()) ? 0.5 : 1 }}
                disabled={isCommitting || !commitMessage.trim()}
                onPress={handleCommit}
              >
                {isCommitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={{ color: '#FFF', fontFamily: theme.typography.uiBold, fontSize: 13 }}>{t('Commit & Push')}</Text>
                )}
              </TouchableOpacity>

              {renderLineChangesSummary()}

              <View style={[styles.resultsHeader, { marginTop: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                <View>
                  <Text style={styles.resultsTitle}>{t('CHANGES')}</Text>
                </View>
              </View>

              {isCheckingGit ? (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={theme.colors.accentBlue} />
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 8 }}>{t('Buscando alterações...')}</Text>
                </View>
              ) : changedFiles.length > 0 && changedFiles[0].status === 'local' ? (
                /* LIVE SYNC MANUAL UPLOAD UI */
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                    <TouchableOpacity
                      onPress={() => {
                        if (syncSelectedFiles.size === changedFiles.length) {
                          setSyncSelectedFiles(new Set());
                        } else {
                          setSyncSelectedFiles(new Set(changedFiles.map((f: any) => f.path)));
                        }
                      }}
                      style={{ padding: 4 }}
                    >
                      <Text style={{ color: theme.colors.accentBlue, fontFamily: theme.typography.uiBold, fontSize: 12 }}>
                        {syncSelectedFiles.size === changedFiles.length ? t('Desmarcar Todos') : t('Marcar Todos')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={{ flex: 1 }}>
                    {changedFiles.map((file, i) => {
                      const isSelected = syncSelectedFiles.has(file.path);
                      return (
                        <TouchableOpacity
                          key={i}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }}
                          onPress={() => {
                            const newSet = new Set(syncSelectedFiles);
                            if (isSelected) newSet.delete(file.path);
                            else newSet.add(file.path);
                            setSyncSelectedFiles(newSet);
                          }}
                        >
                          <Icon name={isSelected ? 'CheckSquare' : 'Square'} size={18} color={isSelected ? theme.colors.accentBlue : theme.colors.textSecondary} />
                          <Text style={{ flex: 1, color: theme.colors.textPrimary, fontFamily: theme.typography.ui, fontSize: 13, marginLeft: 12 }} numberOfLines={1}>
                            {file.path}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                    <TouchableOpacity
                      style={[{ backgroundColor: theme.colors.accentBlue, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }, (isSyncing || syncSelectedFiles.size === 0) && { opacity: 0.5 }]}
                      disabled={isSyncing || syncSelectedFiles.size === 0}
                      onPress={async () => {
                        setIsSyncing(true);
                        try {
                          const { LiveSyncService } = await import('../services/LiveSyncService');
                          await LiveSyncService.pushFilesToPC(Array.from(syncSelectedFiles), projectId);
                          await loadGitChanges();
                          loadFiles();
                          setSyncSelectedFiles(new Set());
                        } finally {
                          setIsSyncing(false);
                        }
                      }}
                    >
                      {isSyncing ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Text style={{ color: '#FFF', fontFamily: theme.typography.uiBold, fontSize: 14 }}>
                          {t('Enviar')} {syncSelectedFiles.size} {t('arquivo(s) para o PC')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* NORMAL GIT UI */
                <ScrollView style={{ flex: 1 }}>
                  {renderUnsavedChangeRows()}
                  {changedFiles.map((file, i) => {
                    const lineStats = getLineStatsForFile(file);
                    return (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
                        <TouchableOpacity
                          style={{ flex: 1, paddingHorizontal: 4 }}
                          onPress={() => {
                            router.setParams({ openFile: file.path });
                            onClose();
                          }}
                        >
                          <Text style={{ color: file.status === 'added' || file.status === 'untracked' ? theme.colors.accentTeal : theme.colors.accentPurple, fontFamily: theme.typography.ui, fontSize: 13 }} numberOfLines={1}>
                            {file.path}
                          </Text>
                          {renderLineStats(lineStats)}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={{ padding: 4 }}
                          onPress={() => handleRevertFile(file.path, file.status)}
                        >
                          <Icon name="RotateCcw" size={14} color={theme.colors.textSecondary} />
                        </TouchableOpacity>

                        <Text style={{ color: file.status === 'added' || file.status === 'untracked' ? theme.colors.accentTeal : theme.colors.accentPurple, fontFamily: theme.typography.uiBold, fontSize: 12, marginLeft: 8, width: 16, textAlign: 'center' }}>
                          {file.status === 'added' || file.status === 'untracked' ? 'A' : 'M'}
                        </Text>
                      </View>
                    );
                  })}
                  {changedFiles.length === 0 && unsavedChangeEntries.length === 0 && (
                    <Text style={{ color: theme.colors.textSecondary, fontFamily: theme.typography.ui, fontSize: 13, marginTop: 16, textAlign: 'center' }}>
                      {t('Nenhuma alteração detectada.')}
                    </Text>
                  )}
                </ScrollView>
              )}
            </View>
          ) : (
            <View style={{ padding: 16, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              <Icon name="GitBranch" size={48} color={theme.colors.textPrimary} style={{ marginBottom: 16 }} />
              <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.uiBold, fontSize: 16, marginBottom: 8 }}>
                {githubUser.login}
              </Text>
              <Text style={{ color: theme.colors.textSecondary, fontFamily: theme.typography.ui, textAlign: 'center', fontSize: 13, marginBottom: 16 }}>
                {t('Este projeto ainda não está vinculado ao Source Control.')}
              </Text>

              <TouchableOpacity
                style={{ backgroundColor: theme.colors.accentTeal, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, marginBottom: 12, width: '100%', alignItems: 'center' }}
                onPress={() => handleOpenRepos('link')}
              >
                <Text style={{ color: '#FFF', fontFamily: theme.typography.uiBold, fontSize: 13 }}>{t('Vincular a um Repositório')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ backgroundColor: theme.colors.accentBlue, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, width: '100%', alignItems: 'center' }}
                onPress={() => handleOpenRepos('clone')}
              >
                <Text style={{ color: '#FFF', fontFamily: theme.typography.uiBold, fontSize: 13 }}>{t('Clonar Outro Repositório')}</Text>
              </TouchableOpacity>
            </View>
          )
        ) : (
          <View style={{ padding: 16, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <Icon name="GitBranch" size={64} color={theme.colors.border} style={{ marginBottom: 16 }} />
            <Text style={{ color: theme.colors.textSecondary, fontFamily: theme.typography.ui, textAlign: 'center', fontSize: 13, marginBottom: 16 }}>
              {t('Para usar os recursos de Source Control, conecte sua conta do GitHub no menu principal.')}
            </Text>
          </View>
        )}
      </View>
    </View>
  );


  // AI tab and Terminal tab removed

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, embedded ? styles.embeddedContainer : { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Activity Bar (Top) */}
      <View style={[styles.activityBar, embedded && styles.activityBarEmbedded]}>
        <TouchableOpacity style={[styles.activityTab, embedded && styles.activityTabEmbedded]} onPress={() => {
          onClose();
          router.replace('/');
        }}>
          <Icon name="Home" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.activityTab, embedded && styles.activityTabEmbedded]} onPress={() => setActiveTab('files')}>
          <Icon name="Files" size={22} color={activeTab === 'files' ? theme.colors.textPrimary : theme.colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.activityTab, embedded && styles.activityTabEmbedded]} onPress={() => setActiveTab('search')}>
          <Icon name="Search" size={22} color={activeTab === 'search' ? theme.colors.textPrimary : theme.colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.activityTab, embedded && styles.activityTabEmbedded]} onPress={() => setActiveTab('git')}>
          <View>
            <Icon name="GitBranch" size={22} color={activeTab === 'git' ? theme.colors.textPrimary : theme.colors.textSecondary} />
            {sourceControlBadgeCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{sourceControlBadgeCount > 9 ? '9+' : sourceControlBadgeCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        {isLiveSyncLocalMirror && isLiveSyncConnected && (
          <TouchableOpacity style={[styles.activityTab, embedded && styles.activityTabEmbedded]} onPress={() => { setActiveTab('git'); loadGitChanges(); }}>
            <View>
              <Icon name="UploadCloud" size={22} color={activeTab === 'git' ? theme.colors.accentBlue : theme.colors.textSecondary} />
              {changedFiles.length > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{changedFiles.length > 9 ? '9+' : changedFiles.length}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Side Panel (Content) */}
      <View style={styles.panelContent}>
        {activeTab === 'files' && renderFiles()}
        {activeTab === 'search' && renderSearch()}
        {activeTab === 'git' && renderGit()}

      </View>

      {/* Action Modal (Long Press) */}
      <Modal visible={!!actionTargetNode} transparent animationType="fade" onRequestClose={() => setActionTargetNode(null)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setActionTargetNode(null)} />
          <View style={styles.actionModalCard}>
            <View style={styles.actionModalHeader}>
              <Icon name={actionTargetNode?.type === 'directory' ? 'Folder' : 'File'} size={20} color={theme.colors.accentBlue} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.actionModalTitle}>{actionTargetNode?.type === 'directory' ? t('Gerenciar Pasta') : t('Gerenciar Arquivo')}</Text>
                <Text style={styles.actionModalSubtitle} numberOfLines={1}>{actionTargetNode?.path || actionTargetNode?.name}</Text>
              </View>
            </View>

            <View style={styles.actionModalButtons}>
              <TouchableOpacity
                style={styles.actionModalButton}
                onPress={() => {
                  const node = actionTargetNode;
                  setActionTargetNode(null);
                  if (node) openRenameModal(node);
                }}
              >
                <View style={[styles.actionIconBg, { backgroundColor: 'rgba(139, 92, 246, 0.12)' }]}>
                  <Icon name="Pencil" size={18} color={theme.colors.accentPurple} />
                </View>
                <Text style={styles.actionModalButtonText}>{t('Renomear')}</Text>
                <Icon name="ChevronRight" size={16} color={theme.colors.textSecondary} />
              </TouchableOpacity>

              <View style={styles.actionModalDivider} />

              {actionTargetNode?.type === 'directory' && (
                <>
                  <TouchableOpacity
                    style={styles.actionModalButton}
                    onPress={() => {
                      const node = actionTargetNode;
                      setActionTargetNode(null);
                      if (node) openImportModal(node.path);
                    }}
                  >
                    <View style={[styles.actionIconBg, { backgroundColor: 'rgba(34, 211, 238, 0.12)' }]}>
                      <Icon name="FileUp" size={18} color={theme.colors.accentTeal} />
                    </View>
                    <Text style={styles.actionModalButtonText}>{t('Importar aqui')}</Text>
                    <Icon name="ChevronRight" size={16} color={theme.colors.textSecondary} />
                  </TouchableOpacity>

                  <View style={styles.actionModalDivider} />
                </>
              )}

              <TouchableOpacity
                style={styles.actionModalButton}
                onPress={() => {
                  const node = actionTargetNode;
                  setActionTargetNode(null);
                  if (node) openMoveModal(node);
                }}
              >
                <View style={[styles.actionIconBg, { backgroundColor: 'rgba(56, 189, 248, 0.1)' }]}>
                  <Icon name="Move" size={18} color={theme.colors.accentBlue} />
                </View>
                <Text style={styles.actionModalButtonText}>{t('Mover para...')}</Text>
                <Icon name="ChevronRight" size={16} color={theme.colors.textSecondary} />
              </TouchableOpacity>

              <View style={styles.actionModalDivider} />

              <TouchableOpacity
                style={styles.actionModalButton}
                onPress={() => {
                  const node = actionTargetNode;
                  setActionTargetNode(null);
                  if (node) {
                    Alert.alert(t('Confirmar Exclusão'), `${t('Tem certeza que deseja excluir')} ${node.name}?`, [
                      { text: t('Cancelar'), style: 'cancel' },
                      { text: t('Excluir'), style: 'destructive', onPress: () => deleteNode(node) }
                    ]);
                  }
                }}
              >
                <View style={[styles.actionIconBg, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                  <Icon name="Trash2" size={18} color={theme.colors.error} />
                </View>
                <Text style={[styles.actionModalButtonText, { color: theme.colors.error }]}>{t('Excluir')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal visible={!!renameTargetNode} transparent animationType="slide" onRequestClose={() => setRenameTargetNode(null)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setRenameTargetNode(null)} />
          <View style={styles.moveModalCard}>
            <Text style={styles.moveModalTitle}>{t('Renomear')}</Text>
            <Text style={styles.moveModalText} numberOfLines={1}>{renameTargetNode?.path || renameTargetNode?.name}</Text>
            <TextInput
              style={styles.moveInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder={t('Novo nome')}
              placeholderTextColor={theme.colors.border}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              importantForAutofill="no"
              keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
              disableFullscreenUI
              returnKeyType="done"
              autoFocus
              onSubmitEditing={renameNode}
            />
            <View style={styles.moveActions}>
              <TouchableOpacity style={styles.moveButtonSecondary} onPress={() => setRenameTargetNode(null)}>
                <Text style={styles.moveButtonSecondaryText}>{t('Cancelar')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.moveButtonPrimary} onPress={renameNode}>
                <Text style={styles.moveButtonPrimaryText}>{t('Renomear')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Move File Modal */}
      <Modal visible={!!moveTargetNode} transparent animationType="slide" onRequestClose={() => setMoveTargetNode(null)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setMoveTargetNode(null)} />
          <View style={[styles.moveModalCard, { maxHeight: '80%', padding: 0 }]}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <Text style={styles.moveModalTitle}>{t('Mover para onde?')}</Text>
              <Text style={styles.moveModalText} numberOfLines={1}>
                {t('Movendo:')} {moveTargetNode?.path || moveTargetNode?.name}
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              {folderList.map((folder, index) => {
                // Prevent moving a folder into itself
                if (moveTargetNode?.type === 'directory' && folder.path.startsWith(moveTargetNode.path)) return null;

                const isSelected = moveDestination === folder.path;
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.folderPickerItem,
                      isSelected && { backgroundColor: theme.colors.bgPrimary }
                    ]}
                    onPress={() => setMoveDestination(folder.path)}
                  >
                    <Icon name={folder.path === '' ? 'Database' : 'Folder'} size={18} color={isSelected ? theme.colors.accentBlue : theme.colors.textSecondary} />
                    <Text style={[
                      styles.folderPickerText,
                      isSelected && { color: theme.colors.textPrimary, fontFamily: theme.typography.uiBold }
                    ]}>
                      {folder.name}
                    </Text>
                    {isSelected && <Icon name="Check" size={16} color={theme.colors.accentBlue} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={[styles.moveActions, { padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: 0 }]}>
              <TouchableOpacity style={styles.moveButtonSecondary} onPress={() => setMoveTargetNode(null)}>
                <Text style={styles.moveButtonSecondaryText}>{t('Cancelar')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.moveButtonPrimary}
                onPress={() => moveTargetNode && moveNodeToFolder(moveTargetNode, moveDestination)}
              >
                <Text style={styles.moveButtonPrimaryText}>{t('Confirmar')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Import File Modal */}
      <Modal visible={isImportModalVisible} transparent animationType="slide" onRequestClose={() => setIsImportModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setIsImportModalVisible(false)} />
          <View style={[styles.moveModalCard, { height: '86%', padding: 0, overflow: 'hidden' }]}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <Text style={styles.moveModalTitle}>{t('Importar arquivo')}</Text>
              <Text style={styles.moveModalText} numberOfLines={1}>
                {importDestination ? `${t('Destino:')} ${importDestination}` : t('Destino: Raiz do Projeto')}
              </Text>
            </View>

            <View style={styles.importSection}>
              <Text style={styles.resultsTitle}>{t('DESTINO')}</Text>
              <ScrollView style={[styles.createFolderList, { maxHeight: 112, marginBottom: 12 }]} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {folderList.map(folder => {
                  const isSelected = folder.path === importDestination;
                  return (
                    <TouchableOpacity
                      key={folder.path || '__import_project_root'}
                      style={[styles.createFolderOption, isSelected && styles.createFolderOptionActive]}
                      onPress={() => setImportDestination(folder.path)}
                    >
                      <Icon name={folder.path ? 'Folder' : 'Database'} size={14} color={isSelected ? theme.colors.accentBlue : theme.colors.textSecondary} />
                      <Text style={[styles.createFolderText, isSelected && styles.createFolderTextActive]} numberOfLines={1}>
                        {folder.path || t('Raiz do Projeto')}
                      </Text>
                      {isSelected && <Icon name="Check" size={14} color={theme.colors.accentBlue} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={[styles.importSourceButton, isImporting && { opacity: 0.5 }]}
                disabled={isImporting}
                onPress={importFilesFromDevice}
              >
                <View style={[styles.actionIconBg, { backgroundColor: 'rgba(34, 211, 238, 0.12)' }]}>
                  <Icon name="Smartphone" size={18} color={theme.colors.accentTeal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.importSourceButtonText}>{t('Arquivos do celular')}</Text>
                  <Text style={styles.actionModalSubtitle}>{t('Escolher em Downloads, Drive, gerenciador de arquivos...')}</Text>
                </View>
                {isImporting ? <ActivityIndicator size="small" color={theme.colors.accentBlue} /> : <Icon name="ChevronRight" size={16} color={theme.colors.textSecondary} />}
              </TouchableOpacity>
            </View>

            <View style={[styles.importSection, styles.importTreeSection]}>
              <Text style={styles.resultsTitle}>{t('DEVFLUX')}</Text>
              <View style={styles.importTreeBox}>
                {isLoadingDevfluxImport ? (
                  <ActivityIndicator size="small" color={theme.colors.accentBlue} style={{ marginTop: 20 }} />
                ) : devfluxImportTree.length === 0 ? (
                  <View style={styles.importEmptyState}>
                    <Text style={styles.importEmptyText}>{t('Nenhum outro projeto do DevFlux encontrado.')}</Text>
                  </View>
                ) : (
                  <FileTree
                    data={devfluxImportTree as any}
                    onFilePress={(file) => importDevFluxFile(file as DevFluxImportNode)}
                  />
                )}
              </View>
            </View>

            <View style={[styles.moveActions, { padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: 0 }]}>
              <TouchableOpacity style={styles.moveButtonSecondary} onPress={() => setIsImportModalVisible(false)}>
                <Text style={styles.moveButtonSecondaryText}>{t('Fechar')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.moveButtonPrimary} onPress={loadDevFluxImportSources} disabled={isLoadingDevfluxImport}>
                <Text style={styles.moveButtonPrimaryText}>{t('Atualizar')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* GitHub Repos Modal */}
      <Modal visible={showRepoModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: theme.colors.bgElevated, borderRadius: 12, maxHeight: '80%', overflow: 'hidden' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.uiBold, fontSize: 16 }}>
                {repoModalMode === 'link' ? t('Vincular Repositório') : t('Clonar Repositório')}
              </Text>
              <TouchableOpacity onPress={() => setShowRepoModal(false)}>
                <Icon name="X" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {repoModalMode === 'link' && (
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                <Text style={{ color: theme.colors.textSecondary, fontFamily: theme.typography.uiBold, fontSize: 12, marginBottom: 8 }}>{t('CRIAR NOVO NO GITHUB')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextInput
                    style={{ flex: 1, backgroundColor: theme.colors.bgPrimary, color: theme.colors.textPrimary, padding: 8, borderRadius: 6, fontFamily: theme.typography.ui, borderWidth: 1, borderColor: theme.colors.border }}
                    placeholder={t('Nome do repositório')}
                    placeholderTextColor={theme.colors.textSecondary}
                    value={newRepoName}
                    onChangeText={setNewRepoName}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    importantForAutofill="no"
                    keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
                    disableFullscreenUI
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: theme.colors.accentTeal, padding: 8, borderRadius: 6, marginLeft: 8, opacity: isCreatingRepo ? 0.5 : 1 }}
                    onPress={handleCreateNewRepo}
                    disabled={isCreatingRepo}
                  >
                    <Icon name={isCreatingRepo ? "Loader" : "Plus"} size={20} color="#FFF" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <FlatList
              data={repos}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
                  onPress={() => repoModalMode === 'link' ? handleLinkRepo(item.full_name) : handleClone(item)}
                >
                  <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.uiBold }}>{item.full_name}</Text>
                  {item.description && (
                    <Text style={{ color: theme.colors.textSecondary, fontFamily: theme.typography.ui, fontSize: 12, marginTop: 4 }}>
                      {item.description}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Clone Progress Modal */}
      <Modal visible={isCloning} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <ActivityIndicator size="large" color={theme.colors.accentBlue} />
          <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.uiBold, marginTop: 16, textAlign: 'center' }}>
            {cloneProgress}
          </Text>
        </View>
      </Modal>
    </View>
    </KeyboardAvoidingView>
  );
};

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: theme.colors.bgElevated,
  },
  embeddedContainer: {
    flexDirection: 'row',
    paddingTop: 0,
    paddingBottom: 0,
  },
  activityBar: {
    flexDirection: 'row',
    height: 48,
    backgroundColor: theme.colors.bgSurface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  activityBarEmbedded: {
    width: 48,
    height: '100%',
    flexDirection: 'column',
    borderBottomWidth: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: theme.colors.border,
    paddingHorizontal: 0,
    paddingVertical: 6,
  },
  activityTab: {
    height: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTabEmbedded: {
    width: 48,
    height: 44,
    flex: 0,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: theme.colors.accentBlue,
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 9,
    fontFamily: theme.typography.ui,
    fontWeight: 'bold',
  },
  panelContent: {
    flex: 1,
  },
  panelContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontFamily: theme.typography.ui,
    fontWeight: 'bold',
    fontSize: 11,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgSurface,
    marginHorizontal: 12,
    borderRadius: 8,
    height: 38,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    fontSize: 14,
    lineHeight: 18,
    paddingHorizontal: 9,
    paddingVertical: 0,
  },
  resultsHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  resultsTitle: {
    fontFamily: theme.typography.ui,
    fontWeight: 'bold',
    fontSize: 11,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  resultsSubtitle: {
    fontFamily: theme.typography.ui,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  gitChangeText: {
    fontFamily: theme.typography.mono,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginLeft: 8,
    flex: 1,
  },
  gitSummaryCard: {
    padding: 10,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgSurface,
  },
  gitSummaryTitle: {
    marginLeft: 8,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
    fontSize: 13,
  },
  gitLineStats: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  gitLineStat: {
    fontFamily: theme.typography.mono,
    fontSize: 11,
  },
  unsavedGitSection: {
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  unsavedGitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
  },
  unsavedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accentBlue,
    marginRight: 10,
  },
  createPanel: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: theme.colors.bgElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  createPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  createPanelLabel: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    fontSize: 11,
  },
  createFolderList: {
    maxHeight: 118,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgPrimary,
    marginBottom: 8,
  },
  createFolderOption: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  createFolderOptionActive: {
    backgroundColor: theme.colors.accentBlue + '18',
  },
  createFolderText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.mono,
    fontSize: 12,
  },
  createFolderTextActive: {
    color: theme.colors.textPrimary,
  },
  createInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.bgPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  createInput: {
    flex: 1,
    marginLeft: 8,
    fontFamily: theme.typography.mono,
    fontSize: 13,
    color: theme.colors.textPrimary,
    height: 24,
    padding: 0,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'center',
    padding: 20,
  },
  moveModalCard: {
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 16,
  },
  moveModalTitle: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
    fontSize: 17,
    marginBottom: 8,
  },
  moveModalText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.mono,
    fontSize: 12,
    marginBottom: 12,
  },
  moveInput: {
    backgroundColor: theme.colors.bgPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.mono,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  moveActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  moveButtonSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  moveButtonSecondaryText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.uiBold,
    fontSize: 13,
  },
  moveButtonPrimary: {
    backgroundColor: theme.colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  moveButtonPrimaryText: {
    color: theme.colors.bgPrimary,
    fontFamily: theme.typography.uiBold,
    fontSize: 13,
  },
  importSection: {
    padding: 16,
  },
  importTreeSection: {
    flex: 1,
    minHeight: 0,
    paddingTop: 0,
  },
  importSourceButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: theme.colors.bgPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  importSourceButtonText: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
    fontSize: 14,
    marginBottom: 2,
  },
  importTreeBox: {
    flex: 1,
    minHeight: 150,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgPrimary,
  },
  importEmptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  importEmptyText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    fontSize: 12,
    textAlign: 'center',
  },
  // New styles for action modal and folder picker
  actionModalCard: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 8,
    width: '90%',
    maxWidth: 360,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  actionModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  actionModalTitle: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
    fontSize: 16,
  },
  actionModalSubtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.mono,
    fontSize: 12,
    marginTop: 2,
  },
  actionModalButtons: {
    padding: 8,
  },
  actionModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
  },
  actionIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionModalButtonText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
    fontSize: 15,
  },
  actionModalDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
    marginHorizontal: 12,
  },
  folderPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  folderPickerText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    fontSize: 14,
    marginLeft: 12,
  }
});
