const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
const path = require('path');

const host = '82.29.61.16';
const username = 'root';
const password = 's/,Ea;+C@PKXZr4m';

async function deploy() {
  console.log('🔗 Conectando ao VPS...');
  try {
    await ssh.connect({ host, username, password });
    console.log('✅ Conectado com sucesso!');

    console.log('📂 Copiando devflux-relay para o VPS...');
    const localPath = path.join(__dirname, 'devflux-relay');
    const remotePath = '/root/devflux-relay';

    await ssh.putDirectory(localPath, remotePath, {
      recursive: true,
      concurrency: 10,
      validate: (itemPath) => !itemPath.includes('node_modules'),
    });

    console.log('📦 Instalando dependências no VPS...');
    await ssh.execCommand('npm install', { cwd: remotePath });

    console.log('🚀 Iniciando servidor com PM2...');
    // Instala PM2 se não existir e reinicia o processo
    await ssh.execCommand('npm install -g pm2', { cwd: remotePath });
    await ssh.execCommand('pm2 stop devflux-relay || true', { cwd: remotePath });
    await ssh.execCommand('pm2 start server.js --name devflux-relay', { cwd: remotePath });

    console.log('✅ Deploy finalizado com sucesso! O servidor está rodando na nuvem.');
    ssh.dispose();
  } catch (err) {
    console.error('❌ Erro no deploy:', err);
    ssh.dispose();
  }
}

deploy();
