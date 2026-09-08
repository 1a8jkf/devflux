/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect */
import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, PanResponder, Dimensions, Animated, ActivityIndicator, KeyboardAvoidingView, Keyboard, TextInput, ScrollView, useWindowDimensions, FlatList, Alert } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { CodeTabs } from '../../components/CodeTabs';
import { CodeEditor } from '../../components/CodeEditor';
import { TerminalSheet, TerminalSheetRef } from '../../components/TerminalSheet';
import { TerminalView } from '../../components/TerminalView';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EditorSidebar } from '../../components/EditorSidebar';
import { Icon } from '../../components/Icon';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { useCommandPalette } from '../../contexts/CommandPaletteContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileSystemService, FileNode, ProjectInfo } from '../../services/FileSystemService';
import { WebView } from 'react-native-webview';
import { Platform } from 'react-native';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useAISettings } from '../../contexts/AISettingsContext';
import { EditorChangeState, EditorChangeStatsByPath, LineChangeStats } from '../../services/EditorChangeState';
import { BrowserPlayButton } from '../../components/BrowserPlayButton';
import { DebugService } from '../../services/DebugService';
import { ContextManager } from '../../services/ContextManager';

interface OpenTab {
  id: string; // The file path
  name: string; // The file name
  type: string;
  isDirty?: boolean;
  saveState?: 'saved' | 'dirty' | 'saving' | 'error';
}

interface AssistantRailMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const createAssistantMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const clampDimension = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const FILE_INDEX_IGNORED_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'build', '.next', '.vinext', '.wrangler', 'coverage']);
const HTML_EXTENSIONS = new Set(['html', 'htm']);
const CSS_EXTENSIONS = new Set(['css', 'scss', 'less']);
const SCRIPT_EXTENSIONS = new Set(['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx']);

const normalizeProjectEditorPath = (path: string) => {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some(part => part === '..')) return '';
  return parts.filter(part => part !== '.').join('/');
};

