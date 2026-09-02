import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { useEnvironment } from '../../hooks/useEnvironment';

interface InitialSetupProps {
  onComplete: () => void;
}

export const InitialSetupScreen: React.FC<InitialSetupProps> = ({ onComplete }) => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const { envVars, updateEnvVar, completeSetup } = useEnvironment();
  const [isSaving, setIsSaving] = useState(false);

  const [localVars, setLocalVars] = useState(envVars);

  // Sincroniza local caso mude no hook
  React.useEffect(() => {
    if (envVars.length > 0 && localVars.length === 0) {
      setLocalVars(envVars);
    }
  }, [envVars]);

  const handleSave = async () => {
    setIsSaving(true);
    for (const v of localVars) {
      await updateEnvVar(v.id, v.value);
    }
    await completeSetup();
    setIsSaving(false);
    onComplete();
  };

  const handleSkip = async () => {
    await completeSetup();
    onComplete();
  };

  const handleChange = (id: string, text: string) => {
    setLocalVars(prev => prev.map(v => v.id === id ? { ...v, value: text } : v));
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>Bem-vindo ao DevFlux!</Text>
          <Text style={styles.subtitle}>
            Para garantir que seus projetos rodem sem problemas, você pode configurar os caminhos das suas ferramentas agora.
            Isso evita erros como "comando não encontrado".
          </Text>
        </View>

        <View style={styles.form}>
          {localVars.map(v => (
            <View key={v.id} style={styles.inputGroup}>
              <Text style={styles.label}>Caminho do {v.key}</Text>
              <TextInput
                style={styles.input}
                value={v.value}
                onChangeText={(text) => handleChange(v.id, text)}
                placeholder={`Ex: /usr/local/bin/${v.key}`}
                placeholderTextColor={theme.colors.textSecondary}
              />
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity 
            style={[styles.button, styles.primaryButton]} 
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Salvar e Continuar</Text>}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton]} 
            onPress={handleSkip}
            disabled={isSaving}
          >
            <Text style={styles.secondaryButtonText}>Pular por enquanto</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  scroll: {
    padding: 24,
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontFamily: theme.typography.uiBold || theme.typography.ui,
    fontSize: 24,
    color: theme.colors.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  form: {
    marginBottom: 32,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontFamily: theme.typography.uiBold || theme.typography.ui,
    fontSize: 14,
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.mono,
  },
  actions: {
    gap: 12,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontFamily: theme.typography.uiBold || theme.typography.ui,
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    fontSize: 14,
  },
});
