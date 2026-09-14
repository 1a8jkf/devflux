import { documentDirectory, getInfoAsync, makeDirectoryAsync, writeAsStringAsync, readDirectoryAsync, readAsStringAsync, deleteAsync, moveAsync, copyAsync, StorageAccessFramework } from 'expo-file-system/legacy';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import JSZip from 'jszip';
import { GithubService } from './GithubService';
import { GitService } from './GitService';
import { DebugService } from './DebugService';
import { projectTemplate, TemplateType } from './ProjectTemplates';

const IS_WEB = Platform.OS === 'web';

// Root directory for our IDE projects
export const PROJECTS_ROOT = IS_WEB ? 'DevFluxProjects/' : `${documentDirectory || ''}DevFluxProjects/`;

export type ProjectType = TemplateType | 'git' | 'saf' | 'sync' | 'sync-local';

export interface ProjectInfo {
  id: string;
  name: string;
  updatedAt: number;
  type: string; // 'html', 'node', 'react', 'git', 'saf', 'sync', 'sync-local'
  githubRepo?: string;
  safMap?: Record<string, string>;
  liveSyncWorkspaceKey?: string;
  liveSyncWorkspaceName?: string;
  liveSyncMode?: 'remote' | 'local';
  liveSyncBaseline?: Record<string, string>;
  liveSyncDownloadedAt?: number;
  changedFiles?: Record<string, 'modified' | 'added' | 'deleted'>;
}

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'directory';
  fileType?: string; // 'html', 'css', 'js', 'jsx', 'json', etc.
  children?: FileNode[];
  childrenDeferred?: boolean;
  isExpanded?: boolean;
  path: string;
}

const normalizeProjectRelativePath = (path: string, allowEmpty = false) => {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some(part => part === '..')) {
    throw new Error('Caminho fora do projeto não permitido');
  }
  const clean = parts.filter(part => part !== '.').join('/');
  if (!clean && !allowEmpty) {
    throw new Error('Caminho relativo do projeto é obrigatório');
  }
  return clean;
};

