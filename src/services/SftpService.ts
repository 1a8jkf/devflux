import { NodeSSH } from 'node-ssh';

class SftpService {
  private ssh: NodeSSH | null = null;
  private currentHost: string = '';
  
  async connect(host: string, user: string, password?: string, port: number = 22) {
    this.ssh = new NodeSSH();
    const config: any = {
      host,
      username: user,
      port,
    };
    if (password) {
      config.password = password;
    }
    await this.ssh.connect(config);
    this.currentHost = host;
  }

  isConnected(): boolean {
    return this.ssh !== null && this.ssh.isConnected();
  }

  async listDirectory(remotePath: string): Promise<any[]> {
    if (!this.ssh) throw new Error("Not connected");
    const sftp = await this.ssh.requestSFTP();
    return new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (err: any, list: any) => {
        if (err) return reject(err);
        
        // Map to FileNode format
        const nodes = list
          // Ignore current and parent directory markers
          .filter((item: any) => item.filename !== '.' && item.filename !== '..')
          .map((item: any) => {
            const isDir = item.attrs && item.attrs.isDirectory();
            const ext = item.filename.includes('.') ? item.filename.split('.').pop()?.toLowerCase() : '';
            return {
              id: `${remotePath === '/' ? '' : remotePath}/${item.filename}`,
              name: item.filename,
              type: isDir ? 'directory' : 'file',
              fileType: isDir ? undefined : ext,
              path: `${remotePath === '/' ? '' : remotePath}/${item.filename}`,
              isRemote: true
            };
          });
          
        // Sort: directories first, then alphabetically
        nodes.sort((a: any, b: any) => {
          if (a.type === 'directory' && b.type !== 'directory') return -1;
          if (a.type !== 'directory' && b.type === 'directory') return 1;
          return a.name.localeCompare(b.name);
        });
        
        resolve(nodes);
      });
    });
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    if (!this.ssh) throw new Error("Not connected");
    const cleanLocalPath = localPath.replace('file://', '');
    await this.ssh.putFile(cleanLocalPath, remotePath);
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    if (!this.ssh) throw new Error("Not connected");
    const cleanLocalPath = localPath.replace('file://', '');
    await this.ssh.getFile(cleanLocalPath, remotePath);
  }

  disconnect() {
    if (this.ssh) {
      this.ssh.dispose();
      this.ssh = null;
    }
  }
}

export default new SftpService();
