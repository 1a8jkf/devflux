import { FileSystemService, FileNode, ProjectInfo } from './FileSystemService';
import { AppState, AppStateStatus } from 'react-native';
import { DebugService } from './DebugService';

const RELAY_URL = 'ws://82.29.61.16:8080';
const LEGACY_SYNC_PROJECT_ID = 'live-sync-workspace';
const FALLBACK_WORKSPACE_NAME = 'VS Code Workspace';

type RemoteTreeHandler = (paths: string[], projectId: string) => void;
type RemoteFileHandler = (path: string, content: string, projectId: string) => void;
export type LiveSyncLocalChange = { path: string; status: 'added' | 'modified' | 'deleted'; type: 'file' };
export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';


const cleanRemotePath = (value: string) => String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/(^|\/)\.\.(?=\/|$)/g, '');

const workspaceTitle = (name?: string | null) => {
  const clean = String(name || '').trim();
  if (!clean || clean === FALLBACK_WORKSPACE_NAME || clean.endsWith('- Sync Code') || clean.endsWith('(VS Code)')) return clean || FALLBACK_WORKSPACE_NAME;
  return `${clean} - Sync Code`;
};

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const hashContent = (value: string) => `${value.length}:${stableHash(value)}`;

const slugify = (value: string) => {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36);
  return slug || 'workspace';
};

const workspaceKeyFrom = (workspaceName?: string | null, workspaceId?: string | null) => {
  const cleanId = String(workspaceId || '').trim();
  if (cleanId) return `id:${cleanId}`;
  const cleanName = String(workspaceName || FALLBACK_WORKSPACE_NAME).trim() || FALLBACK_WORKSPACE_NAME;
  return `name:${cleanName}`;
};

const projectIdForWorkspace = (workspaceName: string, workspaceKey: string) => `live-sync-${slugify(workspaceName)}-${stableHash(workspaceKey).slice(0, 8)}`;

const isLocalMirrorProject = (project?: ProjectInfo | null) => project?.type === 'sync-local' || project?.liveSyncMode === 'local';

const collectFiles = (nodes: FileNode[], prefix = ''): string[] => {
  let paths: string[] = [];
  for (const node of nodes) {
    const path = node.path || (prefix ? `${prefix}/${node.name}` : node.name);
    if (node.type === 'directory') {
      paths = paths.concat(collectFiles(node.children || [], path));
    } else if (path) {
      paths.push(cleanRemotePath(path));
    }
  }
  return paths.filter(Boolean);
};

const ensureLocalParents = async (projectId: string, path: string) => {
  const parts = cleanRemotePath(path).split('/').filter(Boolean);
  if (parts.length <= 1) return;

  let cur = '';
  for (let j = 0; j < parts.length - 1; j++) {
    cur += (j === 0 ? '' : '/') + parts[j];
    try { await FileSystemService.makeDirectory(projectId, cur); } catch (err) {}
  }
};

