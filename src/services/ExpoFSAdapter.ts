import { Platform } from 'react-native';
import { Buffer } from 'buffer';
// Lazy require to break the require cycle: FileSystemService -> GitService -> ExpoFSAdapter -> FileSystemService
const getFS = () => require('./FileSystemService').FileSystemService;
const getProjectsRoot = () => require('./FileSystemService').PROJECTS_ROOT;
const getWebGetInfo = () => require('./FileSystemService').webGetInfo;

import * as FileSystem from 'expo-file-system/legacy';

const IS_WEB = Platform.OS === 'web';

// We need to implement the fs.promises interface expected by isomorphic-git.
export class ExpoFSAdapter {
  promises: ExpoFSPromises;

  constructor(projectId: string) {
    this.promises = new ExpoFSPromises(projectId);
  }
}

class ExpoFSPromises {
  private projectId: string;
  private basePath: string;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.basePath = `${getProjectsRoot()}${projectId}`;
  }

  private getPath(filepath: string) {
    // Isomorphic-git passes paths like '/.git/HEAD' or 'README.md'
    if (filepath === '/' || filepath === '\\') return this.basePath + '/';
    if (filepath.startsWith('/') || filepath.startsWith('\\')) {
      return this.basePath + filepath;
    }
    return this.basePath + '/' + filepath;
  }

  private getRelativePath(filepath: string) {
    if (filepath === '/' || filepath === '\\') return '';
    if (filepath.startsWith('/') || filepath.startsWith('\\')) {
      return filepath.substring(1);
    }
    return filepath;
  }

  async readFile(filepath: string, opts?: any): Promise<Uint8Array | string> {
    const encoding = typeof opts === 'string' ? opts : opts?.encoding;
    const fullPath = this.getPath(filepath);

    if (IS_WEB) {
      try {
        const content = await getFS().readFile(this.projectId, this.getRelativePath(filepath));
        if (encoding === 'utf8') return content;
        // Convert to binary
        return Buffer.from(content, 'utf8');
      } catch (err: any) {
        if (err.message === 'File not found') {
          const e: any = new Error(`ENOENT: no such file or directory, open '${filepath}'`);
          e.code = 'ENOENT';
          throw e;
        }
        throw err;
      }
    }

    if (encoding === 'utf8') {
      return await FileSystem.readAsStringAsync(fullPath, { encoding: FileSystem.EncodingType.UTF8 });
    } else {
      const b64 = await FileSystem.readAsStringAsync(fullPath, { encoding: FileSystem.EncodingType.Base64 });
      return Buffer.from(b64, 'base64');
    }
  }

  async writeFile(filepath: string, data: Uint8Array | string, opts?: any): Promise<void> {
    const fullPath = this.getPath(filepath);

    if (IS_WEB) {
      let content = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
      await getFS().writeFile(this.projectId, this.getRelativePath(filepath), content, true);
      return;
    }

    if (typeof data === 'string') {
      await FileSystem.writeAsStringAsync(fullPath, data, { encoding: FileSystem.EncodingType.UTF8 });
    } else {
      const b64 = Buffer.from(data).toString('base64');
      await FileSystem.writeAsStringAsync(fullPath, b64, { encoding: FileSystem.EncodingType.Base64 });
    }
  }

  async unlink(filepath: string): Promise<void> {
    const fullPath = this.getPath(filepath);
    if (IS_WEB) {
      await getFS().deleteFile(this.projectId, this.getRelativePath(filepath));
      return;
    }
    await FileSystem.deleteAsync(fullPath, { idempotent: true });
  }

  async readdir(filepath: string): Promise<string[]> {
    const fullPath = this.getPath(filepath);
    if (IS_WEB) {
      // getProjectFileTree isn't perfect for this, but we'd need a specific web dir reader.
      // We will try our best or return empty. Web fallback is limited.
      return []; 
    }
    return await FileSystem.readDirectoryAsync(fullPath);
  }

  async mkdir(filepath: string, opts?: any): Promise<void> {
    const fullPath = this.getPath(filepath);
    if (IS_WEB) {
      await getFS().makeDirectory(this.projectId, this.getRelativePath(filepath));
      return;
    }
    await FileSystem.makeDirectoryAsync(fullPath, { intermediates: true });
  }

  async rmdir(filepath: string): Promise<void> {
    await this.unlink(filepath);
  }

  async stat(filepath: string): Promise<any> {
    const fullPath = this.getPath(filepath);
    
    let info: any;
    
    if (IS_WEB) {
      info = getWebGetInfo()(fullPath);
      // Give it fake size on web since we don't track size in vfs easily without reading
      info.size = info.isDirectory ? 0 : 100;
    } else {
      info = await FileSystem.getInfoAsync(fullPath, { size: true } as any);
    }
    
    if (!info.exists) {
      const err: any = new Error(`ENOENT: no such file or directory, stat '${filepath}'`);
      err.code = 'ENOENT';
      throw err;
    }

    return {
      type: info.isDirectory ? 'dir' : 'file',
      mode: info.isDirectory ? 0o040000 | 0o777 : 0o100000 | 0o644,
      size: info.size || 0,
      ino: 0,
      mtimeMs: info.modificationTime ? info.modificationTime * 1000 : Date.now(),
      ctimeMs: info.modificationTime ? info.modificationTime * 1000 : Date.now(),
      isFile: () => !info.isDirectory,
      isDirectory: () => !!info.isDirectory,
      isSymbolicLink: () => false,
    };
  }

  async lstat(filepath: string): Promise<any> {
    // Expo FileSystem doesn't support symlinks natively
    return this.stat(filepath);
  }

  async readlink(filepath: string): Promise<string> {
    throw new Error("readlink not supported");
  }

  async symlink(target: string, filepath: string): Promise<void> {
    throw new Error("symlink not supported");
  }
}
