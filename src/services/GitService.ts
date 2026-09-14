import { NodeRunner } from '../utils/nodeRunner';
import { FileSystemService, PROJECTS_ROOT } from './FileSystemService';

export interface ChangedFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
  addedLines?: number;
  removedLines?: number;
  modifiedLines?: number;
  totalChangedLines?: number;
}

const emptyLineStats = () => ({
  addedLines: 0,
  removedLines: 0,
  modifiedLines: 0,
  totalChangedLines: 0,
});

const countTextLines = (content: string) => {
  const normalized = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized) return 0;
  const lines = normalized.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
};

const lineStatsFromNumstat = (output: string) => {
  const line = output.split('\n').find(item => item.trim());
  if (!line) return emptyLineStats();

  const [rawAdded, rawRemoved] = line.trim().split(/\s+/);
  if (rawAdded === '-' || rawRemoved === '-') return emptyLineStats();

  const rawAddedLines = Number(rawAdded);
  const rawRemovedLines = Number(rawRemoved);
  if (!Number.isFinite(rawAddedLines) || !Number.isFinite(rawRemovedLines)) return emptyLineStats();

  const modifiedLines = Math.min(rawAddedLines, rawRemovedLines);
  const addedLines = Math.max(0, rawAddedLines - modifiedLines);
  const removedLines = Math.max(0, rawRemovedLines - modifiedLines);

  return {
    addedLines,
    removedLines,
    modifiedLines,
    totalChangedLines: addedLines + removedLines + modifiedLines,
  };
};

