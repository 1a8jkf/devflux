const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Substitua esta chave pela sua Chave Privada do RevenueCat (Sua VPS é o único lugar seguro para ela)
const REVENUECAT_SECRET_API_KEY = 'sua_chave_privada_revenuecat_aqui';

/**
 * Middleware de Segurança: Valida a assinatura do usuário no RevenueCat
 */
async function verificarAssinatura(req, res, next) {
  // A chave (App User ID) que nosso apiService.ts injetou no frontend
  const appUserId = req.headers['x-devflux-user-id'];

  if (!appUserId) {
    return res.status(401).json({ error: "Acesso Negado: App User ID não fornecido." });
  }

  try {
    // A VPS pergunta ao RevenueCat se a assinatura é válida
    const rcResponse = await axios.get(`https://api.revenuecat.com/v1/subscribers/${appUserId}`, {
      headers: {
        'Authorization': `Bearer ${REVENUECAT_SECRET_API_KEY}`
      }
    });

    const assinaturasAtivas = rcResponse.data.subscriber.entitlements;

    // 'pro_access' deve ser o exato Entitlement ID que você criou no painel do RevenueCat
    if (assinaturasAtivas && assinaturasAtivas.pro_access && !assinaturasAtivas.pro_access.expires_date) {
        // Usuário pagou e está com assinatura ativa! Libera o DB/Sync.
        console.log(`[DevFlux Relay] Acesso liberado para usuário: ${appUserId}`);
        next(); 
    } else {
        console.warn(`[DevFlux Relay] Bloqueado: Assinatura expirada ou inválida para: ${appUserId}`);
        return res.status(403).json({ error: "Assinatura expirada ou inválida." });
    }
  } catch (error) {
    console.error("[DevFlux Relay] Erro ao comunicar com RevenueCat:", error.message);
    return res.status(500).json({ error: "Erro interno ao validar assinatura." });
  }
}

// ==========================================
// ROTAS PROTEGIDAS PELA ASSINATURA (DB e SYNC)
// ==========================================

app.post('/api/sync', verificarAssinatura, (req, res) => {
    const code = req.body.code;
    // Seu código de sincronização com o VPS vem aqui...
    
    res.json({ success: true, message: "Código sincronizado com segurança!" });
});

app.post('/api/db/query', verificarAssinatura, (req, res) => {
    const query = req.body.query;
    // Sua execução de SQL segura vem aqui...
    
    res.json({ success: true, data: "Resultado do DB..." });
});

// ==========================================
// SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[DevFlux Relay] Servidor blindado rodando na porta ${PORT}`);
});