const sortProjectFilePaths = (paths: string[]) => {
  const seen = new Set<string>();
  return paths
    .map(normalizeProjectEditorPath)
    .filter(path => {
      if (!path || seen.has(path)) return false;
      if (path.split('/').some(part => FILE_INDEX_IGNORED_DIRS.has(part))) return false;
      seen.add(path);
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
};

const flattenProjectFilePaths = (nodes: FileNode[]): string[] => {
  const paths: string[] = [];
  const walk = (items: FileNode[]) => {
    for (const item of items) {
      const itemPath = normalizeProjectEditorPath(item.path);
      if (!itemPath || itemPath.split('/').some(part => FILE_INDEX_IGNORED_DIRS.has(part))) continue;
      if (item.type === 'directory') {
        walk(item.children || []);
      } else {
        paths.push(itemPath);
      }
    }
  };
  walk(nodes);
  return sortProjectFilePaths(paths);
};

const getFileExtension = (path: string) => {
  const fileName = normalizeProjectEditorPath(path).split('/').pop() || '';
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : '';
};

const getDirectoryName = (path: string) => {
  const clean = normalizeProjectEditorPath(path);
  const index = clean.lastIndexOf('/');
  return index >= 0 ? clean.slice(0, index) : '';
};

const joinProjectPath = (folder: string, file: string) => {
  const cleanFolder = normalizeProjectEditorPath(folder);
  const cleanFile = normalizeProjectEditorPath(file);
  return cleanFolder ? `${cleanFolder}/${cleanFile}` : cleanFile;
};

const splitComparableLines = (content: string) => {
  const normalized = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized) return [];
  const lines = normalized.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
};

const calculateLineChangeStats = (savedContent: string, currentContent: string): LineChangeStats => {
  if (savedContent === currentContent) {
    return { addedLines: 0, removedLines: 0, modifiedLines: 0, totalChangedLines: 0 };
  }

  const savedLines = splitComparableLines(savedContent);
  const currentLines = splitComparableLines(currentContent);
  let start = 0;

  while (start < savedLines.length && start < currentLines.length && savedLines[start] === currentLines[start]) {
    start += 1;
  }

  let savedEnd = savedLines.length - 1;
  let currentEnd = currentLines.length - 1;

  while (savedEnd >= start && currentEnd >= start && savedLines[savedEnd] === currentLines[currentEnd]) {
    savedEnd -= 1;
    currentEnd -= 1;
  }

  const removedBlock = Math.max(0, savedEnd - start + 1);
  const addedBlock = Math.max(0, currentEnd - start + 1);
  const modifiedLines = Math.min(removedBlock, addedBlock);
  const addedLines = Math.max(0, addedBlock - modifiedLines);
  const removedLines = Math.max(0, removedBlock - modifiedLines);

  return {
    addedLines,
    removedLines,
    modifiedLines,
    totalChangedLines: addedLines + removedLines + modifiedLines,
  };
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeStyleContent = (value: string) => value.replace(/<\/style/gi, '<\\/style');
const escapeScriptContent = (value: string) => value.replace(/<\/script/gi, '<\\/script');

const injectPreviewAssets = (html: string, css: string, js: string) => {
  let result = html || '<!doctype html><html><head></head><body></body></html>';
  const styleTag = css ? `<style data-devflux-active-preview>${escapeStyleContent(css)}</style>` : '';
  const scriptTag = js ? `<script type="module" data-devflux-active-preview>${escapeScriptContent(js)}</script>` : '';

  result = result.includes('</head>')
    ? result.replace('</head>', `${styleTag}</head>`)
    : `${styleTag}${result}`;

  result = result.includes('</body>')
    ? result.replace('</body>', `${scriptTag}</body>`)
    : `${result}${scriptTag}`;

  return result;
};

const readFirstAvailableFile = async (projectId: string, candidates: string[]) => {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const path = normalizeProjectEditorPath(candidate);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    try {
      return await FileSystemService.readFile(projectId, path);
    } catch (e) {}
  }
  return '';
};

const buildPreviewHtmlForFile = async (projectId: string, activePath: string, activeContent: string) => {
  const cleanPath = normalizeProjectEditorPath(activePath);
  const extension = getFileExtension(cleanPath);
  const directory = getDirectoryName(cleanPath);
  const title = escapeHtml(cleanPath || 'Preview');

  if (!cleanPath) {
    return '<!doctype html><html><body><h1>Nenhum arquivo aberto</h1></body></html>';
  }

  if (!HTML_EXTENSIONS.has(extension) && !CSS_EXTENSIONS.has(extension) && !SCRIPT_EXTENSIONS.has(extension)) {
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font-family:monospace;padding:24px;white-space:pre-wrap;background:#111;color:#f5f5f5}</style></head><body>${escapeHtml(activeContent)}</body></html>`;
  }

  const fallbackHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><main id="app"></main></body></html>`;
  const html = HTML_EXTENSIONS.has(extension)
    ? activeContent
    : await readFirstAvailableFile(projectId, [joinProjectPath(directory, 'index.html'), 'index.html']) || fallbackHtml;

  const css = CSS_EXTENSIONS.has(extension)
    ? activeContent
    : await readFirstAvailableFile(projectId, [joinProjectPath(directory, 'style.css'), 'style.css']);

  const js = SCRIPT_EXTENSIONS.has(extension)
    ? activeContent
    : await readFirstAvailableFile(projectId, [joinProjectPath(directory, 'script.js'), 'script.js']);

  return injectPreviewAssets(html, css, js);
};

export default function CodigoScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);

  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const { t } = useLanguage();
  const { settings } = useSettings();
  const { settings: aiSettings, isConfigured: isAIConfigured, isLoading: isAISettingsLoading } = useAISettings();
  const projectId = params.projectId as string;
  const openFilePath = params.openFile as string;
  const goToLineParam = params.goToLine as string;

  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTabState] = useState('');
  const activeTabRef = useRef('');
  const activeFileLoadSeqRef = useRef(0);
  const previousProjectIdRef = useRef(projectId);
  const [activeFileLoadState, setActiveFileLoadState] = useState<{ path: string; status: 'idle' | 'loading' | 'error'; message?: string }>({ path: '', status: 'idle' });

  const setActiveTab = (tab: string) => {
    activeTabRef.current = tab;
    setActiveTabState(tab);
    ContextManager.setActiveProject(projectId);
    ContextManager.setActiveFile(tab);
  };

  const [code, setCode] = useState('');
  const codeRef = useRef('');
  const unsavedContentRef = useRef<Record<string, string>>({});
  const savedContentRef = useRef<Record<string, string>>({});
  const dirtyFileIdsRef = useRef<Set<string>>(new Set());
  const [dirtyFileIds, setDirtyFileIds] = useState<Set<string>>(() => new Set());
  const [editorChangeStatsByPath, setEditorChangeStatsByPath] = useState<EditorChangeStatsByPath>({});
  const autoSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveSeqRef = useRef(0);
  const terminalSheetRef = useRef<TerminalSheetRef>(null);
  const editorRef = useRef<any>(null);

  const [isPreview, setIsPreview] = useState(false);
  const [playState, setPlayState] = useState<'idle' | 'loading' | 'running' | 'error'>('idle');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewUrl, setPreviewUrl] = useState('http://localhost:3000');
  const [urlInput, setUrlInput] = useState('localhost:3000');
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
  const { width, height } = useWindowDimensions();
  const isWorkbench = width >= 900 && width > height;

  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [projectFilePaths, setProjectFilePaths] = useState<string[]>([]);
  const [isGoToLineVisible, setIsGoToLineVisible] = useState(false);
  const [goToLineText, setGoToLineText] = useState('');
  const isLiveSync = projectInfo?.type === 'sync' || projectInfo?.id === 'live-sync-workspace' || projectInfo?.name === 'LiveSync Workspace';

  const [filePanelWidth, setFilePanelWidth] = useState(304);
  const [assistantPanelWidth, setAssistantPanelWidth] = useState(260);
  const [isAssistantOpen, setIsAssistantOpen] = useState(true);
  const filePanelWidthRef = useRef(304);
  const assistantPanelWidthRef = useRef(260);
  const workbenchWidthRef = useRef(width);
  const assistantOpenRef = useRef(true);
  const fileResizeStartRef = useRef(304);
  const assistantResizeStartRef = useRef(260);
  const assistantListRef = useRef<FlatList<AssistantRailMessage>>(null);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantNotice, setAssistantNotice] = useState('');
  const [assistantMessages, setAssistantMessages] = useState<AssistantRailMessage[]>(() => [{
    id: 'assistant-welcome',
    role: 'assistant',
    content: t('assistantRail.welcome', 'Pergunte algo sobre o projeto atual. Eu preparo a mensagem para o chat da IA no tablet.')
  }]);
  useEffect(() => {
    if (projectId && tabs.length > 0) {
      AsyncStorage.setItem(`devflux_tabs_${projectId}`, JSON.stringify({ tabs, activeTab })).catch(e => console.log(e));
    }
  }, [tabs, activeTab, projectId]);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => {
    filePanelWidthRef.current = filePanelWidth;
  }, [filePanelWidth]);

  useEffect(() => {
    assistantPanelWidthRef.current = assistantPanelWidth;
  }, [assistantPanelWidth]);

  useEffect(() => {
    workbenchWidthRef.current = width;
  }, [width]);

  useEffect(() => {
    assistantOpenRef.current = isAssistantOpen;
  }, [isAssistantOpen]);

  useEffect(() => () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
  }, []);

  const applyDirtyFileIds = (nextDirtyIds: Set<string>) => {
    const normalizedDirtyIds = new Set(nextDirtyIds);
    dirtyFileIdsRef.current = normalizedDirtyIds;
    setDirtyFileIds(normalizedDirtyIds);
  };

  const setFileDirty = (filePath: string, isDirty: boolean) => {
    if (!filePath) return;
    const nextDirtyIds = new Set(dirtyFileIdsRef.current);
    if (isDirty) nextDirtyIds.add(filePath);
    else nextDirtyIds.delete(filePath);

    applyDirtyFileIds(nextDirtyIds);
    setTabs(prev => prev.map(tab => tab.id === filePath ? { ...tab, isDirty } : tab));
  };

  const getUnsavedContent = (filePath: string) => unsavedContentRef.current[filePath];

  const clearEditorChangeStatsForFile = (filePath: string) => {
    if (!filePath) return;
    setEditorChangeStatsByPath(prev => {
      if (!prev[filePath]) return prev;
      const next = { ...prev };
      delete next[filePath];
      return next;
    });
  };

  const setEditorChangeStatsForFile = (filePath: string, savedContent: string, currentContent: string) => {
    if (!filePath) return;
    const stats = calculateLineChangeStats(savedContent, currentContent);
    setEditorChangeStatsByPath(prev => {
      const next = { ...prev };
      if (stats.totalChangedLines <= 0) {
        delete next[filePath];
      } else {
        next[filePath] = { ...stats, isUnsaved: true };
      }
      return next;
    });
  };

  const updateTabSaveState = (path: string, state: 'saved' | 'dirty' | 'saving' | 'error') => {
    setTabs(prev => prev.map(tab => tab.id === path ? { ...tab, saveState: state, isDirty: state === 'dirty' || state === 'error' } : tab));
  };

  const saveFileContent = async (targetProjectId: string, targetPath: string, content: string, syncWithLiveSync: boolean) => {
    if (!targetProjectId || !targetPath) return;
    
    updateTabSaveState(targetPath, 'saving');
    
    try {
      const startedAt = Date.now();
      await FileSystemService.writeFile(targetProjectId, targetPath, content);
      DebugService.log('file', 'info', 'Arquivo salvo.', { project: targetProjectId, file: targetPath, durationMs: Date.now() - startedAt, bytes: content.length });
      savedContentRef.current[targetPath] = content;
      delete unsavedContentRef.current[targetPath];
      
      const nextDirtyIds = new Set(dirtyFileIdsRef.current);
      nextDirtyIds.delete(targetPath);
      dirtyFileIdsRef.current = nextDirtyIds;
      setDirtyFileIds(nextDirtyIds);
      
      updateTabSaveState(targetPath, 'saved');
      clearEditorChangeStatsForFile(targetPath);
      if (targetPath === activeTabRef.current) setOriginalCode(content);

      if (syncWithLiveSync) {
        const { LiveSyncService } = await import('../../services/LiveSyncService');
        if (LiveSyncService.isConnected()) {
          LiveSyncService.queueFileUpdate(targetPath, content);
          // requestSaveFile can also be queued/debounced by queueFileUpdate internally if needed, but sending the update is what matters.
          LiveSyncService.requestSaveFile(targetPath);
        }
      }
    } catch (e: any) {
      console.error('Auto save failed', e);
      DebugService.log('file', 'error', 'Falha ao salvar no editor.', { project: targetProjectId, file: targetPath, error: e?.message || String(e) });
      updateTabSaveState(targetPath, 'error');
    }
  };

  const scheduleAutoSave = (targetPath: string, content: string) => {
    if (autoSaveTimersRef.current[targetPath]) clearTimeout(autoSaveTimersRef.current[targetPath]);
    const targetProjectId = projectId;
    const syncWithLiveSync = isLiveSync;

    if (!settings.autoSave || !targetProjectId || !targetPath) return;

    autoSaveTimersRef.current[targetPath] = setTimeout(() => {
      delete autoSaveTimersRef.current[targetPath];
      saveFileContent(targetProjectId, targetPath, content, syncWithLiveSync)
        .catch(e => console.error('Auto save failed', e));
    }, 900);
  };

  const handleEditorCodeChange = (nextCode: string) => {
    const targetPath = activeTabRef.current;
    codeRef.current = nextCode;
    setCode(nextCode);

    if (!targetPath) return;
    const savedContent = savedContentRef.current[targetPath] ?? originalCode;
    if (nextCode === savedContent) {
      delete unsavedContentRef.current[targetPath];
      updateTabSaveState(targetPath, 'saved');
      setFileDirty(targetPath, false);
      clearEditorChangeStatsForFile(targetPath);
    } else {
      unsavedContentRef.current[targetPath] = nextCode;
      updateTabSaveState(targetPath, 'dirty');
      setFileDirty(targetPath, true);
      setEditorChangeStatsForFile(targetPath, savedContent, nextCode);
    }

    scheduleAutoSave(targetPath, nextCode);
  };

  useEffect(() => {
    if (projectId) {
      EditorChangeState.publish(projectId, dirtyFileIds, editorChangeStatsByPath);
    }
  }, [projectId, dirtyFileIds, editorChangeStatsByPath]);

  useEffect(() => {
    return () => {
      if (projectId) EditorChangeState.clearProject(projectId);
    };
  }, [projectId]);

  useEffect(() => {
    if (!settings.autoSave) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      autoSaveSeqRef.current += 1;
      return;
    }

    if (!projectId) return;
    Array.from(dirtyFileIdsRef.current).forEach(filePath => {
      const content = filePath === activeTabRef.current ? codeRef.current : getUnsavedContent(filePath);
      if (typeof content === 'string') {
        saveFileContent(projectId, filePath, content, isLiveSync)
          .catch(e => console.error('Auto save failed', e));
      }
    });
  }, [settings.autoSave, projectId, isLiveSync]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));

    const { DeviceEventEmitter } = require('react-native');
    const toolbarSub = DeviceEventEmitter.addListener('KEYBOARD_TOOLBAR_ACTION', (action: any) => {
      const currentTarget = (global as any).activeInputTarget;
      const actionTarget = action?.target;
      if ((actionTarget && actionTarget !== 'editor') || (!actionTarget && currentTarget !== 'editor')) return;
      if (!editorRef.current?.handleToolbarAction || action.actionType !== 'keypress') return;

      const { key, ctrlKey } = action.meta;
      if (ctrlKey && key === 's') {
        const targetPath = activeTabRef.current;
        if (projectId && targetPath) {
          saveFileContent(projectId, targetPath, codeRef.current, isLiveSync)
            .finally(() => DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_ACTION_COMPLETE', { requestId: action.requestId, target: 'editor' }));
        } else {
          DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_ACTION_COMPLETE', { requestId: action.requestId, target: 'editor' });
        }
        return;
      }

      editorRef.current.handleToolbarAction('keypress', action.meta);
      DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_ACTION_COMPLETE', { requestId: action.requestId, target: 'editor' });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      toolbarSub.remove();
    };
  }, [projectId, isLiveSync]);

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
        const selectedDeps = String(params.deps || '')
          .split(',')
          .map(dep => dep.trim())
          .filter(dep => /^[a-zA-Z0-9._@/-]+$/.test(dep));
        const installSelectedDeps = selectedDeps.length > 0 ? ` && npm install ${selectedDeps.join(' ')}` : '';
        const shellEnv = 'export HOME=/root NPM_CONFIG_PREFIX=/root/.npm-global npm_config_prefix=/root/.npm-global PATH=/root/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
        const ensureNodeNpm = `${shellEnv}; if ! command -v npm >/dev/null 2>&1; then apk update --no-cache && apk add --no-cache nodejs npm; fi; hash -r`;
        if (type === 'react') {
          terminalSheetRef.current?.runCommand(`${ensureNodeNpm}; npm exec --yes create-vite@latest -- . --template react && npm install${installSelectedDeps}`);
        } else if (type === 'node') {
          const nodeDeps = Array.from(new Set(['express', 'dotenv', 'cors', 'mongoose', ...selectedDeps])).join(' ');
          terminalSheetRef.current?.runCommand(`${ensureNodeNpm}; npm init -y && npm install ${nodeDeps}`);
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

  // Handle goToLine from search results
  useEffect(() => {
    if (goToLineParam && editorRef.current?.handleToolbarAction) {
      const lineNum = parseInt(goToLineParam, 10);
      if (!isNaN(lineNum) && lineNum > 0) {
        // Small delay to let the editor load the file content first
        setTimeout(() => {
          editorRef.current?.handleToolbarAction('gotoLine', lineNum);
        }, 500);
      }
    }
  }, [goToLineParam, activeTab]);

  // Load initial files or open new file from params
  useEffect(() => {
    if (!projectId) return;

    if (openFilePath) {
      const fileName = openFilePath.split('/').pop() || openFilePath;
      const extension = fileName.split('.').pop()?.toLowerCase() || 'txt';

      let type: string = extension;

      const openInitial = async () => {
        setTabs(prev => {
          if (!prev.find(t => t.id === openFilePath)) {
            return [...prev, { id: openFilePath, name: fileName, type }];
          }
          return prev;
        });

        // Force request if LiveSync is active
        if (isLiveSync) {
          import('../../services/LiveSyncService').then(({ LiveSyncService }) => {
            if (LiveSyncService.ws && LiveSyncService.ws.readyState === 1) {
              LiveSyncService.requestRemoteFile(openFilePath);
            }
          });
        }

        setActiveTab(openFilePath);
      };
      openInitial();
    } else if (tabs.length === 0) {
      const openInitial = async () => {
        try {
          const savedData = await AsyncStorage.getItem(`devflux_tabs_${projectId}`);
          if (savedData) {
            const { tabs: savedTabs, activeTab: savedActive } = JSON.parse(savedData);
            if (savedTabs && savedTabs.length > 0) {
              setTabs(savedTabs);
              setActiveTab(savedActive || savedTabs[0].id);
              return;
            }
          }
        } catch(e) {}
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
            let type: string = extension;
            setTabs([{ id: firstFile.path, name: fileName, type }]);
            setActiveTab(firstFile.path);
          }
        } catch(e) {
          console.error("Failed to load initial file", e);
        }
      };
      openInitial();
    }
  }, [projectId, openFilePath, isLiveSync]);

  // Reset state only when switching between projects. On first mount this must not race
  // with the initial open-file effect and clear the freshly selected tab.
  useEffect(() => {
    if (!projectId) return;
    if (!previousProjectIdRef.current) {
      previousProjectIdRef.current = projectId;
      return;
    }
    if (previousProjectIdRef.current === projectId) return;
    previousProjectIdRef.current = projectId;
    activeFileLoadSeqRef.current += 1;
    setTabs([]);
    setActiveTab('');
    codeRef.current = '';
    unsavedContentRef.current = {};
    savedContentRef.current = {};
    applyDirtyFileIds(new Set());
    setEditorChangeStatsByPath({});
    setCode('');
    setOriginalCode('');
    setProjectFilePaths([]);
    setActiveFileLoadState({ path: '', status: 'idle' });
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setProjectFilePaths([]);
      return;
    }

    let isMounted = true;

    const loadProjectFileIndex = async () => {
      try {
        const { LiveSyncService } = await import('../../services/LiveSyncService');
        const currentProject = projectInfo || await LiveSyncService.getProject(projectId);
        const isRemoteLiveSync = LiveSyncService.isRemoteSyncProject(projectId, currentProject);
        const remoteTreeProjectId = LiveSyncService.remoteTreeProjectId || LiveSyncService.syncProjectId;

        if (isRemoteLiveSync && remoteTreeProjectId === projectId) {
          if (LiveSyncService.remoteTree.length > 0 && isMounted) {
            setProjectFilePaths(sortProjectFilePaths(LiveSyncService.remoteTree));
          }
          if (LiveSyncService.isConnected()) {
            LiveSyncService.requestRemoteTree();
          }
          if (LiveSyncService.remoteTree.length > 0) return;
        }

        const tree = await FileSystemService.getProjectFileTree(projectId);
        if (isMounted) setProjectFilePaths(flattenProjectFilePaths(tree || []));
      } catch (e) {
        if (isMounted) setProjectFilePaths([]);
      }
    };

    loadProjectFileIndex();
    const unsubscribeFS = FileSystemService.subscribe(loadProjectFileIndex);
    let unsubscribeLiveSync: (() => void) | undefined;
    import('../../services/LiveSyncService').then(({ LiveSyncService }) => {
      if (isMounted) {
        unsubscribeLiveSync = LiveSyncService.subscribe(loadProjectFileIndex);
      }
    });

    return () => {
      isMounted = false;
      unsubscribeFS();
      unsubscribeLiveSync?.();
    };
  }, [projectId, projectInfo?.type, projectInfo?.liveSyncMode]);

  // Load active tab content
  useEffect(() => {
    if (!projectId || !activeTab) return;
    if (activeTab.startsWith('shell')) {
      setActiveFileLoadState({ path: activeTab, status: 'idle' });
      return;
    }

    let isMounted = true;
    const requestSeq = ++activeFileLoadSeqRef.current;
    const targetPath = activeTab;
    const draftContent = getUnsavedContent(targetPath);
    const hasLocalDraft = draftContent !== undefined && dirtyFileIdsRef.current.has(targetPath);

    if (draftContent !== undefined) {
      const savedContent = savedContentRef.current[targetPath] ?? '';
      codeRef.current = draftContent;
      setCode(draftContent);
      setOriginalCode(savedContent);
      setActiveFileLoadState({ path: targetPath, status: 'idle' });
      const draftIsDirty = draftContent !== savedContent;
      setFileDirty(targetPath, draftIsDirty);
      if (draftIsDirty) setEditorChangeStatsForFile(targetPath, savedContent, draftContent);
      else clearEditorChangeStatsForFile(targetPath);
    } else {
      const startedAt = Date.now();
      setActiveFileLoadState({ path: targetPath, status: 'loading' });
      DebugService.log('file', 'info', 'Abrindo arquivo no editor.', { project: projectId, file: targetPath });

      FileSystemService.readFile(projectId, targetPath)
        .then(content => {
          if (!isMounted || requestSeq !== activeFileLoadSeqRef.current || activeTabRef.current !== targetPath) return;
          if (getUnsavedContent(targetPath) !== undefined) return;
          savedContentRef.current[targetPath] = content;
          codeRef.current = content;
          setCode(content);
          setOriginalCode(content);
          setActiveFileLoadState({ path: targetPath, status: 'idle' });
          setFileDirty(targetPath, false);
          clearEditorChangeStatsForFile(targetPath);
          DebugService.log('file', 'info', 'Arquivo carregado no editor.', { project: projectId, file: targetPath, durationMs: Date.now() - startedAt, bytes: content.length });
        })
        .catch(err => {
          if (!isMounted || requestSeq !== activeFileLoadSeqRef.current || activeTabRef.current !== targetPath) return;
          setActiveFileLoadState({ path: targetPath, status: 'error', message: err?.message || String(err) });
          DebugService.log('file', 'error', 'Arquivo não carregou no editor.', { project: projectId, file: targetPath, durationMs: Date.now() - startedAt, error: err?.message || String(err) });
        });
    }

    if (isLiveSync && !hasLocalDraft) {
      import('../../services/LiveSyncService').then(({ LiveSyncService }) => {
        if (LiveSyncService.ws && LiveSyncService.ws.readyState === 1) {
          LiveSyncService.requestRemoteFile(targetPath);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [projectId, activeTab, isLiveSync]);

  // Listen for remote file content globally
  useEffect(() => {
    let isMounted = true;
    let unsubscribe: () => void;
    import('../../services/LiveSyncService').then(({ LiveSyncService }) => {
      const oldHandler = LiveSyncService.onRemoteFileContent;
      LiveSyncService.onRemoteFileContent = (path: string, content: string, remoteProjectId: string) => {
        if (isMounted && remoteProjectId === projectId) {
          savedContentRef.current[path] = content;
          const hasLocalDraft = dirtyFileIdsRef.current.has(path);
          const localDraft = getUnsavedContent(path);
          if (hasLocalDraft && typeof localDraft === 'string') {
            setEditorChangeStatsForFile(path, content, localDraft);
          }

          if (path === activeTabRef.current) {
            setOriginalCode(content);
            if (!hasLocalDraft) {
              delete unsavedContentRef.current[path];
              if (codeRef.current !== content) {
                codeRef.current = content;
                setCode(content);
              }
              setActiveFileLoadState({ path, status: 'idle' });
              DebugService.log('liveSync', 'info', 'Conteúdo remoto aplicado no editor.', { project: remoteProjectId, file: path, bytes: content.length });
              setFileDirty(path, false);
              clearEditorChangeStatsForFile(path);
            }
          } else if (!hasLocalDraft) {
            delete unsavedContentRef.current[path];
            setFileDirty(path, false);
            clearEditorChangeStatsForFile(path);
          }
        }
        if (oldHandler) oldHandler(path, content, remoteProjectId);
      };

      const oldTreeHandler = LiveSyncService.onRemoteTreeUpdate;
      LiveSyncService.onRemoteTreeUpdate = (paths: string[], remoteProjectId: string) => {
        if (isMounted && remoteProjectId === projectId) {
          setProjectFilePaths(sortProjectFilePaths(paths));
        }
        if (oldTreeHandler) oldTreeHandler(paths, remoteProjectId);
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



  const closeTabById = (id: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== id);
      if (activeTabRef.current === id && newTabs.length > 0) {
        const nextId = newTabs[newTabs.length - 1].id;
        setActiveTab(nextId);
        router.setParams({ openFile: nextId });
      } else if (newTabs.length === 0) {
        setActiveTab('');
        codeRef.current = '';
        setCode('');
        setOriginalCode('');
        router.setParams({ openFile: '' });
      }
      return newTabs;
    });
  };

  const discardTabDraft = (id: string) => {
    delete unsavedContentRef.current[id];
    setFileDirty(id, false);
    clearEditorChangeStatsForFile(id);
    closeTabById(id);
  };

  const handleTabClose = (id: string) => {
    if (!dirtyFileIdsRef.current.has(id)) {
      closeTabById(id);
      return;
    }

    Alert.alert(
      t('editor.unsavedFileTitle', 'Arquivo não salvo'),
      t('editor.unsavedFileMessage', 'Este arquivo possui alterações não salvas.'),
      [
        { text: t('common.cancel', 'Cancelar'), style: 'cancel' },
        { text: t('editor.discard', 'Descartar'), style: 'destructive', onPress: () => discardTabDraft(id) },
        {
          text: t('common.save', 'Salvar'),
          onPress: () => {
            if (!projectId) return;
            const content = id === activeTabRef.current ? codeRef.current : getUnsavedContent(id);
            saveFileContent(projectId, id, content ?? '', isLiveSync)
              .then(() => closeTabById(id))
              .catch(e => console.error('Save before closing failed', e));
          }
        }
      ]
    );
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

  const filePaneResizeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 2,
      onPanResponderGrant: () => {
        fileResizeStartRef.current = filePanelWidthRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const reservedAssistant = assistantOpenRef.current ? assistantPanelWidthRef.current : 44;
        const maxWidth = Math.max(240, Math.min(520, workbenchWidthRef.current - reservedAssistant - 360));
        setFilePanelWidth(clampDimension(fileResizeStartRef.current + gestureState.dx, 220, maxWidth));
      }
    })
  ).current;

  const assistantPaneResizeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 2,
      onPanResponderGrant: () => {
        assistantResizeStartRef.current = assistantPanelWidthRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const maxWidth = Math.max(240, Math.min(520, workbenchWidthRef.current - filePanelWidthRef.current - 360));
        setAssistantPanelWidth(clampDimension(assistantResizeStartRef.current - gestureState.dx, 220, maxWidth));
      }
    })
  ).current;

  const handlePlay = async () => {
    if (playState === 'running') {
      setPlayState('idle');
      setIsPreview(false);
      DebugService.log('browser', 'info', 'Preview parado pelo usuário.', { project: projectId, file: activeTabRef.current });
      return;
    }
    
    setPlayState('loading');
    DebugService.log('browser', 'info', 'Iniciando preview...', { project: projectId, file: activeTabRef.current });
    const selectedPath = activeTabRef.current || activeTab;
    try {
      // Simula um pequeno loading para testar a UI
      await new Promise(r => setTimeout(r, 600));
      const html = await buildPreviewHtmlForFile(projectId, selectedPath, code);
      // Use the actual native file path for baseUrl so relative scripts/css load properly in Android WebView
      let baseUrl = FileSystemService.getProjectPath(projectId);
      if (Platform.OS === 'android' && !baseUrl.startsWith('file://')) {
        baseUrl = 'file://' + baseUrl;
      }
      if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
      }
      setPreviewUrl(baseUrl);
      setUrlInput(normalizeProjectEditorPath(selectedPath) || 'preview');
      setPreviewHtml(html);
    } catch (e: any) {
      console.error(e);
      setPreviewHtml(`<!doctype html><html><body><h1>Error loading preview</h1><p>${e?.message || ''}</p></body></html>`);
      setPlayState('error');
      DebugService.log('browser', 'error', `Falha ao carregar preview: ${e?.message}`, { project: projectId, file: selectedPath });
      setTimeout(() => setPlayState('idle'), 3000);
      return;
    }

    setConsoleLogs([]);
    setNetworkLogs([]);
    setIsConsoleOpen(false);
    setIsPreview(true);
    setPlayState('running');
    DebugService.log('browser', 'info', 'Preview renderizado com sucesso.', { project: projectId, file: selectedPath });
  };

  const activeTabDetails = tabs.find(t => t.id === activeTab);
  const isActiveTabDirty = activeTab ? dirtyFileIds.has(activeTab) : false;

  const openEditorDrawer = () => {
    const nav = navigation as any;
    if (nav.toggleDrawer) nav.toggleDrawer();
    else if (nav.openDrawer) nav.openDrawer();
    else if (nav.getParent && nav.getParent()?.openDrawer) nav.getParent().openDrawer();
  };

const handleOpenShellInTab = () => {
    terminalSheetRef.current?.collapse();
    const shellId = 'shell-' + Date.now();
    setTabs(prev => [...prev, { id: shellId, name: 'Shell', type: 'shell' }]);
    setActiveTab(shellId);
  };

  const renderEditor = (workbench = false) => (
      <View style={[{ flex: 1 }, workbench && styles.workbenchEditorPane]}>
        <>
          <View style={[styles.editorHeader, workbench && styles.workbenchEditorHeader, { paddingTop: workbench ? 0 : insets.top, height: (workbench ? 42 : 44) + (workbench ? 0 : insets.top) }]}>
            <TouchableOpacity
              style={styles.menuBtn}
              onPress={() => workbench ? router.replace('/') : openEditorDrawer()}
            >
              <Icon name={workbench ? "Home" : "MoreVertical"} size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            {workbench ? (
              <View style={styles.workbenchHeaderTitle}>
                <Text style={styles.workbenchProjectName} numberOfLines={1}>{projectInfo?.name || 'DevFlux'}</Text>
                <Text style={styles.workbenchFileName} numberOfLines={1}>{activeTab || t('Nenhum arquivo aberto')}</Text>
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => editorRef.current?.undo()}>
                <Icon name="Undo" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => editorRef.current?.redo()}>
                <Icon name="Redo" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => {
                if (projectId && activeTab) {
                  saveFileContent(projectId, activeTab, codeRef.current, isLiveSync)
                    .catch(e => console.error(e));
                }
              }}>
                <Icon name="Save" size={18} color={isActiveTabDirty ? theme.colors.accentBlue : theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={openPalette}>
                <Icon name="Search" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => router.push({ pathname: '/editor/debug', params: { projectId } })}>
                <Icon name="Activity" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} onPress={() => workbench ? setIsAssistantOpen(open => !open) : router.push({ pathname: '/ai-panel', params: { projectId } })}>
                <Icon name="Sparkles" size={18} color={isAssistantOpen ? theme.colors.accentPurple : theme.colors.textSecondary} outline={false} />
              </TouchableOpacity>
              <BrowserPlayButton 
                state={playState} 
                onPress={handlePlay} 
                color={theme.colors.accentTeal} 
              />
            </View>
          </View>

          <CodeTabs
            tabs={tabs}
            activeTabId={activeTab}
            onTabPress={setActiveTab}
            onTabClose={handleTabClose}
          />
          {activeTab ? (
            activeTab.startsWith('shell') ? (
              <TerminalView projectId={projectId} sessionId={activeTab} />
            ) : activeFileLoadState.path !== activeTab || activeFileLoadState.status === 'loading' ? (
              <View style={styles.emptyEditor}>
                <ActivityIndicator size="large" color={theme.colors.accentBlue} />
                <Text style={styles.emptyEditorText}>{t('Carregando arquivo...')}</Text>
              </View>
            ) : activeFileLoadState.path === activeTab && activeFileLoadState.status === 'error' ? (
              <View style={styles.emptyEditor}>
                <Icon name="AlertTriangle" size={40} color={theme.colors.error} />
                <Text style={styles.emptyEditorText}>{t('Arquivo não carregou')}</Text>
                <Text style={styles.emptyEditorSub}>{activeFileLoadState.message}</Text>
              </View>
            ) : (
              <CodeEditor
                key={activeTab}
                ref={editorRef}
                filePath={activeTab}
                filePaths={projectFilePaths}
                code={code}
                language={activeTabDetails?.type || 'js'}
                onChangeCode={handleEditorCodeChange}
              />
            )
          ) : (
            <View style={styles.emptyEditor}>
              <Icon name="Code" size={48} color={theme.colors.border} />
              <Text style={styles.emptyEditorText}>{t('Nenhum arquivo aberto')}</Text>
              <Text style={styles.emptyEditorSub}>{t('Abra a barra lateral para explorar os arquivos do projeto.')}</Text>
            </View>
          )}

          {isGoToLineVisible && (
            <View style={styles.goToLineContainer}>
               <TextInput
                  style={styles.goToLineInput}
                  placeholder={t('Ir para linha (ex: 42)')}
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

  const renderPreview = (workbench = false) => (
      <View style={[styles.previewContainer, { flex: 1 }]}>
          <View style={[styles.browserBar, workbench && styles.workbenchEditorHeader, { paddingTop: workbench ? 0 : insets.top, height: (workbench ? 42 : 44) + (workbench ? 0 : insets.top) }]}>
            <TouchableOpacity onPress={() => { setIsPreview(false); setIsConsoleOpen(false); setPlayState('idle'); }} style={styles.previewIconBtn}>
              <Icon name="X" size={20} color={theme.colors.textPrimary} />
            </TouchableOpacity>

            <View style={styles.previewNavGroup}>
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
                value={urlInput}
                onChangeText={(text) => setUrlInput(text)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onSubmitEditing={() => {
                  setPreviewHtml('');
                  let finalUrl = urlInput.trim();
                  const isUrl = /^((https?:\/\/)|(www\.))?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/.test(finalUrl) || /^localhost(:\d+)?/.test(finalUrl) || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?/.test(finalUrl);
                  if (isUrl) {
                    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
                      finalUrl = 'http://' + finalUrl;
                    }
                  } else {
                    finalUrl = 'https://www.google.com/search?q=' + encodeURIComponent(finalUrl);
                  }
                  setPreviewUrl(finalUrl);
                  setUrlInput(finalUrl.replace(/^https?:\/\//, ''));
                }}
              />
            </View>
            <TouchableOpacity onPress={() => setIsConsoleOpen(!isConsoleOpen)} style={styles.previewIconBtn}>
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
                allowFileAccess={true}
                allowFileAccessFromFileURLs={true}
                allowUniversalAccessFromFileURLs={true}
                domStorageEnabled={true}
                onNavigationStateChange={(navState) => {
                  setCanGoBack(navState.canGoBack);
                  setCanGoForward(navState.canGoForward);
                  if (navState.url && navState.url !== 'about:blank' && !navState.url.startsWith('file://')) {
                    setPreviewUrl(navState.url);
                    setUrlInput(navState.url.replace(/^https?:\/\//, ''));
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
                      if (msg.level === 'error' || msg.level === 'warn') {
                        DebugService.log('browser', msg.level === 'error' ? 'error' : 'warn', msg.text, { project: projectId, file: activeTabRef.current });
                      }
                    } else if (msg.type === 'NETWORK_START') {
                      setNetworkLogs(prev => [...prev.slice(-100), { id: msg.id, method: msg.method, url: msg.url, status: '...' }]);
                    } else if (msg.type === 'NETWORK_END') {
                      setNetworkLogs(prev => prev.map(log => log.id === msg.id ? { ...log, status: msg.status, time: msg.time, size: msg.size, error: msg.error } : log));
                      if (msg.error || msg.status >= 400 || msg.time > 8000) {
                        const debugMessage = msg.error ? 'Falha de rede no preview: ' + msg.error : 'Requisição do preview retornou status ' + msg.status;
                        DebugService.log('browser', msg.error || msg.status >= 400 ? 'error' : 'warn', debugMessage, { project: projectId, file: activeTabRef.current, status: msg.status, durationMs: msg.time });
                      }
                    }
                  } catch(e: any) {
                    DebugService.log('browser', 'error', 'Falha ao interpretar mensagem do preview.', { project: projectId, file: activeTabRef.current, error: e?.message || String(e) });
                  }
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
                <TouchableOpacity onPress={() => { if (activeConsoleTab === 'console') setConsoleLogs([]); else setNetworkLogs([]); }} style={{ padding: 10 }}>
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

  const warnAssistantConfiguration = () => {
    const message = t('assistantRail.configureWarning', 'Configure a chave BYOK e selecione um modelo antes de usar o chat da IA.');
    setAssistantNotice(message);
    setAssistantMessages(prev => {
      if (prev[prev.length - 1]?.content === message) return prev;
      return [...prev, { id: createAssistantMessageId(), role: 'assistant', content: message }];
    });
  };

  const handleAssistantInputChange = (text: string) => {
    setAssistantInput(text);
    if (text.trim() && !isAISettingsLoading && !isAIConfigured) {
      setAssistantNotice(t('assistantRail.configureWarning', 'Configure a chave BYOK e selecione um modelo antes de usar o chat da IA.'));
    } else if (assistantNotice) {
      setAssistantNotice('');
    }
  };

  const openConfiguredAssistantChat = () => {
    const text = assistantInput.trim();
    if (!text) return;

    if (isAISettingsLoading || !isAIConfigured) {
      warnAssistantConfiguration();
      return;
    }

    const userMessage: AssistantRailMessage = { id: createAssistantMessageId(), role: 'user', content: text };
    const handoffMessage: AssistantRailMessage = {
      id: createAssistantMessageId(),
      role: 'assistant',
      content: t('assistantRail.openingFullChat', 'Vou abrir o chat completo com sua mensagem pronta para envio.')
    };
    setAssistantInput('');
    setAssistantNotice('');
    setAssistantMessages(prev => [...prev, userMessage, handoffMessage]);
    router.push({ pathname: '/ai-panel', params: { projectId, draft: text } });
  };

  const renderAssistantRailMessage = ({ item }: { item: AssistantRailMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.assistantMessage, isUser ? styles.assistantUserMessage : styles.assistantAIMessage]}>
        <Text style={[styles.assistantMessageText, isUser ? styles.assistantUserMessageText : styles.assistantAIMessageText]}>{item.content}</Text>
      </View>
    );
  };

  const renderAssistantRail = () => (
    <View style={styles.assistantRail}>
      <View style={styles.assistantHeader}>
        <View style={styles.assistantIconBox}>
          <Icon name="Sparkles" size={15} color={theme.colors.textPrimary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.assistantTitle}>{t('Assistente IA')}</Text>
          <Text style={styles.assistantSub} numberOfLines={1}>{aiSettings.model?.trim() || 'BYOK'}</Text>
        </View>
        <TouchableOpacity style={styles.assistantHeaderButton} onPress={() => router.push('/ai-settings')}>
          <Icon name="Key" size={15} color={isAIConfigured ? theme.colors.accentTeal : theme.colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.assistantHeaderButton} onPress={() => setIsAssistantOpen(false)}>
          <Icon name="PanelRightClose" size={16} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {!isAIConfigured && (
        <TouchableOpacity style={styles.assistantNotice} onPress={() => router.push('/ai-settings')}>
          <Icon name="KeyRound" size={14} color={theme.colors.accentPurple} />
          <Text style={styles.assistantNoticeText}>{t('assistantRail.configureWarning', 'Configure a chave BYOK e selecione um modelo antes de usar o chat da IA.')}</Text>
        </TouchableOpacity>
      )}

      <FlatList
        ref={assistantListRef}
        data={assistantMessages}
        renderItem={renderAssistantRailMessage}
        keyExtractor={item => item.id}
        style={styles.assistantChatList}
        contentContainerStyle={styles.assistantChatContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => assistantListRef.current?.scrollToEnd({ animated: true })}
      />

      {assistantNotice ? <Text style={styles.assistantInlineNotice}>{assistantNotice}</Text> : null}

      <View style={styles.assistantInputRow}>
        <TextInput
          style={styles.assistantInput}
          placeholder={t('assistantRail.inputPlaceholder', 'Pergunte sobre o arquivo ou projeto...')}
          placeholderTextColor={theme.colors.textSecondary}
          value={assistantInput}
          onChangeText={handleAssistantInputChange}
          multiline
          maxLength={4000}
          autoCorrect={false}
          autoCapitalize="sentences"
          onSubmitEditing={openConfiguredAssistantChat}
        />
        <TouchableOpacity
          style={[styles.assistantSendButton, !assistantInput.trim() && { opacity: 0.55 }]}
          onPress={openConfiguredAssistantChat}
          disabled={!assistantInput.trim()}
        >
          <Icon name="Send" size={17} color="#FFF" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.assistantFullChatButton} onPress={() => router.push({ pathname: '/ai-panel', params: { projectId } })}>
        <Icon name="Maximize2" size={14} color={theme.colors.textSecondary} />
        <Text style={styles.assistantFullChatText}>{t('Abrir chat')}</Text>
      </TouchableOpacity>
    </View>
  );

  if (isWorkbench) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: Platform.OS === 'ios' ? insets.bottom : 0 }]}>
        <View style={styles.workbenchShell}>
          <View style={[styles.workbenchSidebar, { width: filePanelWidth }]}>
            <EditorSidebar embedded onClose={() => {}} />
            <View {...filePaneResizeResponder.panHandlers} style={[styles.verticalResizeHandle, styles.leftResizeHandle]}>
              <View style={styles.verticalResizeLine} />
            </View>
          </View>
          <View style={styles.workbenchContent}>
            {isPreview ? renderPreview(true) : renderEditor(true)}
          </View>
          {isAssistantOpen ? (
            <View style={[styles.workbenchAssistant, { width: assistantPanelWidth }]}>
              <View {...assistantPaneResizeResponder.panHandlers} style={[styles.verticalResizeHandle, styles.rightResizeHandle]}>
                <View style={styles.verticalResizeLine} />
              </View>
              {renderAssistantRail()}
            </View>
          ) : (
            <TouchableOpacity style={styles.assistantCollapsedRail} onPress={() => setIsAssistantOpen(true)}>
              <Icon name="PanelRightOpen" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <TerminalSheet
          ref={terminalSheetRef}
          projectId={projectId}
          visible={!isPreview}
          onOpenInTab={handleOpenShellInTab}
        />
      </View>
    );
  }

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
        onOpenInTab={handleOpenShellInTab}
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
  workbenchShell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  workbenchSidebar: {
    minWidth: 220,
    maxWidth: 520,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
    position: 'relative',
  },
  workbenchContent: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#000000',
  },
  workbenchAssistant: {
    minWidth: 220,
    maxWidth: 520,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
    position: 'relative',
  },
  assistantCollapsedRail: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 12,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
  },
  verticalResizeHandle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 16,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftResizeHandle: {
    right: -8,
  },
  rightResizeHandle: {
    left: -8,
  },
  verticalResizeLine: {
    width: 2,
    height: 42,
    borderRadius: 1,
    backgroundColor: theme.colors.border,
    opacity: 0.9,
  },
  workbenchEditorPane: {
    backgroundColor: '#000000',
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 0,
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  workbenchEditorHeader: {
    backgroundColor: '#050505',
  },
  menuBtn: {
    padding: 8,
  },
  workbenchHeaderTitle: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 2,
  },
  workbenchProjectName: {
    fontFamily: theme.typography.uiBold,
    fontSize: 12,
    color: theme.colors.textPrimary,
  },
  workbenchFileName: {
    fontFamily: theme.typography.mono,
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    gap: 4,
  },
  actionBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
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
    paddingLeft: 8,
    paddingRight: 12,
    paddingBottom: 8,
  },
  previewNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  previewIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  urlBox: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgSurface,
    marginHorizontal: 8,
    height: 34,
    borderRadius: 6,
    overflow: 'hidden',
  },
  url: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    paddingVertical: 0,
    fontFamily: theme.typography.ui,
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
    fontFamily: theme.typography.ui,
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
  goToLineContainer: {
    position: 'absolute',
    top: 72,
    alignSelf: 'center',
    width: 220,
    padding: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  goToLineInput: {
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: theme.colors.bgSurface,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.mono,
    fontSize: 13,
  },
  assistantRail: {
    flex: 1,
    padding: 12,
    gap: 8,
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 10,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  assistantHeaderButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgSurface,
  },
  assistantNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: theme.colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  assistantNoticeText: {
    flex: 1,
    fontFamily: theme.typography.ui,
    fontSize: 11,
    lineHeight: 16,
    color: theme.colors.textPrimary,
  },
  assistantChatList: {
    flex: 1,
    minHeight: 0,
  },
  assistantChatContent: {
    paddingVertical: 6,
    gap: 8,
  },
  assistantMessage: {
    maxWidth: '92%',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  assistantUserMessage: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.accentBlue,
  },
  assistantAIMessage: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  assistantMessageText: {
    fontFamily: theme.typography.ui,
    fontSize: 12,
    lineHeight: 17,
  },
  assistantUserMessageText: {
    color: '#FFF',
  },
  assistantAIMessageText: {
    color: theme.colors.textPrimary,
  },
  assistantInlineNotice: {
    fontFamily: theme.typography.ui,
    fontSize: 11,
    lineHeight: 15,
    color: theme.colors.accentPurple,
  },
  assistantInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  assistantInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 96,
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 9,
    borderRadius: 8,
    backgroundColor: theme.colors.bgSurface,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    fontSize: 12,
    lineHeight: 17,
    textAlignVertical: 'top',
  },
  assistantSendButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentBlue,
  },
  assistantFullChatButton: {
    minHeight: 34,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#050505',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  assistantFullChatText: {
    fontFamily: theme.typography.uiBold,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  assistantIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgSurface,
  },
  assistantTitle: {
    fontFamily: theme.typography.uiBold,
    fontSize: 12,
    color: theme.colors.textPrimary,
  },
  assistantSub: {
    fontFamily: theme.typography.mono,
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  railAction: {
    minHeight: 38,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: theme.colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  railActionText: {
    fontFamily: theme.typography.ui,
    fontSize: 12,
    color: theme.colors.textPrimary,
  },
  deviceStatusBox: {
    marginTop: 'auto',
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#050505',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    gap: 8,
  },
  deviceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  deviceStatusText: {
    fontFamily: theme.typography.mono,
    fontSize: 10,
    color: theme.colors.textSecondary,
  },

});
