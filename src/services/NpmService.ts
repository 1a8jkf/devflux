import { NodeRunner } from '../utils/nodeRunner';
import { PROJECTS_ROOT } from './FileSystemService';

export const NpmService = {
  async runCommand(projectId: string, args: string[]): Promise<string> {
    await NodeRunner.init();
    
    return new Promise((resolve, reject) => {
      const reqId = Math.random().toString(36).substring(7);
      
      const unsubscribe = NodeRunner.addListener((msg: any) => {
        if (msg.type === 'LINUX_NPM_RESULT' && msg.reqId === reqId) {
          unsubscribe();
          if (msg.error) {
             reject(new Error(msg.error));
          } else {
             resolve(msg.payload || '');
          }
        }
      });
      
      NodeRunner.send({
        type: 'LINUX_NPM_COMMAND',
        reqId,
        projectsRoot: PROJECTS_ROOT,
        cwd: `${PROJECTS_ROOT}${projectId}`,
        args
      });
    });
  },

  async installPackage(projectId: string, pkgName: string): Promise<string> {
    return this.runCommand(projectId, ['install', pkgName, '--save']);
  },

  async uninstallPackage(projectId: string, pkgName: string): Promise<string> {
    return this.runCommand(projectId, ['uninstall', pkgName, '--save']);
  },
  
  async searchPackage(query: string): Promise<any[]> {
    try {
      const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=20`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      return data.objects.map((obj: any) => ({
        name: obj.package.name,
        version: obj.package.version,
        description: obj.package.description,
        publisher: obj.package.publisher?.username,
      }));
    } catch (e) {
      console.error('NPM search error', e);
      return [];
    }
  }
};
