import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language, translations, getTranslation } from '../i18n';

const LANGUAGE_STORAGE_KEY = '@devflux_language';
const DEFAULT_LANGUAGE: Language = 'en';

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextProps>({
  language: DEFAULT_LANGUAGE,
  setLanguage: async () => {},
  t: (key: string, fallback?: string) => fallback || key,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (stored && ['pt', 'en', 'es'].includes(stored)) {
          setLanguageState(stored as Language);
        } else {
          await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, DEFAULT_LANGUAGE);
        }
      } catch (e) {
        console.error('Failed to load language', e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadLanguage();
  }, []);

  const setLanguage = async (lang: Language) => {
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      setLanguageState(lang);
    } catch (e) {
      console.error('Failed to save language', e);
    }
  };

  const t = (key: string, fallback?: string) => {
    const dict = translations[language] || translations[DEFAULT_LANGUAGE];
    let text = getTranslation(dict, key);
    
    if (text === key && language !== DEFAULT_LANGUAGE) {
      text = getTranslation(translations[DEFAULT_LANGUAGE], key);
    }
    
    if (text === key && fallback) {
      return fallback;
    }
    
    return text;
  };

  if (!isLoaded) return null;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
