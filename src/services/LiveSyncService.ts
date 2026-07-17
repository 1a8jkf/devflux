import { FileSystemService } from './FileSystemService';
import { AppState, AppStateStatus } from 'react-native';

const RELAY_URL = 'ws://82.29.61.16:8080';

export const LiveSyncService = {
  ws: null as WebSocket | null,
  syncProjectId: null as string | null,
  remoteTree: [] as string[],
  onRemoteTreeUpdate: null as ((paths: string[]) => void) | null,
  onRemoteFileContent: null as ((path: string, content: string) => void) | null,
  onCommandOutput: null as ((cmdId: string, output: string) => void) | null,
  onCommandExit: null as ((cmdId: string, code: number) => void) | null,
  logs: [] as { id: string; time: string; msg: string }[],
  listeners: new Set<(logs: any[]) => void>(),
  fileResolvers: new Map<string, { resolve: (content: string) => void, reject: (err: any) => void }>(),

  pingInterval: null as any,
  lastRoomCode: null as string | null,
  appStateSubscription: null as any,

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

  connect(roomCode: string) {
    if (this.ws) {
        this.ws.close();
    }
    
    this.lastRoomCode = roomCode;

    if (!this.appStateSubscription) {
      this.appStateSubscription = AppState.addEventListener('change', this._handleAppStateChange.bind(this));
    }
    
    this.addLog(`Conectando ao Relay: ${RELAY_URL}...`);
    
    try {
        this.ws = new WebSocket(RELAY_URL);
        
        this.ws.onopen = async () => {
            this.addLog(`Conectado com sucesso! Entrando na sala ${roomCode}...`);
            this.ws?.send(JSON.stringify({ type: 'join', role: 'app', roomId: roomCode }));
            
            // Start Heartbeat
            this.pingInterval = setInterval(() => {
              if (this.ws && this.ws.readyState === 1) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
              }
            }, 15000); // 15 seconds

            try {
              const projects = await FileSystemService.getProjects();
              const existing = projects.find(p => p.name === 'LiveSync Workspace');
              if (!existing) {
                const newProj = await FileSystemService.createEmptyProject('LiveSync Workspace', 'html');
                this.syncProjectId = newProj.id;
                this.addLog('Criado "LiveSync Workspace".');
              } else {
                this.syncProjectId = existing.id;
                this.addLog(`Usando projeto existente: ${existing.id}`);
              }
              // Now that syncProjectId is set, request the file tree immediately
              this.requestRemoteTree();
              this.addLog('Solicitando lista de arquivos do PC...');
            } catch (error: any) {
              this.addLog(`Erro ao configurar workspace: ${error?.message || error}`);
            }
            // Always notify FileSystemService subscribers so WelcomeScreen refreshes
            FileSystemService.notify();
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'file_update' && data.path && data.content !== undefined) {
            this.addLog(`Atualização recebida: ${data.path}`);
            if (this.syncProjectId) {
              const projects = await FileSystemService.getProjects();
              const project = projects.find(p => p.name === 'LiveSync Workspace');
              if (project) {
                const parts = data.path.split('/');
                if (parts.length > 1) {
                  let cur = '';
                  for (let j = 0; j < parts.length - 1; j++) {
                    cur += (j === 0 ? '' : '/') + parts[j];
                    try { await FileSystemService.makeDirectory(project.id, cur); } catch(err) {}
                  }
                }
                await FileSystemService.writeFile(project.id, data.path, data.content, true);
                FileSystemService.notify(); // Refresh Explorer tree
                if (this.fileResolvers.has(data.path)) {
                  this.fileResolvers.get(data.path)!.resolve(data.content);
                  this.fileResolvers.delete(data.path);
                }
              }
            }
          } else if (data.type === 'tree_data' && data.paths) {
            this.remoteTree = data.paths;
            this.addLog(`Árvore recebida: ${data.paths.length} arquivos`);
            if (this.onRemoteTreeUpdate) this.onRemoteTreeUpdate(this.remoteTree);
          } else if (data.type === 'file_content' && data.path && data.content !== undefined) {
            this.addLog(`Arquivo recebido: ${data.path} (${data.content.length} bytes)`);
            if (this.onRemoteFileContent) this.onRemoteFileContent(data.path, data.content);
            if (this.fileResolvers.has(data.path)) {
              this.fileResolvers.get(data.path)!.resolve(data.content);
              this.fileResolvers.delete(data.path);
            }
          } else if (data.type === 'command_output' && data.output) {
            if (this.onCommandOutput) this.onCommandOutput(data.cmdId, data.output);
          } else if (data.type === 'command_exit') {
            if (this.onCommandExit) this.onCommandExit(data.cmdId, data.code);
          }
        } catch (err) {
          this.addLog(`Erro no parse da mensagem.`);
        }
      };

      this.ws.onerror = () => {
        this.addLog('Erro de conexão.');
        this.ws = null;
      };

      this.ws.onclose = () => {
        this.addLog('Desconectado do servidor de Sync.');
        this.syncProjectId = null;
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        this.ws = null;
      };

    } catch (e: any) {
      this.addLog(`Erro ao conectar: ${e.message}`);
    }
  },

  _handleAppStateChange(nextAppState: AppStateStatus) {
    if (nextAppState === 'active' && this.lastRoomCode && (!this.ws || this.ws.readyState !== 1)) {
      this.addLog('App retornou ao primeiro plano, tentando reconectar ao LiveSync...');
      this.connect(this.lastRoomCode);
    }
  },

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.syncProjectId = null;
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  },

  sendFileUpdate(path: string, content: string) {
    if (this.ws && this.ws.readyState === 1 /* WebSocket.OPEN */) {
      this.ws.send(JSON.stringify({
        type: 'file_update',
        path,
        content
      }));
    }
  },

  requestSaveFile(path: string) {
    if (this.ws && this.ws.readyState === 1 /* WebSocket.OPEN */) {
      this.addLog(`Solicitando salvamento no PC: ${path}`);
      this.ws.send(JSON.stringify({ type: 'save_file', path }));
    }
  },

  requestFullWorkspace() {
    if (this.ws && this.ws.readyState === 1 /* WebSocket.OPEN */) {
      this.addLog(`Solicitando Workspace Completo (Modo Offline)...`);
      this.ws.send(JSON.stringify({ type: 'request_full_sync' }));
    }
  },

  requestRemoteTree() {
    if (this.ws && this.ws.readyState === 1 /* WebSocket.OPEN */) {
      this.ws.send(JSON.stringify({ type: 'request_tree' }));
    }
  },

  requestRemoteFile(path: string) {
    if (this.ws && this.ws.readyState === 1 /* WebSocket.OPEN */) {
      this.addLog(`Solicitando arquivo: ${path}`);
      this.ws.send(JSON.stringify({ type: 'request_file', path }));
    } else {
      this.addLog(`Falha ao solicitar ${path}: WebSocket não conectado`);
    }
  },

  async getFileContentAsync(path: string): Promise<string> {
    if (!this.syncProjectId) throw new Error("LiveSync não está ativo.");
    
    try {
      // First try to read locally
      const { FileSystemService } = await import('./FileSystemService');
      const content = await FileSystemService.readFile(this.syncProjectId, path);
      return content;
    } catch (err) {
      // Not downloaded yet, request it
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.fileResolvers.delete(path);
          reject(new Error(`Timeout aguardando o arquivo ${path} do PC.`));
        }, 8000);

        this.fileResolvers.set(path, {
          resolve: (content) => {
            clearTimeout(timeout);
            resolve(content);
          },
          reject: (err) => {
            clearTimeout(timeout);
            reject(err);
          }
        });

        this.requestRemoteFile(path);
      });
    }
  },

  execCommand(cmdId: string, command: string, args: string[]) {
    if (this.ws && this.ws.readyState === 1 /* WebSocket.OPEN */) {
      this.addLog(`Executando comando remoto: ${command} ${args.join(' ')}`);
      this.ws.send(JSON.stringify({
        type: 'exec_command',
        cmdId,
        command,
        args
      }));
    } else {
      if (this.onCommandOutput) {
        this.onCommandOutput(cmdId, "Error: VS Code LiveSync is not connected. Use 'connect <ip>' first.\n");
      }
      if (this.onCommandExit) {
        this.onCommandExit(cmdId, 1);
      }
    }
  },

  async pushLocalWorkspaceToPC() {
    if (!this.syncProjectId || !this.ws || this.ws.readyState !== 1 /* WebSocket.OPEN */) return;
    
    this.addLog(`📤 Preparando para Enviar Alterações Locais...`);
    try {
      const { FileSystemService } = await import('./FileSystemService');
      const files = await FileSystemService.getProjectFileTree(this.syncProjectId);
      
      let count = 0;
      const sendFilesRecursive = async (nodes: any[], currentPath: string = '') => {
        for (const node of nodes) {
          const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;
          if (node.isDirectory) {
            if (node.children) {
              await sendFilesRecursive(node.children, fullPath);
            }
          } else {
            try {
              const content = await FileSystemService.readFile(this.syncProjectId!, fullPath);
              this.sendFileUpdate(fullPath, content);
              count++;
            } catch (err) {}
          }
        }
      };
      
      await sendFilesRecursive(files);
      this.addLog(`✅ Sincronização concluída! ${count} arquivos enviados para o PC.`);
    } catch (e) {
      this.addLog(`❌ Erro ao enviar workspace: ${e}`);
    }
  }
};
