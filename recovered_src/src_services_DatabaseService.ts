export interface DBConnectionConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  connectionString?: string;
  useRelay?: boolean;
  relayUrl?: string;
}

export class DatabaseService {
  static async queryViaRelay(config: DBConnectionConfig, text: string, params: any[] = []): Promise<any> {
    const relayEndpoint = config.relayUrl || 'http://82.29.61.16:8080/api/db/query';
    
    try {
      const response = await fetch(relayEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          database: config.database,
          connectionString: config.connectionString,
          query: text,
          params: params
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Erro HTTP ${response.status} no Proxy Cloud`);
      }

      return data;
    } catch (err: any) {
      console.log('--- RELAY SQL ERROR ---', err);
      let msg = err.message || 'Falha ao conectar via DevFlux Cloud Relay (VPS).';
      if (msg.includes('CLEARTEXT') || msg.includes('Network request failed') || msg.includes('fetch failed')) {
        msg = 'Falha na conexão com o servidor nuvem (82.29.61.16:8080). O tráfego HTTP foi liberado na nova versão do app.';
      }
      throw new Error(msg);
    }
  }

  static async query(config: DBConnectionConfig, text: string, params: any[] = []): Promise<any> {
    // DevFlux Cloud Relay é a única e exclusiva opção de conexão
    return this.queryViaRelay(config, text, params);
  }
}
