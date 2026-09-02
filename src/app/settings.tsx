import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { useEnvironment } from '../hooks/useEnvironment';

export default function SettingsScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const { envVars, addEnvVar, removeEnvVar, updateEnvVar } = useEnvironment();

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const handleAdd = () => {
    if (newKey.trim() && newValue.trim()) {
      addEnvVar({ key: newKey.trim(), value: newValue.trim() });
      setNewKey('');
      setNewValue('');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configurações</Text>
        <View style={{ width: 32 }} /> {/* Placeholder to balance header */}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>Variáveis de Ambiente</Text>
        <Text style={styles.sectionSubtitle}>
          Gerencie os caminhos e variáveis que serão injetados nos seus projetos.
        </Text>

        <View style={styles.list}>
          {envVars.map(v => (
            <View key={v.id} style={styles.varItem}>
              <View style={styles.varInfo}>
                <Text style={styles.varKey}>{v.key}</Text>
                <TextInput
                  style={styles.varInput}
                  value={v.value}
                  onChangeText={(text) => updateEnvVar(v.id, text)}
                  placeholder="Caminho/Valor"
                  placeholderTextColor={theme.colors.textSecondary}
                />
              </View>
              {!v.isSystem && (
                <TouchableOpacity onPress={() => removeEnvVar(v.id)} style={styles.removeBtn}>
                  <Icon name="Trash" size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        <View style={styles.addSection}>
          <Text style={styles.addTitle}>Adicionar nova variável</Text>
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={newKey}
              onChangeText={setNewKey}
              placeholder="Chave (ex: python)"
              placeholderTextColor={theme.colors.textSecondary}
            />
            <TextInput
              style={[styles.input, { flex: 2, marginLeft: 8 }]}
              value={newValue}
              onChangeText={setNewValue}
              placeholder="Valor (ex: /usr/bin/python)"
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>
          <TouchableOpacity 
            style={[styles.button, (!newKey || !newValue) && styles.buttonDisabled]} 
            onPress={handleAdd}
            disabled={!newKey || !newValue}
          >
            <Text style={styles.buttonText}>Adicionar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    padding: 6,
  },
  headerTitle: {
    fontFamily: theme.typography.uiBold || theme.typography.ui,
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  scroll: {
    padding: 16,
  },
  sectionTitle: {
    fontFamily: theme.typography.uiBold || theme.typography.ui,
    fontSize: 18,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 16,
  },
  list: {
    marginBottom: 24,
  },
  varItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgSurface,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  varInfo: {
    flex: 1,
  },
  varKey: {
    fontFamily: theme.typography.mono,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  varInput: {
    fontFamily: theme.typography.mono,
    fontSize: 14,
    color: theme.colors.textPrimary,
    padding: 0,
  },
  removeBtn: {
    padding: 8,
    marginLeft: 8,
  },
  addSection: {
    backgroundColor: theme.colors.bgSurface,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  addTitle: {
    fontFamily: theme.typography.uiBold || theme.typography.ui,
    fontSize: 14,
    color: theme.colors.textPrimary,
    marginBottom: 12,
  },
  addRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  input: {
    backgroundColor: theme.colors.bgPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    padding: 10,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.mono,
  },
  button: {
    backgroundColor: theme.colors.primary,
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#ffffff',
    fontFamily: theme.typography.uiBold || theme.typography.ui,
    fontSize: 14,
  },
});
