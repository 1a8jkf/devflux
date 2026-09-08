import { FileSystemService } from './FileSystemService';

export interface BackupItem {
  id: string;
  name: string;
  timestamp: string;
  size: number;
}

export const CloudBackupService = {
  // Configurable server URL (could be moved to SettingsContext later if needed)
  serverUrl: 'http://localhost:8080', 

  /**
   * Sets the relay server URL
   */
  setServerUrl(url: string) {
    this.serverUrl = url;
  },

  /**
   * Collects all files in a project and sends them to the relay server
   */
  async backupProject(token: string, projectId: string, projectName: string): Promise<boolean> {
    if (!token) throw new Error("Token do GitHub não fornecido. Faça login primeiro.");
    
    // 1. Gather all files in the project
    const files: { path: string, content: string, encoding: 'utf8' | 'base64' }[] = [];
    
    const tree = await FileSystemService.getProjectFileTree(projectId);
    
    const gatherFiles = async (nodes: any[]) => {
      for (const node of nodes) {
        if (node.type === 'file') {
          // Simplification: assuming text files for now. In a real scenario, you'd handle binary files too.
          try {
            const content = await FileSystemService.readFile(projectId, node.path);
            files.push({ path: node.path, content, encoding: 'utf8' });
          } catch (e) {
            console.warn(`Failed to read file for backup: ${node.path}`, e);
          }
        } else if (node.children) {
          await gatherFiles(node.children);
        }
      }
    };
    
    await gatherFiles(tree);

    // 2. Send to server
    const payload = {
      token,
      projectId,
      projectName,
      files
    };

    const response = await fetch(`${this.serverUrl}/api/backup/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(err.error || 'Falha ao fazer backup');
    }

    return true;
  },

  /**
   * Fetches the list of available backups for the user
   */
  async listBackups(token: string): Promise<BackupItem[]> {
    if (!token) throw new Error("Token do GitHub não fornecido.");

    const response = await fetch(`${this.serverUrl}/api/backup/list?token=${encodeURIComponent(token)}`);
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(err.error || 'Falha ao listar backups');
    }

    const data = await response.json();
    return data.backups || [];
  },

  /**
   * Downloads a backup and writes the files to the local file system
   */
  async restoreBackup(token: string, projectId: string): Promise<boolean> {
    if (!token) throw new Error("Token do GitHub não fornecido.");

    // 1. Fetch backup data
    const response = await fetch(`${this.serverUrl}/api/backup/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token, projectId })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(err.error || 'Falha ao baixar backup');
    }

    const data = await response.json();
    const files = data.files || [];
    const projectName = data.projectName || projectId;

    if (files.length === 0) {
      throw new Error("O backup está vazio.");
    }

    // 2. Create the project locally (ensure directory exists)
    await FileSystemService.createEmptyProject(projectId, projectName);

    // 3. Write all files
    for (const file of files) {
      try {
        // Ensure directories exist
        const parts = file.path.split('/');
        parts.pop(); // remove filename
        if (parts.length > 0) {
          const dir = parts.join('/');
          await FileSystemService.makeDirectory(projectId, dir);
        }
        
        await FileSystemService.writeFile(projectId, file.path, file.content);
      } catch (e) {
         console.warn(`Failed to write restored file: ${file.path}`, e);
      }
    }
    
    // Notify file system that changes occurred
    FileSystemService.notify();

    return true;
  }
};
