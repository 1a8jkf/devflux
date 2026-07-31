import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { useSubscription } from '../contexts/SubscriptionContext';

export default function UpgradeScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPro, unlockPro } = useSubscription();

  const handlePurchase = async () => {
    if (isPro) return;
    await unlockPro();
    alert('Mock: Conta Pro Desbloqueada!');
  };

  const handleManage = async () => {
    alert('Mock: Gerenciar Assinatura (Módulo de Pagamento Desativado)');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Icon name="Crown" size={64} color={theme.colors.accentAmber} outline={false} />
          <Text style={styles.heroTitle}>Desbloqueie o poder máximo</Text>
          <Text style={styles.heroDesc}>
            O Cloud IDE completo no seu bolso. Conecte-se ao seu PC e edite arquivos remotos em tempo real.
          </Text>
        </View>

        <View style={styles.features}>
          <View style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Icon name="MonitorUp" size={20} color={theme.colors.success} />
            </View>
            <View style={styles.featureInfo}>
              <Text style={styles.featureTitle}>Live Sync (Bridge)</Text>
              <Text style={styles.featureDesc}>Conecte o app à extensão oficial do VS Code e sincronize projetos inteiros via WebSocket.</Text>
            </View>
          </View>
          
          <View style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Icon name="Terminal" size={20} color={theme.colors.accentBlue} />
            </View>
            <View style={styles.featureInfo}>
              <Text style={styles.featureTitle}>Edição Remota Síncrona</Text>
              <Text style={styles.featureDesc}>Não gaste memória do celular. Edite os arquivos fisicamente no seu computador enquanto digita deitado no sofá.</Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Icon name="Sparkles" size={20} color={theme.colors.accentPurple} />
            </View>
            <View style={styles.featureInfo}>
              <Text style={styles.featureTitle}>Apoie um Dev Independente</Text>
              <Text style={styles.featureDesc}>Você ajuda a manter este projeto incrível vivo e a financiar as próximas ferramentas de IA.</Text>
            </View>
          </View>
        </View>

        <View style={styles.pricing}>
          <Text style={styles.priceLabel}>ASSINATURA</Text>
          <Text style={styles.priceSub}>Planos Mensal, Anual ou Vitalício disponíveis.</Text>
        </View>

        <TouchableOpacity 
          style={[styles.buyBtn, isPro && { backgroundColor: theme.colors.success }]} 
          onPress={isPro ? handleManage : handlePurchase}
        >
          <Text style={styles.buyBtnText}>{isPro ? 'GERENCIAR ASSINATURA' : 'VER PLANOS'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>Talvez mais tarde</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 18,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
  },
  content: {
    padding: 24,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
  },
  heroTitle: {
    fontSize: 24,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
    marginTop: 16,
    textAlign: 'center',
  },
  heroDesc: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  features: {
    marginBottom: 40,
  },
  featureRow: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  featureInfo: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    lineHeight: 18,
  },
  pricing: {
    alignItems: 'center',
    backgroundColor: theme.colors.bgElevated,
    padding: 24,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.accentAmber,
  },
  priceLabel: {
    fontSize: 12,
    color: theme.colors.accentAmber,
    fontFamily: theme.typography.uiBold,
    letterSpacing: 2,
    marginBottom: 8,
  },
  priceValue: {
    fontSize: 36,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
    marginBottom: 4,
  },
  priceSub: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
  },
  buyBtn: {
    backgroundColor: theme.colors.accentBlue,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buyBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: theme.typography.uiBold,
  },
  closeBtn: {
    marginTop: 16,
    alignItems: 'center',
    padding: 8,
  },
  closeBtnText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.uiBold,
  }
});
