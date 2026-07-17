const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// Armazena as salas ativas: { [roomId]: { pc: ws, app: ws } }
const rooms = {};

console.log(`☁️  DevFlux Cloud Relay Server rodando na porta ${PORT}`);

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
      console.error('Erro ao processar mensagem:', err.message);
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
