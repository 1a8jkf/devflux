import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { useRouter } from 'expo-router';
import { useLanguage } from '../contexts/LanguageContext';

export default function SuporteScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const { t } = useLanguage();

  const router = useRouter();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    if (message.trim().length > 0) {
      setSent(true);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Icon name="MessageSquare" size={32} color={theme.colors.accentBlue} />
          </View>
          <Text style={styles.title}>{t('Falar com Suporte')}</Text>
          <Text style={styles.subtitle}>{t('Nossa equipe de especialistas responderá ao seu email cadastrado em até 2 horas.')}</Text>
        </View>

        {!sent ? (
          <View style={styles.form}>
            <Text style={styles.label}>{t('Sua mensagem')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('Descreva o problema ou dúvida...')}
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              textAlignVertical="top"
              value={message}
              onChangeText={setMessage}
            />
            
            <TouchableOpacity 
              style={[styles.btn, message.trim().length === 0 && styles.btnDisabled]} 
              onPress={handleSend}
              disabled={message.trim().length === 0}
            >
              <Text style={styles.btnText}>{t('Enviar Mensagem')}</Text>
              <Icon name="Send" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.successState}>
            <View style={styles.successIcon}>
              <Icon name="Check" size={32} color={theme.colors.accentTeal} />
            </View>
            <Text style={styles.successTitle}>{t('Mensagem Enviada!')}</Text>
            <Text style={styles.successDesc}>{t('Obrigado por entrar em contato. Um ticket foi criado e você receberá atualizações no seu email.')}</Text>
            
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>{t('Voltar para Ajuda')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  scrollContent: {
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 16,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    textAlign: 'center',
    lineHeight: 20,
  },
  form: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    fontSize: 14,
    padding: 16,
    height: 160,
    marginBottom: 24,
  },
  btn: {
    flexDirection: 'row',
    backgroundColor: theme.colors.accentBlue,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: theme.typography.ui,
  },
  successState: {
    alignItems: 'center',
    marginTop: 32,
    padding: 24,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    marginBottom: 8,
  },
  successDesc: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  backBtnText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontFamily: theme.typography.ui,
    fontWeight: '500',
  },
});
