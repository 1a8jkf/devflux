import { NodeRunner } from '../utils/nodeRunner';
import { PROJECTS_ROOT } from './FileSystemService';
import { DebugService } from './DebugService';

export const NpmService = {
  async runCommand(projectId: string, args: string[]): Promise<string> {
    await NodeRunner.waitForEnvironment();
    
    return new Promise((resolve, reject) => {
      const reqId = Math.random().toString(36).substring(7);
      const startedAt = Date.now();
      const timeout = setTimeout(() => {
        unsubscribe();
        NodeRunner.send({ type: 'LINUX_NPM_CANCEL', reqId });
        DebugService.log('runtime', 'error', 'Tempo limite da operacao NPM.', { project: projectId, reqId });
        reject(new Error('NPM excedeu 5 minutos. Verifique a conexao e tente novamente.'));
      }, 300000);
      
      const unsubscribe = NodeRunner.addListener((msg: any) => {
        if (msg.type === 'LINUX_NPM_RESULT' && msg.reqId === reqId) {
          unsubscribe();
          clearTimeout(timeout);
          DebugService.log('runtime', msg.error || msg.code ? 'error' : 'info', 'Operacao NPM finalizada.', { project: projectId, reqId, code: msg.code, durationMs: Date.now() - startedAt });
          if (msg.error || (msg.code !== undefined && msg.code !== 0)) {
             reject(new Error(msg.error || 'NPM terminou com codigo ' + msg.code));
          } else {
             resolve(msg.payload || '');
          }
        }
      });
      
      const sent = NodeRunner.send({
        type: 'LINUX_NPM_COMMAND',
        reqId,
        projectsRoot: PROJECTS_ROOT,
        cwd: `${PROJECTS_ROOT}${projectId}`,
        args
      });
      if (!sent) {
        clearTimeout(timeout);
        unsubscribe();
        reject(new Error('Nao foi possivel enviar a operacao ao runtime.'));
      }
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
