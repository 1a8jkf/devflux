import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert, Modal, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon, IconName } from './Icon';
import { FileTree } from './FileTree';
import { useRouter, useGlobalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileSystemService, FileNode, ProjectInfo } from '../services/FileSystemService';
import { useAIContext } from '../contexts/AIContext';
import { MonacoEditor } from './MonacoEditor';

interface EditorSidebarProps {
  onClose: () => void;
  onOpenDrawer?: () => void;
}

export const EditorSidebar: React.FC<EditorSidebarProps> = ({ onClose, onOpenDrawer }) => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useGlobalSearchParams();
  const projectId = params.projectId as string;

  const { pendingChanges, approveChange, rejectChange } = useAIContext();

  const [activeTab, setActiveTab] = useState<'files' | 'search' | 'git' | 'terminal' | 'ai'>('files');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{path: string, name: string, matches?: {line: number, text: string}[]}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isCreating, setIsCreating] = useState<'file'|'folder'|null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [githubUser, setGithubUser] = useState<any>(null);
  const [showRepoModal, setShowRepoModal] = useState(false);
  const [repos, setRepos] = useState<any[]>([]);
  const [isCloning, setIsCloning] = useState(false);
  const [cloneProgress, setCloneProgress] = useState('');
  
  const [repoModalMode, setRepoModalMode] = useState<'clone' | 'link'>('clone');
  const [newRepoName, setNewRepoName] = useState('');
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);

  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [changedFiles, setChangedFiles] = useState<any[]>([]);
  const [isCheckingGit, setIsCheckingGit] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  useEffect(() => {
    // Clear state when switching projects
    setProjectInfo(null);
    setChangedFiles([]);
    setSelectedFiles([]);
    
    if (projectId) {
      FileSystemService.getProjects().then(projs => {
        const p = projs.find(p => p.id === projectId);
        if (p) {
          setProjectInfo(p as ProjectInfo);
        }
      });
    }
  }, [projectId]);

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const { LiveSyncService } = await import('../services/LiveSyncService');
      if (projectId === LiveSyncService.syncProjectId && LiveSyncService.ws && LiveSyncService.ws.readyState === 1) {
        const handler = (event: any) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'search_results' && data.query === query) {
               setSearchResults(data.results);
               setIsSearching(false);
               LiveSyncService.ws?.removeEventListener('message', handler);
            }
          } catch(e) {}
        };
        LiveSyncService.ws.addEventListener('message', handler);
        LiveSyncService.ws.send(JSON.stringify({ type: 'search_workspace', query }));
        setTimeout(() => {
           setIsSearching(false);
           LiveSyncService.ws?.removeEventListener('message', handler);
        }, 10000);
        return;
      }

      const results: {path: string, name: string, matches?: {line: number, text: string}[]}[] = [];
      const searchRecursive = async (nodes: FileNode[]) => {
        for (const node of nodes) {
          if (node.type === 'file') {
            const ext = node.fileType || '';
            let fileMatched = false;
            let fileMatches: {line: number, text: string}[] = [];
            
            if (node.name.toLowerCase().includes(query.toLowerCase())) {
              fileMatched = true;
            }
            
            if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'md', 'txt'].includes(ext)) {
              try {
                const content = await FileSystemService.readFile(projectId, node.path!);
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                  if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                    fileMatched = true;
                    fileMatches.push({ line: i + 1, text: lines[i].trim().substring(0, 60) });
                    if (fileMatches.length >= 5) break; 
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
  }, [searchQuery, fileTree]);

  const loadGitChanges = async () => {
    const { LiveSyncService } = await import('../services/LiveSyncService');
    if (projectId === LiveSyncService.syncProjectId) {
       setChangedFiles([{ path: '(Modo Live Sync Ativo)', type: 'info' }]);
       setSelectedFiles([]);
       setIsCheckingGit(false);
       return;
    }

    if (!projectInfo?.githubRepo) return;
    setIsCheckingGit(true);
    try {
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
    if (activeTab === 'git' && projectInfo?.githubRepo) {
      loadGitChanges();
    }
  }, [activeTab, projectInfo?.githubRepo, projectId]);

  const handleCommit = async () => {
    const { LiveSyncService } = await import('../services/LiveSyncService');
    if (projectId === LiveSyncService.syncProjectId) {
        Alert.alert('Live Sync', 'Utilize o Terminal do DevFlux ou o próprio VS Code para rodar comandos Git no modo remoto.');
        return;
    }

    if (!projectInfo?.githubRepo || !commitMessage.trim()) return;
    setIsCommitting(true);
    try {
      const { GitService } = await import('../services/GitService');
      const { GithubService } = await import('../services/GithubService');
      const user = await GithubService.getUser();
      await GitService.commit(projectId, commitMessage, user.name || user.login, user.login + '@users.noreply.github.com');
      await GitService.push(projectId);
      Alert.alert('Sucesso', 'Commit e push realizados com sucesso!');
      setCommitMessage('');
      loadGitChanges();
    } catch(e: any) {
      Alert.alert('Erro', 'Falha ao fazer commit: ' + e.message);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleRevertFile = (path: string, status: string) => {
    Alert.alert(
      "Descartar Alterações",
      `Tem certeza que deseja reverter as alterações de ${path}?`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Descartar", 
          style: "destructive", 
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
              Alert.alert('Erro', 'Não foi possível reverter: ' + e.message);
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
      Alert.alert('Erro', 'Falha ao buscar repositórios.');
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
      
      Alert.alert('Sucesso', `Projeto vinculado a ${repoName}!`);
      setShowRepoModal(false);
      loadGitChanges();
    } catch (e: any) {
      Alert.alert('Erro', 'Falha ao vincular: ' + e.message);
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
      Alert.alert('Erro', 'Falha ao criar repositório no Github: ' + e.message);
      setIsCreatingRepo(false);
    }
  };

  const handleClone = async (repo: any) => {
    setShowRepoModal(false);
    setIsCloning(true);
    setCloneProgress(`Baixando ${repo.name}...`);
    try {
      const newProjectId = await FileSystemService.downloadGitRepo(repo.full_name);
      
      setCloneProgress('Clone finalizado!');
      setTimeout(() => {
        setIsCloning(false);
        router.replace({ pathname: '/editor/codigo', params: { projectId: newProjectId } });
      }, 1000);
      
    } catch (e: any) {
      Alert.alert('Erro ao clonar', e.message);
      setIsCloning(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadFiles();
      const unsubscribe = FileSystemService.subscribe(loadFiles);
      return () => { unsubscribe(); };
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
    setIsLoading(true);
    try {
      const { LiveSyncService } = await import('../services/LiveSyncService');
      
      if (projectId === LiveSyncService.syncProjectId) {
        const isConnected = LiveSyncService.ws && LiveSyncService.ws.readyState === 1;
        if (isConnected) {
          LiveSyncService.onRemoteTreeUpdate = (paths: string[]) => {
            setFileTree(buildTreeFromPaths(paths));
            setIsLoading(false);
          };
          LiveSyncService.requestRemoteTree();
          return;
        }
      }

      // 1. Try local filesystem for standard projects or disconnected sync
      const tree = await FileSystemService.getProjectFileTree(projectId);
      setFileTree(tree || []);
      setIsLoading(false);
    } catch (e) {
      console.error('loadFiles error:', e);
      setFileTree([]);
      setIsLoading(false);
    }
  };

  // Keep onRemoteTreeUpdate handler alive so tree updates in real-time
  useEffect(() => {
    let mounted = true;
    import('../services/LiveSyncService').then(({ LiveSyncService }) => {
      const oldHandler = LiveSyncService.onRemoteTreeUpdate;
      LiveSyncService.onRemoteTreeUpdate = (paths: string[]) => {
        if (mounted) {
          setFileTree(buildTreeFromPaths(paths));
          setIsLoading(false);
        }
        if (oldHandler) oldHandler(paths);
      };
      
      // If remote tree already cached, display it
      if (LiveSyncService.remoteTree && LiveSyncService.remoteTree.length > 0) {
        setFileTree(buildTreeFromPaths(LiveSyncService.remoteTree));
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      // Don't null out the handler on unmount — let it persist for reconnections
    };
  }, []);

  // Poll for local file system changes
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (projectId) {
      import('../services/LiveSyncService').then(({ LiveSyncService }) => {
        if (projectId !== LiveSyncService.syncProjectId) {
          interval = setInterval(() => {
            FileSystemService.getProjectFileTree(projectId).then(tree => {
              setFileTree(tree || []);
            });
          }, 2500); // 2.5 seconds refresh rate
        }
      });
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [projectId]);

  const handleFilePress = (file: any) => {
    if (file.type === 'file') {
      router.setParams({ openFile: file.path, t: Date.now().toString() });
      onClose();
    }
  };

  const renderFiles = () => (
    <>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>EXPLORER</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => { setIsCreating('file'); setNewItemName(''); }}>
            <Icon name="FilePlus" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ width: 12 }} />
          <TouchableOpacity onPress={() => { setIsCreating('folder'); setNewItemName(''); }}>
            <Icon name="FolderPlus" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ width: 12 }} />
          <TouchableOpacity onPress={loadFiles}>
            <Icon name="RefreshCw" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ width: 12 }} />
          <TouchableOpacity onPress={() => {
            import('../services/LiveSyncService').then(({ LiveSyncService }) => {
              if (projectId === LiveSyncService.syncProjectId) {
                LiveSyncService.pushLocalWorkspaceToPC();
              }
            });
          }}>
            <Icon name="CloudUpload" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
      {isLoading ? (
        <ActivityIndicator size="small" color={theme.colors.accentBlue} style={{ marginTop: 20 }} />
      ) : (
        <FileTree 
          data={fileTree} 
          onFilePress={handleFilePress} 
          onFileLongPress={(node) => {
            Alert.alert(
              "Gerenciar Arquivo",
              `O que deseja fazer com ${node.name}?`,
              [
                { text: "Cancelar", style: "cancel" },
                { 
                  text: "Apagar", 
                  style: "destructive", 
                  onPress: async () => {
                    if (projectId && node.path) {
                       await FileSystemService.deleteFile(projectId, node.path);
                    }
                  } 
                }
              ]
            );
          }}
        />
      )}
      
      {isCreating && (
        <View style={styles.createInputContainer}>
          <Icon name={isCreating === 'folder' ? 'Folder' : 'File'} size={14} color={theme.colors.textSecondary} />
          <TextInput 
            style={styles.createInput}
            value={newItemName}
            onChangeText={setNewItemName}
            placeholder={isCreating === 'folder' ? 'folder_name' : 'file_name.ext'}
            placeholderTextColor={theme.colors.border}
            autoFocus
            onSubmitEditing={async () => {
              if (newItemName.trim() && projectId) {
                const path = newItemName.trim();
                if (isCreating === 'folder') {
                  await FileSystemService.makeDirectory(projectId, path);
                } else {
                  await FileSystemService.writeFile(projectId, path, '');
                }
                import('../services/LiveSyncService').then(({ LiveSyncService }) => {
                  if (projectId === LiveSyncService.syncProjectId) {
                    if (isCreating === 'file') {
                      LiveSyncService.sendFileUpdate(path, '');
                      LiveSyncService.requestSaveFile(path);
                    }
                  }
                });
              }
              setIsCreating(null);
            }}
            onBlur={() => setIsCreating(null)}
          />
        </View>
      )}
    </>
  );

  const renderSearch = () => (
    <View style={styles.panelContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SEARCH</Text>
        <View style={styles.headerActions}>
          <Icon name="RefreshCw" size={14} color={theme.colors.textSecondary} />
          <View style={{ width: 12 }} />
          <Icon name="ListFilter" size={14} color={theme.colors.textSecondary} />
        </View>
      </View>
      <View style={styles.searchBox}>
        <Icon name="Search" size={16} color={theme.colors.textSecondary} style={{ marginLeft: 8 }} />
        <TextInput 
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search"
          placeholderTextColor={theme.colors.textSecondary}
        />
        <TouchableOpacity onPress={() => setSearchQuery('')}>
          <Icon name="XCircle" size={16} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>RESULTS</Text>
        <Text style={styles.resultsSubtitle}>{isSearching ? 'Searching...' : `${searchResults.length} results`}</Text>
      </View>
      <ScrollView style={{ flex: 1 }}>
        {isSearching ? (
          <ActivityIndicator size="small" color={theme.colors.accentBlue} style={{ marginTop: 20 }} />
        ) : (
          searchResults.map((res, i) => (
            <View key={i} style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }}>
              <TouchableOpacity 
                style={{ padding: 12, backgroundColor: theme.colors.bgElevated }}
                onPress={() => {
                  router.setParams({ openFile: res.path, t: Date.now().toString() });
                  onClose();
                }}
              >
                <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.uiBold, fontSize: 13 }}>{res.name}</Text>
                <Text style={{ color: theme.colors.textSecondary, fontFamily: theme.typography.ui, fontSize: 11, marginTop: 4 }}>{res.path}</Text>
              </TouchableOpacity>
              {res.matches && res.matches.length > 0 && res.matches.map((m, j) => (
                <TouchableOpacity
                  key={j}
                  style={{ paddingVertical: 6, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, backgroundColor: theme.colors.bgSurface }}
                  onPress={() => {
                     // We pass the file path to open the file. 
                     // Advanced: passing a specific line to focus (requires editor support).
                     router.setParams({ openFile: res.path, t: Date.now().toString() });
                     onClose();
                  }}
                >
                  <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.ui, fontSize: 11 }} numberOfLines={1}>
                    <Text style={{ color: theme.colors.accentBlue }}>{m.line}:</Text> {m.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );

  const renderGit = () => (
    <View style={styles.panelContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SOURCE CONTROL</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={loadGitChanges} disabled={isCheckingGit}>
            <Icon name="RefreshCw" size={14} color={isCheckingGit ? theme.colors.border : theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {githubUser ? (
          projectInfo?.githubRepo ? (
            <View style={{ flex: 1, padding: 12 }}>
              <TextInput 
                style={[styles.searchInput, { height: 60, textAlignVertical: 'top', padding: 8, marginBottom: 12 }]}
                value={commitMessage}
                onChangeText={setCommitMessage}
                placeholder="Message (Commit & Push)"
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
                  <Text style={{ color: '#FFF', fontFamily: theme.typography.uiBold, fontSize: 13 }}>Commit & Push</Text>
                )}
              </TouchableOpacity>

              <View style={[styles.resultsHeader, { marginTop: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                <View>
                  <Text style={styles.resultsTitle}>CHANGES</Text>
                </View>
              </View>

              {isCheckingGit ? (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={theme.colors.accentBlue} />
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 8 }}>Buscando alterações...</Text>
                </View>
              ) : (
                <ScrollView style={{ flex: 1 }}>
                  {changedFiles.map((file, i) => {
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
                  {changedFiles.length === 0 && (
                    <Text style={{ color: theme.colors.textSecondary, fontFamily: theme.typography.ui, fontSize: 13, marginTop: 16, textAlign: 'center' }}>
                      Nenhuma alteração detectada.
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
                Este projeto ainda não está vinculado ao Source Control.
              </Text>
              
              <TouchableOpacity 
                style={{ backgroundColor: theme.colors.accentTeal, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, marginBottom: 12, width: '100%', alignItems: 'center' }} 
                onPress={() => handleOpenRepos('link')}
              >
                <Text style={{ color: '#FFF', fontFamily: theme.typography.uiBold, fontSize: 13 }}>Vincular a um Repositório</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={{ backgroundColor: theme.colors.accentBlue, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, width: '100%', alignItems: 'center' }} 
                onPress={() => handleOpenRepos('clone')}
              >
                <Text style={{ color: '#FFF', fontFamily: theme.typography.uiBold, fontSize: 13 }}>Clonar Outro Repositório</Text>
              </TouchableOpacity>
            </View>
          )
        ) : (
          <View style={{ padding: 16, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <Icon name="GitBranch" size={64} color={theme.colors.border} style={{ marginBottom: 16 }} />
            <Text style={{ color: theme.colors.textSecondary, fontFamily: theme.typography.ui, textAlign: 'center', fontSize: 13, marginBottom: 16 }}>
              Para usar os recursos de Source Control, conecte sua conta do GitHub no menu principal.
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  // AI tab removed

  const renderTerminal = () => (
    <View style={styles.panelContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>TERMINAL</Text>
      </View>
      <View style={{ padding: 12 }}>
        <Text style={{ color: theme.colors.textSecondary, fontFamily: theme.typography.mono, fontSize: 12 }}>
          {'>'} cd project{'\n'}
          Ready.
        </Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Activity Bar (Top) */}
      <View style={styles.activityBar}>
        <TouchableOpacity style={styles.activityTab} onPress={() => {
          onClose();
          router.replace('/');
        }}>
          <Icon name="Home" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.activityTab} onPress={() => setActiveTab('files')}>
          <Icon name="Files" size={22} color={activeTab === 'files' ? theme.colors.textPrimary : theme.colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.activityTab} onPress={() => setActiveTab('search')}>
          <Icon name="Search" size={22} color={activeTab === 'search' ? theme.colors.textPrimary : theme.colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.activityTab} onPress={() => setActiveTab('git')}>
          <View>
            <Icon name="GitBranch" size={22} color={activeTab === 'git' ? theme.colors.textPrimary : theme.colors.textSecondary} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.activityTab} onPress={() => setActiveTab('terminal')}>
          <Icon name="Terminal" size={22} color={activeTab === 'terminal' ? theme.colors.textPrimary : theme.colors.textSecondary} />
        </TouchableOpacity>
        
        <View style={{ flex: 1 }} />
      </View>

      {/* Side Panel (Content) */}
      <View style={styles.panelContent}>
        {activeTab === 'files' && renderFiles()}
        {activeTab === 'search' && renderSearch()}
        {activeTab === 'git' && renderGit()}
        {activeTab === 'terminal' && renderTerminal()}
      </View>

      {/* GitHub Repos Modal */}
      <Modal visible={showRepoModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: theme.colors.bgElevated, borderRadius: 12, maxHeight: '80%', overflow: 'hidden' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: theme.colors.textPrimary, fontFamily: theme.typography.uiBold, fontSize: 16 }}>
                {repoModalMode === 'link' ? 'Vincular Repositório' : 'Clonar Repositório'}
              </Text>
              <TouchableOpacity onPress={() => setShowRepoModal(false)}>
                <Icon name="X" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            {repoModalMode === 'link' && (
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                <Text style={{ color: theme.colors.textSecondary, fontFamily: theme.typography.uiBold, fontSize: 12, marginBottom: 8 }}>CRIAR NOVO NO GITHUB</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextInput 
                    style={{ flex: 1, backgroundColor: theme.colors.bgPrimary, color: theme.colors.textPrimary, padding: 8, borderRadius: 6, fontFamily: theme.typography.ui, borderWidth: 1, borderColor: theme.colors.border }}
                    placeholder="Nome do repositório"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={newRepoName}
                    onChangeText={setNewRepoName}
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
  activityBar: {
    flexDirection: 'row',
    height: 48,
    backgroundColor: theme.colors.bgSurface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  activityTab: {
    padding: 10,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: 4,
    height: 32,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    fontSize: 13,
    paddingHorizontal: 8,
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
  createInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 8,
    backgroundColor: theme.colors.bgElevated,
  },
  createInput: {
    flex: 1,
    marginLeft: 8,
    fontFamily: theme.typography.mono,
    fontSize: 13,
    color: theme.colors.textPrimary,
    height: 24,
    padding: 0,
  }
});
