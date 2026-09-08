const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();
const path = require('path');

const host = process.env.DEVFLUX_VPS_HOST;
const username = process.env.DEVFLUX_VPS_USER;
const password = process.env.DEVFLUX_VPS_PASSWORD;

function requireSshConfig() {
  if (!host || !username || !password) {
    throw new Error('Configure DEVFLUX_VPS_HOST, DEVFLUX_VPS_USER e DEVFLUX_VPS_PASSWORD antes de rodar este script.');
  }
}

async function deploy() {
  console.log('🔗 Conectando ao VPS...');
  try {
    requireSshConfig();
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
