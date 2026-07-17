const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

const host = '82.29.61.16';
const username = 'root';
const password = 's/,Ea;+C@PKXZr4m';

async function check() {
  console.log('🔗 Conectando ao VPS...');
  try {
    await ssh.connect({ host, username, password });
    
    console.log('--- Verificando Firewall (UFW) ---');
    const ufw = await ssh.execCommand('ufw status');
    console.log(ufw.stdout);
    
    console.log('--- Liberando porta 8080 ---');
    const ufwAllow = await ssh.execCommand('ufw allow 8080/tcp');
    console.log(ufwAllow.stdout);

    console.log('--- Verificando IPTables ---');
    const iptables = await ssh.execCommand('iptables -I INPUT -p tcp --dport 8080 -j ACCEPT');
    console.log(iptables.stdout);

    console.log('--- Verificando PM2 Logs ---');
    const pm2 = await ssh.execCommand('pm2 logs devflux-relay --lines 10 --nostream', { cwd: '/root/devflux-relay' });
    console.log(pm2.stdout);
    if (pm2.stderr) console.log('PM2 STDERR:', pm2.stderr);

    console.log('--- Verificando se a porta 8080 esta aberta no localhost do VPS ---');
    const netstat = await ssh.execCommand('ss -tulpn | grep 8080');
    console.log(netstat.stdout);

    ssh.dispose();
  } catch (err) {
    console.error('❌ Erro:', err);
    ssh.dispose();
  }
}

check();
