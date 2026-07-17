import { Client } from 'pg';

export interface DBConnectionConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  connectionString?: string;
}

export class DatabaseService {
  static async query(config: DBConnectionConfig, text: string, params: any[] = []): Promise<any> {
    const client = new Client({
      host: config.host,
      port: Number(config.port) || 5432,
      user: config.user,
      password: config.password,
      database: config.database,
      connectionString: config.connectionString,
      ssl: { rejectUnauthorized: false } // Required for AWS/Supabase in mobile
    });

    try {
      await client.connect();
      const res = await client.query(text, params);
      
      // Parse pg output to our generic grid format
      let columns: string[] = [];
      let rows: any[][] = [];

      if (res.fields) {
        columns = res.fields.map(f => f.name);
      }
      
      if (res.rows) {
        rows = res.rows.map(row => columns.map(col => row[col]));
      }

      return { columns, rows, rowCount: res.rowCount };
    } catch (err: any) {
      console.log('--- SQL RAW ERROR ---', err);
      let errMsg = 'Erro desconhecido';
      if (err?.message) errMsg = err.message;
      else if (typeof err === 'string') errMsg = err;
      else if (err) errMsg = JSON.stringify(err);
      
      throw new Error(errMsg);
    } finally {
      await client.end().catch(() => {});
    }
  }
}
