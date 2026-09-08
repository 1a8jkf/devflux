import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
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
  model: 'anthropic/claude-3.5-sonnet',
};

const defaultModelForProvider = (provider: AIProvider) => {
  if (provider === 'google') return 'gemini-1.5-pro';
  if (provider === 'openai') return 'gpt-4o';
  return 'anthropic/claude-3.5-sonnet';
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
    model: seed.model || defaultModelForProvider(provider),
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
    model: String(config.model || defaultModelForProvider(provider)),
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

  const persistState = async (nextConfigs: AIProviderConfig[], nextActiveConfigId: string) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeConfigId: nextActiveConfigId,
      configs: nextConfigs,
    }));

    const active = nextConfigs.find(config => config.id === nextActiveConfigId) || nextConfigs[0];
    if (active) {
      await AsyncStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(configToSettings(active)));
    }
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
            setConfigs(loadedConfigs);
            setActiveConfigId(loadedActiveId);
            return;
          }
        }

        const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          const migrated = createProviderConfig(JSON.parse(legacy), 1);
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
    const now = Date.now();
    const targetId = activeConfig?.id || activeConfigId;
    const nextConfigs = configs.map(config => {
      if (config.id !== targetId) return config;
      const provider = newSettings.provider || config.provider;
      const model = newSettings.provider && newSettings.model === undefined
        ? defaultModelForProvider(provider)
        : newSettings.model ?? config.model;
      return {
        ...config,
        ...newSettings,
        provider,
        model,
        name: (newSettings.name ?? config.name).trim() || providerLabel(provider),
        updatedAt: now,
      };
    });

    setConfigs(nextConfigs);
    setActiveConfigId(targetId);
    await persistState(nextConfigs, targetId);
  };

  const createConfig = async (seed: Partial<AISettings> = {}) => {
    const nextConfig = createProviderConfig(seed, configs.length + 1);
    const nextConfigs = [...configs, nextConfig];
    setConfigs(nextConfigs);
    setActiveConfigId(nextConfig.id);
    await persistState(nextConfigs, nextConfig.id);
    return nextConfig.id;
  };

  const selectConfig = async (configId: string) => {
    if (!configs.some(config => config.id === configId)) return;
    setActiveConfigId(configId);
    await persistState(configs, configId);
  };

  const deleteConfig = async (configId: string) => {
    if (configs.length <= 1) {
      const reset = createProviderConfig(defaultSettings, 1);
      setConfigs([reset]);
      setActiveConfigId(reset.id);
      await persistState([reset], reset.id);
      return;
    }

    const nextConfigs = configs.filter(config => config.id !== configId);
    const nextActiveId = activeConfigId === configId ? nextConfigs[0].id : activeConfigId;
    setConfigs(nextConfigs);
    setActiveConfigId(nextActiveId);
    await persistState(nextConfigs, nextActiveId);
  };

  const settings = configToSettings(activeConfig);
  const isConfigured = settings.apiKey.trim().length > 10 && settings.model.trim().length > 0;

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
