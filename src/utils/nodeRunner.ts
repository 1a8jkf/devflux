import nodejs from 'nodejs-mobile-react-native';

export class NodeRunner {
  private static isReady = false;
  private static listeners: ((msg: any) => void)[] = [];

  static async init() {
    if (this.isReady) return;

    return new Promise<void>((resolve, reject) => {
      nodejs.channel.addListener('message', (msg: any) => {
        try {
          const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
          if (data.type === 'READY') {
            this.isReady = true;
            resolve();
          }
          this.listeners.forEach(listener => listener(data));
        } catch (err) {
          console.error("NodeJS channel message error", err);
        }
      });

      nodejs.start('main.js');
      
      // Safety timeout
      setTimeout(() => {
        if (!this.isReady) reject(new Error("NodeJS backend timeout"));
      }, 10000);
    });
  }

  static addListener(callback: (msg: any) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  static send(message: any) {
    if (!this.isReady) {
      console.warn("NodeJS backend is not ready yet.");
      return;
    }
    nodejs.channel.send(JSON.stringify(message));
  }
}
