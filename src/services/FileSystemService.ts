import * as FileSystem from 'expo-file-system/legacy';
import { readAsStringAsync, writeAsStringAsync, getInfoAsync, makeDirectoryAsync, deleteAsync, readDirectoryAsync, StorageAccessFramework, documentDirectory } from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import JSZip from 'jszip';
import { GithubService } from './GithubService';
import { GitService } from './GitService';

const IS_WEB = Platform.OS === 'web';

// Root directory for our IDE projects
export const PROJECTS_ROOT = IS_WEB ? 'DevFluxProjects/' : `${documentDirectory || ''}DevFluxProjects/`;

// SAF access
const SAF = StorageAccessFramework || null;

export type ProjectType = 'html' | 'node' | 'react' | 'git' | 'saf' | 'blank';

export interface ProjectInfo {
  id: string;
  name: string;
  updatedAt: number;
  type: ProjectType;
  githubRepo?: string;
  safMap?: Record<string, string>; // Maps relative path to SAF URI
}

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'directory';
  fileType?: string; // 'html', 'css', 'js', 'jsx', 'json', etc.
  children?: FileNode[];
  path: string;
}

// ----------------------------------------------------------------------
// WEB FALLBACK (VIRTUAL FILE SYSTEM IN LOCALSTORAGE)
// ----------------------------------------------------------------------
const getWebVFS = (): Record<string, string> => {
  if (!IS_WEB || typeof window === 'undefined') return {};
  try {
    const data = window.localStorage.getItem('DevFlux_VFS');
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
};

const saveWebVFS = (data: Record<string, string>) => {
  if (!IS_WEB || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('DevFlux_VFS', JSON.stringify(data));
  } catch (e) {}
};

const webMakeDirectory = (path: string) => {
  const vfs = getWebVFS();
  // We represent directories by ensuring they exist as prefixes or explicitly
  if (!vfs[path]) {
    vfs[path] = '__DIR__';
    saveWebVFS(vfs);
  }
};

const webWriteFile = (path: string, content: string) => {
  const vfs = getWebVFS();
  vfs[path] = content;
  saveWebVFS(vfs);
};

const webReadFile = (path: string): string => {
  const vfs = getWebVFS();
  if (vfs[path] === undefined || vfs[path] === '__DIR__') throw new Error('File not found');
  return vfs[path];
};

const webReadDirectory = (path: string): string[] => {
  const vfs = getWebVFS();
  const entries = new Set<string>();
  const normalizedPath = path.endsWith('/') ? path : `${path}/`;
  
  for (const key of Object.keys(vfs)) {
    if (key.startsWith(normalizedPath) && key !== normalizedPath) {
      const relative = key.slice(normalizedPath.length);
      const nextSlash = relative.indexOf('/');
      if (nextSlash === -1) {
        entries.add(relative); // It's a file in this dir
      } else {
        entries.add(relative.slice(0, nextSlash)); // It's a subdirectory
      }
    }
  }
  return Array.from(entries);
};

export const webGetInfo = (path: string) => {
  const vfs = getWebVFS();
  
  // Exact match for file
  if (vfs[path] && vfs[path] !== '__DIR__') {
    return { exists: true, isDirectory: false, modificationTime: Date.now() / 1000 };
  }
  
  // Exact match for explicit dir
  if (vfs[path] === '__DIR__') {
    return { exists: true, isDirectory: true, modificationTime: Date.now() / 1000 };
  }
  
  // Implicit dir check
  const normalizedPath = path.endsWith('/') ? path : `${path}/`;
  for (const key of Object.keys(vfs)) {
    if (key.startsWith(normalizedPath)) {
      return { exists: true, isDirectory: true, modificationTime: Date.now() / 1000 };
    }
  }
  
  return { exists: false, isDirectory: false };
};

// ----------------------------------------------------------------------
// MAIN EXPORTS
// ----------------------------------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();

export const FileSystemService = {
  getProjectPath: async (projectId: string) => {
    return `${PROJECTS_ROOT}${projectId}/`.replace('file://', '');
  },

  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  
  notify() {
    listeners.forEach(l => l());
  },
  /**
   * Initializes the root directory if it doesn't exist
   */
  async init() {
    if (IS_WEB) {
      webMakeDirectory(PROJECTS_ROOT);
      return;
    }
    try {
      const dirInfo = await getInfoAsync(PROJECTS_ROOT);
      if (!dirInfo.exists) {
        await makeDirectoryAsync(PROJECTS_ROOT, { intermediates: true });
      }
    } catch (error) {
      console.warn("Failed to initialize FileSystemService:", error);
      throw error;
    }
  },

  /**
   * Creates a new project with basic boilerplate
   */
  createProject: async (name: string, type: ProjectType = 'html', dependencies: string[] = []) => {
    await FileSystemService.init();
    
    // Generate a unique ID for the project (lowercase, no spaces)
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
    const projectPath = `${PROJECTS_ROOT}${id}/`;
    
    // Create project folder
    if (IS_WEB) {
      webMakeDirectory(projectPath);
    } else {
      await makeDirectoryAsync(projectPath, { intermediates: true });
    }
    
    // Save metadata
    const metadata: ProjectInfo = {
      id,
      name,
      updatedAt: Date.now(),
      type
    };
    
    const metaContent = JSON.stringify(metadata, null, 2);
    if (IS_WEB) {
      webWriteFile(`${projectPath}devflux.json`, metaContent);
    } else {
      await writeAsStringAsync(`${projectPath}devflux.json`, metaContent);
    }

    // Create boilerplate files based on type
    if (type === 'html') {
      const htmlCode = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Hello ${name}</h1>
  <p>Welcome to DevFlux IDE!</p>
  <script src="script.js"></script>
</body>
</html>`;
      const cssCode = `body {
  font-family: system-ui, sans-serif;
  background-color: #1e1e1e;
  color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  margin: 0;
}`;
      const jsCode = `console.log("Welcome to ${name}!");`;

      if (IS_WEB) {
        webWriteFile(`${projectPath}index.html`, htmlCode);
        webWriteFile(`${projectPath}style.css`, cssCode);
        webWriteFile(`${projectPath}script.js`, jsCode);
      } else {
        await writeAsStringAsync(`${projectPath}index.html`, htmlCode);
        await writeAsStringAsync(`${projectPath}style.css`, cssCode);
        await writeAsStringAsync(`${projectPath}script.js`, jsCode);
      }
    } else if (type === 'node') {
      const packageJson = {
        name: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        version: '1.0.0',
        main: 'index.js',
        scripts: {
          start: 'node index.js'
        },
        dependencies: dependencies.reduce((acc, dep) => ({ ...acc, [dep]: '*' }), {})
      };
      const indexJsCode = `const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello from DevFlux Node API!\\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`;

      if (IS_WEB) {
        webWriteFile(`${projectPath}package.json`, JSON.stringify(packageJson, null, 2));
        webWriteFile(`${projectPath}index.js`, indexJsCode);
      } else {
        await writeAsStringAsync(`${projectPath}package.json`, JSON.stringify(packageJson, null, 2));
        await writeAsStringAsync(`${projectPath}index.js`, indexJsCode);
      }
    } else if (type === 'react') {
      const packageJson = {
        name: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        version: '1.0.0',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview'
        },
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
          ...dependencies.reduce((acc, dep) => ({ ...acc, [dep]: '*' }), {})
        }
      };
      const indexHtmlCode = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`;
      const mainJsxCode = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`;
      const appJsxCode = `import React from 'react'

function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Hello ${name}!</h1>
      <p>Welcome to your DevFlux React app.</p>
    </div>
  )
}

export default App`;

      if (IS_WEB) {
        webMakeDirectory(`${projectPath}src/`);
        webWriteFile(`${projectPath}package.json`, JSON.stringify(packageJson, null, 2));
        webWriteFile(`${projectPath}index.html`, indexHtmlCode);
        webWriteFile(`${projectPath}src/main.jsx`, mainJsxCode);
        webWriteFile(`${projectPath}src/App.jsx`, appJsxCode);
      } else {
        await makeDirectoryAsync(`${projectPath}src/`, { intermediates: true });
        await writeAsStringAsync(`${projectPath}package.json`, JSON.stringify(packageJson, null, 2));
        await writeAsStringAsync(`${projectPath}index.html`, indexHtmlCode);
        await writeAsStringAsync(`${projectPath}src/main.jsx`, mainJsxCode);
        await writeAsStringAsync(`${projectPath}src/App.jsx`, appJsxCode);
      }
    }
    
    FileSystemService.notify();
    return metadata;
  },

  /**
   * Imports an external folder via SAF
   */
  async importSAFDirectory(directoryUri: string, folderName: string): Promise<string> {
    await this.init();
    const projectId = Math.random().toString(36).substring(2, 10);
    const projectPath = `${PROJECTS_ROOT}${projectId}/`;
    
    if (IS_WEB) {
      throw new Error("SAF is not supported on Web");
    }
    
    await makeDirectoryAsync(projectPath, { intermediates: true });
    
    const safMap: Record<string, string> = { '.': directoryUri };
    
    const readSafRecursively = async (uri: string, currentRelativePath: string) => {
      const files = await SAF.readDirectoryAsync(uri);
      for (const fileUri of files) {
        try {
          const info = await FileSystem.getInfoAsync(fileUri);
          let fileName = fileUri.split('%2F').pop() || 'unknown';
          fileName = decodeURIComponent(fileName);
          
          const relativePath = currentRelativePath ? `${currentRelativePath}/${fileName}` : fileName;
          
          if (info.isDirectory) {
            safMap[relativePath] = fileUri;
            await makeDirectoryAsync(`${projectPath}${relativePath}`, { intermediates: true });
            await readSafRecursively(fileUri, relativePath);
          } else {
            safMap[relativePath] = fileUri;
            try {
              const content = await SAF.readAsStringAsync(fileUri);
              await writeAsStringAsync(`${projectPath}${relativePath}`, content);
            } catch(e) {
              await writeAsStringAsync(`${projectPath}${relativePath}`, '');
            }
          }
        } catch(e) {}
      }
    };
    
    await readSafRecursively(directoryUri, '');
    
    const metadata: ProjectInfo = {
      id: projectId,
      name: folderName,
      updatedAt: Date.now(),
      type: 'saf',
      safMap
    };
    await writeAsStringAsync(`${projectPath}devflux.json`, JSON.stringify(metadata, null, 2));
    
    this.notify();
    return projectId;
  },

  /**
   * Creates an empty project (useful for imports)
   */
  async createEmptyProject(name: string, type: ProjectType = 'html'): Promise<ProjectInfo> {
    try {
      await this.init();
      
      const projectId = Math.random().toString(36).substring(2, 10);
      const projectPath = `${PROJECTS_ROOT}${projectId}/`;
      
      const metadata: ProjectInfo = {
        id: projectId,
        name,
        updatedAt: Date.now(),
        type
      };

      if (IS_WEB) {
        webMakeDirectory(projectPath);
        webWriteFile(`${projectPath}devflux.json`, JSON.stringify(metadata, null, 2));
      } else {
        await makeDirectoryAsync(projectPath, { intermediates: true });
        await writeAsStringAsync(`${projectPath}devflux.json`, JSON.stringify(metadata, null, 2));
      }
      
      this.notify();
      return metadata;
    } catch (error) {
      console.error('Failed to create empty project:', error);
      throw error;
    }
  },

  /**
   * Creates a project linked to an external SAF directory
   */
  async createSAFProject(directoryUri: string, folderName: string): Promise<string> {
    await this.init();
    const projectId = Math.random().toString(36).substring(2, 10);
    const projectPath = `${PROJECTS_ROOT}${projectId}/`;
    
    if (IS_WEB) {
      throw new Error('SAF is not supported on Web');
    }
    
    await makeDirectoryAsync(projectPath, { intermediates: true });
    
    const metadata: ProjectInfo = {
      id: projectId,
      name: folderName,
      updatedAt: Date.now(),
      type: 'saf',
      safMap: { '.': directoryUri }
    };
    await writeAsStringAsync(`${projectPath}devflux.json`, JSON.stringify(metadata, null, 2));
    
    // Read the directory contents into local cache
    try {
      if (!SAF) throw new Error('SAF não disponível');
      const files = await SAF.readDirectoryAsync(directoryUri);
      for (const fileUri of files) {
        try {
          const info = await FileSystem.getInfoAsync(fileUri);
          let fileName = fileUri.split('%2F').pop() || 'unknown';
          fileName = decodeURIComponent(fileName);
          
          if (!info.isDirectory) {
            metadata.safMap![fileName] = fileUri;
            try {
              const content = await SAF.readAsStringAsync(fileUri);
              await writeAsStringAsync(`${projectPath}${fileName}`, content);
            } catch(e) {
              await writeAsStringAsync(`${projectPath}${fileName}`, '');
            }
          }
        } catch(e) {}
      }
      // Update metadata with SAF map
      await writeAsStringAsync(`${projectPath}devflux.json`, JSON.stringify(metadata, null, 2));
    } catch(e) {
      console.warn('Failed to read SAF directory contents:', e);
    }
    
    this.notify();
    return projectId;
  },

  /**
   * Updates project metadata
   */
  async updateProject(projectId: string, updates: Partial<ProjectInfo>): Promise<void> {
    const projects = await this.getProjects();
    const original = projects.find(p => p.id === projectId);
    if (!original) throw new Error('Project not found');

    const metadata: ProjectInfo = { ...original, ...updates, updatedAt: Date.now() };
    const metaContent = JSON.stringify(metadata, null, 2);
    const projectPath = `${PROJECTS_ROOT}${projectId}/`;

    if (IS_WEB) {
      try {
        const data = window.localStorage.getItem('DevFlux_VFS');
        if (data) {
          const vfs = JSON.parse(data);
          vfs[`${projectPath}devflux.json`] = metaContent;
          window.localStorage.setItem('DevFlux_VFS', JSON.stringify(vfs));
        }
      } catch (e) {}
    } else {
      await writeAsStringAsync(`${projectPath}devflux.json`, metaContent);
    }
    this.notify();
  },

  /**
   * Deletes a project
   */
  async deleteProject(projectId: string): Promise<void> {
    const projectPath = `${PROJECTS_ROOT}${projectId}/`;
    if (IS_WEB) {
      // Need to find web functions or use local storage
      try {
        const data = window.localStorage.getItem('DevFlux_VFS');
        if (data) {
          const vfs = JSON.parse(data);
          for (const key of Object.keys(vfs)) {
            if (key.startsWith(projectPath)) {
              delete vfs[key];
            }
          }
          window.localStorage.setItem('DevFlux_VFS', JSON.stringify(vfs));
        }
      } catch (e) {}
    } else {
      const info = await getInfoAsync(projectPath);
      if (info.exists) {
        await deleteAsync(projectPath, { idempotent: true });
      }
    }
    this.notify();
  },

  /**
   * Duplicates a project
   */
  async duplicateProject(projectId: string, newName: string): Promise<string> {
    const projects = await this.getProjects();
    const original = projects.find(p => p.id === projectId);
    if (!original) throw new Error('Projeto original não encontrado');

    const newId = newName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
    const newPath = `${PROJECTS_ROOT}${newId}/`;
    const oldPath = `${PROJECTS_ROOT}${projectId}/`;

    if (IS_WEB) {
      try {
        const data = window.localStorage.getItem('DevFlux_VFS');
        if (data) {
          const vfs = JSON.parse(data);
          for (const key of Object.keys(vfs)) {
            if (key.startsWith(oldPath)) {
              const relative = key.slice(oldPath.length);
              vfs[`${newPath}${relative}`] = vfs[key];
            }
          }
          window.localStorage.setItem('DevFlux_VFS', JSON.stringify(vfs));
        }
      } catch (e) {}
    } else {
      const info = await getInfoAsync(oldPath);
      if (info.exists) {
        // Expo FileSystem has copyAsync
        await FileSystem.copyAsync({ from: oldPath, to: newPath });
      }
    }

    // Update metadata
    const metadata: ProjectInfo = {
      ...original,
      id: newId,
      name: newName,
      updatedAt: Date.now()
    };
    const metaContent = JSON.stringify(metadata, null, 2);
    if (IS_WEB) {
      try {
        const data = window.localStorage.getItem('DevFlux_VFS');
        if (data) {
          const vfs = JSON.parse(data);
          vfs[`${newPath}devflux.json`] = metaContent;
          window.localStorage.setItem('DevFlux_VFS', JSON.stringify(vfs));
        }
      } catch (e) {}
    } else {
      await writeAsStringAsync(`${newPath}devflux.json`, metaContent);
    }

    this.notify();
    return newId;
  },

  /**
   * Lists all projects
   */

  async getProjects(): Promise<ProjectInfo[]> {
    try {
      await this.init();
      
      const projects: ProjectInfo[] = [];
      
      const entries = IS_WEB 
        ? webReadDirectory(PROJECTS_ROOT)
        : await readDirectoryAsync(PROJECTS_ROOT);
      
      for (const entry of entries) {
        const projectPath = `${PROJECTS_ROOT}${entry}/`;
        const info = IS_WEB 
          ? webGetInfo(projectPath)
          : await getInfoAsync(projectPath);
        
        if (info.isDirectory) {
          try {
            const metaContent = IS_WEB 
              ? webReadFile(`${projectPath}devflux.json`)
              : await readAsStringAsync(`${projectPath}devflux.json`);
              
            const meta = JSON.parse(metaContent);
            projects.push(meta);
          } catch (e) {
            // Fallback if metadata doesn't exist
            projects.push({
              id: entry,
              name: entry,
              updatedAt: info.modificationTime ? info.modificationTime * 1000 : Date.now(),
              type: 'html'
            });
          }
        }
      }
      
      // Sort by most recent
      return projects.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error("Failed to get projects:", error);
      return [];
    }
  },

  /**
   * Reads a file's content
   */
  async readFile(projectId: string, filePath: string): Promise<string> {
    const fullPath = `${PROJECTS_ROOT}${projectId}/${filePath}`;
    if (IS_WEB) {
      return webReadFile(fullPath);
    }
    try {
      const metaStr = await readAsStringAsync(`${PROJECTS_ROOT}${projectId}/devflux.json`);
      const meta = JSON.parse(metaStr) as ProjectInfo;
      if (meta.type === 'saf' && meta.safMap && meta.safMap[filePath]) {
        if (SAF) return await SAF.readAsStringAsync(meta.safMap[filePath]);
      }
    } catch(e) {}
    
    return await readAsStringAsync(fullPath);
  },

  /**
   * Writes content to a file
   */
  async writeFile(projectId: string, filePath: string, content: string, ignoreSync = false): Promise<void> {
    const fullPath = `${PROJECTS_ROOT}${projectId}/${filePath}`;
    
    // Trigger LiveSync if it's the LiveSync Workspace and not ignoring sync
    if (!ignoreSync) {
      import('./LiveSyncService').then(({ LiveSyncService }) => {
        if (LiveSyncService.syncProjectId === projectId) {
          LiveSyncService.sendFileUpdate(filePath, content);
        }
      });
    }

    // Ensure parent directories exist before writing
    const lastSlash = filePath.lastIndexOf('/');
    if (lastSlash > 0) {
      const dirPath = filePath.substring(0, lastSlash);
      const fullDirPath = `${PROJECTS_ROOT}${projectId}/${dirPath}`;
      if (IS_WEB) {
        webMakeDirectory(fullDirPath);
      } else {
        await makeDirectoryAsync(fullDirPath, { intermediates: true });
      }
    }

    if (IS_WEB) {
      webWriteFile(fullPath, content);
    } else {
      await writeAsStringAsync(fullPath, content);
      try {
        const metaStr = await readAsStringAsync(`${PROJECTS_ROOT}${projectId}/devflux.json`);
        const meta = JSON.parse(metaStr) as ProjectInfo;
        if (meta.safMap && meta.safMap[filePath]) {
          if (SAF) await SAF.writeAsStringAsync(meta.safMap[filePath], content);
        } else if (meta.type === 'saf' && meta.safMap && SAF) {
          // Handle new file creation in external folder
          const parts = filePath.split('/');
          const fileName = parts.pop() || filePath;
          const parentUri = meta.safMap['.'];
          const mimeType = fileName.endsWith('.js') || fileName.endsWith('.ts') ? 'text/javascript' : (fileName.endsWith('.json') ? 'application/json' : 'text/plain');
          const newUri = await SAF.createFileAsync(parentUri, fileName, mimeType);
          meta.safMap[filePath] = newUri;
          await writeAsStringAsync(`${PROJECTS_ROOT}${projectId}/devflux.json`, JSON.stringify(meta, null, 2));
          await SAF.writeAsStringAsync(newUri, content);
        }
      } catch(e) {}
    }
    
    // Update project modification time
    try {
      const metaPath = `${PROJECTS_ROOT}${projectId}/devflux.json`;
      const metaContent = IS_WEB 
        ? webReadFile(metaPath)
        : await readAsStringAsync(metaPath);
        
      const meta = JSON.parse(metaContent);
      meta.updatedAt = Date.now();
      
      if (IS_WEB) {
        webWriteFile(metaPath, JSON.stringify(meta, null, 2));
      } else {
        await writeAsStringAsync(metaPath, JSON.stringify(meta, null, 2));
      }
    } catch (e) {
      // Ignore
    }
    
    this.notify();
  },

  /**
   * Deletes a file or directory
   */
  async deleteFile(projectId: string, filePath: string): Promise<void> {
    const fullPath = `${PROJECTS_ROOT}${projectId}/${filePath}`;
    if (IS_WEB) {
      const vfs = getWebVFS();
      const keys = Object.keys(vfs);
      for (const key of keys) {
        if (key === fullPath || key.startsWith(`${fullPath}/`)) {
          delete vfs[key];
        }
      }
    } else {
      await deleteAsync(fullPath, { idempotent: true });
    }
    this.notify();
  },

  /**
   * Creates a directory
   */
  async makeDirectory(projectId: string, dirPath: string): Promise<void> {
    const fullPath = `${PROJECTS_ROOT}${projectId}/${dirPath}`;
    if (IS_WEB) {
      webMakeDirectory(fullPath);
    } else {
      await makeDirectoryAsync(fullPath, { intermediates: true });
    }
    this.notify();
  },

  /**
   * Recursively reads the project directory to build a file tree
   */
  async getProjectFileTree(projectId: string): Promise<FileNode[]> {
    const projectPath = `${PROJECTS_ROOT}${projectId}/`;
    
    const readDir = async (currentPath: string, relativePath: string): Promise<FileNode[]> => {
      const entries = IS_WEB 
        ? webReadDirectory(currentPath)
        : await readDirectoryAsync(currentPath);
        
      const nodes: FileNode[] = [];
      
      for (const entry of entries) {
        if (entry === 'devflux.json' && relativePath === '') continue; // Hide metadata file
        
        const fullPath = `${currentPath}${entry}`;
        const info = IS_WEB 
          ? webGetInfo(fullPath)
          : await getInfoAsync(fullPath);
        
        const entryRelativePath = relativePath ? `${relativePath}/${entry}` : entry;
        
        if (info.isDirectory) {
          const children = await readDir(`${fullPath}/`, entryRelativePath);
          nodes.push({
            id: entryRelativePath,
            name: entry,
            type: 'directory',
            path: entryRelativePath,
            children
          });
        } else {
          const extension = entry.split('.').pop()?.toLowerCase() || 'txt';
          nodes.push({
            id: entryRelativePath,
            name: entry,
            type: 'file',
            fileType: extension,
            path: entryRelativePath
          });
        }
      }
      
      // Sort: folders first, then alphabetically
      return nodes.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
      });
    }
    
    return await readDir(projectPath, '');
  },

  /**
   * Clones a GitHub repository using isomorphic-git
   */
  async downloadGitRepo(repoUrl: string): Promise<string> {
    // Expected format: https://github.com/facebook/react or facebook/react
    let owner = '';
    let repo = '';
    
    try {
      if (repoUrl.includes('github.com')) {
        const parts = repoUrl.split('github.com/')[1].split('/');
        owner = parts[0];
        repo = parts[1].replace('.git', '');
      } else {
        const parts = repoUrl.split('/');
        owner = parts[0];
        repo = parts[1];
      }
    } catch (e) {
      throw new Error('Formato de URL do GitHub inválido. Use https://github.com/usuario/repo');
    }

    if (!owner || !repo) throw new Error('Não foi possível identificar o usuário e o repositório');

    const projectName = repo;
    const projectId = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
    const projectPath = `${PROJECTS_ROOT}${projectId}/`;

    await this.init();

    // 1. Create project dir
    if (IS_WEB) {
      webMakeDirectory(projectPath);
    } else {
      await makeDirectoryAsync(projectPath, { intermediates: true });
    }

    // 2. Save metadata
    const metadata: ProjectInfo = {
      id: projectId,
      name: projectName,
      updatedAt: Date.now(),
      type: 'git',
      githubRepo: `${owner}/${repo}`
    };
    const metaContent = JSON.stringify(metadata, null, 2);
    if (IS_WEB) {
      webWriteFile(`${projectPath}devflux.json`, metaContent);
    } else {
      await writeAsStringAsync(`${projectPath}devflux.json`, metaContent);
    }

    // 3. Clone repository using isomorphic-git
    try {
      const cloneUrl = `https://github.com/${owner}/${repo}.git`;
      await GitService.clone(projectId, cloneUrl, 'main');
    } catch (e: any) {
      // Cleanup if failed
      if (IS_WEB) {
        delete getWebVFS()[projectPath];
      } else {
        await deleteAsync(projectPath, { idempotent: true });
      }
      throw new Error(`Falha ao clonar repositório: ${e.message}`);
    }

    this.notify();
    return projectId;
  }
};
