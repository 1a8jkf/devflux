import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
  t: (key: string, fallback?: string) => {
    const value = getTranslation(translations.en, key);
    return value === key ? fallback || key : value;
  },
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [isLoaded, setIsLoaded] = useState(false);
  const selectionRevision = useRef(0);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const loadLanguage = async () => {
      const revision = selectionRevision.current;
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (selectionRevision.current !== revision) return;
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

  const setLanguage = useCallback(async (lang: Language) => {
    if (!['pt', 'en', 'es'].includes(lang)) return;
    selectionRevision.current++;
    setLanguageState(lang);
    writeQueue.current = writeQueue.current.catch(() => {}).then(() => AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang));
    try { await writeQueue.current; }
    catch (e) { console.error('Failed to save language', e); }
  }, []);

  const t = useCallback((key: string, fallback?: string) => {
    const dict = translations[language] || translations[DEFAULT_LANGUAGE];
    let text = getTranslation(dict, key);
    
    if (text === key && language !== DEFAULT_LANGUAGE) {
      text = getTranslation(translations[DEFAULT_LANGUAGE], key);
    }
    
    if (text === key && fallback) {
      return fallback;
    }
    
    return text;
  }, [language]);

  if (!isLoaded) return null;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
