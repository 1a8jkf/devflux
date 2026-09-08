const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Client } = require('pg');
const PORT = process.env.PORT || 8080;

// Helper para CORS e JSON response
function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // Health check endpoint
  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { status: 'online', service: 'DevFlux Cloud Relay & SQL Proxy', timestamp: new Date() });
  }

  // SQL Proxy Endpoint: POST /api/db/query
  if (req.method === 'POST' && req.url === '/api/db/query') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const { host, port, user, password, database, connectionString, query, params } = data;

        if (!query) {
          return sendJson(res, 400, { error: 'O parâmetro "query" é obrigatório.' });
        }
        if (!connectionString && (!host || !user || !database)) {
          return sendJson(res, 400, { error: 'Parâmetros de conexão do banco incompletos (host, user, database ou connectionString).' });
        }

        const client = new Client({
          host,
          port: Number(port) || 5432,
          user,
          password,
          database,
          connectionString,
          ssl: { rejectUnauthorized: false } // Permite conexão SSL com AWS RDS / Supabase / Nuvem
        });

        try {
          await client.connect();
          const result = await client.query(query, params || []);
          
          let columns = [];
          let rows = [];

          if (result.fields) {
            columns = result.fields.map(f => f.name);
          }
          if (result.rows) {
            rows = result.rows.map(row => columns.map(col => row[col]));
          }

          return sendJson(res, 200, { columns, rows, rowCount: result.rowCount });
        } catch (dbErr) {
          console.error('❌ [SQL Proxy Error]:', dbErr.message || dbErr);
          return sendJson(res, 400, { error: dbErr.message || String(dbErr) });
        } finally {
          await client.end().catch(() => {});
        }
      } catch (err) {
        console.error('❌ [Proxy Parse Error]:', err.message);
        return sendJson(res, 500, { error: 'Erro interno ao processar requisição do Proxy SQL.' });
      }
    });
    return;
  }

  // Cloud Backup Endpoints

  // Helper to verify GitHub token and get username
  const verifyGitHubToken = (token) => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: '/user',
        method: 'GET',
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'DevFlux-Relay'
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const user = JSON.parse(data);
              resolve(user.login);
            } catch (e) {
              reject(new Error('Invalid JSON from GitHub'));
            }
          } else {
            reject(new Error(`GitHub API error: ${res.statusCode}`));
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  };

  const getBackupDir = (username) => {
    const dir = path.join(__dirname, 'backups', username);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  };

  // POST /api/backup/upload
  if (req.method === 'POST' && req.url === '/api/backup/upload') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const { token, projectId, projectName, files } = data;

        if (!token || !projectId || !files) {
          return sendJson(res, 400, { error: 'Missing required parameters.' });
        }

        const username = await verifyGitHubToken(token);
        const userDir = getBackupDir(username);
        
        const backupData = {
          id: projectId,
          name: projectName || projectId,
          timestamp: new Date().toISOString(),
          size: Buffer.byteLength(body, 'utf8'),
          files: files
        };

        const filePath = path.join(userDir, `${projectId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf8');

        return sendJson(res, 200, { success: true, message: 'Backup saved successfully' });
      } catch (err) {
        console.error('❌ [Backup Upload Error]:', err.message);
        return sendJson(res, err.message.includes('GitHub') ? 401 : 500, { error: err.message });
      }
    });
    return;
  }

  // GET /api/backup/list
  if (req.method === 'GET' && req.url.startsWith('/api/backup/list')) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (!token) {
        return sendJson(res, 400, { error: 'Missing GitHub token.' });
      }

      const username = await verifyGitHubToken(token);
      const userDir = getBackupDir(username);
      
      const backups = [];
      if (fs.existsSync(userDir)) {
        const files = fs.readdirSync(userDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            try {
              const filePath = path.join(userDir, file);
              const stats = fs.statSync(filePath);
              const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
              backups.push({
                id: content.id,
                name: content.name,
                timestamp: content.timestamp,
                size: content.size
              });
            } catch (e) {
              console.warn(`Failed to read backup file ${file}`, e);
            }
          }
        }
      }

      // Sort by timestamp descending
      backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return sendJson(res, 200, { backups });
    } catch (err) {
      console.error('❌ [Backup List Error]:', err.message);
      return sendJson(res, err.message.includes('GitHub') ? 401 : 500, { error: err.message });
    }
  }

  // POST /api/backup/download
  if (req.method === 'POST' && req.url === '/api/backup/download') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const { token, projectId } = data;

        if (!token || !projectId) {
          return sendJson(res, 400, { error: 'Missing required parameters.' });
        }

        const username = await verifyGitHubToken(token);
        const userDir = getBackupDir(username);
        const filePath = path.join(userDir, `${projectId}.json`);

        if (!fs.existsSync(filePath)) {
          return sendJson(res, 404, { error: 'Backup not found.' });
        }

        const backupData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return sendJson(res, 200, backupData);
      } catch (err) {
        console.error('❌ [Backup Download Error]:', err.message);
        return sendJson(res, err.message.includes('GitHub') ? 401 : 500, { error: err.message });
      }
    });
    return;
  }


  // Default 404 for other HTTP requests
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('DevFlux Relay Server - WebSocket & SQL Proxy active on port ' + PORT);
});

const wss = new WebSocketServer({ server });

// Armazena as salas ativas: { [roomId]: { pc: ws, app: ws } }
const rooms = {};

server.listen(PORT, () => {
  console.log(`☁️  DevFlux Cloud Relay & SQL Proxy rodando na porta ${PORT}`);
});

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Comando inicial para entrar na sala
      if (data.type === 'join') {
        const { roomId, role } = data;
        
        if (!roomId || !role) return;

        ws.roomId = roomId;
        ws.role = role;

        if (!rooms[roomId]) {
          rooms[roomId] = { pc: null, app: null };
        }

        rooms[roomId][role] = ws;
        console.log(`🔗 [Room ${roomId}] ${role.toUpperCase()} conectado.`);

        // Se ambos estiverem conectados, avisa que a ponte está pronta
        if (rooms[roomId].pc && rooms[roomId].app) {
          console.log(`🚀 [Room ${roomId}] Ponte estabelecida com sucesso!`);
          
          // Opcional: Avisar o PC que o App conectou
          if (role === 'app') {
            rooms[roomId].pc.send(JSON.stringify({ type: 'relay_app_connected' }));
          }
        }
        return;
      }

      // Roteamento padrão de mensagens
      if (ws.roomId && rooms[ws.roomId]) {
        const targetRole = ws.role === 'pc' ? 'app' : 'pc';
        const targetWs = rooms[ws.roomId][targetRole];

        if (targetWs && targetWs.readyState === 1 /* OPEN */) {
          // Repassa a mensagem original exatamente como chegou
          targetWs.send(message.toString());
        }
      }
    } catch (err) {
      console.error('Erro ao processar mensagem WS:', err.message);
    }
  });

  ws.on('close', () => {
    if (ws.roomId && rooms[ws.roomId]) {
      console.log(`❌ [Room ${ws.roomId}] ${ws.role?.toUpperCase()} desconectado.`);
      rooms[ws.roomId][ws.role] = null;

      // Se a sala ficar vazia, limpa a memória
      if (!rooms[ws.roomId].pc && !rooms[ws.roomId].app) {
        delete rooms[ws.roomId];
        console.log(`🗑️  [Room ${ws.roomId}] Sala destruída.`);
      } else {
        // Avisa a outra ponta que a conexão caiu
        const targetRole = ws.role === 'pc' ? 'app' : 'pc';
        const targetWs = rooms[ws.roomId][targetRole];
        if (targetWs && targetWs.readyState === 1) {
           targetWs.send(JSON.stringify({ type: 'relay_peer_disconnected' }));
        }
      }
    }
  });
});

