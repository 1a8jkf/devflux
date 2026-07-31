import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, PanResponder, Dimensions, Animated, ActivityIndicator } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { CodeTabs } from '../../components/CodeTabs';
import { CodeEditorMock } from '../../components/CodeEditorMock';
import { TerminalSheet, TerminalSheetRef } from '../../components/TerminalSheet';
import { Icon } from '../../components/Icon';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { useCommandPalette } from '../../contexts/CommandPaletteContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileSystemService, FileNode, ProjectInfo } from '../../services/FileSystemService';
import { WebView } from 'react-native-webview';
import { Platform } from 'react-native';

interface OpenTab {
  id: string; // The file path
  name: string; // The file name
  type: 'html' | 'css' | 'js' | 'jsx' | 'json' | 'markdown';
}

export default function CodigoScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);

  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const projectId = params.projectId as string;
  const openFilePath = params.openFile as string;

  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTabState] = useState('');
  const activeTabRef = useRef('');

  const setActiveTab = (tab: string) => {
    activeTabRef.current = tab;
    setActiveTabState(tab);
  };

  const [code, setCode] = useState('');
  const terminalSheetRef = useRef<TerminalSheetRef>(null);
  
  const [isPreview, setIsPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [isBooting, setIsBooting] = useState(false);
  const [bootStep, setBootStep] = useState(0);
  const insets = useSafeAreaInsets();
  
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);

  useEffect(() => {
    if (projectId) {
      FileSystemService.getProjects().then(projs => {
        const p = projs.find(p => p.id === projectId);
        if (p) setProjectInfo(p as ProjectInfo);
      });
    }
  }, [projectId]);

  useEffect(() => {
    if (params.isNewProject === 'true') {
      terminalSheetRef.current?.snapToIndex(1);
    }
  }, [params.isNewProject]);

  useEffect(() => {
    const parent = navigation.getParent();
    if (parent) {
      parent.setOptions({ headerShown: false });
    }
    return () => {
      if (parent) {
        parent.setOptions({ headerShown: true });
      }
    };
  }, [navigation]);

  // Load initial files or open new file from params
  useEffect(() => {
    if (!projectId) return;

    if (openFilePath) {
      const fileName = openFilePath.split('/').pop() || openFilePath;
      const extension = fileName.split('.').pop()?.toLowerCase() || 'txt';
      
      let type: OpenTab['type'] = 'js';
      if (['html', 'css', 'js', 'jsx', 'json', 'markdown'].includes(extension)) {
        type = extension as OpenTab['type'];
      }

      const openInitial = async () => {
        setTabs(prev => {
          if (!prev.find(t => t.id === openFilePath)) {
            return [...prev, { id: openFilePath, name: fileName, type }];
          }
          return prev;
        });

        // Force request if LiveSync is active
        import('../../services/LiveSyncService').then(({ LiveSyncService }) => {
          if (LiveSyncService.ws && LiveSyncService.ws.readyState === 1) {
            LiveSyncService.requestRemoteFile(openFilePath);
          }
        });

        setActiveTab(openFilePath);
      };
      openInitial();
    } else if (tabs.length === 0) {
      const openInitial = async () => {
        try {
          const tree = await FileSystemService.getProjectFileTree(projectId);
          const getFirstFile = (nodes: FileNode[]): FileNode | null => {
            for (const node of nodes) {
              if (node.type === 'file') {
                return node;
              } else if (node.children) {
                const found = getFirstFile(node.children);
                if (found) return found;
              }
            }
            return null;
          };
          
          const firstFile = getFirstFile(tree);

          if (firstFile) {
            const fileName = firstFile.name;
            const extension = fileName.split('.').pop()?.toLowerCase() || 'txt';
            let type: OpenTab['type'] = 'js';
            if (['html', 'css', 'js', 'jsx', 'json', 'markdown'].includes(extension)) {
              type = extension as OpenTab['type'];
            }
            setTabs([{ id: firstFile.path, name: fileName, type }]);
            setActiveTab(firstFile.path);
          }
        } catch(e) {
          console.error("Failed to load initial file", e);
        }
      };
      openInitial();
    }
  }, [projectId, openFilePath]);

  // Reset state when project changes
  useEffect(() => {
    if (projectId) {
      setTabs([]);
      setActiveTab('');
      setCode('');
      setOriginalCode('');
    }
  }, [projectId]);

  // Load active tab content
  useEffect(() => {
    if (!projectId || !activeTab) return;

    let isMounted = true;
    setCode(''); // Clear old code while loading
    setOriginalCode('');

    // First try to load locally (for downloaded files or normal projects)
    FileSystemService.readFile(projectId, activeTab)
      .then(content => {
        if (isMounted) {
          setCode(content);
          setOriginalCode(content); // Ensure original code is set for diff comparison
        }
      })
      .catch(err => {
        // Ignore local read errors, it will be fetched from PC if LiveSync
      });

    // Always request from PC if it's LiveSync, as the PC is the source of truth
    if (isLiveSync) {
      import('../../services/LiveSyncService').then(({ LiveSyncService }) => {
        if (LiveSyncService.ws && LiveSyncService.ws.readyState === 1) {
          LiveSyncService.requestRemoteFile(activeTab);
        }
      });
    }
  }, [projectId, activeTab, isLiveSync]);

  // Listen for remote file content globally
  useEffect(() => {
    let isMounted = true;
    let unsubscribe: () => void;
    import('../../services/LiveSyncService').then(({ LiveSyncService }) => {
      const oldHandler = LiveSyncService.onRemoteFileContent;
      LiveSyncService.onRemoteFileContent = (path: string, content: string) => {
        if (isMounted && path === activeTabRef.current) {
          setCode(content);
        }
        if (oldHandler) oldHandler(path, content);
      };
      
      const oldTreeHandler = LiveSyncService.onRemoteTreeUpdate;
      LiveSyncService.onRemoteTreeUpdate = (paths: string[]) => {
        if (isMounted && activeTabRef.current && LiveSyncService.ws && LiveSyncService.ws.readyState === 1) {
          LiveSyncService.requestRemoteFile(activeTabRef.current);
        }
        if (oldTreeHandler) oldTreeHandler(paths);
      };
      
      unsubscribe = () => { 
        LiveSyncService.onRemoteFileContent = oldHandler; 
        LiveSyncService.onRemoteTreeUpdate = oldTreeHandler;
      };
    });

    return () => { 
      isMounted = false; 
      if (unsubscribe) unsubscribe();
    };
  }, [projectId]);



  const handleTabClose = (id: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== id);
      if (activeTabRef.current === id && newTabs.length > 0) {
        const nextId = newTabs[newTabs.length - 1].id;
        setActiveTab(nextId);
        router.setParams({ openFile: nextId });
      } else if (newTabs.length === 0) {
        setActiveTab('');
        setCode('');
        router.setParams({ openFile: '' });
      }
      return newTabs;
    });
  };
  
  const terminalHeight = useRef(new Animated.Value(24)).current;
  const lastHeight = useRef(24);
  
  const { openPalette } = useCommandPalette();

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // @ts-ignore
        lastHeight.current = terminalHeight._value;
      },
      onPanResponderMove: (_, gestureState) => {
        let newHeight = lastHeight.current - gestureState.dy;
        if (newHeight < 24) newHeight = 24;
        if (newHeight > 600) newHeight = 600;
        terminalHeight.setValue(newHeight);
      }
    })
  ).current;

  const handlePlay = async () => {
    setIsBooting(true);
    setBootStep(0);
    
    // Simulate WebContainer Boot Steps
    setTimeout(() => setBootStep(1), 500);
    setTimeout(() => setBootStep(2), 1000);
    setTimeout(() => setBootStep(3), 1500);

    // Bundle HTML/CSS/JS for preview
    try {
      const html = await FileSystemService.readFile(projectId, 'index.html').catch(() => '<h1>index.html not found</h1>');
      const css = await FileSystemService.readFile(projectId, 'style.css').catch(() => '');
      const js = await FileSystemService.readFile(projectId, 'script.js').catch(() => '');

      // Inject CSS and JS into HTML
      const injectedHtml = html
        .replace('</head>', `<style>${css}</style></head>`)
        .replace('</body>', `<script>${js}</script></body>`);
        
      setPreviewHtml(injectedHtml);
    } catch (e) {
      console.error(e);
      setPreviewHtml('<h1>Error loading preview</h1>');
    }

    setTimeout(() => {
      setIsBooting(false);
      setIsPreview(true);
    }, 2000);
  };

  const activeTabDetails = tabs.find(t => t.id === activeTab);

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { paddingBottom: Platform.OS === 'ios' ? insets.bottom : 0 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {!isPreview ? (
        <>
          <View style={[styles.editorHeader, { paddingTop: insets.top, height: 44 + insets.top }]}>
            <TouchableOpacity 
              style={styles.menuBtn}
              onPress={() => {
                const nav = navigation as any;
                if (nav.toggleDrawer) nav.toggleDrawer();
                else if (nav.openDrawer) nav.openDrawer();
                else if (nav.getParent && nav.getParent()?.openDrawer) nav.getParent().openDrawer();
              }}
            >
              <Icon name="MoreVertical" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => editorRef.current?.undo()}>
                <Icon name="Undo" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => editorRef.current?.redo()}>
                <Icon name="Redo" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => {
                if (projectId && activeTab) {
                  import('../../services/FileSystemService').then(({ FileSystemService }) => {
                    FileSystemService.writeFile(projectId, activeTab, code).catch(e => console.error(e));
                  });
                  import('../../services/LiveSyncService').then(({ LiveSyncService }) => {
                    if (LiveSyncService.ws && LiveSyncService.ws.readyState === 1) {
                      LiveSyncService.sendFileUpdate(activeTab, code);
                      LiveSyncService.requestSaveFile(activeTab);
                    }
                  });
                }
              }}>
                <Icon name="Save" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={openPalette}>
                <Icon name="Search" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/bridge')}>
                <Icon name="Cloud" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => router.push({ pathname: '/ai-panel', params: { projectId } })}>
                <Icon name="Sparkles" size={18} color={theme.colors.accentPurple} outline={false} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={handlePlay}>
                <Icon name="Play" size={18} color={theme.colors.accentTeal} outline={false} />
              </TouchableOpacity>
            </View>
          </View>

          <CodeTabs 
            tabs={tabs} 
            activeTabId={activeTab} 
            onTabPress={setActiveTab} 
            onTabClose={handleTabClose} 
          />
          {activeTab ? (
            <CodeEditorMock 
              code={code} 
              language={activeTabDetails?.type || 'js'} 
              onChangeCode={handleCodeChange} 
            />
          ) : (
            <View style={styles.emptyEditor}>
              <Icon name="Code" size={48} color={theme.colors.border} />
              <Text style={styles.emptyEditorText}>Nenhum arquivo aberto</Text>
              <Text style={styles.emptyEditorSub}>Abra a barra lateral para explorar os arquivos do projeto.</Text>
            </View>
          )}
          
          <TerminalSheet 
            ref={terminalSheetRef}
            projectId={projectId}
            githubRepo={projectInfo?.githubRepo}
            onStartDevServer={handlePlay}
            onFileSystemChange={() => {
              // Reload files if npm install happened
              FileSystemService.getProjectFileTree(projectId).then(tree => {
                // Not ideal, but force re-render via active tab or something
                setTabs([...tabs]);
              });
            }}
          />

          {isBooting && (
            <View style={styles.bootOverlay}>
              <View style={styles.bootCard}>
                <ActivityIndicator size="large" color={theme.colors.accentBlue} style={{ marginBottom: 16 }} />
                <Text style={styles.bootTitle}>DevFlux Build Engine</Text>
                
                <View style={styles.bootSteps}>
                  <Text style={[styles.bootStep, bootStep >= 0 && styles.bootStepActive]}>
                    <Icon name={bootStep > 0 ? "CheckCircle" : "Loader"} size={12} color={bootStep > 0 ? theme.colors.accentTeal : theme.colors.textSecondary} /> 
                    {' '}Inicializando ambiente v8...
                  </Text>
                  <Text style={[styles.bootStep, bootStep >= 1 && styles.bootStepActive, bootStep < 1 && styles.bootStepHidden]}>
                    <Icon name={bootStep > 1 ? "CheckCircle" : "Loader"} size={12} color={bootStep > 1 ? theme.colors.accentTeal : theme.colors.textSecondary} /> 
                    {' '}Montando sistema de arquivos (Proot)...
                  </Text>
                  <Text style={[styles.bootStep, bootStep >= 2 && styles.bootStepActive, bootStep < 2 && styles.bootStepHidden]}>
                    <Icon name={bootStep > 2 ? "CheckCircle" : "Loader"} size={12} color={bootStep > 2 ? theme.colors.accentTeal : theme.colors.textSecondary} /> 
                    {' '}Instalando dependências (npm)...
                  </Text>
                  <Text style={[styles.bootStep, bootStep >= 3 && styles.bootStepActive, bootStep < 3 && styles.bootStepHidden]}>
                    <Icon name="Terminal" size={12} color={theme.colors.accentBlue} /> 
                    {' '}Iniciando servidor de desenvolvimento...
                  </Text>
                </View>
              </View>
            </View>
          )}

          {isGoToLineVisible && (
            <View style={styles.goToLineContainer}>
               <TextInput 
                  style={styles.goToLineInput}
                  placeholder="Ir para linha (ex: 42)"
                  keyboardType="numeric"
                  placeholderTextColor={theme.colors.border}
                  value={goToLineText}
                  onChangeText={setGoToLineText}
                  autoFocus
                  onSubmitEditing={() => {
                     const line = parseInt(goToLineText, 10);
                     if (!isNaN(line) && editorRef.current && (editorRef.current as any).handleToolbarAction) {
                        (editorRef.current as any).handleToolbarAction('gotoLine', line);
                     }
                     setIsGoToLineVisible(false);
                     setGoToLineText("");
                  }}
                  onBlur={() => { setIsGoToLineVisible(false); setGoToLineText(""); }}
               />
            </View>
          )}
        </>
      ) : (
        <View style={styles.previewContainer}>
          <View style={[styles.browserBar, { paddingTop: insets.top, height: 44 + insets.top }]}>
            <TouchableOpacity onPress={() => setIsPreview(false)} style={{ padding: 8 }}>
              <Icon name="ChevronLeft" size={20} color={theme.colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.urlBox}>
              <Icon name="Lock" size={12} color={theme.colors.accentTeal} />
              <TextInput 
                style={styles.url}
                value={previewUrl.replace('http://', '').replace('https://', '')}
                onChangeText={(text) => setPreviewUrl(text.startsWith('http') ? text : 'http://' + text)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onSubmitEditing={() => {
                  // To trigger a reload, we can momentarily clear the URL or we can rely on the user tapping the refresh button
                }}
              />
            </View>
            <TouchableOpacity onPress={() => setPreviewUrl(previewUrl + '#reload=' + Date.now())}>
              <Icon name="RotateCw" size={14} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </View>
          {Platform.OS === 'web' ? (
            <iframe
              srcDoc={previewHtml}
              style={{ flex: 1, border: 'none', width: '100%', height: '100%' }}
              sandbox="allow-scripts allow-same-origin"
            />
          ) : (
            <WebView
              source={{ html: previewHtml }}
              style={{ flex: 1 }}
              originWhitelist={['*']}
              javaScriptEnabled={true}
            />
          )}
        </View>
      )}
      {Platform.OS !== 'ios' && <View style={{ height: isKeyboardVisible ? 0 : insets.bottom, backgroundColor: theme.colors.bgElevated }} />}
    </KeyboardAvoidingView>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  menuBtn: {
    padding: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 8,
    marginLeft: 4,
  },
  emptyEditor: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgSurface,
  },
  emptyEditorText: {
    fontFamily: theme.typography.ui,
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: 16,
  },
  emptyEditorSub: {
    fontFamily: theme.typography.ui,
    fontSize: 13,
    color: theme.colors.border,
    marginTop: 8,
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  browserBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  urlBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgSurface,
    marginHorizontal: 12,
    height: 28,
    borderRadius: 6,
  },
  url: {
    fontFamily: theme.typography.sans,
    fontSize: 13,
    color: theme.colors.textPrimary,
    marginLeft: 6,
  },
  webviewMock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitle: {
    fontFamily: theme.typography.ui,
    fontSize: 24,
    color: '#1E1E1E',
    marginBottom: 8,
  },
  previewDesc: {
    fontFamily: theme.typography.sans,
    fontSize: 16,
    color: '#666666',
  },
  resizerHandle: {
    height: 24,
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  } as any,
  resizerDash: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  bootOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  bootCard: {
    backgroundColor: theme.colors.bgElevated,
    padding: 24,
    borderRadius: 16,
    width: '80%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  bootTitle: {
    fontFamily: theme.typography.sansBold,
    fontSize: 18,
    color: theme.colors.textPrimary,
    marginBottom: 20,
    textAlign: 'center',
  },
  bootSteps: {
    marginTop: 8,
  },
  bootStep: {
    fontFamily: theme.typography.sans,
    fontSize: 13,
    color: theme.colors.textPrimary,
    marginBottom: 12,
    opacity: 0.5,
  },
  bootStepActive: {
    opacity: 1,
  },
  bootStepHidden: {
    opacity: 0,
  },
});