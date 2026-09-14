import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { useLanguage } from '../contexts/LanguageContext';

export default function UpgradeScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const { t } = useLanguage();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Icon name="Crown" size={64} color={theme.colors.accentAmber} />
        <Text style={styles.title}>{t('DevFlux Pro Ativo')}</Text>
        <Text style={styles.desc}>
          {t('Você já possui acesso a todos os recursos premium, incluindo sincronização de repositórios GitHub, Live Sync com PC e acesso SSH aos seus servidores.')}
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>{t('Voltar')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 32,
    alignItems: 'center',
    maxWidth: 400,
  },
  title: {
    fontFamily: theme.typography.uiBold,
    fontSize: 24,
    color: theme.colors.textPrimary,
    marginTop: 24,
    marginBottom: 12,
  },
  desc: {
    fontFamily: theme.typography.ui,
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  button: {
    backgroundColor: theme.colors.accentBlue,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  buttonText: {
    fontFamily: theme.typography.uiBold,
    color: '#FFF',
    fontSize: 16,
  }
});
