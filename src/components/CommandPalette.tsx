import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, DeviceEventEmitter } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from './Icon';
import { useCommandPalette } from '../contexts/CommandPaletteContext';
import { useRouter } from 'expo-router';

interface Command {
  id: string;
  title: string;
  icon: any;
  action: () => void;
}

export const CommandPalette: React.FC = () => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);

  const { isVisible, closePalette } = useCommandPalette();
  const [search, setSearch] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (isVisible) {
      setSearch('');
    }
  }, [isVisible]);

  const commands: Command[] = [
    {
      id: 'settings',
      title: 'Abrir Configurações',
      icon: 'Settings',
      action: () => { router.push('/editor/configuracoes'); closePalette(); }
    },
    {
      id: 'sync',
      title: 'Sincronizar com PC (Bridge)',
      icon: 'Cloud',
      action: () => { router.push('/bridge'); closePalette(); }
    },
    {
      id: 'ai',
      title: 'Assistente IA (CodeFlex AI)',
      icon: 'Sparkles',
      action: () => { router.push('/ai-panel'); closePalette(); }
    },
    {
      id: 'support',
      title: 'Falar com Suporte',
      icon: 'MessageSquare',
      action: () => { router.push('/suporte'); closePalette(); }
    },
    {
      id: 'docs',
      title: 'Ler Documentação Oficial',
      icon: 'BookOpen',
      action: () => { router.push('/documentacao'); closePalette(); }
    },
    {
      id: 'projects',
      title: 'Meus Projetos',
      icon: 'Folder',
      action: () => { router.push('/projetos'); closePalette(); }
    },
    {
      id: 'gotoline',
      title: 'Ir para a linha...',
      icon: 'CornerDownRight',
      action: () => { DeviceEventEmitter.emit('triggerGoToLine'); closePalette(); }
    }
  ];

  const filteredCommands = commands.filter(cmd => 
    cmd.title.toLowerCase().includes(search.toLowerCase())
  );

  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} transparent animationType="fade">
      <TouchableWithoutFeedback onPress={closePalette}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
            style={styles.avoidingView}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.paletteContainer}>
                <View style={styles.searchHeader}>
                  <Icon name="Search" size={20} color={theme.colors.textSecondary} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="O que você precisa fazer?"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={search}
                    onChangeText={setSearch}
                    autoFocus
                  />
                  <TouchableOpacity onPress={closePalette}>
                    <Icon name="X" size={20} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <FlatList
                  data={filteredCommands}
                  keyExtractor={item => item.id}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.listContent}
                  ListEmptyComponent={() => (
                    <Text style={styles.emptyText}>Nenhum comando encontrado.</Text>
                  )}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.commandItem} onPress={item.action}>
                      <Icon name={item.icon} size={18} color={theme.colors.textPrimary} />
                      <Text style={styles.commandTitle}>{item.title}</Text>
                      <Icon name="ChevronRight" size={16} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                />
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const getStyles = (theme: AppTheme) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingTop: 80,
    paddingHorizontal: 16,
  },
  avoidingView: {
    width: '100%',
    maxHeight: '60%',
  },
  paletteContainer: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: theme.typography.ui,
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginLeft: 12,
    marginRight: 12,
  },
  listContent: {
    paddingVertical: 8,
  },
  emptyText: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 24,
  },
  commandItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  commandTitle: {
    flex: 1,
    fontFamily: theme.typography.ui,
    fontSize: 15,
    color: theme.colors.textPrimary,
    marginLeft: 12,
  },
});