export const GitService = {
  
  async runLinuxGit(projectId: string, args: string[]): Promise<string> {
    await NodeRunner.init();
    
    return new Promise((resolve, reject) => {
      const reqId = Math.random().toString(36).substring(7);
      
      const unsubscribe = NodeRunner.addListener((msg: any) => {
        if (msg.type === 'LINUX_GIT_RESULT' && msg.reqId === reqId) {
          unsubscribe();
          if (msg.error) {
             reject(new Error(msg.error));
          } else {
             resolve(msg.payload || '');
          }
        }
      });
      
      NodeRunner.send({
        type: 'LINUX_GIT_COMMAND',
        reqId,
        projectsRoot: PROJECTS_ROOT,
        cwd: `${PROJECTS_ROOT}${projectId}`,
        args
      });
    });
  },

  async clone(projectId: string, url: string, branch: string = 'main'): Promise<void> {
    const { GithubService } = await import('./GithubService');
    const token = await GithubService.getToken();
    
    // Inject token into URL for authentication (works for private repos)
    let authUrl = url;
    if (token && url.startsWith('https://github.com/')) {
        authUrl = url.replace('https://github.com/', `https://${token}@github.com/`);
    }

    await NodeRunner.init();
    
    return new Promise((resolve, reject) => {
      const reqId = Math.random().toString(36).substring(7);
      
      const unsubscribe = NodeRunner.addListener((msg: any) => {
        if (msg.type === 'LINUX_GIT_RESULT' && msg.reqId === reqId) {
          unsubscribe();
          if (msg.error) reject(new Error(msg.error));
          else resolve();
        }
      });
      
      NodeRunner.send({
        type: 'LINUX_GIT_COMMAND',
        reqId,
        projectsRoot: PROJECTS_ROOT,
        cwd: PROJECTS_ROOT,
        args: ['clone', '--depth', '1', '-b', branch, authUrl, projectId]
      });
    });
  },

  async initAndAddRemote(projectId: string, url: string, branch: string = 'main'): Promise<void> {
    await this.runLinuxGit(projectId, ['init', '-b', branch]);
    await this.runLinuxGit(projectId, ['remote', 'add', 'origin', url]);
  },

  async getChangedFiles(projectId: string): Promise<ChangedFile[]> {
    try {
      const output = await this.runLinuxGit(projectId, ['status', '--porcelain']);
      const changes: ChangedFile[] = [];
      const lines = output.split('\n');
      
      for (let line of lines) {
        if (!line.trim()) continue;
        const status = line.substring(0, 2);
        const file = line.substring(3).trim();
        
        let parsedStatus: ChangedFile['status'] = 'modified';
        if (status === '??') parsedStatus = 'untracked';
        else if (status.includes('A')) parsedStatus = 'added';
        else if (status.includes('D')) parsedStatus = 'deleted';
        else if (status.includes('M')) parsedStatus = 'modified';
        
        changes.push({ path: file, status: parsedStatus });
      }
      return await Promise.all(changes.map(async change => ({
        ...change,
        ...(await this.getChangedFileLineStats(projectId, change)),
      })));
    } catch(e: any) {
       console.error('[GitService] Error getting status:', e);
       // Tratamento de pasta não sendo repositório git
       if (e.message.includes('not a git repository')) {
          // Poderia retornar untracked tudo aqui, mas vamos retornar vazio por enquanto.
       }
       return [];
    }
  },

  async getChangedFileLineStats(projectId: string, change: ChangedFile) {
    if (!change.path) return emptyLineStats();

    if (change.status === 'untracked') {
      try {
        const content = await FileSystemService.readFile(projectId, change.path);
        const addedLines = countTextLines(content);
        return { addedLines, removedLines: 0, modifiedLines: 0, totalChangedLines: addedLines };
      } catch (e) {
        return emptyLineStats();
      }
    }

    try {
      const output = await this.runLinuxGit(projectId, ['diff', '--numstat', 'HEAD', '--', change.path]);
      const stats = lineStatsFromNumstat(output);
      if (stats.totalChangedLines > 0 || change.status === 'deleted') return stats;
    } catch (e) {}

    if (change.status === 'added') {
      try {
        const content = await FileSystemService.readFile(projectId, change.path);
        const addedLines = countTextLines(content);
        return { addedLines, removedLines: 0, modifiedLines: 0, totalChangedLines: addedLines };
      } catch (e) {}
    }

    return emptyLineStats();
  },

  async commit(
    projectId: string, 
    message: string, 
    authorName: string, 
    authorEmail: string
  ): Promise<string> {
    // Add all modified and untracked files
    await this.runLinuxGit(projectId, ['add', '-A']);
    
    // Configurar author localmente
    await this.runLinuxGit(projectId, ['config', 'user.name', `"${authorName}"`]);
    await this.runLinuxGit(projectId, ['config', 'user.email', `"${authorEmail}"`]);
    
    // Create commit
    const output = await this.runLinuxGit(projectId, ['commit', '-m', `"${message.replace(/"/g, '\\"')}"`]);
    return output;
  },

  async push(
    projectId: string, 
    branch: string = 'main'
  ): Promise<void> {
    const { GithubService } = await import('./GithubService');
    const token = await GithubService.getToken();
    
    // Configura o remote origin para usar o token temporariamente (isso resolve os problemas de senha)
    if (token) {
       const remoteUrl = await this.runLinuxGit(projectId, ['config', '--get', 'remote.origin.url']);
       if (remoteUrl && remoteUrl.startsWith('https://github.com/')) {
          const authUrl = remoteUrl.trim().replace('https://github.com/', `https://${token}@github.com/`);
          await this.runLinuxGit(projectId, ['remote', 'set-url', 'origin', authUrl]);
       }
    }
    
    await this.runLinuxGit(projectId, ['push', 'origin', branch]);
  },
  
  async pull(
    projectId: string, 
    branch: string = 'main',
    authorName: string, 
    authorEmail: string
  ): Promise<void> {
    const { GithubService } = await import('./GithubService');
    const token = await GithubService.getToken();
    if (token) {
       const remoteUrl = await this.runLinuxGit(projectId, ['config', '--get', 'remote.origin.url']);
       if (remoteUrl && remoteUrl.startsWith('https://github.com/')) {
          const authUrl = remoteUrl.trim().replace('https://github.com/', `https://${token}@github.com/`);
          await this.runLinuxGit(projectId, ['remote', 'set-url', 'origin', authUrl]);
       }
    }
    await this.runLinuxGit(projectId, ['pull', 'origin', branch]);
  },

  async revertFile(projectId: string, filepath: string): Promise<void> {
    await this.runLinuxGit(projectId, ['checkout', '--', filepath]);
  },

  async getFileFromHead(projectId: string, filepath: string): Promise<string> {
    try {
      const output = await this.runLinuxGit(projectId, ['show', `HEAD:${filepath}`]);
      return output;
    } catch (e) {
      return ''; // File might be new/untracked
    }
  }
};