export const LiveSyncService = {
  connectionState: 'DISCONNECTED' as ConnectionState,
  ws: null as WebSocket | null,
  syncProjectId: null as string | null,
  remoteTree: [] as string[],
  remoteWorkspaceName: FALLBACK_WORKSPACE_NAME,
  remoteWorkspaceRawName: FALLBACK_WORKSPACE_NAME,
  remoteWorkspaceKey: workspaceKeyFrom(FALLBACK_WORKSPACE_NAME) as string,
  remoteTreeProjectId: null as string | null,
  onRemoteTreeUpdate: null as RemoteTreeHandler | null,
  onRemoteFileContent: null as RemoteFileHandler | null,
  onCommandOutput: null as ((cmdId: string, output: string) => void) | null,
  onCommandExit: null as ((cmdId: string, code: number) => void) | null,
  onRemoteShellOutput: null as ((shellId: string, output: string) => void) | null,
  onRemoteShellExit: null as ((shellId: string, code: number | null) => void) | null,
  onFullSyncProgress: null as ((downloaded: number, total: number) => void) | null,
  fullSyncExpectedCount: 0 as number,
  fullSyncReceivedCount: 0 as number,
  isFullSyncInProgress: false as boolean,
  fullSyncCompletionTimer: null as any,
  logs: [] as { id: string; time: string; msg: string }[],
  listeners: new Set<(logs: any[]) => void>(),
  fileResolvers: new Map<string, { resolve: (content: string) => void, reject: (err: any) => void }>(),
  syncQueue: new Map<string, { content: string, timer: any }>(),

  pingInterval: null as any,
  reconnectTimer: null as any,
  reconnectAttempts: 0,
  intentionallyDisconnected: false,
  lastRoomCode: null as string | null,
  appStateSubscription: null as any,
  remoteShellConfigs: new Map<string, { cols: number; rows: number }>(),
  pendingRemoteShellInput: new Map<string, string>(),

  addLog(msg: string) {
    console.log(`[LiveSync] ${msg}`);
    const newLog = { id: Math.random().toString(), time: new Date().toLocaleTimeString(), msg };
    this.logs = [newLog, ...this.logs].slice(0, 50);
    this.notify();
  },

  subscribe(listener: (logs: any[]) => void) {
    this.listeners.add(listener);
    listener(this.logs);
    return () => { this.listeners.delete(listener); };
  },

  notify() {
    this.listeners.forEach(l => l(this.logs));
  },

  setConnectionState(state: ConnectionState) {
    if (this.connectionState !== state) {
      const previousState = this.connectionState;
      this.connectionState = state;
      const project = this.syncProjectId || this.remoteTreeProjectId || undefined;
      DebugService.log('liveSync', state === 'ERROR' ? 'error' : state === 'DISCONNECTED' ? 'warn' : 'info', `Live Sync: ${previousState} -> ${state}`, { project, previousState, state });
      this.notify();
    }
  },

  isConnected() {
    return this.connectionState === 'CONNECTED' && !!this.ws && this.ws.readyState === WebSocket.OPEN;
  },

  isProjectLocalMirror(project?: ProjectInfo | null) {
    return isLocalMirrorProject(project);
  },

  isRemoteSyncProject(projectId?: string | null, project?: ProjectInfo | null) {
    return !!projectId && projectId === this.syncProjectId && !isLocalMirrorProject(project);
  },

  async getProject(projectId?: string | null): Promise<ProjectInfo | null> {
    if (!projectId) return null;
    const projects = await FileSystemService.getProjects();
    return projects.find(p => p.id === projectId) || null;
  },

  async ensureSyncProject(workspaceName?: string | null, workspaceId?: string | null) {
    const rawName = String(workspaceName || this.remoteWorkspaceName || FALLBACK_WORKSPACE_NAME).trim() || FALLBACK_WORKSPACE_NAME;
    const nextName = workspaceTitle(rawName);
    const workspaceKey = workspaceKeyFrom(rawName, workspaceId);
    const desiredId = projectIdForWorkspace(rawName, workspaceKey);

    this.remoteWorkspaceName = nextName;
    this.remoteWorkspaceRawName = rawName;
    this.remoteWorkspaceKey = workspaceKey;

    const projects = await FileSystemService.getProjects();
    let project = projects.find(p => p.id === this.syncProjectId && p.liveSyncWorkspaceKey === workspaceKey)
      || projects.find(p => p.liveSyncWorkspaceKey === workspaceKey)
      || projects.find(p => p.id === desiredId && (p.type === 'sync' || p.type === 'sync-local' || !p.liveSyncWorkspaceKey))
      || projects.find(p => !p.liveSyncWorkspaceKey && p.type === 'sync' && p.name === nextName)
      || projects.find(p => !p.liveSyncWorkspaceKey && p.id === LEGACY_SYNC_PROJECT_ID && (p.name === nextName || p.name === 'LiveSync Workspace' || p.name === FALLBACK_WORKSPACE_NAME));

    if (!project) {
      project = await FileSystemService.createEmptyProject(desiredId, nextName);
    }

    const localMirror = isLocalMirrorProject(project);
    this.syncProjectId = project.id;
    this.remoteTreeProjectId = project.id;

    await FileSystemService.updateProject(project.id, {
      name: nextName,
      type: localMirror ? 'sync-local' : 'sync',
      liveSyncMode: localMirror ? 'local' : 'remote',
      liveSyncWorkspaceKey: workspaceKey,
      liveSyncWorkspaceName: rawName,
    });
    FileSystemService.notify();
    return project.id;
  },

  async getProjectSnapshot(projectId: string): Promise<Record<string, string>> {
    const tree = await FileSystemService.getProjectFileTree(projectId);
    const paths = collectFiles(tree).sort((a, b) => a.localeCompare(b));
    const snapshot: Record<string, string> = {};

    for (const path of paths) {
      try {
        const content = await FileSystemService.readFile(projectId, path);
        snapshot[path] = hashContent(content);
      } catch (e) {}
    }

    return snapshot;
  },

  async getLocalChangedFiles(projectId?: string | null): Promise<LiveSyncLocalChange[]> {
    const targetProjectId = projectId || this.syncProjectId;
    if (!targetProjectId) return [];

    const project = await this.getProject(targetProjectId);
    if (!project) return [];

    const baseline = project.liveSyncBaseline || {};
    const snapshot = await this.getProjectSnapshot(targetProjectId);
    const paths = Array.from(new Set([...Object.keys(baseline), ...Object.keys(snapshot)])).sort((a, b) => a.localeCompare(b));

    return paths.reduce<LiveSyncLocalChange[]>((changes, path) => {
      if (!baseline[path] && snapshot[path]) {
        changes.push({ path, status: 'added', type: 'file' });
      } else if (baseline[path] && !snapshot[path]) {
        changes.push({ path, status: 'deleted', type: 'file' });
      } else if (baseline[path] !== snapshot[path]) {
        changes.push({ path, status: 'modified', type: 'file' });
      }
      return changes;
    }, []);
  },

  async markProjectAsLocalMirror(projectId?: string | null) {
    const targetProjectId = projectId || this.syncProjectId;
    if (!targetProjectId) return;

    const project = await this.getProject(targetProjectId);
    const baseline = await this.getProjectSnapshot(targetProjectId);
    await FileSystemService.updateProject(targetProjectId, {
      type: 'sync-local',
      liveSyncMode: 'local',
      liveSyncBaseline: baseline,
      liveSyncDownloadedAt: Date.now(),
      liveSyncWorkspaceKey: project?.liveSyncWorkspaceKey || this.remoteWorkspaceKey,
      liveSyncWorkspaceName: project?.liveSyncWorkspaceName || this.remoteWorkspaceName,
    });
    FileSystemService.notify();
    this.notify();
  },

  scheduleFullSyncCompletion(delay = 2500) {
    if (this.fullSyncCompletionTimer) {
      clearTimeout(this.fullSyncCompletionTimer);
    }
    this.fullSyncCompletionTimer = setTimeout(() => {
      this.fullSyncCompletionTimer = null;
      void this.completeFullSync();
    }, delay);
  },

  async completeFullSync() {
    if (!this.isFullSyncInProgress) return;
    this.isFullSyncInProgress = false;
    await this.markProjectAsLocalMirror(this.syncProjectId);
    this.addLog(`Download concluído. ${this.fullSyncReceivedCount} arquivos salvos como cópia local do DevFlux.`);
    FileSystemService.notify();
  },

  async writeIncomingFile(projectId: string, path: string, content: string) {
    await ensureLocalParents(projectId, path);
    await FileSystemService.writeFile(projectId, path, content);
  },

  async handleIncomingFile(path: string, content: string, workspaceName?: string | null, workspaceId?: string | null, notifyEditor = false) {
    const cleanPath = cleanRemotePath(path);
    if (!cleanPath) return;

    this.addLog(`Arquivo recebido: ${cleanPath} (${content.length} bytes)`);
    if (this.isFullSyncInProgress) {
      this.fullSyncReceivedCount++;
      this.onFullSyncProgress?.(this.fullSyncReceivedCount, this.fullSyncExpectedCount);
    }

    const projectId = await this.ensureSyncProject(workspaceName, workspaceId);
    const project = await this.getProject(projectId);
    const localMirror = isLocalMirrorProject(project);
    const shouldWriteLocal = this.isFullSyncInProgress || !localMirror;

    if (shouldWriteLocal) {
      await this.writeIncomingFile(projectId, cleanPath, content);
      FileSystemService.notify();
    }

    if (notifyEditor && (!localMirror || this.isFullSyncInProgress)) {
      this.onRemoteFileContent?.(cleanPath, content, projectId);
    }

    if (this.fileResolvers.has(cleanPath)) {
      this.fileResolvers.get(cleanPath)!.resolve(content);
      this.fileResolvers.delete(cleanPath);
    }

    if (this.isFullSyncInProgress) {
      this.scheduleFullSyncCompletion();
    }
  },

  connect(roomCode: string) {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      const currentWs = this.ws;
      this.ws = null;
      currentWs.onclose = null;
      currentWs.close();
    }

    this.intentionallyDisconnected = false;
    this.lastRoomCode = roomCode;

    if (!this.appStateSubscription) {
      this.appStateSubscription = AppState.addEventListener('change', this._handleAppStateChange.bind(this));
    }

    this.setConnectionState(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');
    this.addLog(`Conectando ao Relay: ${RELAY_URL}...`);

    try {
        this.ws = new WebSocket(RELAY_URL);

        this.ws.onopen = async () => {
            this.setConnectionState('CONNECTED');
            this.reconnectAttempts = 0;
            this.addLog(`Conectado com sucesso! Entrando na sala ${roomCode}...`);
            this.ws?.send(JSON.stringify({ type: 'join', role: 'app', roomId: roomCode }));

            this.pingInterval = setInterval(() => {
              if (this.isConnected()) {
                this.ws?.send(JSON.stringify({ type: 'ping' }));
              }
            }, 15000);

            this.remoteShellConfigs.forEach((size, shellId) => {
              this.ws?.send(JSON.stringify({ type: 'shell_start', shellId, ...size }));
            });
            this.pendingRemoteShellInput.forEach((payload, shellId) => {
              this.ws?.send(JSON.stringify({ type: 'shell_input', shellId, payload }));
            });
            this.pendingRemoteShellInput.clear();

            setTimeout(() => {
              if (this.remoteTree.length === 0 && this.isConnected()) {
                this.ws?.send(JSON.stringify({ type: 'request_tree' }));
              }
            }, 1200);

            FileSystemService.notify();
            this.notify();
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'file_update' && data.path && data.content !== undefined) {
            await this.handleIncomingFile(data.path, data.content, data.workspaceName, data.workspaceId, false);
          } else if (data.type === 'tree_data' && data.paths) {
            const projectId = await this.ensureSyncProject(data.workspaceName, data.workspaceId);
            this.remoteTree = data.paths.map((path: string) => cleanRemotePath(path)).filter(Boolean);
            this.remoteTreeProjectId = projectId;
            this.addLog(`Árvore recebida: ${this.remoteTree.length} arquivos`);
            this.onRemoteTreeUpdate?.(this.remoteTree, projectId);
            if (this.isFullSyncInProgress) {
              this.scheduleFullSyncCompletion();
            }
            FileSystemService.notify();
            this.notify();
          } else if (data.type === 'file_content' && data.path && data.content !== undefined) {
            await this.handleIncomingFile(data.path, data.content, data.workspaceName, data.workspaceId, true);
          } else if (data.type === 'operation_result') {
            this.addLog(data.error ? `Erro remoto: ${data.error}` : (data.message || 'Operação remota concluída.'));
          } else if (data.type === 'command_output' && data.output) {
            if (this.onCommandOutput) this.onCommandOutput(data.cmdId, data.output);
          } else if (data.type === 'command_exit') {
            if (this.onCommandExit) this.onCommandExit(data.cmdId, data.code);
          } else if (data.type === 'shell_output' && data.shellId) {
            if (this.onRemoteShellOutput) this.onRemoteShellOutput(data.shellId, data.output || '');
          } else if (data.type === 'shell_exit' && data.shellId) {
            if (this.onRemoteShellExit) this.onRemoteShellExit(data.shellId, data.code ?? null);
          }
        } catch (err: any) {
          this.addLog('Erro no parse da mensagem.');
          DebugService.log('liveSync', 'error', 'Falha ao interpretar mensagem do Live Sync.', { project: this.syncProjectId || this.remoteTreeProjectId || undefined, error: err?.message || String(err) });
        }
      };

      this.ws.onerror = () => {
        this.addLog('Erro de conexão.');
        DebugService.log('liveSync', 'error', 'Erro de conexão no WebSocket do Live Sync.', { project: this.syncProjectId || this.remoteTreeProjectId || undefined, relayUrl: RELAY_URL, roomCode });
        this.setConnectionState('ERROR');
      };

      this.ws.onclose = () => {
        this.addLog('Desconectado do servidor de Sync.');
        DebugService.log('liveSync', this.intentionallyDisconnected ? 'info' : 'warn', this.intentionallyDisconnected ? 'Live Sync desconectado pelo usuário.' : 'Live Sync desconectou inesperadamente.', { project: this.syncProjectId || this.remoteTreeProjectId || undefined, relayUrl: RELAY_URL, roomCode, reconnectAttempts: this.reconnectAttempts });
        this.syncProjectId = null;
        this.remoteTreeProjectId = null;
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        this.ws = null;
        this.setConnectionState('DISCONNECTED');
        this.notify();
        this.scheduleReconnect();
      };

    } catch (e: any) {
      this.addLog(`Erro ao conectar: ${e.message}`);
      DebugService.log('liveSync', 'error', `Erro ao conectar Live Sync: ${e.message}`, { project: this.syncProjectId || this.remoteTreeProjectId || undefined, relayUrl: RELAY_URL, roomCode });
      this.setConnectionState('ERROR');
      this.scheduleReconnect();
    }
  },

  scheduleReconnect() {
    if (this.intentionallyDisconnected || !this.lastRoomCode || this.reconnectTimer) return;
    const delay = Math.min(10000, 1000 * Math.pow(1.6, this.reconnectAttempts));
    this.reconnectAttempts += 1;
    this.addLog(`Reconectando ao LiveSync em ${Math.ceil(delay / 1000)}s...`);
    DebugService.log('liveSync', 'warn', 'Live Sync agendou reconexão.', { project: this.syncProjectId || this.remoteTreeProjectId || undefined, delayMs: delay, reconnectAttempts: this.reconnectAttempts });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionallyDisconnected && this.lastRoomCode && !this.isConnected()) {
        this.connect(this.lastRoomCode);
      }
    }, delay);
  },

  _handleAppStateChange(nextAppState: AppStateStatus) {
    if (nextAppState === 'active' && this.lastRoomCode && !this.isConnected()) {
      this.addLog('App retornou ao primeiro plano, tentando reconectar ao LiveSync...');
      this.connect(this.lastRoomCode);
    }
  },

  disconnect() {
    this.intentionallyDisconnected = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.fullSyncCompletionTimer) {
      clearTimeout(this.fullSyncCompletionTimer);
      this.fullSyncCompletionTimer = null;
    }
    this.isFullSyncInProgress = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.syncProjectId = null;
    this.remoteTreeProjectId = null;
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.setConnectionState('DISCONNECTED');
    this.notify();
  },

  sendFileUpdate(path: string, content: string) {
    if (this.isConnected()) {
      this.ws?.send(JSON.stringify({
        type: 'file_update',
        path: cleanRemotePath(path),
        content
      }));
    }
  },

  queueFileUpdate(path: string, content: string, delayMs = 600) {
    if (this.syncQueue.has(path)) {
      clearTimeout(this.syncQueue.get(path)!.timer);
    }
    const timer = setTimeout(() => {
      this.syncQueue.delete(path);
      this.sendFileUpdate(path, content);
    }, delayMs);
    this.syncQueue.set(path, { content, timer });
  },

  requestSaveFile(path: string) {
    if (this.isConnected()) {
      const cleanPath = cleanRemotePath(path);
      this.addLog(`Solicitando salvamento no PC: ${cleanPath}`);
      this.ws?.send(JSON.stringify({ type: 'save_file', path: cleanPath }));
    }
  },

  async requestFullWorkspace() {
    if (!this.isConnected()) {
      this.addLog('Não conectado ao VS Code. Conecte primeiro.');
      DebugService.log('liveSync', 'warn', 'Sincronização completa solicitada sem Live Sync conectado.', { project: this.syncProjectId || this.remoteTreeProjectId || undefined });
      return;
    }

    if (!this.syncProjectId) {
      await this.ensureSyncProject(this.remoteWorkspaceRawName, this.remoteWorkspaceKey.startsWith('id:') ? this.remoteWorkspaceKey.slice(3) : null);
    }

    this.isFullSyncInProgress = true;
    this.fullSyncReceivedCount = 0;
    this.fullSyncExpectedCount = this.remoteTree.length || 0;
    this.addLog(`Baixando workspace completo (${this.fullSyncExpectedCount} arquivos)...`);
    this.ws?.send(JSON.stringify({ type: 'request_full_sync' }));
    this.scheduleFullSyncCompletion(12000);
  },

  requestRemoteTree() {
    if (this.isConnected()) {
      this.ws?.send(JSON.stringify({ type: 'request_tree' }));
    }
  },

  requestRemoteFile(path: string) {
    const cleanPath = cleanRemotePath(path);
    if (this.isConnected()) {
      this.addLog(`Solicitando arquivo: ${cleanPath}`);
      this.ws?.send(JSON.stringify({ type: 'request_file', path: cleanPath }));
    } else {
      this.addLog(`Falha ao solicitar ${cleanPath}: WebSocket não conectado`);
    }
  },

  deleteRemotePath(path: string) {
    const cleanPath = cleanRemotePath(path);
    if (this.isConnected()) {
      this.addLog(`Excluindo no PC: ${cleanPath}`);
      this.ws?.send(JSON.stringify({ type: 'delete_path', path: cleanPath }));
    }
  },

  moveRemotePath(fromPath: string, toPath: string) {
    const cleanFrom = cleanRemotePath(fromPath);
    const cleanTo = cleanRemotePath(toPath);
    if (this.isConnected()) {
      this.addLog(`Movendo no PC: ${cleanFrom} -> ${cleanTo}`);
      this.ws?.send(JSON.stringify({ type: 'move_path', fromPath: cleanFrom, toPath: cleanTo }));
    }
  },

  createRemoteDirectory(path: string) {
    const cleanPath = cleanRemotePath(path);
    if (this.isConnected()) {
      this.addLog(`Criando pasta no PC: ${cleanPath}`);
      this.ws?.send(JSON.stringify({ type: 'create_directory', path: cleanPath }));
    }
  },

  async getFileContentAsync(path: string): Promise<string> {
    if (!this.syncProjectId) {
      await this.ensureSyncProject(this.remoteWorkspaceRawName, this.remoteWorkspaceKey.startsWith('id:') ? this.remoteWorkspaceKey.slice(3) : null);
    }
    if (!this.syncProjectId) throw new Error('LiveSync não está ativo.');

    const cleanPath = cleanRemotePath(path);
    const project = await this.getProject(this.syncProjectId);

    try {
      return await FileSystemService.readFile(this.syncProjectId, cleanPath);
    } catch (err) {
      if (isLocalMirrorProject(project)) {
        throw err;
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.fileResolvers.delete(cleanPath);
          reject(new Error(`Timeout aguardando o arquivo ${cleanPath} do PC.`));
        }, 8000);

        this.fileResolvers.set(cleanPath, {
          resolve: (content) => {
            clearTimeout(timeout);
            resolve(content);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          }
        });

        this.requestRemoteFile(cleanPath);
      });
    }
  },

  execCommand(cmdId: string, command: string, args: string[]) {
    if (this.isConnected()) {
      this.addLog(`Executando comando remoto: ${command} ${args.join(' ')}`);
      this.ws?.send(JSON.stringify({
        type: 'exec_command',
        cmdId,
        command,
        args
      }));
    } else {
      DebugService.log('shell', 'error', 'Comando remoto solicitado sem Live Sync conectado.', { cmdId, command, args });
      if (this.onCommandOutput) {
        this.onCommandOutput(cmdId, "Error: VS Code LiveSync is not connected. Use 'connect <ip>' first.\n");
      }
      if (this.onCommandExit) {
        this.onCommandExit(cmdId, 1);
      }
    }
  },

  startRemoteShell(shellId: string, cols = 80, rows = 24) {
    this.remoteShellConfigs.set(shellId, { cols, rows });
    if (this.isConnected()) {
      this.ws?.send(JSON.stringify({ type: 'shell_start', shellId, cols, rows }));
      return true;
    }
    DebugService.log('shell', 'warn', 'Shell remoto solicitado com Live Sync desconectado.', { shellId });
    const message = 'LiveSync desconectado. Reconecte ao VS Code para usar o shell remoto.\n';
    if (this.onRemoteShellOutput) this.onRemoteShellOutput(shellId, message);
    this.scheduleReconnect();
    return false;
  },

  sendRemoteShellInput(shellId: string, payload: string) {
    if (this.isConnected()) {
      this.ws?.send(JSON.stringify({ type: 'shell_input', shellId, payload }));
    } else {
      DebugService.log('shell', 'warn', 'Entrada de shell remoto enfileirada porque o Live Sync está desconectado.', { shellId, bytes: payload.length });
      this.pendingRemoteShellInput.set(
        shellId,
        `${this.pendingRemoteShellInput.get(shellId) || ''}${payload}`
      );
      this.scheduleReconnect();
    }
  },

  resizeRemoteShell(shellId: string, cols: number, rows: number) {
    if (this.isConnected()) {
      this.ws?.send(JSON.stringify({ type: 'shell_resize', shellId, cols, rows }));
    }
  },

  stopRemoteShell(shellId: string) {
    this.remoteShellConfigs.delete(shellId);
    this.pendingRemoteShellInput.delete(shellId);
    if (this.isConnected()) {
      this.ws?.send(JSON.stringify({ type: 'shell_stop', shellId }));
    }
  },

  async pushLocalWorkspaceToPC(projectId?: string | null) {
    const targetProjectId = projectId || this.syncProjectId;
    if (!targetProjectId || !this.isConnected()) {
      this.addLog('Conecte ao PC antes de enviar alterações locais.');
      return;
    }

    this.addLog('Preparando para enviar alterações locais...');
    try {
      const changes = await this.getLocalChangedFiles(targetProjectId);
      const paths = changes.length > 0
        ? changes.map(change => change.path)
        : collectFiles(await FileSystemService.getProjectFileTree(targetProjectId));

      await this.pushFilesToPC(paths, targetProjectId);
    } catch (e) {
      this.addLog(`Erro ao enviar workspace: ${e}`);
    }
  },

  async pushFilesToPC(paths: string[], projectId?: string | null) {
    const targetProjectId = projectId || this.syncProjectId;
    if (!targetProjectId || !this.isConnected()) {
      this.addLog('Conecte ao PC antes de enviar arquivos locais.');
      return;
    }

    const project = await this.getProject(targetProjectId);
    const baseline = { ...(project?.liveSyncBaseline || {}) };
    const uniquePaths = Array.from(new Set(paths.map(cleanRemotePath).filter(Boolean))).sort((a, b) => a.localeCompare(b));

    this.addLog(`Preparando para enviar ${uniquePaths.length} arquivo(s) locais...`);
    try {
      let sentCount = 0;
      let deletedCount = 0;

      for (const path of uniquePaths) {
        try {
          const content = await FileSystemService.readFile(targetProjectId, path);
          this.sendFileUpdate(path, content);
          this.requestSaveFile(path);
          baseline[path] = hashContent(content);
          sentCount++;
        } catch (err) {
          if (baseline[path]) {
            this.deleteRemotePath(path);
            delete baseline[path];
            deletedCount++;
          } else {
            this.addLog(`Não foi possível ler o arquivo local: ${path}`);
          }
        }
      }

      await FileSystemService.updateProject(targetProjectId, {
        type: 'sync-local',
        liveSyncMode: 'local',
        liveSyncBaseline: baseline,
        liveSyncWorkspaceKey: project?.liveSyncWorkspaceKey || this.remoteWorkspaceKey,
        liveSyncWorkspaceName: project?.liveSyncWorkspaceName || this.remoteWorkspaceName,
      });
      this.addLog(`Sincronização concluída. ${sentCount} arquivo(s) enviados${deletedCount ? ` e ${deletedCount} exclusão(ões) aplicadas` : ''}.`);
      FileSystemService.notify();
      this.notify();
    } catch (e) {
      this.addLog(`Erro ao enviar arquivos selecionados: ${e}`);
    }
  }
};
