import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Modal, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { AIProvider, AISettings, useAISettings } from '../contexts/AISettingsContext';
import { AIService } from '../services/AIService';
import { useLanguage } from '../contexts/LanguageContext';

const providers: { id: AIProvider; name: string }[] = [
  { id: 'google', name: 'Google' }, { id: 'openrouter', name: 'OpenRouter' }, { id: 'openai', name: 'OpenAI' },
];

export default function AISettingsScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { settings, configs, activeConfigId, updateSettings, createConfig, selectConfig, deleteConfig, isLoading } = useAISettings();
  const [draft, setDraft] = useState<AISettings>(settings);
  const [savedVersion, setSavedVersion] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message?: string; error?: unknown } | null>(null);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [showModels, setShowModels] = useState(false);
  const [query, setQuery] = useState('');
  const [showKey, setShowKey] = useState(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const working = useRef(false);

  if (settings.id !== savedVersion.id || settings.name !== savedVersion.name || settings.provider !== savedVersion.provider || settings.apiKey !== savedVersion.apiKey || settings.model !== savedVersion.model) {
    setSavedVersion(settings);
    setDraft(settings);
    setResult(null);
    setModels([]);
    setShowKey(false);
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);

  const dirty = draft.name !== settings.name || draft.provider !== settings.provider || draft.apiKey !== settings.apiKey || draft.model !== settings.model;
  const change = (values: Partial<AISettings>) => {
    setDraft(previous => ({ ...previous, ...values }));
    setResult(null);
    if (values.apiKey !== undefined || values.provider !== undefined) setModels([]);
  };
  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setResult(null);
    const controller = new AbortController();
    request.current = controller;
    try { await action(controller.signal); }
    catch (error: any) {
      if (mounted.current && !controller.signal.aborted) setResult({ success: false, error });
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const switchConfig = (action: () => Promise<unknown>) => {
    const execute = () => { void run(async () => { await action(); }); };
    if (dirty) Alert.alert(t('Alterações não salvas'), t('Descartar as alterações desta configuração?'), [
      { text: t('Cancelar'), style: 'cancel' }, { text: t('Descartar'), style: 'destructive', onPress: execute },
    ]);
    else execute();
  };
  const loadModels = () => run(async signal => {
    const available = await AIService.listModels(draft, signal);
    if (!mounted.current || signal.aborted) return;
    setModels(available);
    setQuery('');
    setShowModels(true);
  });
  const disabled = isLoading || busy;
  const hasKey = !!draft.apiKey.trim();
  const hasModel = !!draft.model.trim();

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={headerHeight}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.sectionHeader}>
          <Text style={styles.heading}>{t('Configurações salvas')}</Text>
          <TouchableOpacity accessibilityLabel={t('Nova configuração')} style={styles.iconButton} disabled={disabled} onPress={() => switchConfig(() => createConfig())}><Icon name="Plus" size={20} color={theme.colors.textPrimary} /></TouchableOpacity>
        </View>
        {configs.map(config => (
          <TouchableOpacity key={config.id} accessibilityRole="radio" accessibilityState={{ checked: activeConfigId === config.id }} disabled={disabled} onPress={() => switchConfig(() => selectConfig(config.id))} style={[styles.configRow, activeConfigId === config.id && styles.selected]}>
            <Icon name={activeConfigId === config.id ? 'CircleDot' : 'Circle'} size={18} color={theme.colors.accentBlue} />
            <View style={styles.flex}><Text style={styles.text}>{config.name}</Text><Text style={styles.secondary}>{providers.find(p => p.id === config.provider)?.name} · {config.model || t('Sem modelo')}</Text></View>
          </TouchableOpacity>
        ))}
        <Text style={styles.label}>{t('Nome da configuração')}</Text>
        <TextInput accessibilityLabel={t('Nome da configuração')} style={styles.input} value={draft.name} editable={!disabled} onChangeText={name => change({ name })} autoCorrect={false} />
        <Text style={styles.label}>{t('Provedor')}</Text>
        <View style={styles.providerRow}>
          {providers.map(provider => (
            <TouchableOpacity key={provider.id} accessibilityRole="radio" accessibilityState={{ checked: draft.provider === provider.id }} style={[styles.provider, draft.provider === provider.id && styles.selected]} disabled={disabled} onPress={() => {
              if (draft.provider !== provider.id) change({ provider: provider.id, apiKey: '', model: '' });
            }}><Text style={styles.text}>{provider.name}</Text></TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>{t('Chave de API')}</Text>
        <View style={styles.fieldRow}>
          <TextInput accessibilityLabel={t('Chave de API')} style={[styles.input, styles.flex]} value={draft.apiKey} editable={!disabled} onChangeText={apiKey => change({ apiKey })} secureTextEntry={!showKey} autoCapitalize="none" autoCorrect={false} autoComplete="off" importantForAutofill="no" disableFullscreenUI />
          <TouchableOpacity style={styles.iconButton} accessibilityLabel={t(showKey ? 'Ocultar chave' : 'Mostrar chave')} onPress={() => setShowKey(value => !value)}><Icon name={showKey ? 'EyeOff' : 'Eye'} size={20} color={theme.colors.textSecondary} /></TouchableOpacity>
        </View>
        <Text style={styles.label}>{t('Modelo')}</Text>
        <View style={styles.fieldRow}>
          <TextInput accessibilityLabel={t('Modelo')} style={[styles.input, styles.flex]} value={draft.model} editable={!disabled} onChangeText={model => change({ model })} autoCapitalize="none" autoCorrect={false} autoComplete="off" importantForAutofill="no" disableFullscreenUI />
          <TouchableOpacity style={styles.iconButton} accessibilityLabel={t('Selecionar modelo do provedor')} disabled={disabled || !hasKey} onPress={() => void loadModels()}><Icon name="ListFilter" size={20} color={theme.colors.accentBlue} /></TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.listButton} disabled={disabled || !hasKey} onPress={() => void loadModels()}>
          <Icon name="RefreshCw" size={16} color={theme.colors.accentBlue} /><Text style={[styles.text, { color: theme.colors.accentBlue }]}>{t('Modelos do provedor')}</Text>
        </TouchableOpacity>
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.button, styles.primary, (disabled || !dirty || !hasKey || !hasModel) && styles.disabled]} disabled={disabled || !dirty || !hasKey || !hasModel} onPress={() => void run(async () => { await updateSettings({ ...draft, id: activeConfigId, model: AIService.normalizeModel(draft) }); })}>
            <Icon name="Save" size={18} color="#FFFFFF" /><Text style={styles.buttonText}>{t('Salvar')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, (disabled || !hasKey || !hasModel) && styles.disabled]} disabled={disabled || !hasKey || !hasModel} onPress={() => void run(async signal => {
            await AIService.testConnection(draft, signal);
            if (mounted.current && !signal.aborted) setResult({ success: true, message: 'Modelo respondeu com sucesso.' });
          })}><Icon name="Activity" size={18} color={theme.colors.textPrimary} /><Text style={styles.text}>{t('Testar modelo')}</Text></TouchableOpacity>
        </View>
        {busy && <ActivityIndicator style={{ marginVertical: 12 }} />}
        {result ? <Text accessibilityRole="alert" style={[styles.status, { color: result.success ? theme.colors.success : theme.colors.error }]}>{result.error ? AIService.describeError(result.error, t) : t(result.message || '')}</Text> : <Text style={styles.secondary}>{t(dirty ? 'Alterações não salvas' : 'Configuração salva no dispositivo')}</Text>}
        <TouchableOpacity style={styles.deleteButton} disabled={disabled} onPress={() => Alert.alert(t('Excluir configuração'), draft.name, [
          { text: t('Cancelar'), style: 'cancel' },
          { text: t('Excluir'), style: 'destructive', onPress: () => void run(async () => { await deleteConfig(activeConfigId); }) },
        ])}><Icon name="Trash2" size={18} color={theme.colors.error} /><Text style={[styles.text, { color: theme.colors.error }]}>{t('Excluir configuração')}</Text></TouchableOpacity>
      </ScrollView>
      <Modal visible={showModels} animationType="slide" onRequestClose={() => setShowModels(false)}>
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.modalHeader}><Text style={[styles.heading, styles.flex]}>{t('Modelos do provedor')}</Text><TouchableOpacity accessibilityLabel={t('Fechar')} style={styles.iconButton} onPress={() => setShowModels(false)}><Icon name="X" size={24} color={theme.colors.textPrimary} /></TouchableOpacity></View>
          <TextInput accessibilityLabel={t('Buscar modelo')} style={[styles.input, { marginHorizontal: 16 }]} placeholder={t('Buscar modelo')} placeholderTextColor={theme.colors.textSecondary} value={query} onChangeText={setQuery} autoCapitalize="none" />
          <FlatList keyboardShouldPersistTaps="handled" data={models.filter(model => (model.id + ' ' + model.name).toLowerCase().includes(query.toLowerCase()))} keyExtractor={model => model.id}
            ListEmptyComponent={<Text style={styles.status}>{t('Nenhum modelo disponível.')}</Text>}
            renderItem={({ item }) => <TouchableOpacity style={styles.configRow} onPress={() => { change({ model: item.id }); setShowModels(false); }}>
              <View style={styles.flex}><Text style={styles.text}>{item.name}</Text><Text style={styles.secondary}>{item.id}</Text></View>
              {AIService.normalizeModel(draft) === item.id && <Icon name="Check" size={20} color={theme.colors.accentBlue} />}
            </TouchableOpacity>} />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  content: { padding: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  flex: { flex: 1, minWidth: 0 },
  heading: { color: theme.colors.textPrimary, fontSize: 16, fontFamily: theme.typography.uiBold },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  configRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderColor: theme.colors.border, minHeight: 60 },
  selected: { backgroundColor: theme.colors.accentBlue + '18', borderColor: theme.colors.accentBlue },
  text: { color: theme.colors.textPrimary, fontSize: 14, fontFamily: theme.typography.ui, flexShrink: 1 },
  secondary: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  label: { color: theme.colors.textSecondary, fontSize: 13, marginTop: 22, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, color: theme.colors.textPrimary, backgroundColor: theme.colors.bgElevated, fontSize: 14 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  providerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  provider: { minHeight: 44, flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  listButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 20, marginBottom: 12 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexGrow: 1, minHeight: 48, paddingHorizontal: 16, borderRadius: 6, backgroundColor: theme.colors.bgElevated },
  primary: { backgroundColor: theme.colors.accentBlue },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontFamily: theme.typography.uiBold },
  disabled: { opacity: 0.45 },
  status: { padding: 16, fontSize: 14, lineHeight: 21, color: theme.colors.textSecondary },
  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, minHeight: 48 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 56 },
});
