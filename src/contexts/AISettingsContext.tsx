import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AISettings {
  provider: 'openai' | 'openrouter' | 'google';
  apiKey: string;
  model: string;
}

interface AISettingsContextType {
  settings: AISettings;
  updateSettings: (newSettings: Partial<AISettings>) => Promise<void>;
  isConfigured: boolean;
}

const defaultSettings: AISettings = {
  provider: 'openrouter', // OpenRouter is great for BYOK because it supports many models
  apiKey: '',
  model: 'anthropic/claude-3.5-sonnet',
};

const AISettingsContext = createContext<AISettingsContextType>({
  settings: defaultSettings,
  updateSettings: async () => {},
  isConfigured: false,
});

export const useAISettings = () => useContext(AISettingsContext);

export const AISettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AISettings>(defaultSettings);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const saved = await AsyncStorage.getItem('@codeflex_ai_settings');
        if (saved) {
          setSettings({ ...defaultSettings, ...JSON.parse(saved) });
        }
      } catch (e) {
        console.error('Failed to load AI settings', e);
      }
    };
    loadSettings();
  }, []);

  const updateSettings = async (newSettings: Partial<AISettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    try {
      await AsyncStorage.setItem('@codeflex_ai_settings', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save AI settings', e);
    }
  };

  const isConfigured = settings.apiKey.trim().length > 10;

  return (
    <AISettingsContext.Provider value={{ settings, updateSettings, isConfigured }}>
      {children}
    </AISettingsContext.Provider>
  );
};
