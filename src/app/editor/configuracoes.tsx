import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { Icon } from '../../components/Icon';
import { useSettings } from '../../contexts/SettingsContext';

export default function SettingsScreen() {
  const { theme, variant, setThemeVariant } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();

  const handleFontSizeChange = (change: number) => {
    const newSize = Math.max(10, Math.min(30, settings.fontSize + change));
    updateSettings({ fontSize: newSize });
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.navigate('/')}>
          <Icon name="ArrowLeft" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Configurações Gerais</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>APARÊNCIA</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Tema Escuro</Text>
              <Text style={styles.settingDesc}>Usa cores otimizadas para fadiga visual</Text>
            </View>
            <Switch 
              value={variant === 'dark'}
              onValueChange={(val) => setThemeVariant(val ? 'dark' : 'light')}
              trackColor={{ false: theme.colors.border, true: theme.colors.accentBlue }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>EDITOR DE CÓDIGO (MONACO)</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Tamanho da Fonte</Text>
              <Text style={styles.settingDesc}>{settings.fontSize}px</Text>
            </View>
            <View style={styles.controlsRow}>
              <TouchableOpacity style={styles.controlBtn} onPress={() => handleFontSizeChange(-1)}>
                <Icon name="Minus" size={20} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.controlBtn} onPress={() => handleFontSizeChange(1)}>
                <Icon name="Plus" size={20} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Quebra de Linha (Word Wrap)</Text>
              <Text style={styles.settingDesc}>Evita rolagem horizontal</Text>
            </View>
            <Switch 
              value={settings.wordWrap === 'on'}
              onValueChange={(val) => updateSettings({ wordWrap: val ? 'on' : 'off' })}
              trackColor={{ false: theme.colors.border, true: theme.colors.accentBlue }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Minimap</Text>
              <Text style={styles.settingDesc}>Mostrar o mapa lateral do código</Text>
            </View>
            <Switch 
              value={settings.minimap}
              onValueChange={(val) => updateSettings({ minimap: val })}
              trackColor={{ false: theme.colors.border, true: theme.colors.accentBlue }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Números de Linha</Text>
              <Text style={styles.settingDesc}>Mostrar numeração à esquerda</Text>
            </View>
            <Switch 
              value={settings.lineNumbers === 'on'}
              onValueChange={(val) => updateSettings({ lineNumbers: val ? 'on' : 'off' })}
              trackColor={{ false: theme.colors.border, true: theme.colors.accentBlue }}
            />
          </View>
          
          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>ARQUIVOS</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Salvar Automaticamente</Text>
              <Text style={styles.settingDesc}>Salva o arquivo após parar de digitar</Text>
            </View>
            <Switch 
              value={settings.autoSave}
              onValueChange={(val) => updateSettings({ autoSave: val })}
              trackColor={{ false: theme.colors.border, true: theme.colors.accentBlue }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Formatar ao Salvar</Text>
              <Text style={styles.settingDesc}>Aplica regras de formatação (Prettier) ao salvar</Text>
            </View>
            <Switch 
              value={settings.formatOnSave}
              onValueChange={(val) => updateSettings({ formatOnSave: val })}
              trackColor={{ false: theme.colors.border, true: theme.colors.accentBlue }}
            />
          </View>

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
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: theme.typography.uiBold,
    color: theme.colors.textSecondary,
    marginBottom: 16,
    letterSpacing: 1,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.bgElevated,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  settingInfo: {
    flex: 1,
    paddingRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    marginBottom: 4,
  },
  settingDesc: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  }
});
