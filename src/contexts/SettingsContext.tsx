import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface EditorSettings {
  editorEngine?: 'monaco' | 'lightweight';
  fontSize: number;
  fontFamily?: string;
  wordWrap: 'on' | 'off';
  minimap: boolean;
  autoSave: boolean;
  formatOnSave: boolean;
  lineNumbers: 'on' | 'off';
  githubToken?: string;
  relayUrl?: string;
}

interface SettingsContextType {
  settings: EditorSettings;
  updateSettings: (newSettings: Partial<EditorSettings>) => Promise<void>;
}

const defaultSettings: EditorSettings = {
  editorEngine: 'monaco',
  fontSize: 14,
  wordWrap: 'on',
  minimap: false,
  autoSave: false,
  formatOnSave: false,
  lineNumbers: 'on',
  relayUrl: 'http://localhost:8080',
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  updateSettings: async () => {},
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<EditorSettings>(defaultSettings);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const saved = await AsyncStorage.getItem('@codeflex_settings');
        if (saved) {
          setSettings({ ...defaultSettings, ...JSON.parse(saved) });
        }
      } catch (e) {
        console.error('Failed to load settings', e);
      }
    };
    loadSettings();
  }, []);

  const updateSettings = async (newSettings: Partial<EditorSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    try {
      await AsyncStorage.setItem('@codeflex_settings', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};
