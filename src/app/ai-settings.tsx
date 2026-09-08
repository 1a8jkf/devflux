import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { useAISettings } from '../contexts/AISettingsContext';
import { useLanguage } from '../contexts/LanguageContext';

const providerDefaultModel = (provider: string) => {
  if (provider === 'google') return 'gemini-1.5-pro';
  if (provider === 'openai') return 'gpt-4o';
  return 'anthropic/claude-3.5-sonnet';
};

export default function AISettingsScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();
  const {
    settings,
    configs,
    activeConfigId,
    updateSettings,
    createConfig,
    selectConfig,
    deleteConfig,
    isConfigured,
    isLoading
  } = useAISettings();
  const { t } = useLanguage();
  const [isTesting, setIsTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{success: boolean, message: string} | null>(null);
  const scrollRef = React.useRef<ScrollView>(null);

  const handleTestConnection = async () => {
    if (!settings.apiKey.trim()) {
      setTestResult({ success: false, message: t('aiSettings.insertKeyFirst', 'Insira uma chave de API primeiro.') });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      let res;
      if (settings.provider === 'google') {
        const modelName = (settings.model || providerDefaultModel(settings.provider)).replace(/^models\//, '');
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

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey.trim()}`,
        };

        if (settings.provider === 'openrouter') {
          headers['HTTP-Referer'] = 'https://devflux.app';
          headers['X-Title'] = 'DevFlux Mobile IDE';
        }

        res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: settings.model || providerDefaultModel(settings.provider),
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

      setTestResult({ success: true, message: t('aiSettings.connectionSuccess', 'Conexão estabelecida com sucesso!') });
    } catch (e: any) {
      setTestResult({ success: false, message: `${t('aiSettings.connectionFailed', 'Falha na conexão:')} ${e.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
      >
        <View style={styles.infoBox}>
          <Icon name="Info" size={20} color={theme.colors.accentBlue} style={{ marginRight: 12 }} />
          <Text style={styles.infoText}>
            {t('aiSettings.infoText', 'O DevFlux usa a abordagem BYOK (Bring Your Own Key). Suas chaves são salvas apenas no seu dispositivo e as requisições vão direto do seu celular para a provedora.')}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('CONFIGURAÇÕES SALVAS')}</Text>
            <TouchableOpacity
              style={styles.smallActionBtn}
              disabled={isLoading}
              onPress={async () => {
                await createConfig();
                setTestResult(null);
                setTimeout(() => scrollRef.current?.scrollTo({ y: 110, animated: true }), 120);
              }}
            >
              <Icon name="Plus" size={14} color={theme.colors.textPrimary} style={{ marginRight: 6 }} />
              <Text style={styles.smallActionText}>{t('Nova')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {configs.map(config => (
              <TouchableOpacity
                key={config.id}
                style={[styles.configChip, activeConfigId === config.id && styles.configChipActive]}
                onPress={async () => {
                  await selectConfig(config.id);
                  setTestResult(null);
                }}
              >
                <Text style={[styles.configChipName, activeConfigId === config.id && styles.configChipTextActive]} numberOfLines={1}>
                  {config.name}
                </Text>
                <Text style={[styles.configChipModel, activeConfigId === config.id && styles.configChipTextActive]} numberOfLines={1}>
                  {config.provider} · {config.model || providerDefaultModel(config.provider)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('NOME DA CONFIGURAÇÃO')}</Text>
          <TextInput
            style={styles.input}
            placeholder="OpenRouter principal"
            placeholderTextColor={theme.colors.border}
            value={settings.name}
            onChangeText={(text) => {
              updateSettings({ name: text });
              setTestResult(null);
            }}
            autoCorrect={false}
            spellCheck={false}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('PROVEDOR')}</Text>
          <View style={styles.providerRow}>
            <TouchableOpacity
              style={[styles.providerBtn, settings.provider === 'google' && styles.providerBtnActive]}
              onPress={() => {
                updateSettings({ provider: 'google' });
                setTestResult(null);
              }}
            >
              <Icon name="Globe" size={16} color={settings.provider === 'google' ? theme.colors.bgPrimary : theme.colors.textPrimary} />
              <Text style={[styles.providerText, settings.provider === 'google' && styles.providerTextActive]}>Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.providerBtn, settings.provider === 'openrouter' && styles.providerBtnActive]}
              onPress={() => {
                updateSettings({ provider: 'openrouter' });
                setTestResult(null);
              }}
            >
              <Icon name="Box" size={16} color={settings.provider === 'openrouter' ? theme.colors.bgPrimary : theme.colors.textPrimary} />
              <Text style={[styles.providerText, settings.provider === 'openrouter' && styles.providerTextActive]}>OpenRouter</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.providerBtn, settings.provider === 'openai' && styles.providerBtnActive]}
              onPress={() => {
                updateSettings({ provider: 'openai' });
                setTestResult(null);
              }}
            >
              <Icon name="Cpu" size={16} color={settings.provider === 'openai' ? theme.colors.bgPrimary : theme.colors.textPrimary} />
              <Text style={[styles.providerText, settings.provider === 'openai' && styles.providerTextActive]}>OpenAI</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('CHAVE DE API')}</Text>
          <Text style={styles.helperText}>{t('Insira sua chave')} {settings.provider === 'openrouter' ? 'do OpenRouter (sk-or...)' : settings.provider === 'google' ? 'do Google AI Studio (AIza... ou AQ...)' : 'da OpenAI (sk-...)'}</Text>
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
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            importantForAutofill="no"
            disableFullscreenUI
            onFocus={() => setTimeout(() => scrollRef.current?.scrollTo({ y: 280, animated: true }), 120)}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('MODELO')}</Text>
          <Text style={styles.helperText}>
            {t('Exemplos:')} {settings.provider === 'openrouter'
              ? 'anthropic/claude-3.5-sonnet, openai/gpt-4o'
              : settings.provider === 'google'
              ? 'gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash-exp'
              : 'gpt-4o, gpt-4o-mini'}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={providerDefaultModel(settings.provider)}
            placeholderTextColor={theme.colors.border}
            value={settings.model}
            onChangeText={(text) => {
              updateSettings({ model: text });
              setTestResult(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            importantForAutofill="no"
            keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
            disableFullscreenUI
            onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120)}
          />
        </View>

        <View style={styles.testConnectionContainer}>
          <TouchableOpacity
            style={[styles.testBtn, { backgroundColor: isTesting || !settings.apiKey.trim() ? theme.colors.bgSurface : theme.colors.accentBlue }]}
            onPress={handleTestConnection}
            disabled={isTesting || !settings.apiKey.trim()}
          >
            {isTesting ? (
              <Text style={[styles.testBtnText, { color: theme.colors.textSecondary }]}>{t('Testando...')}</Text>
            ) : (
              <>
                <Icon name="Activity" size={20} color={!settings.apiKey.trim() ? theme.colors.textSecondary : "#FFF"} style={{ marginRight: 8 }} />
                <Text style={[styles.testBtnText, { color: !settings.apiKey.trim() ? theme.colors.textSecondary : "#FFF" }]}>{t('Testar Conexão')}</Text>
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
                {isConfigured ? t('aiSettings.saved', 'Configuração salva localmente') : t('aiSettings.notConfigured', 'Chave não configurada')}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.deleteBtn, configs.length <= 1 && { opacity: 0.45 }]}
            disabled={configs.length <= 1}
            onPress={async () => {
              await deleteConfig(activeConfigId);
              setTestResult(null);
            }}
          >
            <Icon name="Trash2" size={16} color={theme.colors.error} style={{ marginRight: 8 }} />
            <Text style={styles.deleteBtnText}>{t('Excluir configuração atual')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingTop: 16,
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: theme.typography.uiBold,
    color: theme.colors.textSecondary,
    marginBottom: 8,
    letterSpacing: 1,
  },
  smallActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallActionText: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
    fontSize: 12,
  },
  configChip: {
    width: 190,
    padding: 12,
    marginRight: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
  },
  configChipActive: {
    backgroundColor: theme.colors.textPrimary,
    borderColor: theme.colors.textPrimary,
  },
  configChipName: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.uiBold,
    fontSize: 13,
    marginBottom: 4,
  },
  configChipModel: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.mono,
    fontSize: 10,
  },
  configChipTextActive: {
    color: theme.colors.bgPrimary,
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
    paddingVertical: 18,
    paddingHorizontal: 10,
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
    fontSize: 13,
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 54,
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
    marginBottom: 16,
  },
  statusText: {
    marginLeft: 8,
    fontSize: 14,
    fontFamily: theme.typography.uiBold,
    flex: 1,
  },
  testConnectionContainer: {
    marginTop: 8,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
  },
  testBtnText: {
    fontSize: 16,
    fontFamily: theme.typography.uiBold,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.error + '12',
    borderWidth: 1,
    borderColor: theme.colors.error + '30',
  },
  deleteBtnText: {
    color: theme.colors.error,
    fontFamily: theme.typography.uiBold,
    fontSize: 13,
  },
});
