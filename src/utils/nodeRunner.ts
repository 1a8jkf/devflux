import { DebugService } from '../services/DebugService';
// Lazy import — avoids crash if native module isn't ready at startup
let nodejs: any = null;

function getNodejs(): any {
  if (!nodejs) {
    try {
      nodejs = require('nodejs-mobile-react-native');
    } catch (e) {
      console.error('[NodeRunner] Failed to load nodejs-mobile-react-native:', e);
      DebugService.log('runtime', 'error', 'Falha ao carregar nodejs-mobile-react-native.', { error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }
  return nodejs;
}

export class NodeRunner {
  private static isReady = false;
  private static listeners: ((msg: any) => void)[] = [];
  private static initPromise: Promise<void> | null = null;
  private static envReady = false;
  private static envPromise: Promise<void> | null = null;
  private static envRetryCount = 0;
  private static readonly ENV_MAX_RETRIES = 5;

  private static async injectEnvironment(lib: any): Promise<boolean> {
    if (this.envReady) return true;
    if (this.envPromise) {
      await this.envPromise;
      return this.envReady;
    }

    this.envPromise = (async () => {
      try {
        const [{ NativeModules }, FileSystem] = await Promise.all([
          import('react-native'),
          import('expo-file-system/legacy'),
        ]);

        const documentDir = FileSystem.documentDirectory
          ? FileSystem.documentDirectory.replace('file://', '')
          : '';

        // Send INIT_ENV and wait for ACK from backend
        const ackReceived = await new Promise<boolean>((resolve) => {
          let ackTimer: any = null;
          const ackListener = (data: any) => {
            if (data?.type === 'INIT_ENV_ACK') {
              if (ackTimer) clearTimeout(ackTimer);
              this.listeners = this.listeners.filter(l => l !== ackListener);
              resolve(true);
            }
          };
          this.listeners.push(ackListener);

          lib.channel.send(JSON.stringify({
            type: 'INIT_ENV',
            documentDir,
          }));

          ackTimer = setTimeout(() => {
            this.listeners = this.listeners.filter(l => l !== ackListener);
            // Even without ACK, consider it sent to avoid blocking
            resolve(true);
          }, 3000);
        });

        this.envReady = ackReceived;
        if (!this.envReady) {
          console.warn('[NodeRunner] INIT_ENV_ACK not received; env may not be ready.');
          DebugService.log('runtime', 'warn', 'Runtime Linux não confirmou INIT_ENV_ACK.', { timeoutMs: 3000 });
        }
      } catch (e) {
        console.error('[NodeRunner] Failed to inject native environment:', e);
        DebugService.log('runtime', 'error', 'Falha ao injetar ambiente nativo do Runtime Linux.', { error: e instanceof Error ? e.message : String(e) });
      } finally {
        this.envPromise = null;
      }
    })();

    await this.envPromise;
    return this.envReady;
  }

  static async init() {
    if (this.isReady && this.envReady) {
      return;
    }
    if (this.isReady && !this.envReady) {
      const lib = getNodejs();
      if (lib) await this.injectEnvironment(lib);
      return;
    }
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve) => {
      const lib = getNodejs();
      if (!lib) {
        console.warn('[NodeRunner] nodejs-mobile-react-native not available, skipping init.');
        DebugService.log('runtime', 'error', 'Runtime Linux indisponível: módulo nativo não carregado.');
        resolve();
        return;
      }

      let initTimeout: any = null;

      const messageHandler = (msg: any) => {
        try {
          const data = typeof msg === 'string' ? JSON.parse(msg) : msg;

          if (data.type === 'READY' || data.type === 'HEARTBEAT') {
            if (!NodeRunner.isReady) {
              if (initTimeout) clearTimeout(initTimeout);
              NodeRunner.isReady = true;
              NodeRunner.injectEnvironment(lib).finally(resolve);
            } else if (data.type === 'HEARTBEAT' && !NodeRunner.envReady && NodeRunner.envRetryCount < NodeRunner.ENV_MAX_RETRIES) {
              // Retry env injection on heartbeat if it wasn't ready before
              NodeRunner.envRetryCount++;
              NodeRunner.injectEnvironment(lib).catch(() => {});
            }
          }

          NodeRunner.listeners.forEach(listener => listener(data));
        } catch (err) {
          console.error('[NodeRunner] channel message error', err);
          DebugService.log('runtime', 'error', 'Erro ao processar mensagem do Runtime Linux.', { error: err instanceof Error ? err.message : String(err) });
        }
      };

      try {
        lib.channel.addListener('message', messageHandler);
      } catch (e) {
        console.error('[NodeRunner] addListener error:', e);
        DebugService.log('runtime', 'error', 'Falha ao registrar listener do Runtime Linux.', { error: e instanceof Error ? e.message : String(e) });
        resolve();
        return;
      }

      // Start the Node.js engine
      try {
        lib.start('main.js');
      } catch (e) {
        console.error('[NodeRunner] nodejs.start error:', e);
        DebugService.log('runtime', 'error', 'Falha ao iniciar Runtime Linux.', { error: e instanceof Error ? e.message : String(e) });
      }

      initTimeout = setTimeout(() => {
        if (!NodeRunner.isReady) {
          console.warn('[NodeRunner] Backend timeout — resolving anyway to keep app alive');
          DebugService.log('runtime', 'error', 'Timeout ao iniciar Runtime Linux.', { timeoutMs: 10000 });
          NodeRunner.isReady = false;
          NodeRunner.initPromise = null;
          resolve();
        }
      }, 10000);
    });

    return this.initPromise;
  }

  static send(msg: any): boolean {
    try {
      const lib = getNodejs();
      if (!lib) return false;
      lib.channel.send(JSON.stringify(msg));
      return true;
    } catch (e) {
      console.error('[NodeRunner] send error:', e);
      DebugService.log('runtime', 'error', 'Falha ao enviar mensagem ao Runtime Linux.', { type: msg?.type, sessionId: msg?.sessionId, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }

  static async waitForEnvironment(timeoutMs = 12000): Promise<void> {
    await this.init();
    if (this.envReady) return;

    const lib = getNodejs();
    if (!lib) throw new Error('Node backend is not available.');

    const startedAt = Date.now();
    while (!this.envReady && Date.now() - startedAt < timeoutMs) {
      await this.injectEnvironment(lib);
      if (this.envReady) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    throw new Error('Native Linux runtime is not ready yet. Restart the app and try again.');
  }

  static isEnvReady(): boolean {
    return this.envReady;
  }

  static addListener(listener: (msg: any) => void): () => void {
    NodeRunner.listeners.push(listener);
    return () => {
      NodeRunner.listeners = NodeRunner.listeners.filter(l => l !== listener);
    };
  }
}
