import AsyncStorage from '@react-native-async-storage/async-storage';
import { AISettings } from '../contexts/AISettingsContext';
import { DebugService } from './DebugService';

class AIRequestError extends Error {
  constructor(readonly translationKey: string, readonly detail = '') {
    super(translationKey + (detail ? ' ' + detail : ''));
  }
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export class AIService {
  public static describeError(error: unknown, t: (key: string) => string): string {
    if (error instanceof AIRequestError) return t(error.translationKey) + (error.detail ? ' ' + error.detail : '');
    return t(error instanceof Error ? error.message : String(error));
  }
  private static endpoint(provider: string) {
    if (provider === 'google') return 'https://generativelanguage.googleapis.com/v1beta/openai';
    if (provider === 'openrouter') return 'https://openrouter.ai/api/v1';
    if (provider === 'openai') return 'https://api.openai.com/v1';
    throw new Error('Provedor de IA desconhecido.');
  }

  public static normalizeModel(settings: AISettings) {
    const model = settings.model.trim();
    return settings.provider === 'google' ? model.replace(/^models\//, '') : model;
  }

  private static async request(settings: AISettings, url: string, init: RequestInit, signal?: AbortSignal): Promise<any> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel);
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(cancel, 60000);
    let status: number | undefined;
    try {
      if (!settings.apiKey.trim()) throw new Error('Chave de API nao configurada.');
      const res = await fetch(url, { ...init, signal: controller.signal });
      status = res.status;
      const json = await res.json();
      if (!res.ok || json.error) {
        const detail = String(json.error?.message || res.statusText || 'Resposta invalida')
          .split(settings.apiKey.trim()).join('[redacted]').slice(0, 800);
        const reason = status === 401 ? 'Chave recusada pelo provedor.'
          : status === 403 ? 'Sem permissao para este recurso.'
          : status === 404 ? 'Modelo indisponivel neste provedor. Atualize a lista de modelos.'
          : status === 429 ? 'Limite de uso ou cota do provedor atingido.'
          : 'Falha na API de IA.';
        throw new AIRequestError(reason, detail);
      }
      DebugService.log('ai', 'info', 'AI request completed.', {
        provider: settings.provider, model: this.normalizeModel(settings), status, durationMs: Date.now() - startedAt,
      });
      return json;
    } catch (error: any) {
      const message = controller.signal.aborted
        ? (signal?.aborted ? 'Requisicao cancelada.' : 'O provedor nao respondeu em 60 segundos.')
        : String(error?.message || error).split(settings.apiKey.trim() || '\0').join('[redacted]');
      DebugService.log('ai', 'error', message, {
        provider: settings.provider, model: this.normalizeModel(settings), status, durationMs: Date.now() - startedAt,
      });
      throw controller.signal.aborted ? new AIRequestError(message) : error instanceof AIRequestError ? error : new AIRequestError(message);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
    }
  }

  public static async fetchChat(settings: AISettings, messages: Message[], tools: any[] = [], signal?: AbortSignal): Promise<any> {
    const model = this.normalizeModel(settings);
    if (!model) throw new Error('Selecione um modelo para esta configuracao.');
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.apiKey.trim() };
    if (settings.provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://devflux.app';
      headers['X-Title'] = 'DevFlux Mobile IDE';
    }
    const json = await this.request(settings, this.endpoint(settings.provider) + '/chat/completions', {
      method: 'POST', headers,
      body: JSON.stringify({ model, messages, tools: tools.length ? tools : undefined, tool_choice: tools.length ? 'auto' : undefined }),
    }, signal);
    if (!json.choices?.[0]?.message) throw new Error('O provedor retornou uma resposta sem mensagem.');
    return json;
  }

  public static async testConnection(settings: AISettings, signal?: AbortSignal): Promise<void> {
    await this.fetchChat(settings, [{ role: 'user', content: 'Reply with OK only.' }], [], signal);
  }

  public static async listModels(settings: AISettings, signal?: AbortSignal): Promise<{ id: string; name: string }[]> {
    const result = new Map<string, { id: string; name: string }>();
    if (settings.provider === 'google') {
      let pageToken = '';
      const pages = new Set<string>();
      do {
        if (pages.has(pageToken) || pages.size >= 20) throw new Error('Paginacao de modelos invalida.');
        pages.add(pageToken);
        const url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
        const json = await this.request(settings, url, { headers: { 'x-goog-api-key': settings.apiKey.trim() } }, signal);
        for (const model of json.models || []) {
          if (typeof model.name !== 'string' || !model.supportedGenerationMethods?.includes('generateContent')) continue;
          const id = model.name.replace(/^models\//, '');
          result.set(id, { id, name: model.displayName || id });
        }
        pageToken = json.nextPageToken || '';
      } while (pageToken);
    } else {
      const json = await this.request(settings, this.endpoint(settings.provider) + '/models', {
        headers: { Authorization: 'Bearer ' + settings.apiKey.trim() },
      }, signal);
      for (const model of json.data || []) {
        if (typeof model.id !== 'string') continue;
        if (settings.provider === 'openrouter') {
          if (model.architecture?.output_modalities && !model.architecture.output_modalities.includes('text')) continue;
        } else if (/(embedding|whisper|tts|transcribe|realtime|moderation|image|dall-e|sora|instruct)/i.test(model.id)) continue;
        result.set(model.id, { id: model.id, name: model.name || model.id });
      }
    }
    return [...result.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  public static async loadHistory(projectId: string): Promise<Message[]> {
    try {
      const data = await AsyncStorage.getItem(`@devflux_ai_history_${projectId}`);
      return data ? JSON.parse(data) : [];
    } catch (e: any) {
      DebugService.log('ai', 'warn', 'Conversation history could not be loaded.', { project: projectId, error: e?.message || String(e) });
      return [];
    }
  }

  public static async saveHistory(projectId: string, messages: Message[]): Promise<void> {
    try {
      await AsyncStorage.setItem(`@devflux_ai_history_${projectId}`, JSON.stringify(messages));
    } catch (e: any) {
      console.error('Failed to save history', e);
      DebugService.log('ai', 'warn', 'Conversation history could not be saved.', { project: projectId, error: e?.message || String(e) });
    }
  }

  public static async clearHistory(projectId: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`@devflux_ai_history_${projectId}`);
    } catch (e: any) {
      console.error('Failed to clear history', e);
      DebugService.log('ai', 'warn', 'Conversation history could not be cleared.', { project: projectId, error: e?.message || String(e) });
    }
  }
}
