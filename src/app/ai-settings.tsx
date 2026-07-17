import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { useAISettings } from '../contexts/AISettingsContext';

export default function AISettingsScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, isConfigured } = useAISettings();
  const [isTesting, setIsTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{success: boolean, message: string} | null>(null);

  const handleTestConnection = async () => {
    if (!settings.apiKey.trim()) {
      setTestResult({ success: false, message: 'Insira uma chave de API primeiro.' });
      return;
    }
    
    setIsTesting(true);
    setTestResult(null);

    try {
      let res;
      if (settings.provider === 'google') {
        const modelName = settings.model || 'gemini-1.5-pro';
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${settings.apiKey.trim()}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Teste de conexão. Responda apenas "OK" se estiver tudo certo.' }] }]
          })
        });
      } else {
        const url = settings.provider === 'openrouter' 
          ? 'https://openrouter.ai/api/v1/chat/completions'
          : 'https://api.openai.com/v1/chat/completions';

        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey.trim()}`,
            'HTTP-Referer': 'https://codeflex.app',
            'X-Title': 'CodeFlex Mobile IDE',
          },
          body: JSON.stringify({
            model: settings.model || (settings.provider === 'openrouter' ? 'anthropic/claude-3.5-sonnet' : 'gpt-4o'),
            messages: [{ role: 'user', content: 'Teste de conexão. Responda apenas "OK" se estiver tudo certo.' }],
            max_tokens: 5,
          })
        });
      }

      if (!res.ok) {
        const errorText = await res.text();
        let errorMsg = errorText;
        try {
            const json = JSON.parse(errorText);
            errorMsg = json.error?.message || errorText;
        } catch(e) {}
        throw new Error(errorMsg);
      }

      setTestResult({ success: true, message: 'Conexão estabelecida com sucesso!' });
    } catch (e: any) {
      setTestResult({ success: false, message: `Falha na conexão: ${e.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoBox}>
          <Icon name="Info" size={20} color={theme.colors.accentBlue} style={{ marginRight: 12 }} />
          <Text style={styles.infoText}>
            O CodeFlex usa a abordagem BYOK (Bring Your Own Key). Suas chaves são salvas apenas no seu dispositivo e as requisições vão direto do seu celular para a provedora.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PROVEDOR</Text>
          <View style={styles.providerRow}>
            <TouchableOpacity 
              style={[styles.providerBtn, settings.provider === 'google' && styles.providerBtnActive]}
              onPress={() => updateSettings({ provider: 'google' })}
            >
              <Icon name="Globe" size={16} color={settings.provider === 'google' ? theme.colors.bgPrimary : theme.colors.textPrimary} />
              <Text style={[styles.providerText, settings.provider === 'google' && styles.providerTextActive]}>Google</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.providerBtn, settings.provider === 'openrouter' && styles.providerBtnActive]}
              onPress={() => updateSettings({ provider: 'openrouter' })}
            >
              <Icon name="Box" size={16} color={settings.provider === 'openrouter' ? theme.colors.bgPrimary : theme.colors.textPrimary} />
              <Text style={[styles.providerText, settings.provider === 'openrouter' && styles.providerTextActive]}>OpenRouter</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.providerBtn, settings.provider === 'openai' && styles.providerBtnActive]}
              onPress={() => updateSettings({ provider: 'openai' })}
            >
              <Icon name="Cpu" size={16} color={settings.provider === 'openai' ? theme.colors.bgPrimary : theme.colors.textPrimary} />
              <Text style={[styles.providerText, settings.provider === 'openai' && styles.providerTextActive]}>OpenAI</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CHAVE DE API</Text>
          <Text style={styles.helperText}>Insira sua chave {settings.provider === 'openrouter' ? 'do OpenRouter (sk-or...)' : settings.provider === 'google' ? 'do Google AI Studio (AIza... ou AQ...)' : 'da OpenAI (sk-...)'}</Text>
          <TextInput
            style={styles.input}
            placeholder="sk-..."
            placeholderTextColor={theme.colors.border}
            value={settings.apiKey}
            onChangeText={(text) => {
              updateSettings({ apiKey: text });
              setTestResult(null);
            }}
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MODELO</Text>
          <Text style={styles.helperText}>
            {settings.provider === 'openrouter' 
              ? 'Exemplos: anthropic/claude-3.5-sonnet, openai/gpt-4o' 
              : settings.provider === 'google'
              ? 'Exemplos: gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash-exp'
              : 'Exemplos: gpt-4o, gpt-4o-mini'}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={settings.provider === 'openrouter' ? 'anthropic/claude-3.5-sonnet' : settings.provider === 'google' ? 'gemini-1.5-pro' : 'gpt-4o'}
            placeholderTextColor={theme.colors.border}
            value={settings.model}
            onChangeText={(text) => {
              updateSettings({ model: text });
              setTestResult(null);
            }}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.testConnectionContainer}>
          <TouchableOpacity 
            style={[styles.testBtn, { backgroundColor: isTesting || !settings.apiKey.trim() ? theme.colors.bgSurface : theme.colors.accentBlue }]} 
            onPress={handleTestConnection}
            disabled={isTesting || !settings.apiKey.trim()}
          >
            {isTesting ? (
              <Text style={[styles.testBtnText, { color: theme.colors.textSecondary }]}>Testando...</Text>
            ) : (
              <>
                <Icon name="Activity" size={20} color={!settings.apiKey.trim() ? theme.colors.textSecondary : "#FFF"} style={{ marginRight: 8 }} />
                <Text style={[styles.testBtnText, { color: !settings.apiKey.trim() ? theme.colors.textSecondary : "#FFF" }]}>Testar Conexão</Text>
              </>
            )}
          </TouchableOpacity>
          
          {testResult ? (
            <View style={[styles.statusBox, { backgroundColor: testResult.success ? theme.colors.success + '20' : theme.colors.error + '20' }]}>
              <Icon 
                name={testResult.success ? 'CheckCircle' : 'XCircle'} 
                size={20} 
                color={testResult.success ? theme.colors.success : theme.colors.error} 
              />
              <Text style={[styles.statusText, { color: testResult.success ? theme.colors.success : theme.colors.error }]}>
                {testResult.message}
              </Text>
            </View>
          ) : (
            <View style={styles.statusBox}>
              <Icon 
                name={isConfigured ? 'CheckCircle' : 'Info'} 
                size={20} 
                color={isConfigured ? theme.colors.success : theme.colors.textSecondary} 
              />
              <Text style={[styles.statusText, { color: isConfigured ? theme.colors.success : theme.colors.textSecondary }]}>
                {isConfigured ? 'Configuração salva localmente' : 'Chave não configurada'}
              </Text>
            </View>
          )}
        </View>
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
    padding: 16,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: theme.colors.accentBlue + '20',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.accentBlue + '40',
  },
  infoText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    fontSize: 13,
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: theme.typography.uiBold,
    color: theme.colors.textSecondary,
    marginBottom: 8,
    letterSpacing: 1,
  },
  helperText: {
    fontSize: 12,
    fontFamily: theme.typography.ui,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  providerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  providerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  providerBtnActive: {
    backgroundColor: theme.colors.textPrimary,
    borderColor: theme.colors.textPrimary,
  },
  providerText: {
    marginLeft: 8,
    fontSize: 14,
    fontFamily: theme.typography.uiBold,
    color: theme.colors.textPrimary,
  },
  providerTextActive: {
    color: theme.colors.bgPrimary,
  },
  input: {
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.mono,
    fontSize: 14,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 12,
    marginTop: 16,
    marginBottom: 24,
  },
  statusText: {
    marginLeft: 8,
    fontSize: 14,
    fontFamily: theme.typography.uiBold,
  },
  testConnectionContainer: {
    marginTop: 8,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  testBtnText: {
    fontSize: 14,
    fontFamily: theme.typography.uiBold,
  }
});
