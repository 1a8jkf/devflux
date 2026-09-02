import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from './Icon';
import { useBilling } from '../hooks/useBilling';

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  featureName: string;
}

export function PaywallModal({ visible, onClose, featureName }: PaywallModalProps) {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const { packages, purchasePro, isFetching } = useBilling();

  const handlePurchase = async () => {
    // Pegar o pacote mensal. Por padrão o RevenueCat retorna o 'monthly' ou o que você definir no Offerings.
    const monthlyPackage = packages.find(p => p.packageType === 'MONTHLY') || packages[0];
    
    if (monthlyPackage) {
      const success = await purchasePro(monthlyPackage);
      if (success) {
        onClose(); // Comprou com sucesso, fecha o modal
      }
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Icon name="X" size={24} color={theme.colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.iconContainer}>
            <Icon name="Lock" size={48} color={theme.colors.primary} />
          </View>

          <Text style={styles.title}>DevFlux Cloud</Text>
          <Text style={styles.subtitle}>
            Para usar a funcionalidade "{featureName}", é necessário fazer login. Após o login, o usuário deverá pagar os serviços para uso devido a custos de infraestrutura.
          </Text>

          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <Icon name="Check" size={16} color="#4ADE80" />
              <Text style={styles.featureText}>Sincronização em tempo real (Sync Code)</Text>
            </View>
            <View style={styles.featureItem}>
              <Icon name="Check" size={16} color="#4ADE80" />
              <Text style={styles.featureText}>Acesso seguro ao Terminal SQL (Modo DB)</Text>
            </View>
            <View style={styles.featureItem}>
              <Icon name="Check" size={16} color="#4ADE80" />
              <Text style={styles.featureText}>Banda e armazenamento na nuvem inclusos</Text>
            </View>
          </View>

          <TouchableOpacity 
            style={styles.subscribeButton} 
            onPress={handlePurchase}
            disabled={isFetching || packages.length === 0}
          >
            {isFetching ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.subscribeText}>
                Assinar (R$ 19,90/mês)
              </Text>
            )}
          </TouchableOpacity>
          
          <Text style={styles.footerText}>
             Cancele quando quiser através da Play Store.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: theme.colors.bgSurface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 48,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 8,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: theme.typography.uiBold || theme.typography.ui,
    fontSize: 24,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  featuresList: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  subscribeButton: {
    backgroundColor: theme.colors.primary || '#ffffff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  subscribeText: {
    fontFamily: theme.typography.uiBold || theme.typography.ui,
    fontSize: 16,
    color: '#000000',
  },
  footerText: {
    fontFamily: theme.typography.ui,
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  }
});
