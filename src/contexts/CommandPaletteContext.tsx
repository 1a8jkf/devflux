import React, { createContext, useContext, useState } from 'react';

interface CommandPaletteContextType {
  isVisible: boolean;
  openPalette: () => void;
  closePalette: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextType>({
  isVisible: false,
  openPalette: () => {},
  closePalette: () => {},
});

export const useCommandPalette = () => useContext(CommandPaletteContext);

export const CommandPaletteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isVisible, setIsVisible] = useState(false);

  const openPalette = () => setIsVisible(true);
  const closePalette = () => setIsVisible(false);

  return (
    <CommandPaletteContext.Provider value={{ isVisible, openPalette, closePalette }}>
      {children}
    </CommandPaletteContext.Provider>
  );
};
