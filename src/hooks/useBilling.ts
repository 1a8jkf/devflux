import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, PurchasesPackage, CustomerInfo } from 'react-native-purchases';

// As chaves públicas do RevenueCat devem ficar idealmente no .env
const APIKeys = {
  apple: "appl_sua_chave_aqui",
  google: "goog_sua_chave_aqui"
};

export const useBilling = () => {
  const [isPro, setIsPro] = useState<boolean>(false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [isFetching, setIsFetching] = useState<boolean>(true);

  useEffect(() => {
    setup();
  }, []);

  const setup = async () => {
    try {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);

      if (Platform.OS === 'android') {
        Purchases.configure({ apiKey: APIKeys.google });
      } else if (Platform.OS === 'ios') {
        Purchases.configure({ apiKey: APIKeys.apple });
      }

      // Verifica status atual do usuário
      const customerInfo = await Purchases.getCustomerInfo();
      updateCustomerState(customerInfo);

      // Busca os pacotes disponíveis (ex: Lifetime Pro)
      const offerings = await Purchases.getOfferings();
      if (offerings.current !== null && offerings.current.availablePackages.length !== 0) {
        setPackages(offerings.current.availablePackages);
      }
    } catch (e) {
      console.error("Error setting up RevenueCat", e);
    } finally {
      setIsFetching(false);
    }
  };

  const updateCustomerState = (customerInfo: CustomerInfo) => {
    // 'pro_access' é o Entitlement ID que você cadastra no painel do RevenueCat
    if (typeof customerInfo.entitlements.active['pro_access'] !== "undefined") {
      setIsPro(true);
    } else {
      setIsPro(false);
    }
  };

  const purchasePro = async (pack: PurchasesPackage) => {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pack);
      updateCustomerState(customerInfo);
      return true;
    } catch (e: any) {
      if (!e.userCancelled) {
        console.error("Error purchasing package", e);
      }
      return false;
    }
  };

  const restorePurchases = async () => {
    try {
      const customerInfo = await Purchases.restorePurchases();
      updateCustomerState(customerInfo);
      return true;
    } catch (e) {
      console.error("Error restoring purchases", e);
      return false;
    }
  };

  return {
    isPro,
    packages,
    isFetching,
    purchasePro,
    restorePurchases
  };
};
