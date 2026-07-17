import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  DeviceEventEmitter,
  Alert,
  KeyboardAvoidingView,
  Keyboard
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useKeepAwake } from "expo-keep-awake";
import { CodeTabs } from "../../components/CodeTabs";
import { Icon } from "../../components/Icon";
import { MonacoEditor, MonacoEditorRef } from "../../components/MonacoEditor";
import { KeyboardToolbar } from "../../components/KeyboardToolbar";
import { BundlerWebView } from "../../components/BundlerWebView";
import { BundlerEngine } from "../../services/BundlerEngine";
import {
  TerminalSheet,
  TerminalSheetRef,
} from "../../components/TerminalSheet";
import { useCommandPalette } from "../../contexts/CommandPaletteContext";
import { useAppTheme } from "../../contexts/ThemeContext";
import {
  FileNode,
  FileSystemService,
  ProjectInfo,
} from "../../services/FileSystemService";
import { LiveSyncService } from "../../services/LiveSyncService";
import { AppTheme } from "../../theme";

interface OpenTab {
  id: string; // The file path
  name: string; // The file name
  type: "html" | "css" | "js" | "jsx" | "json" | "markdown";
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
  const [activeTab, setActiveTab] = useState("");
  const [code, setCode] = useState("");
  const [originalCode, setOriginalCode] = useState("");
  const terminalSheetRef = useRef<TerminalSheetRef>(null);

