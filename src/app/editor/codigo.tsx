import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, PanResponder, Dimensions, Animated, ActivityIndicator, KeyboardAvoidingView, Keyboard, TextInput, ScrollView } from 'react-native';
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
  const editorRef = useRef<any>(null);
  
  const [isPreview, setIsPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewUrl, setPreviewUrl] = useState('http://localhost:3000');
  const [consoleLogs, setConsoleLogs] = useState<{type: string, text: string}[]>([]);
  const [networkLogs, setNetworkLogs] = useState<any[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [activeConsoleTab, setActiveConsoleTab] = useState<'console' | 'network'>('console');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const previewWebViewRef = useRef<any>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [originalCode, setOriginalCode] = useState('');

  const insets = useSafeAreaInsets();
  
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [isGoToLineVisible, setIsGoToLineVisible] = useState(false);
  const [goToLineText, setGoToLineText] = useState('');
  const isLiveSync = projectInfo?.name === 'LiveSync Workspace';

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

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
      setTimeout(() => {
        terminalSheetRef.current?.snapToIndex(1);
        const type = params.templateType as string;
        if (type === 'react') {
          terminalSheetRef.current?.runCommand(`npx -y create-vite-app@latest ./ --template react && npm install`);
        } else if (type === 'node') {
          terminalSheetRef.current?.runCommand(`npm init -y && npm install express dotenv cors mongoose`);
        }
      }, 1000);
    }
  }, [params.isNewProject, params.templateType]);

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

    setConsoleLogs([]);
    setIsConsoleOpen(false);
    setIsPreview(true);
  };

  const activeTabDetails = tabs.find(t => t.id === activeTab);

  const renderEditor = () => (
      <View style={{ flex: 1 }}>
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

              <TouchableOpacity style={styles.actionBtn} onPress={() => router.push({ pathname: '/ai-panel', params: { projectId } })}>
                <Icon name="Sparkles" size={18} color={theme.colors.accentPurple} outline={false} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { paddingRight: 16 }]} onPress={handlePlay}>
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
              onChangeCode={setCode} 
            />
          ) : (
            <View style={styles.emptyEditor}>
              <Icon name="Code" size={48} color={theme.colors.border} />
              <Text style={styles.emptyEditorText}>Nenhum arquivo aberto</Text>
              <Text style={styles.emptyEditorSub}>Abra a barra lateral para explorar os arquivos do projeto.</Text>
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
      </View>
  );

  const renderPreview = () => (
      <View style={[styles.previewContainer, { flex: 1 }]}>
          <View style={[styles.browserBar, { paddingTop: insets.top, height: 44 + insets.top }]}>
            <TouchableOpacity onPress={() => { setIsPreview(false); setIsConsoleOpen(false); }} style={{ padding: 8 }}>
              <Icon name="X" size={20} color={theme.colors.textPrimary} />
            </TouchableOpacity>
            
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity 
                style={[styles.actionBtn, !canGoBack && { opacity: 0.5 }]} 
                disabled={!canGoBack}
                onPress={() => previewWebViewRef.current?.goBack()}
              >
                <Icon name="ArrowLeft" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.actionBtn, !canGoForward && { opacity: 0.5 }]} 
                disabled={!canGoForward}
                onPress={() => previewWebViewRef.current?.goForward()}
              >
                <Icon name="ArrowRight" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => previewWebViewRef.current?.reload()}>
                <Icon name="RotateCw" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.urlBox}>
              <Icon name="Lock" size={12} color={theme.colors.textSecondary} />
              <TextInput 
                style={styles.url}
                value={previewUrl.replace(/^https?:\/\//, '')}
                onChangeText={(text) => setPreviewUrl(text)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onSubmitEditing={() => {
                  setPreviewHtml('');
                  let finalUrl = previewUrl;
                  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
                    finalUrl = 'http://' + finalUrl;
                  }
                  setPreviewUrl(finalUrl);
                }}
              />
            </View>
            <TouchableOpacity onPress={() => setIsConsoleOpen(!isConsoleOpen)} style={{ padding: 8, paddingRight: 16 }}>
              <Icon name="Terminal" size={18} color={isConsoleOpen ? theme.colors.accentTeal : theme.colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            {Platform.OS === 'web' ? (
              <iframe
                src={previewHtml ? undefined : previewUrl}
                srcDoc={previewHtml || undefined}
                style={{ flex: 1, border: 'none', width: '100%', height: '100%' }}
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <WebView
                ref={previewWebViewRef}
                source={previewHtml ? { html: previewHtml, baseUrl: previewUrl } : { uri: previewUrl }}
                style={{ flex: 1 }}
                originWhitelist={['*']}
                javaScriptEnabled={true}
                onNavigationStateChange={(navState) => {
                  setCanGoBack(navState.canGoBack);
                  setCanGoForward(navState.canGoForward);
                  if (navState.url && navState.url !== 'about:blank' && !navState.url.startsWith('file://')) {
                    setPreviewUrl(navState.url);
                  }
                }}
                injectedJavaScript={`
                  (function() {
                    var origLog = console.log; var origError = console.error; var origWarn = console.warn; var origInfo = console.info;
                    function sendConsole(type, args) {
                      try {
                        var text = Array.prototype.slice.call(args).map(function(a) {
                          if (typeof a === 'object') return JSON.stringify(a, null, 2);
                          return String(a);
                        }).join(' ');
                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CONSOLE', level: type, text: text }));
                      } catch(e) {}
                    }
                    console.log = function() { sendConsole('log', arguments); origLog.apply(console, arguments); };
                    console.error = function() { sendConsole('error', arguments); origError.apply(console, arguments); };
                    console.warn = function() { sendConsole('warn', arguments); origWarn.apply(console, arguments); };
                    console.info = function() { sendConsole('info', arguments); origInfo.apply(console, arguments); };
                    window.onerror = function(msg, src, line, col, err) { sendConsole('error', [msg + ' (line ' + line + ')']); };

                    var originalFetch = window.fetch;
                    window.fetch = function() {
                      var args = arguments;
                      var startTime = Date.now();
                      var id = Math.random().toString(36).substring(7);
                      var method = 'GET'; var url = args[0];
                      if (args[1] && args[1].method) method = args[1].method.toUpperCase();
                      if (typeof url === 'object' && url.url) { url = url.url; method = url.method || 'GET'; }
                      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'NETWORK_START', id: id, method: method, url: typeof url === 'string' ? url : String(url) }));
                      return originalFetch.apply(this, arguments).then(function(res) {
                        var clone = res.clone();
                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'NETWORK_END', id: id, status: res.status, time: Date.now() - startTime, size: clone.headers.get('content-length') || 0 }));
                        return res;
                      }).catch(function(err) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'NETWORK_END', id: id, status: 0, time: Date.now() - startTime, size: 0, error: err.message }));
                        throw err;
                      });
                    };

                    var XHR = window.XMLHttpRequest;
                    window.XMLHttpRequest = function() {
                      var xhr = new XHR();
                      var startTime; var id = Math.random().toString(36).substring(7);
                      var reqMethod = 'GET'; var reqUrl = '';
                      var open = xhr.open;
                      xhr.open = function(method, url) { reqMethod = method.toUpperCase(); reqUrl = url; open.apply(xhr, arguments); };
                      var send = xhr.send;
                      xhr.send = function() {
                        startTime = Date.now();
                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'NETWORK_START', id: id, method: reqMethod, url: reqUrl }));
                        send.apply(xhr, arguments);
                      };
                      xhr.addEventListener('load', function() {
                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'NETWORK_END', id: id, status: xhr.status, time: Date.now() - startTime, size: xhr.getResponseHeader('content-length') || (xhr.responseText ? xhr.responseText.length : 0) }));
                      });
                      xhr.addEventListener('error', function() {
                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'NETWORK_END', id: id, status: xhr.status, time: Date.now() - startTime, size: 0, error: 'XHR Error' }));
                      });
                      return xhr;
                    };
                  })();
                  true;
                `}
                onMessage={(event: any) => {
                  try {
                    const msg = JSON.parse(event.nativeEvent.data);
                    if (msg.type === 'CONSOLE') {
                      setConsoleLogs(prev => [...prev.slice(-200), { type: msg.level, text: msg.text }]);
                    } else if (msg.type === 'NETWORK_START') {
                      setNetworkLogs(prev => [...prev.slice(-100), { id: msg.id, method: msg.method, url: msg.url, status: '...' }]);
                    } else if (msg.type === 'NETWORK_END') {
                      setNetworkLogs(prev => prev.map(log => log.id === msg.id ? { ...log, status: msg.status, time: msg.time, size: msg.size, error: msg.error } : log));
                    }
                  } catch(e) {}
                }}
              />
            )}
          </View>
          {/* Console Panel */}
          {isConsoleOpen && (
            <Animated.View
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: terminalHeight,
                backgroundColor: theme.colors.bgPrimary,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.colors.border,
                zIndex: 100,
              }}
            >
              <View {...panResponder.panHandlers} style={styles.resizerHandle}>
                 <View style={styles.resizerDash} />
              </View>
              <View style={{ flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }}>
                <TouchableOpacity onPress={() => setActiveConsoleTab('console')} style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: activeConsoleTab === 'console' ? theme.colors.textPrimary : 'transparent' }}>
                  <Text style={{ fontFamily: theme.typography.ui, fontSize: 13, color: activeConsoleTab === 'console' ? theme.colors.textPrimary : theme.colors.textSecondary }}>Console</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setActiveConsoleTab('network')} style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: activeConsoleTab === 'network' ? theme.colors.textPrimary : 'transparent' }}>
                  <Text style={{ fontFamily: theme.typography.ui, fontSize: 13, color: activeConsoleTab === 'network' ? theme.colors.textPrimary : theme.colors.textSecondary }}>Network</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => { activeConsoleTab === 'console' ? setConsoleLogs([]) : setNetworkLogs([]); }} style={{ padding: 10 }}>
                  <Icon name="Trash2" size={14} color={theme.colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsConsoleOpen(false)} style={{ padding: 10 }}>
                  <Icon name="X" size={16} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
              
              {activeConsoleTab === 'console' && (
                <ScrollView style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
                  {consoleLogs.length === 0 ? (
                    <Text style={{ fontFamily: theme.typography.mono, fontSize: 12, color: theme.colors.textSecondary, opacity: 0.5, padding: 12 }}>No logs yet...</Text>
                  ) : (
                    consoleLogs.map((log, i) => (
                      <View key={i} style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, backgroundColor: log.type === 'error' ? 'rgba(255, 69, 58, 0.1)' : log.type === 'warn' ? 'rgba(255, 214, 10, 0.1)' : 'transparent' }}>
                        <Icon name={log.type === 'error' ? 'XCircle' : log.type === 'warn' ? 'AlertTriangle' : 'ChevronRight'} size={14} color={log.type === 'error' ? '#FF453A' : log.type === 'warn' ? '#FFD60A' : theme.colors.textSecondary} />
                        <Text style={{ fontFamily: theme.typography.mono, fontSize: 12, color: log.type === 'error' ? '#FF453A' : log.type === 'warn' ? '#FFD60A' : theme.colors.textPrimary, marginLeft: 8, flex: 1 }}>{log.text}</Text>
                      </View>
                    ))
                  )}
                </ScrollView>
              )}
              {activeConsoleTab === 'network' && (
                <ScrollView style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
                  {networkLogs.length === 0 ? (
                    <Text style={{ fontFamily: theme.typography.mono, fontSize: 12, color: theme.colors.textSecondary, opacity: 0.5, padding: 12 }}>No network requests yet...</Text>
                  ) : (
                    networkLogs.map((log, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }}>
                        <Text style={{ fontFamily: theme.typography.mono, fontSize: 11, fontWeight: 'bold', width: 45, color: log.status >= 400 || log.status === 0 ? '#FF453A' : theme.colors.textPrimary }}>{log.method}</Text>
                        <Text style={{ fontFamily: theme.typography.mono, fontSize: 11, color: log.status >= 400 || log.status === 0 ? '#FF453A' : log.status === 200 ? '#32D74B' : theme.colors.textSecondary, width: 40 }}>{log.status}</Text>
                        <Text style={{ fontFamily: theme.typography.mono, fontSize: 11, color: theme.colors.textPrimary, flex: 1 }} numberOfLines={1} ellipsizeMode="tail">{log.url}</Text>
                        {log.time !== undefined && <Text style={{ fontFamily: theme.typography.mono, fontSize: 11, color: theme.colors.textSecondary, width: 50, textAlign: 'right' }}>{log.time}ms</Text>}
                      </View>
                    ))
                  )}
                </ScrollView>
              )}
            </Animated.View>
          )}
        </View>
  );

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { paddingBottom: Platform.OS === 'ios' ? insets.bottom : 0 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {isPreview ? renderPreview() : renderEditor()}
      
      <TerminalSheet 
        ref={terminalSheetRef}
        projectId={projectId}
        visible={!isPreview}
      />
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
    paddingRight: 4,
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
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgSurface,
    marginHorizontal: 12,
    height: 36,
    borderRadius: 6,
    overflow: 'hidden',
  },
  url: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    paddingVertical: 0,
    fontFamily: theme.typography.sans,
    fontSize: 14,
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

});