const ensureParentDirectories = async (projectId: string, filePath: string) => {
  const parts = normalizeProjectRelativePath(filePath).split('/').filter(Boolean);
  if (parts.length <= 1) return;

  const projectPath = `${PROJECTS_ROOT}${projectId}/`;
  let current = '';
  for (let index = 0; index < parts.length - 1; index++) {
    current += `${index === 0 ? '' : '/'}${parts[index]}`;
    if (IS_WEB) {
      webMakeDirectory(`${projectPath}${current}`);
    } else {
      await makeDirectoryAsync(`${projectPath}${current}`, { intermediates: true });
    }
  }
};

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
  if (vfs[path] !== undefined && vfs[path] !== '__DIR__') {
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

const getProjectFullPath = (projectId: string, relativePath: string) => {
  const cleanPath = normalizeProjectRelativePath(relativePath);
  return `${PROJECTS_ROOT}${projectId}/${cleanPath}`;
};

const projectPathExists = async (projectId: string, relativePath: string) => {
  const fullPath = getProjectFullPath(projectId, relativePath);
  if (IS_WEB) return webGetInfo(fullPath).exists;
  const info = await getInfoAsync(fullPath);
  return info.exists;
};

const getAvailableProjectPath = async (projectId: string, desiredPath: string) => {
  const cleanPath = normalizeProjectRelativePath(desiredPath);
  const slashIndex = cleanPath.lastIndexOf('/');
  const folder = slashIndex >= 0 ? cleanPath.slice(0, slashIndex) : '';
  const fileName = slashIndex >= 0 ? cleanPath.slice(slashIndex + 1) : cleanPath;
  const dotIndex = fileName.lastIndexOf('.');
  const hasExtension = dotIndex > 0 && dotIndex < fileName.length - 1;
  const baseName = hasExtension ? fileName.slice(0, dotIndex) : fileName;
  const extension = hasExtension ? fileName.slice(dotIndex) : '';

  let candidate = cleanPath;
  let suffix = 1;
  while (await projectPathExists(projectId, candidate)) {
    const nextName = `${baseName}-${suffix}${extension}`;
    candidate = folder ? `${folder}/${nextName}` : nextName;
    suffix += 1;
    if (suffix > 999) throw new Error('Não foi possível gerar um nome livre para o arquivo.');
  }
  return candidate;
};

const touchProjectMetadata = async (projectId: string) => {
  try {
    const metaPath = `${PROJECTS_ROOT}${projectId}/devflux.json`;
    const metaContent = IS_WEB ? webReadFile(metaPath) : await readAsStringAsync(metaPath);
    const meta = JSON.parse(metaContent);
    meta.updatedAt = Date.now();
    const nextContent = JSON.stringify(meta, null, 2);
    if (IS_WEB) {
      webWriteFile(metaPath, nextContent);
    } else {
      await writeAsStringAsync(metaPath, nextContent);
    }
  } catch (e) {}
};

// ----------------------------------------------------------------------
// MAIN EXPORTS
// ----------------------------------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();

export const FileSystemService = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  notify() {
    listeners.forEach(l => l());
  },

  getProjectPath(projectId: string): string {
    return `${PROJECTS_ROOT}${projectId}/`;
  },

  async createSAFProject(projectId: string, name: string): Promise<ProjectInfo> {
    return this.createEmptyProject(projectId, name);
  },

  async makeDirectory(projectId: string, path: string): Promise<void> {
    const projectPath = `${PROJECTS_ROOT}${projectId}/`;
    const cleanPath = normalizeProjectRelativePath(path);
    if (IS_WEB) {
      webMakeDirectory(`${projectPath}${cleanPath}`);
    } else {
      await makeDirectoryAsync(`${projectPath}${cleanPath}`, { intermediates: true });
    }
    this.notify();
  },

  async deleteFile(projectId: string, path: string): Promise<void> {
    const projectPath = `${PROJECTS_ROOT}${projectId}/`;
    const cleanPath = normalizeProjectRelativePath(path);
    if (!IS_WEB) {
      await deleteAsync(`${projectPath}${cleanPath}`, { idempotent: true });
    }
    this.notify();
  },

  async movePath(projectId: string, fromPath: string, toPath: string): Promise<void> {
    const projectPath = `${PROJECTS_ROOT}${projectId}/`;
    const cleanFrom = normalizeProjectRelativePath(fromPath);
    const cleanTo = normalizeProjectRelativePath(toPath);
    if (cleanFrom === cleanTo) return;

    if (IS_WEB) {
      const fromFull = `${projectPath}${cleanFrom}`;
      const toFull = `${projectPath}${cleanTo}`;
      const vfs = getWebVFS();
      const next: Record<string, string> = { ...vfs };
      const prefix = fromFull.endsWith('/') ? fromFull : `${fromFull}/`;
      let moved = false;

      for (const key of Object.keys(vfs)) {
        if (key === fromFull || key.startsWith(prefix)) {
          const suffix = key === fromFull ? '' : key.slice(prefix.length);
          const target = suffix ? `${toFull}/${suffix}` : toFull;
          next[target] = vfs[key];
          delete next[key];
          moved = true;
        }
      }

      if (moved) saveWebVFS(next);
    } else {
      const fromFull = `${projectPath}${cleanFrom}`;
      const toFull = `${projectPath}${cleanTo}`;
      const parent = cleanTo.split('/').slice(0, -1).join('/');
      if (parent) {
        await makeDirectoryAsync(`${projectPath}${parent}`, { intermediates: true });
      }
      await moveAsync({ from: fromFull, to: toFull });
    }

    try {
      const metaPath = `${PROJECTS_ROOT}${projectId}/devflux.json`;
      const metaContent = IS_WEB ? webReadFile(metaPath) : await readAsStringAsync(metaPath);
      const meta = JSON.parse(metaContent);
      meta.updatedAt = Date.now();
      if (IS_WEB) {
        webWriteFile(metaPath, JSON.stringify(meta, null, 2));
      } else {
        await writeAsStringAsync(metaPath, JSON.stringify(meta, null, 2));
      }
    } catch (e) {}

    this.notify();
  },

  async pathExists(projectId: string, path: string): Promise<boolean> {
    return projectPathExists(projectId, path);
  },

  async importFileFromUri(projectId: string, sourceUri: string, destinationPath: string, options: { dedupe?: boolean } = {}): Promise<string> {
    const requestedPath = normalizeProjectRelativePath(destinationPath);
    const cleanPath = options.dedupe === false ? requestedPath : await getAvailableProjectPath(projectId, requestedPath);
    const fullPath = getProjectFullPath(projectId, cleanPath);

    await ensureParentDirectories(projectId, cleanPath);

    if (IS_WEB) {
      const response = await fetch(sourceUri);
      if (!response.ok) throw new Error('Não foi possível ler o arquivo selecionado.');
      webWriteFile(fullPath, await response.text());
    } else {
      await copyAsync({ from: sourceUri, to: fullPath });
    }

    await touchProjectMetadata(projectId);
    this.notify();
    return cleanPath;
  },

  async copyFileBetweenProjects(sourceProjectId: string, sourcePath: string, targetProjectId: string, destinationPath: string, options: { dedupe?: boolean } = {}): Promise<string> {
    const cleanSource = normalizeProjectRelativePath(sourcePath);
    const requestedTarget = normalizeProjectRelativePath(destinationPath);
    const cleanTarget = options.dedupe === false ? requestedTarget : await getAvailableProjectPath(targetProjectId, requestedTarget);
    const sourceFullPath = getProjectFullPath(sourceProjectId, cleanSource);
    const targetFullPath = getProjectFullPath(targetProjectId, cleanTarget);

    await ensureParentDirectories(targetProjectId, cleanTarget);

    if (IS_WEB) {
      webWriteFile(targetFullPath, webReadFile(sourceFullPath));
    } else {
      await copyAsync({ from: sourceFullPath, to: targetFullPath });
    }

    await touchProjectMetadata(targetProjectId);
    this.notify();
    return cleanTarget;
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
  async createProject(name: string, type: TemplateType = 'html', dependencies: string[] = []) {
    await this.init();
    const startedAt = Date.now();
    const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'projeto';
    const projectPath = `${PROJECTS_ROOT}${id}/`;
    const files = projectTemplate(id, name, type, dependencies);
    const info = IS_WEB ? webGetInfo(projectPath) : await getInfoAsync(projectPath);
    if (info.exists) throw new Error('Ja existe um projeto com esse nome.');
    const metadata: ProjectInfo = { id, name, updatedAt: Date.now(), type };

    try {
      if (IS_WEB) webMakeDirectory(projectPath);
      else await makeDirectoryAsync(projectPath, { intermediates: true });
      for (const [file, content] of Object.entries(files)) {
        await ensureParentDirectories(id, file);
        if (IS_WEB) webWriteFile(projectPath + file, content);
        else await writeAsStringAsync(projectPath + file, content);
        const confirmed = IS_WEB ? webReadFile(projectPath + file) : await readAsStringAsync(projectPath + file);
        if (confirmed !== content) throw new Error('Falha ao confirmar arquivo: ' + file);
      }
      // Publish metadata only after every template file has been written and verified.
      if (IS_WEB) webWriteFile(projectPath + 'devflux.json', JSON.stringify(metadata, null, 2));
      else await writeAsStringAsync(projectPath + 'devflux.json', JSON.stringify(metadata, null, 2));
      DebugService.log('file', 'info', 'Template criado e confirmado.', { project: id, template: type, fileCount: Object.keys(files).length, durationMs: Date.now() - startedAt });
      this.notify();
      return metadata;
    } catch (error) {
      DebugService.log('file', 'error', 'Falha ao criar template.', { project: id, template: type, error: String(error) });
      throw error;
    }
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
      const files = await StorageAccessFramework.readDirectoryAsync(uri);
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
              const content = await StorageAccessFramework.readAsStringAsync(fileUri);
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
  async createEmptyProject(projectId: string, name: string): Promise<ProjectInfo> {
    await this.init();
    const projectPath = `${PROJECTS_ROOT}${projectId}/`;

    const metadata: ProjectInfo = {
      id: projectId,
      name,
      updatedAt: Date.now(),
      type: 'html'
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
        if (entry.startsWith('.devflux-import-')) continue;
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
            // The directory is authoritative; imported metadata may carry another id.
            projects.push({ ...meta, id: entry });
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
    const startedAt = Date.now();
    const cleanPath = normalizeProjectRelativePath(filePath);
    const fullPath = `${PROJECTS_ROOT}${projectId}/${cleanPath}`;

    try {
      let content: string;
      if (IS_WEB) {
        content = webReadFile(fullPath);
      } else {
        let safUri: string | undefined;
        try {
          const metaStr = await readAsStringAsync(`${PROJECTS_ROOT}${projectId}/devflux.json`);
          const meta = JSON.parse(metaStr) as ProjectInfo;
          safUri = meta.safMap?.[cleanPath];
        } catch(e) {}

        content = safUri
          ? await StorageAccessFramework.readAsStringAsync(safUri)
          : await readAsStringAsync(fullPath);
      }

      const durationMs = Date.now() - startedAt;
      if (durationMs > 700) {
        DebugService.log('file', 'warn', 'Leitura de arquivo demorou mais que o esperado.', {
          project: projectId,
          file: cleanPath,
          durationMs,
          bytes: content.length,
        });
      }
      return content;
    } catch (error: any) {
      DebugService.log('file', 'error', `Arquivo não carregou: ${cleanPath}`, {
        project: projectId,
        file: cleanPath,
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
      });
      throw error;
    }
  },

  /**
   * Writes content to a file
   */
  async writeFile(projectId: string, filePath: string, content: string): Promise<void> {
    const startedAt = Date.now();
    const cleanPath = normalizeProjectRelativePath(filePath);
    const fullPath = `${PROJECTS_ROOT}${projectId}/${cleanPath}`;

    try {
      await ensureParentDirectories(projectId, cleanPath);

      if (IS_WEB) {
        webWriteFile(fullPath, content);
      } else {
        await writeAsStringAsync(fullPath, content);
        try {
          const metaStr = await readAsStringAsync(`${PROJECTS_ROOT}${projectId}/devflux.json`);
          const meta = JSON.parse(metaStr) as ProjectInfo;
          if (meta.safMap && meta.safMap[cleanPath]) {
            await StorageAccessFramework.writeAsStringAsync(meta.safMap[cleanPath], content);
          } else if (meta.type === 'saf' && meta.safMap) {
            // Handle new file creation in external folder
            const parts = cleanPath.split('/');
            const fileName = parts.pop() || cleanPath;
            const parentDir = parts.length > 0 ? parts.join('/') : '';
            const parentUri = parentDir === '' ? meta.safMap['.'] : meta.safMap[parentDir];
            if (parentUri) {
              const mimeType = fileName.endsWith('.json') ? 'application/json' : fileName.endsWith('.html') ? 'text/html' : fileName.endsWith('.js') ? 'text/javascript' : 'text/plain';
              const newUri = await StorageAccessFramework.createFileAsync(parentUri, fileName, mimeType);
              meta.safMap[cleanPath] = newUri;
              await writeAsStringAsync(`${PROJECTS_ROOT}${projectId}/devflux.json`, JSON.stringify(meta, null, 2));
              await StorageAccessFramework.writeAsStringAsync(newUri, content);
            }
          }
        } catch(e) {}
      }

      const durationMs = Date.now() - startedAt;
      if (durationMs > 700) {
        DebugService.log('file', 'warn', 'Salvamento de arquivo demorou mais que o esperado.', {
          project: projectId,
          file: cleanPath,
          durationMs,
          bytes: content.length,
        });
      }
    } catch (error: any) {
      DebugService.log('file', 'error', `Falha ao salvar arquivo: ${cleanPath}`, {
        project: projectId,
        file: cleanPath,
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
      });
      throw error;
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
      // Ignore if metadata update fails
    }

    this.notify();
  },

  /**
   * Recursively reads the project directory to build a file tree
   */
  async getProjectFileTree(projectId: string, options: { relativePath?: string; shallow?: boolean; deferDirectories?: string[] } = {}): Promise<FileNode[]> {
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
          const deferred = options.shallow || options.deferDirectories?.includes(entry);
          const children = deferred ? undefined : await readDir(`${fullPath}/`, entryRelativePath);
          nodes.push({
            id: entryRelativePath,
            name: entry,
            type: 'directory',
            path: entryRelativePath,
            children,
            childrenDeferred: !!deferred
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

    const relativePath = normalizeProjectRelativePath(options.relativePath || '', true);
    return await readDir(relativePath ? `${projectPath}${relativePath}/` : projectPath, relativePath);
  },

  async getRootFileTree(): Promise<FileNode[]> {
    const readDir = async (currentPath: string, relativePath: string): Promise<FileNode[]> => {
      try {
        const list = IS_WEB
          ? webReadDirectory(currentPath)
          : await readDirectoryAsync(currentPath);

        const nodes: FileNode[] = [];
        for (const item of list) {
          const fullPath = `${currentPath}${item}`;
          const entryRelativePath = relativePath ? `${relativePath}/${item}` : item;
          const info = IS_WEB ? webGetInfo(fullPath) : await getInfoAsync(fullPath);

          if (info.isDirectory) {
            const children = await readDir(`${fullPath}/`, entryRelativePath);
            nodes.push({
              id: entryRelativePath,
              name: item,
              type: 'directory',
              path: fullPath,
              children,
              isExpanded: false
            });
          } else {
            const ext = item.includes('.') ? item.split('.').pop()?.toLowerCase() : '';
            nodes.push({
              id: entryRelativePath,
              name: item,
              type: 'file',
              path: fullPath,
              fileType: ext
            });
          }
        }

        nodes.sort((a, b) => {
          if (a.type === 'directory' && b.type !== 'directory') return -1;
          if (a.type !== 'directory' && b.type === 'directory') return 1;
          return a.name.localeCompare(b.name);
        });

        return nodes;
      } catch (e) {
        return [];
      }
    };
    return await readDir(PROJECTS_ROOT, '');
  },

  /**
   * Downloads a GitHub repository as a Zipball and extracts it into a new project
   */
  async downloadGitRepo(repoUrl: string): Promise<string> {
    const match = repoUrl.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git\/?$/, '').match(/^([^/]+)\/([^/?#]+)\/?$/);
    if (!match) throw new Error('Formato de URL do GitHub inválido. Use https://github.com/usuario/repo');
    const [, owner, repo] = match;
    const fullName = `${owner}/${repo}`;
    await this.init();

    // Prefer the durable checkout, including after a process restart.
    const existing = (await this.getProjects()).find(project => project.type === 'git' && project.githubRepo?.toLowerCase() === fullName.toLowerCase());
    if (existing) {
      const localPath = this.getProjectPath(existing.id);
      const entries = IS_WEB ? webReadDirectory(localPath) : await readDirectoryAsync(localPath);
      if (entries.some(entry => entry !== 'devflux.json')) return existing.id;
    }

    const projectId = repo.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
    const projectPath = this.getProjectPath(projectId);
    // Stage on the same durable filesystem so only a complete download is published.
    const stagingId = '.devflux-import-' + projectId;
    const stagingPath = this.getProjectPath(stagingId);
    const metadata: ProjectInfo = { id: projectId, name: repo, updatedAt: Date.now(), type: 'git', githubRepo: fullName };
    try {
      const token = await GithubService.getToken();
      const response = await fetch(`https://api.github.com/repos/${fullName}/zipball`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`Falha ao baixar o repositório: ${response.status}`);
      const zip = await JSZip.loadAsync(await response.arrayBuffer());
      if (IS_WEB) webMakeDirectory(stagingPath);
      else await makeDirectoryAsync(stagingPath, { intermediates: true });

      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        const relativePath = normalizeProjectRelativePath(entry.name.split('/').slice(1).join('/'), true);
        if (!relativePath || relativePath === 'devflux.json') continue;
        await ensureParentDirectories(stagingId, relativePath);
        if (IS_WEB) {
          webWriteFile(stagingPath + relativePath, await entry.async('string'));
        } else {
          // UTF-8 decoding corrupts images and other binary repository files.
          await writeAsStringAsync(stagingPath + relativePath, await entry.async('base64'), { encoding: 'base64' });
        }
      }
      const metaContent = JSON.stringify(metadata, null, 2);
      if (IS_WEB) {
        webWriteFile(stagingPath + 'devflux.json', metaContent);
        const vfs = getWebVFS();
        for (const key of Object.keys(vfs)) {
          if (key.startsWith(stagingPath)) {
            vfs[projectPath + key.slice(stagingPath.length)] = vfs[key];
            delete vfs[key];
          }
        }
        saveWebVFS(vfs);
      } else {
        await writeAsStringAsync(stagingPath + 'devflux.json', metaContent);
        await moveAsync({ from: stagingPath, to: projectPath });
      }
      this.notify();
      return projectId;
    } catch (error) {
      if (IS_WEB) {
        const vfs = getWebVFS();
        for (const key of Object.keys(vfs)) if (key.startsWith(stagingPath)) delete vfs[key];
        saveWebVFS(vfs);
      } else {
        await deleteAsync(stagingPath, { idempotent: true });
      }
      throw error;
    }
  }
};
