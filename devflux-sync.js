/**
 * DevFlux - Live Sync Server 🌉
 * 
 * Este script roda na sua máquina (PC) e funciona como uma ponte para o aplicativo DevFlux.
 * Ele usa WebSockets para enviar as mudanças de arquivo do seu VS Code diretamente pro celular!
 * 
 * Como usar:
 * 1. Instale as dependências na pasta do seu projeto:
 *    npm install ws chokidar
 * 2. Rode o script:
 *    node devflux-sync.js
 * 3. No app DevFlux, vá em "Live Sync" e conecte-se ao IP da sua máquina.
 */

const { WebSocketServer } = require('ws');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configurações
const PORT = 8080;
const WATCH_DIR = process.cwd(); // Vai observar a pasta onde você rodar o script

// Descobrir IP Local para facilitar a conexão
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIP = getLocalIP();
const wss = new WebSocketServer({ port: PORT });

console.log(`\n🚀 DevFlux Live Sync Server rodando!`);
console.log(`📱 No DevFlux, conecte no IP: ws://${localIP}:${PORT}\n`);

let clients = [];

wss.on('connection', (ws) => {
  console.log(`✅ Novo dispositivo conectado ao DevFlux Sync!`);
  clients.push(ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // O App mandou um arquivo modificado (Você editou no celular)
      if (data.type === 'file_update' && data.path && data.content !== undefined) {
        const fullPath = path.join(WATCH_DIR, data.path);
        
        console.log(`📝 [App -> PC] Atualizando: ${data.path}`);
        
        // Garante que o diretório existe antes de salvar
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        
        // Escreve o arquivo silenciosamente
        fs.writeFileSync(fullPath, data.content, 'utf8');
      }
    } catch (err) {
      console.error('Erro ao processar mensagem do app:', err.message);
    }
  });

  ws.on('close', () => {
    console.log(`❌ Dispositivo desconectado.`);
    clients = clients.filter(client => client !== ws);
  });
});

// Observador de Arquivos (VS Code -> App)
console.log(`👀 Observando arquivos em: ${WATCH_DIR}`);

// Ignorar node_modules, .git e arquivos ocultos
const watcher = chokidar.watch('.', {
  ignored: /(^|[\/\\])\..|node_modules/, 
  persistent: true,
  ignoreInitial: true
});

watcher
  .on('change', (filePath) => {
    // Quando você salva no VS Code, nós enviamos pro celular!
    const normalizedPath = filePath.replace(/\\/g, '/');
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      console.log(`📤 [PC -> App] Enviando alteração: ${normalizedPath}`);
      
      const payload = JSON.stringify({
        type: 'file_update',
        path: normalizedPath,
        content: content
      });

      clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(payload);
        }
      });
    } catch (e) {
      // Arquivo pode estar travado
    }
  })
  .on('add', (filePath) => {
    console.log(`➕ Novo arquivo detectado: ${filePath}`);
  });
