import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { CustomerInfo, LOG_LEVEL } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';

// API Keys (It is recommended to store these in an environment variable)
const API_KEY_GOOGLE = 'test_AmbiJhDWdgAhkIrkLiaIfcPAkpX';
const API_KEY_APPLE = 'test_AmbiJhDWdgAhkIrkLiaIfcPAkpX'; // Assuming same if not distinct

const ENTITLEMENT_ID = 'DevFlux Labs Pro';

interface RevenueCatContextState {
  isPro: boolean;
  isFetching: boolean;
  customerInfo: CustomerInfo | null;
  presentPaywall: () => Promise<void>;
  presentCustomerCenter: () => Promise<void>;
}

const RevenueCatContext = createContext<RevenueCatContextState>({
  isPro: false,
  isFetching: true,
  customerInfo: null,
  presentPaywall: async () => {},
  presentCustomerCenter: async () => {},
});

export const useRevenueCat = () => useContext(RevenueCatContext);

export const RevenueCatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPro, setIsPro] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);

  useEffect(() => {
    const setup = async () => {
      try {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);

        if (Platform.OS === 'android') {
          Purchases.configure({ apiKey: API_KEY_GOOGLE });
        } else if (Platform.OS === 'ios') {
          Purchases.configure({ apiKey: API_KEY_APPLE });
        }

        const initialCustomerInfo = await Purchases.getCustomerInfo();
        updateCustomerState(initialCustomerInfo);

        Purchases.addCustomerInfoUpdateListener(updateCustomerState);
      } catch (e) {
        console.error('Error setting up RevenueCat:', e);
      } finally {
        setIsFetching(false);
      }
    };

    setup();

    return () => {
      Purchases.removeCustomerInfoUpdateListener(updateCustomerState);
    };
  }, []);

  const updateCustomerState = (info: CustomerInfo) => {
    setCustomerInfo(info);
    if (info.entitlements.active[ENTITLEMENT_ID] !== undefined) {
      setIsPro(true);
    } else {
      setIsPro(false);
    }
  };

  const presentPaywall = async () => {
    try {
      // Modern method to present paywall with RevenueCat UI
      const paywallResult = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: ENTITLEMENT_ID,
      });
      // The result might indicate if it was purchased or restored, but the customer listener handles the actual state update.
      console.log('Paywall result:', paywallResult);
    } catch (e) {
      console.error('Error presenting paywall:', e);
    }
  };

  const presentCustomerCenter = async () => {
    try {
      await RevenueCatUI.presentCustomerCenter();
    } catch (e) {
      console.error('Error presenting Customer Center:', e);
    }
  };

  return (
    <RevenueCatContext.Provider value={{ isPro, isFetching, customerInfo, presentPaywall, presentCustomerCenter }}>
      {children}
    </RevenueCatContext.Provider>
  );
};
