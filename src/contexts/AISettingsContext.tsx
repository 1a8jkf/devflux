import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AIProvider = 'openai' | 'openrouter' | 'google';

export interface AISettings {
  id?: string;
  name: string;
  provider: AIProvider;
  apiKey: string;
  model: string;
}

export interface AIProviderConfig extends AISettings {
  id: string;
  createdAt: number;
  updatedAt: number;
}

interface AISettingsContextType {
  settings: AISettings;
  configs: AIProviderConfig[];
  activeConfigId: string;
  activeConfig: AIProviderConfig;
  updateSettings: (newSettings: Partial<AISettings>) => Promise<void>;
  createConfig: (seed?: Partial<AISettings>) => Promise<string>;
  selectConfig: (configId: string) => Promise<void>;
  deleteConfig: (configId: string) => Promise<void>;
  isConfigured: boolean;
  isLoading: boolean;
}

const STORAGE_KEY = '@devflux_ai_provider_configs_v1';
const LEGACY_STORAGE_KEY = '@codeflex_ai_settings';

const defaultSettings: AISettings = {
  name: 'OpenRouter',
  provider: 'openrouter',
  apiKey: '',
  model: '',
};

const providerLabel = (provider: AIProvider) => {
  if (provider === 'google') return 'Google';
  if (provider === 'openai') return 'OpenAI';
  return 'OpenRouter';
};

const createProviderConfig = (seed: Partial<AISettings> = {}, index = 1): AIProviderConfig => {
  const provider = seed.provider || defaultSettings.provider;
  const now = Date.now();
  return {
    id: seed.id || `ai-config-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: (seed.name || `${providerLabel(provider)} ${index}`).trim(),
    provider,
    apiKey: seed.apiKey || '',
    model: seed.model || '',
    createdAt: now,
    updatedAt: now,
  };
};

const fallbackConfig = createProviderConfig(defaultSettings, 1);

const configToSettings = (config: AIProviderConfig): AISettings => ({
  id: config.id,
  name: config.name,
  provider: config.provider,
  apiKey: config.apiKey,
  model: config.model,
});

const normalizeLoadedConfig = (config: any, index: number): AIProviderConfig | null => {
  if (!config || typeof config !== 'object') return null;
  const provider = config.provider === 'openai' || config.provider === 'google' || config.provider === 'openrouter'
    ? config.provider
    : defaultSettings.provider;
  return {
    id: String(config.id || `ai-config-loaded-${index}`),
    name: String(config.name || `${providerLabel(provider)} ${index + 1}`).trim(),
    provider,
    apiKey: String(config.apiKey || ''),
    model: String(config.model || ''),
    createdAt: Number(config.createdAt || Date.now()),
    updatedAt: Number(config.updatedAt || Date.now()),
  };
};

const AISettingsContext = createContext<AISettingsContextType>({
  settings: configToSettings(fallbackConfig),
  configs: [fallbackConfig],
  activeConfigId: fallbackConfig.id,
  activeConfig: fallbackConfig,
  updateSettings: async () => {},
  createConfig: async () => fallbackConfig.id,
  selectConfig: async () => {},
  deleteConfig: async () => {},
  isConfigured: false,
  isLoading: true,
});

export const useAISettings = () => useContext(AISettingsContext);

export const AISettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [configs, setConfigs] = useState<AIProviderConfig[]>([fallbackConfig]);
  const [activeConfigId, setActiveConfigId] = useState(fallbackConfig.id);
  const [isLoading, setIsLoading] = useState(true);

  const stateRef = useRef({ configs: [fallbackConfig], activeConfigId: fallbackConfig.id });
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  const persistState = async (nextConfigs: AIProviderConfig[], nextActiveConfigId: string) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ configs: nextConfigs, activeConfigId: nextActiveConfigId }));
  };

  const commit = (update: (state: typeof stateRef.current) => typeof stateRef.current) => {
    const operation = writeQueue.current.catch(() => {}).then(async () => {
      const next = update(stateRef.current);
      await persistState(next.configs, next.activeConfigId);
      stateRef.current = next;
      setConfigs(next.configs);
      setActiveConfigId(next.activeConfigId);
    });
    writeQueue.current = operation;
    return operation;
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          const loadedConfigs = Array.isArray(parsed.configs)
            ? parsed.configs.map(normalizeLoadedConfig).filter(Boolean) as AIProviderConfig[]
            : [];

          if (loadedConfigs.length > 0) {
            const loadedActiveId = loadedConfigs.some(config => config.id === parsed.activeConfigId)
              ? String(parsed.activeConfigId)
              : loadedConfigs[0].id;
            stateRef.current = { configs: loadedConfigs, activeConfigId: loadedActiveId };
            setConfigs(loadedConfigs);
            setActiveConfigId(loadedActiveId);
            return;
          }
        }

        const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          const migrated = createProviderConfig(JSON.parse(legacy), 1);
          stateRef.current = { configs: [migrated], activeConfigId: migrated.id };
          setConfigs([migrated]);
          setActiveConfigId(migrated.id);
          await persistState([migrated], migrated.id);
          return;
        }

        setConfigs([fallbackConfig]);
        setActiveConfigId(fallbackConfig.id);
      } catch (e) {
        console.error('Failed to load AI settings', e);
        setConfigs([fallbackConfig]);
        setActiveConfigId(fallbackConfig.id);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const activeConfig = useMemo(() => {
    return configs.find(config => config.id === activeConfigId) || configs[0] || fallbackConfig;
  }, [configs, activeConfigId]);

  const updateSettings = async (newSettings: Partial<AISettings>) => {
    const targetId = newSettings.id || stateRef.current.activeConfigId;
    await commit(state => ({
      ...state,
      configs: state.configs.map(config => {
        if (config.id !== targetId) return config;
        const provider = newSettings.provider || config.provider;
        const changedProvider = provider !== config.provider;
        return {
          ...config,
          name: (newSettings.name ?? config.name).trim() || providerLabel(provider),
          provider,
          apiKey: (newSettings.apiKey ?? (changedProvider ? '' : config.apiKey)).trim(),
          model: (newSettings.model ?? (changedProvider ? '' : config.model)).trim(),
          updatedAt: Date.now(),
        };
      }),
    }));
  };

  const createConfig = async (seed: Partial<AISettings> = {}) => {
    const nextConfig = createProviderConfig(seed, stateRef.current.configs.length + 1);
    await commit(state => ({ configs: [...state.configs, nextConfig], activeConfigId: nextConfig.id }));
    return nextConfig.id;
  };

  const selectConfig = async (configId: string) => {
    await commit(state => state.configs.some(config => config.id === configId) ? { ...state, activeConfigId: configId } : state);
  };

  const deleteConfig = async (configId: string) => {
    await commit(state => {
      const remaining = state.configs.filter(config => config.id !== configId);
      const nextConfigs = remaining.length ? remaining : [createProviderConfig(defaultSettings, 1)];
      return { configs: nextConfigs, activeConfigId: nextConfigs.some(config => config.id === state.activeConfigId) ? state.activeConfigId : nextConfigs[0].id };
    });
  };

  const settings = configToSettings(activeConfig);
  const isConfigured = settings.apiKey.trim().length > 0 && settings.model.trim().length > 0;

  return (
    <AISettingsContext.Provider
      value={{
        settings,
        configs,
        activeConfigId,
        activeConfig,
        updateSettings,
        createConfig,
        selectConfig,
        deleteConfig,
        isConfigured,
        isLoading,
      }}
    >
      {children}
    </AISettingsContext.Provider>
  );
};
