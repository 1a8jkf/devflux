const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure public directory exists
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'index.html'),
    '<!DOCTYPE html><html><head><title>DevFlux Alpine Test</title><style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;} .box{background:#1e293b;padding:2rem;border-radius:1rem;box-shadow:0 10px 15px -3px rgba(0,0,0,0.5);text-align:center;} h1{color:#38bdf8;}</style></head><body><div class="box"><h1>🚀 Servidor Alpine Funcionando!</h1><p>DevFlux Node.js Server rodando no Alpine Linux via proot.</p></div></body></html>'
  );
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 - Arquivo Não Encontrado</h1>');
      } else {
        res.writeHead(500);
        res.end(`Erro no servidor: ${error.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': `${contentType}; charset=utf-8` });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ [DevFlux Alpine Server] Servidor rodando em http://localhost:${PORT}/`);
  console.log(`📁 Servindo arquivos da pasta: ${PUBLIC_DIR}\n`);
});
