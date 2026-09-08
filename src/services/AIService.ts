import AsyncStorage from '@react-native-async-storage/async-storage';
import { AISettings } from '../contexts/AISettingsContext';
import { DebugService } from './DebugService';

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export class AIService {
  private static getUrl(provider: string) {
    if (provider === 'openrouter') return 'https://openrouter.ai/api/v1/chat/completions';
    if (provider === 'google') return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    return 'https://api.openai.com/v1/chat/completions';
  }

  public static async fetchChat(settings: AISettings, messages: Message[], tools: any[] = []): Promise<any> {
    const startedAt = Date.now();
    try {
      const res = await fetch(this.getUrl(settings.provider), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey.trim()}`,
          'HTTP-Referer': 'https://devflux.app',
          'X-Title': 'DevFlux Mobile IDE',
        },
        body: JSON.stringify({
          model: settings.model,
          messages: messages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? 'auto' : undefined
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        DebugService.log('ai', 'error', `Falha na API de IA: ${res.status} ${res.statusText}`, {
          provider: settings.provider,
          model: settings.model,
          durationMs: Date.now() - startedAt,
          response: errorText,
        });
        const error = new Error(errorText);
        (error as any).__debugLogged = true;
        throw error;
      }

      const json = await res.json();
      const durationMs = Date.now() - startedAt;
      if (durationMs > 10000) {
        DebugService.log('ai', 'warn', 'Resposta da API de IA demorou mais que o esperado.', {
          provider: settings.provider,
          model: settings.model,
          durationMs,
          messageCount: messages.length,
        });
      }
      return json;
    } catch (error: any) {
      if (!(error as any)?.__debugLogged) {
        DebugService.log('ai', 'error', `Falha de comunicação com IA: ${error?.message || String(error)}`, {
          provider: settings.provider,
          model: settings.model,
          durationMs: Date.now() - startedAt,
        });
      }
      throw error;
    }
  }

  public static async loadHistory(projectId: string): Promise<Message[]> {
    try {
      const data = await AsyncStorage.getItem(`@devflux_ai_history_${projectId}`);
      return data ? JSON.parse(data) : [];
    } catch (e: any) {
      DebugService.log('ai', 'warn', 'Histórico da conversa não pôde ser carregado.', { project: projectId, error: e?.message || String(e) });
      return [];
    }
  }

  public static async saveHistory(projectId: string, messages: Message[]): Promise<void> {
    try {
      await AsyncStorage.setItem(`@devflux_ai_history_${projectId}`, JSON.stringify(messages));
    } catch (e: any) {
      console.error('Failed to save history', e);
      DebugService.log('ai', 'warn', 'Histórico da conversa não pôde ser salvo.', { project: projectId, error: e?.message || String(e) });
    }
  }

  public static async clearHistory(projectId: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`@devflux_ai_history_${projectId}`);
    } catch (e: any) {
      console.error('Failed to clear history', e);
      DebugService.log('ai', 'warn', 'Histórico da conversa não pôde ser apagado.', { project: projectId, error: e?.message || String(e) });
    }
  }
}
