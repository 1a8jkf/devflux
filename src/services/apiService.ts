import Purchases from 'react-native-purchases';

// URL base da sua VPS
const VPS_BASE_URL = 'https://api.devflux.com';

/**
 * Função utilitária para fazer requisições seguras para a sua VPS.
 * Ela injeta automaticamente o 'App User ID' do RevenueCat nos cabeçalhos,
 * permitindo que a VPS valide se o usuário realmente tem a assinatura ativa.
 */
export const fetchVPS = async (endpoint: string, options: RequestInit = {}) => {
  try {
    // 1. Pega o identificador único do celular (a "chave" de autenticação do RevenueCat)
    const appUserId = await Purchases.getAppUserID();

    // 2. Prepara os cabeçalhos (mantendo os originais se houver)
    const headers = new Headers(options.headers || {});
    
    // Injeta a chave no cabeçalho
    headers.append('x-devflux-user-id', appUserId);
    headers.append('Content-Type', 'application/json');

    // 3. Dispara a requisição para a VPS
    const response = await fetch(`${VPS_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });

    if (response.status === 403) {
      console.warn("A VPS bloqueou o acesso! O usuário tentou hackear o app ou a assinatura expirou.");
      // Aqui você poderia forçar o isPro = false ou abrir o Modal de Paywall
    }

    return response;
  } catch (error) {
    console.error("Erro na comunicação com a VPS:", error);
    throw error;
  }
};

/**
 * Exemplo de uso prático: Enviando código para a VPS sincronizar
 */
export const syncCodeToVPS = async (codePayload: any) => {
  return await fetchVPS('/api/sync', {
    method: 'POST',
    body: JSON.stringify({ code: codePayload })
  });
};
