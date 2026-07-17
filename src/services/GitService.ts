import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { ExpoFSAdapter } from './ExpoFSAdapter';
import { GithubService } from './GithubService';

export interface ChangedFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
}

export const GitService = {
  /**
   * Clones a repository into a specific project directory.
   */
  async clone(projectId: string, url: string, branch: string = 'main'): Promise<void> {
    const fs = new ExpoFSAdapter(projectId);
    
    // Convert github.com URL to allow CORS if needed, or rely on corsProxy
    // Isomorphic-git needs a cors proxy for browser environments. 
    // In React Native (mobile), fetch doesn't have CORS restrictions, 
    // but isomorphic-git's http plugin might still enforce it if it thinks it's a browser.
    
    await git.clone({
      fs,
      http,
      dir: '/',
      url,
      ref: branch,
      singleBranch: true,
      depth: 1,
      corsProxy: 'https://cors.isomorphic-git.org'
    });
  },

  /**
   * Inicializa um repositório git vazio localmente e adiciona um remote.
   */
  async initAndAddRemote(projectId: string, url: string, branch: string = 'main'): Promise<void> {
    const fs = new ExpoFSAdapter(projectId);
    
    // Initialize empty git repo
    await git.init({ fs, dir: '/', defaultBranch: branch });
    
    // Add remote
    await git.addRemote({
      fs,
      dir: '/',
      remote: 'origin',
      url
    });
  },

  /**
   * Retrieves a list of modified, added, and deleted files using isomorphic-git statusMatrix.
   */
  async getChangedFiles(projectId: string): Promise<ChangedFile[]> {
    const fs = new ExpoFSAdapter(projectId);
    const changes: ChangedFile[] = [];

    try {
      const matrix = await git.statusMatrix({ fs, dir: '/' });
      
      for (const row of matrix) {
        const [filepath, headStatus, workdirStatus, stageStatus] = row;
        
        // Skip metadata and hidden files
        if (filepath === 'devflux.json' || filepath.startsWith('.git/')) continue;
        if (filepath.startsWith('node_modules/') || filepath.startsWith('.expo/')) continue;
        
        // headStatus: 0=absent, 1=present
        // workdirStatus: 0=absent, 1=identical, 2=modified
        // stageStatus: 0=absent, 1=identical, 2=modified, 3=added
        
        if (headStatus === 1 && workdirStatus === 1 && stageStatus === 1) {
          // Unmodified
          continue;
        }

        if (headStatus === 0 && workdirStatus === 2 && stageStatus === 0) {
          changes.push({ path: filepath, status: 'untracked' });
        } else if (headStatus === 1 && workdirStatus === 2) {
          changes.push({ path: filepath, status: 'modified' });
        } else if (headStatus === 1 && workdirStatus === 0) {
          changes.push({ path: filepath, status: 'deleted' });
        } else if (stageStatus === 3) {
          changes.push({ path: filepath, status: 'added' });
        } else {
           // Other modified states
           changes.push({ path: filepath, status: 'modified' });
        }
      }
    } catch (e: any) {
      if (e.code === 'NotFoundError' || e.message.includes('NotFoundError') || e.message.includes('File not found')) {
        // Repository is empty (no HEAD). Fallback to listing all files as untracked.
        try {
          const { FileSystemService } = await import('./FileSystemService');
          const tree = await FileSystemService.getProjectFileTree(projectId);
          
          const flattenTree = (nodes: any[]): void => {
            for (const node of nodes) {
              if (node.type === 'file') {
                changes.push({ path: node.path, status: 'untracked' });
              } else if (node.children) {
                flattenTree(node.children);
              }
            }
          };
          flattenTree(tree);
        } catch(fallbackErr) {
          console.error('[GitService] Fallback getChangedFiles failed:', fallbackErr);
        }
      } else {
        console.error('[GitService] Error getting status:', e);
      }
    }

    return changes;
  },

  /**
   * Commits the current working directory changes.
   */
  async commit(
    projectId: string, 
    message: string, 
    authorName: string, 
    authorEmail: string
  ): Promise<string> {
    const fs = new ExpoFSAdapter(projectId);

    // Add all modified and untracked files
    const changes = await this.getChangedFiles(projectId);
    
    for (const change of changes) {
      if (change.status === 'deleted') {
        await git.remove({ fs, dir: '/', filepath: change.path });
      } else {
        await git.add({ fs, dir: '/', filepath: change.path });
      }
    }

    // Create commit
    const sha = await git.commit({
      fs,
      dir: '/',
      message,
      author: {
        name: authorName,
        email: authorEmail,
      }
    });

    return sha;
  },

  /**
   * Pushes the committed changes back to GitHub.
   */
  async push(
    projectId: string, 
    branch: string = 'main'
  ): Promise<void> {
    const fs = new ExpoFSAdapter(projectId);
    const token = await GithubService.getToken();

    if (!token) {
      throw new Error('Não autenticado com o GitHub');
    }

    await git.push({
      fs,
      http,
      dir: '/',
      remote: 'origin',
      ref: branch,
      onAuth: () => ({ username: token }),
      corsProxy: 'https://cors.isomorphic-git.org'
    });
  },
  
  /**
   * Pulls the latest changes from GitHub.
   */
  async pull(
    projectId: string, 
    branch: string = 'main',
    authorName: string, 
    authorEmail: string
  ): Promise<void> {
    const fs = new ExpoFSAdapter(projectId);
    const token = await GithubService.getToken();

    await git.pull({
      fs,
      http,
      dir: '/',
      ref: branch,
      singleBranch: true,
      author: {
        name: authorName,
        email: authorEmail,
      },
      onAuth: () => token ? { username: token } : undefined,
      corsProxy: 'https://cors.isomorphic-git.org'
    });
  },

  /**
   * Reverts uncommitted changes to a file.
   */
  async revertFile(projectId: string, filepath: string): Promise<void> {
    const fs = new ExpoFSAdapter(projectId);
    await git.checkout({
      fs,
      dir: '/',
      filepaths: [filepath],
      force: true
    });
  },

  /**
   * Gets the content of a file from HEAD.
   */
  async getFileFromHead(projectId: string, filepath: string): Promise<string> {
    const fs = new ExpoFSAdapter(projectId);
    try {
      const { object: blob } = await git.readObject({
        fs,
        dir: '/',
        oid: 'HEAD',
        filepath
      });
      return new TextDecoder('utf8').decode(blob as Uint8Array);
    } catch (e) {
      return ''; // File might be new/untracked
    }
  }
};
