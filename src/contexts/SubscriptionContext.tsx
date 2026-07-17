import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SubscriptionContextType {
  isPro: boolean;
  unlockPro: () => Promise<void>;
  resetPro: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  isPro: false,
  unlockPro: async () => {},
  resetPro: async () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const val = await AsyncStorage.getItem('@codeflex_pro');
        if (val === 'true') {
          setIsPro(true);
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadStatus();
  }, []);

  const unlockPro = async () => {
    setIsPro(true);
    await AsyncStorage.setItem('@codeflex_pro', 'true');
  };

  const resetPro = async () => {
    setIsPro(false);
    await AsyncStorage.removeItem('@codeflex_pro');
  };

  return (
    <SubscriptionContext.Provider value={{ isPro, unlockPro, resetPro }}>
      {children}
    </SubscriptionContext.Provider>
  );
};