  const [isPreview, setIsPreview] = useState(false);
  const [gitUrl, setGitUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const kShow = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const kHide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
       kShow.remove();
       kHide.remove();
    };
  }, []);
  const [bootStep, setBootStep] = useState(0);
  const [isBooting, setIsBooting] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");

  const editorRef = useRef<MonacoEditorRef>(null);

  const insets = useSafeAreaInsets();
  useKeepAwake();

  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  
  const [isGoToLineVisible, setIsGoToLineVisible] = useState(false);
  const [goToLineText, setGoToLineText] = useState("");

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('triggerGoToLine', () => {
       setIsGoToLineVisible(true);
    });
    return () => sub.remove();
  }, []);

  // LiveSync: detect if this is a LiveSync project where remote is host
  const [liveSyncProjectId, setLiveSyncProjectId] = useState<string | null>(
    null,
  );
  const isLiveSyncAndNotHost =
    projectId != null && liveSyncProjectId === projectId;

  useEffect(() => {
    import("../../services/LiveSyncService").then(({ LiveSyncService }) => {
      setLiveSyncProjectId(LiveSyncService.syncProjectId);
    });
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      FileSystemService.getProjects().then((projs) => {
        const p = projs.find((p) => p.id === projectId);
        if (p) setProjectInfo(p as ProjectInfo);
      });
    }
  }, [projectId]);

  useEffect(() => {
    if (params.isNewProject === "true") {
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
      const fileName = openFilePath.split("/").pop() || openFilePath;
      const extension = fileName.split(".").pop()?.toLowerCase() || "txt";

      let type: OpenTab["type"] = "js";
      if (
        ["html", "css", "js", "jsx", "json", "markdown"].includes(extension)
      ) {
        type = extension as OpenTab["type"];
      }

      setTabs((prev) => {
        if (!prev.find((t) => t.id === openFilePath)) {
          return [...prev, { id: openFilePath, name: fileName, type }];
        }
        return prev;
      });
      setActiveTab(openFilePath);
    } else if (tabs.length === 0) {
      const openInitial = async () => {
        try {
          const tree = await FileSystemService.getProjectFileTree(projectId);
          const getFirstFile = (nodes: FileNode[]): FileNode | null => {
            for (const node of nodes) {
              if (node.type === "file") {
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
            const extension = fileName.split(".").pop()?.toLowerCase() || "txt";
            let type: OpenTab["type"] = "js";
            if (
              ["html", "css", "js", "jsx", "json", "markdown"].includes(
                extension,
              )
            ) {
              type = extension as OpenTab["type"];
            }
            setTabs([{ id: firstFile.path, name: fileName, type }]);
            setActiveTab(firstFile.path);
          }
        } catch (e) {
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
      setActiveTab("");

      setCode("");
      setOriginalCode("");
    }
  }, [projectId]);

  // Load active tab content
  useEffect(() => {
    if (!projectId || !activeTab) return;

    let isMounted = true;
    setCode(""); // Clear old code while loading
    setOriginalCode("");

    // First try to load locally (for downloaded files or normal projects)
    FileSystemService.readFile(projectId, activeTab)
      .then((content) => {
        if (isMounted) {
          setCode(content);
          setOriginalCode(content); // Ensure original code is set for diff comparison
        }
      })
      .catch((err) => {
        // Ignore local read errors, it will be fetched from PC if LiveSync
      });

    // Always request from PC if it's LiveSync, as the PC is the source of truth
    import("../../services/LiveSyncService").then(({ LiveSyncService }) => {
      if (projectId === LiveSyncService.syncProjectId) {
        LiveSyncService.requestRemoteFile(activeTab);
      }
    });

    // Listen for remote file content
    let unsubscribe: () => void;
    import("../../services/LiveSyncService").then(({ LiveSyncService }) => {
      const oldHandler = LiveSyncService.onRemoteFileContent;
      LiveSyncService.onRemoteFileContent = (path: string, content: string) => {
        if (isMounted && path === activeTab) {
          setCode(content);
        }
        if (oldHandler) oldHandler(path, content);
      };
      unsubscribe = () => {
        LiveSyncService.onRemoteFileContent = oldHandler;
      };
    });

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [projectId, activeTab]);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);

    // Auto-save debounce
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      if (projectId && activeTab) {
        FileSystemService.writeFile(projectId, activeTab, newCode).catch((e) =>
          console.error(e),
        );

        import("../../services/LiveSyncService").then(({ LiveSyncService }) => {
          if (projectId === LiveSyncService.syncProjectId) {
            LiveSyncService.sendFileUpdate(activeTab, newCode);
          }
        });
      }
    }, 100);
  };

  const handleFileSelect = (node: FileNode) => {
    // Determine type from extension
    const ext = node.name.split(".").pop()?.toLowerCase();
    const typeMap: Record<string, any> = {
      html: "html",
      htm: "html",
      css: "css",
      js: "js",
      jsx: "jsx",
      ts: "js",
      tsx: "jsx",
      json: "json",
      md: "markdown",
    };
    const type = typeMap[ext || ""] || "js";

    if (!tabs.find((t) => t.id === node.path)) {
      setTabs([...tabs, { id: node.path, name: node.name, type }]);
    }
    setActiveTab(node.path);
  };

  const handleTabClose = (id: string) => {
    setTabs((prev) => {
      const newTabs = prev.filter((t) => t.id !== id);
      if (activeTab === id && newTabs.length > 0) {
        setActiveTab(newTabs[newTabs.length - 1].id);
      } else if (newTabs.length === 0) {
        setActiveTab("");
        setCode("");
      }
      return newTabs;
    });
  };

  const lastHeight = useRef(24);

  const { openPalette } = useCommandPalette();

  const handlePlay = async () => {
    setIsBooting(true);
    setBootStep(0);

    try {
      // Step 1: Read project files
      setBootStep(0);
      const allFiles = await BundlerEngine.collectProjectFiles(projectId);
      const hasJSX = Object.keys(allFiles).some(
        (f) => f.endsWith(".jsx") || f.endsWith(".tsx"),
      );

      setBootStep(1);

      const CONSOLE_INTERCEPTOR = `
        <script src="https://cdn.jsdelivr.net/npm/eruda"></script>
        <script>
          if (typeof eruda !== 'undefined') eruda.init();
        </script>
        <script>
          (function() {
            if (window.__devflux_console_injected) return;
            window.__devflux_console_injected = true;
            function sendLog(level, args) {
              try {
                const msg = Array.from(args).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                const payload = JSON.stringify({ type: 'DEVFLUX_CONSOLE', level: level, message: msg });
                if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
                else if (window.parent) window.parent.postMessage(payload, '*');
              } catch(e) {}
            }
            const oL = console.log, oW = console.warn, oE = console.error, oI = console.info;
            console.log = function() { oL.apply(console, arguments); sendLog('log', arguments); };
            console.warn = function() { oW.apply(console, arguments); sendLog('warn', arguments); };
            console.error = function() { oE.apply(console, arguments); sendLog('error', arguments); };
            console.info = function() { oI.apply(console, arguments); sendLog('info', arguments); };
            window.onerror = function(msg, src, lineno, colno) {
              sendLog('error', [msg + ' at ' + src + ':' + lineno + ':' + colno]);
              return false;
            };
          })();
        </script>
      `;

      if (hasJSX && BundlerEngine.isReady()) {
        // === REAL BUNDLER: esbuild-wasm transpilation ===
        setBootStep(2);
        const buildResult = await BundlerEngine.build(projectId);

        if (buildResult.errors.length > 0) {
          // Show build errors
          const errorHtml = `<!DOCTYPE html><html><body style="background:#1e1e1e;color:#ff6b6b;font-family:monospace;padding:20px">
            <h3>Build Error</h3>
            <pre style="white-space:pre-wrap;color:#ccc;margin-top:12px">${buildResult.errors.join("\n")}</pre>
          </body></html>`;
          setPreviewHtml(errorHtml);
        } else {
          // Generate preview with real transpiled code + import maps
          const deps = BundlerEngine.parseDependencies(allFiles);
          const pHtml = BundlerEngine.generatePreviewHTML(
            buildResult,
            deps,
          );
          setPreviewHtml(CONSOLE_INTERCEPTOR + pHtml);
        }

        setBootStep(3);
      } else {
        // === VANILLA FALLBACK: HTML/CSS/JS string injection ===
        const html = await FileSystemService.readFile(
          projectId,
          "index.html",
        ).catch(() => "<h1>index.html not found</h1>");
        const css = await FileSystemService.readFile(
          projectId,
          "style.css",
        ).catch(() => "");
        const js = await FileSystemService.readFile(
          projectId,
          "script.js",
        ).catch(() => "");

        const injectedHtml = html
          .replace("</head>", `<style>${css}</style></head>`)
          .replace("</body>", `<script>${js}</script></body>`);

        setPreviewHtml(CONSOLE_INTERCEPTOR + injectedHtml);
        setBootStep(3);
      }
    } catch (e) {
      console.error(e);
      setPreviewHtml("<h1>Error loading preview</h1>");
    }

    setTimeout(() => {
      setIsBooting(false);
      setIsPreview(true);
    }, 500);
  };

  const activeTabDetails = tabs.find((t) => t.id === activeTab);

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { paddingBottom: Platform.OS === 'ios' ? insets.bottom : 0 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {!isPreview ? (
        <>
          <View
            style={[
              styles.editorHeader,
              { paddingTop: insets.top, height: 44 + insets.top },
            ]}
          >
            <TouchableOpacity
              style={styles.menuBtn}
              onPress={() => {
                const nav = navigation as any;
                if (nav.toggleDrawer) nav.toggleDrawer();
                else if (nav.openDrawer) nav.openDrawer();
                else if (nav.getParent && nav.getParent()?.openDrawer)
                  nav.getParent().openDrawer();
              }}
            >
              <Icon
                name="MoreVertical"
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => editorRef.current?.undo()}
              >
                <Icon name="Undo" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => editorRef.current?.redo()}
              >
                <Icon name="Redo" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  if (projectId && activeTab) {
                    import("../../services/FileSystemService").then(
                      ({ FileSystemService }) => {
                        FileSystemService.writeFile(
                          projectId,
                          activeTab,
                          code,
                        ).catch((e) => console.error(e));
                      },
                    );
                    import("../../services/LiveSyncService").then(
                      ({ LiveSyncService }) => {
                        if (projectId === LiveSyncService.syncProjectId) {
                          LiveSyncService.sendFileUpdate(activeTab, code);
                          LiveSyncService.requestSaveFile(activeTab);
                        }
                      },
                    );
                  }
                }}
              >
                <Icon name="Save" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={openPalette}>
                <Icon
                  name="Search"
                  size={18}
                  color={theme.colors.textPrimary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push("/bridge")}
              >
                <Icon name="Cloud" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() =>
                  router.push({ pathname: "/ai-panel", params: { projectId } })
                }
              >
                <Icon
                  name="Sparkles"
                  size={18}
                  color={theme.colors.accentPurple}
                  outline={false}
                />
              </TouchableOpacity>
              {projectId !== LiveSyncService.syncProjectId && (
                <TouchableOpacity style={styles.actionBtn} onPress={handlePlay}>
                  <Icon
                    name="Play"
                    size={18}
                    color={theme.colors.accentTeal}
                    outline={false}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <CodeTabs
            tabs={tabs}
            activeTabId={activeTab}
            onTabPress={setActiveTab}
            onTabClose={handleTabClose}
          />
          {activeTab ? (
            <MonacoEditor
              ref={editorRef}
              key={activeTab}
              code={code}
              language={activeTabDetails?.type || "javascript"}
              onChangeCode={setCode}
            />
          ) : (
            <View style={styles.emptyEditor}>
              <Icon name="Code" size={48} color={theme.colors.border} />
              <Text style={styles.emptyEditorText}>Nenhum arquivo aberto</Text>
              <Text style={styles.emptyEditorSub}>
                Abra a barra lateral para explorar os arquivos do projeto.
              </Text>
            </View>
          )}

          {/* Invisible WebView: loads esbuild-wasm for real JSX/TSX transpilation */}
          <BundlerWebView />

          <TerminalSheet
            ref={terminalSheetRef}
            projectId={projectId}
            githubRepo={projectInfo?.githubRepo}
            onStartDevServer={handlePlay}
            onFileSystemChange={() => {
              // Reload files if npm install happened
              FileSystemService.getProjectFileTree(projectId).then((tree) => {
                // Not ideal, but force re-render via active tab or something
                setTabs([...tabs]);
              });
            }}
          />

          <KeyboardToolbar 
            onAction={(type, meta) => {
               if (editorRef.current && (editorRef.current as any).handleToolbarAction) {
                 (editorRef.current as any).handleToolbarAction(type, meta);
               }
            }} 
          />

          {isBooting && (
            <View style={styles.bootOverlay}>
              <View style={styles.bootCard}>
                <ActivityIndicator
                  size="large"
                  color={theme.colors.accentBlue}
                  style={{ marginBottom: 16 }}
                />
                <Text style={styles.bootTitle}>DevFlux Build Engine</Text>

                <View style={styles.bootSteps}>
                  <Text
                    style={[
                      styles.bootStep,
                      bootStep >= 0 && styles.bootStepActive,
                    ]}
                  >
                    <Icon
                      name={bootStep > 0 ? "CheckCircle" : "Loader"}
                      size={12}
                      color={
                        bootStep > 0
                          ? theme.colors.accentTeal
                          : theme.colors.textSecondary
                      }
                    />{" "}
                    Coletando arquivos do projeto...
                  </Text>
                  <Text
                    style={[
                      styles.bootStep,
                      bootStep >= 1 && styles.bootStepActive,
                      bootStep < 1 && styles.bootStepHidden,
                    ]}
                  >
                    <Icon
                      name={bootStep > 1 ? "CheckCircle" : "Loader"}
                      size={12}
                      color={
                        bootStep > 1
                          ? theme.colors.accentTeal
                          : theme.colors.textSecondary
                      }
                    />{" "}
                    Detectando tipo de projeto...
                  </Text>
                  <Text
                    style={[
                      styles.bootStep,
                      bootStep >= 2 && styles.bootStepActive,
                      bootStep < 2 && styles.bootStepHidden,
                    ]}
                  >
                    <Icon
                      name={bootStep > 2 ? "CheckCircle" : "Loader"}
                      size={12}
                      color={
                        bootStep > 2
                          ? theme.colors.accentTeal
                          : theme.colors.textSecondary
                      }
                    />{" "}
                    Transpilando JSX/TypeScript (esbuild)...
                  </Text>
                  <Text
                    style={[
                      styles.bootStep,
                      bootStep >= 3 && styles.bootStepActive,
                      bootStep < 3 && styles.bootStepHidden,
                    ]}
                  >
                    <Icon
                      name="Terminal"
                      size={12}
                      color={theme.colors.accentBlue}
                    />{" "}
                    Gerando preview...
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
          <View
            style={[
              styles.browserBar,
              { paddingTop: insets.top, height: 44 + insets.top },
            ]}
          >
            <TouchableOpacity
              onPress={() => setIsPreview(false)}
              style={{ padding: 8 }}
            >
              <Icon
                name="ChevronLeft"
                size={20}
                color={theme.colors.textPrimary}
              />
            </TouchableOpacity>
            <View style={styles.urlBox}>
              <Icon name="Lock" size={12} color={theme.colors.accentTeal} />
              <Text style={styles.url}>localhost:3000</Text>
            </View>
            <TouchableOpacity onPress={() => handlePlay()}>
              <Icon
                name="RotateCw"
                size={14}
                color={theme.colors.textPrimary}
              />
            </TouchableOpacity>
          </View>
          {Platform.OS === "web" ? (
            <iframe
              srcDoc={previewHtml}
              style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
              sandbox="allow-scripts allow-same-origin"
            />
          ) : (
            <WebView
              source={{ html: previewHtml }}
              style={{ flex: 1 }}
              originWhitelist={["*"]}
              javaScriptEnabled={true}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data.type === 'DEVFLUX_CONSOLE') {
                    import('../../services/LogService').then(({ LogService }) => {
                      LogService.addLog(data.level, data.message);
                    });
                    DeviceEventEmitter.emit('TERMINAL_LOG', { level: data.level, message: data.message });
                  }
                } catch(e) {}
              }}
            />
          )}
        </View>
      )}
      {Platform.OS !== 'ios' && <View style={{ height: isKeyboardVisible ? 0 : insets.bottom, backgroundColor: theme.colors.bgElevated }} />}
    </KeyboardAvoidingView>
  );
}

const getStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bgPrimary,
    },
    editorHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      backgroundColor: theme.colors.bgElevated,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    menuBtn: {
      padding: 8,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
    },
    actionBtn: {
      padding: 8,
      marginLeft: 4,
    },
    emptyEditor: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
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
      backgroundColor: "#FFFFFF",
    },
    browserBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.bgElevated,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      paddingHorizontal: 8,
      paddingBottom: 8,
    },
    urlBox: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.bgSurface,
      marginHorizontal: 12,
      height: 28,
      borderRadius: 6,
    },
    url: {
      fontFamily: theme.typography.ui,
      fontSize: 13,
      color: theme.colors.textPrimary,
      marginLeft: 6,
    },
    webviewMock: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    previewTitle: {
      fontFamily: theme.typography.ui,
      fontSize: 24,
      color: "#1E1E1E",
      marginBottom: 8,
    },
    previewDesc: {
      fontFamily: theme.typography.ui,
      fontSize: 16,
      color: "#666666",
    },
    resizerHandle: {
      height: 24,
      backgroundColor: theme.colors.bgElevated,
      alignItems: "center",
      justifyContent: "center",
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
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.8)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 100,
    },
    bootCard: {
      backgroundColor: theme.colors.bgElevated,
      padding: 24,
      borderRadius: 16,
      width: "80%",
      maxWidth: 400,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 10,
    },
    bootTitle: {
      fontFamily: theme.typography.ui,
      fontSize: 18,
      color: theme.colors.textPrimary,
      marginBottom: 20,
      textAlign: "center",
    },
    bootSteps: {
      marginTop: 8,
    },
    bootStep: {
      fontFamily: theme.typography.ui,
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
    goToLineContainer: {
      position: 'absolute',
      top: 100,
      alignSelf: 'center',
      backgroundColor: theme.colors.bgElevated,
      borderRadius: 8,
      padding: 8,
      width: 250,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    goToLineInput: {
      fontFamily: theme.typography.mono,
      fontSize: 14,
      color: theme.colors.textPrimary,
      padding: 8,
      backgroundColor: theme.colors.bgPrimary,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
    }
  });
