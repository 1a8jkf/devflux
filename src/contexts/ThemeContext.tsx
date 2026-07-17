import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppTheme, darkTheme, lightTheme } from '../theme';

type ThemeVariant = 'dark' | 'light';

interface ThemeContextType {
  theme: AppTheme;
  variant: ThemeVariant;
  setThemeVariant: (variant: ThemeVariant) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: darkTheme,
  variant: 'dark',
  setThemeVariant: () => {},
});

export const useAppTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [variant, setVariant] = useState<ThemeVariant>('dark');
  const theme = variant === 'light' ? lightTheme : darkTheme;

  return (
    <ThemeContext.Provider value={{ theme, variant, setThemeVariant: setVariant }}>
      {children}
    </ThemeContext.Provider>
  );
};
