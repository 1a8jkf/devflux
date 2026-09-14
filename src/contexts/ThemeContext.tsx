import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppTheme, ThemeId, THEME_LIST, getThemeById, getThemeInfo } from '../theme';

const THEME_STORAGE_KEY = '@devflux_theme';

interface ThemeContextType {
  theme: AppTheme;
  themeId: ThemeId;
  variant: 'dark' | 'light'; // backward compat
  isDark: boolean;
  setThemeById: (id: ThemeId) => void;
  setThemeVariant: (variant: 'dark' | 'light') => void; // backward compat
}

const ThemeContext = createContext<ThemeContextType>({
  theme: getThemeById('devflux-dark'),
  themeId: 'devflux-dark',
  variant: 'dark',
  isDark: true,
  setThemeById: () => {},
  setThemeVariant: () => {},
});

export const useAppTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeId, setThemeId] = useState<ThemeId>('devflux-dark');

  // Load persisted theme on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(stored => {
      if (stored && THEME_LIST.find(t => t.id === stored)) {
        setThemeId(stored as ThemeId);
      }
    }).catch(() => {});
  }, []);

  const setThemeById = (id: ThemeId) => {
    setThemeId(id);
    AsyncStorage.setItem(THEME_STORAGE_KEY, id).catch(() => {});
  };

  // Backward compatibility: setThemeVariant maps to devflux-dark / devflux-light
  const setThemeVariant = (variant: 'dark' | 'light') => {
    setThemeById(variant === 'dark' ? 'devflux-dark' : 'devflux-light');
  };

  const info = getThemeInfo(themeId);
  const theme = info.theme;
  const isDark = info.isDark;
  const variant = isDark ? 'dark' : 'light';

  return (
    <ThemeContext.Provider value={{ theme, themeId, variant, isDark, setThemeById, setThemeVariant }}>
      {children}
    </ThemeContext.Provider>
  );
};
