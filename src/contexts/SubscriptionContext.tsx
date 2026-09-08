import React, { createContext, useContext } from 'react';

interface SubscriptionContextType {
  isPro: boolean;
  unlockPro: () => Promise<void>;
  resetPro: () => Promise<void>;
  customerInfo: any | null;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  isPro: true,
  unlockPro: async () => {},
  resetPro: async () => {},
  customerInfo: null,
});

export const useSubscription = () => useContext(SubscriptionContext);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <SubscriptionContext.Provider value={{ isPro: true, unlockPro: async () => {}, resetPro: async () => {}, customerInfo: null }}>
      {children}
    </SubscriptionContext.Provider>
  );
};
