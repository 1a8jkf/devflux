import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { FileSystemService, ProjectInfo } from '../services/FileSystemService';
import { useLanguage } from '../contexts/LanguageContext';

export default function ProjetosScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const { t } = useLanguage();

  const router = useRouter();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [selectedOptionsProject, setSelectedOptionsProject] = useState<ProjectInfo | null>(null);
  const [duplicateModalVisible, setDuplicateModalVisible] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');


  const loadProjects = async () => {
    setIsLoading(true);
    const data = await FileSystemService.getProjects();
    setProjects(data);
    setIsLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [])
  );


  const getIconForType = (type: string) => {
    switch(type) {
      case 'node': return 'Server';
      case 'react': return 'Layout';
      case 'html': return 'Globe';
      default: return 'FileCode2';
    }
  };

  const formatTime = (ms: number) => {
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return t('time.minutesAgo', '{value}m ago').replace('{value}', String(mins));
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('time.hoursAgo', '{value}h ago').replace('{value}', String(hours));
    return t('time.daysAgo', '{value}d ago').replace('{value}', String(Math.floor(hours / 24)));
  };

  const handleDuplicate = async () => {
    if (!selectedOptionsProject || !duplicateName.trim()) return;
    setDuplicateModalVisible(false);
    setIsLoading(true);
    await FileSystemService.duplicateProject(selectedOptionsProject.id, duplicateName.trim());
    await loadProjects();
  };

  const handleDelete = async () => {
    if (!selectedOptionsProject) return;
    setOptionsModalVisible(false);
    setIsLoading(true);
    await FileSystemService.deleteProject(selectedOptionsProject.id);
    await loadProjects();
  };

  const filteredProjects = projects.filter(project => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;
    return project.name.toLowerCase().includes(query) || project.type.toLowerCase().includes(query);
  });

  const renderItem = ({ item }: { item: ProjectInfo }) => (
    <TouchableOpacity
      style={styles.projectCard}
      onPress={() => router.push({ pathname: '/editor/codigo', params: { projectId: item.id } })}
    >
      <View style={styles.projectIcon}>
        <Icon name={getIconForType(item.type) as any} size={24} color={theme.colors.accentBlue} />
      </View>
      <View style={styles.projectInfo}>
        <Text style={styles.projectName}>{item.name}</Text>
        <Text style={styles.projectMeta}>{item.type.toUpperCase()} • {t('Editado')} {formatTime(item.updatedAt)}</Text>
      </View>
      <TouchableOpacity onPress={() => { setSelectedOptionsProject(item); setOptionsModalVisible(true); }}>
        <Icon name="MoreVertical" size={20} color={theme.colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>


      <View style={styles.searchContainer}>
        <Icon name="Search" size={16} color={theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('Buscar projetos...')}
          placeholderTextColor={theme.colors.textSecondary}
          value={searchTerm}
          onChangeText={setSearchTerm}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          importantForAutofill="no"
          disableFullscreenUI
        />
        {searchTerm.length > 0 && (
          <TouchableOpacity onPress={() => setSearchTerm('')} style={styles.searchClearBtn}>
            <Icon name="X" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredProjects}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshing={isLoading}
        onRefresh={loadProjects}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="FolderPlus" size={48} color={theme.colors.border} />
            <Text style={styles.emptyText}>{isLoading ? t('Carregando...') : searchTerm ? t('Nenhum projeto encontrado.') : t('Nenhum projeto ainda.')}</Text>
            {!isLoading && !searchTerm && (
              <TouchableOpacity style={styles.emptyButton} onPress={() => router.push('/novo-projeto')}>
                <Icon name="Plus" size={16} color="#FFF" />
                <Text style={styles.emptyButtonText}>{t('Criar Projeto')}</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/novo-projeto')}
      >
        <Icon name="Plus" size={24} color="#FFF" />
      </TouchableOpacity>

      {/* Options Modal */}
      <Modal visible={optionsModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('Opções do Projeto')}</Text>
              <TouchableOpacity onPress={() => setOptionsModalVisible(false)}>
                <Icon name="X" size={24} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 24, gap: 16 }}>
              <TouchableOpacity style={styles.optionBtn} onPress={() => { setOptionsModalVisible(false); setDuplicateName(selectedOptionsProject?.name + ' (' + t('Cópia') + ')'); setDuplicateModalVisible(true); }}>
                <Icon name="Copy" size={20} color={theme.colors.accentBlue} />
                <Text style={styles.optionBtnText}>{t('Duplicar')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.optionBtn} onPress={handleDelete}>
                <Icon name="Trash2" size={20} color={theme.colors.error} />
                <Text style={[styles.optionBtnText, { color: theme.colors.error }]}>{t('Excluir')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Duplicate Name Modal */}
      <Modal visible={duplicateModalVisible} transparent animationType="fade">
        <View style={[styles.modalOverlay, { justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }]}>
          <View style={[styles.modalContent, { borderRadius: 12, marginHorizontal: 24, paddingTop: 24, paddingBottom: 24 }]}>
            <Text style={[styles.modalTitle, { paddingHorizontal: 24, marginBottom: 16 }]}>{t('Nome da Cópia')}</Text>
            <TextInput
              style={[styles.searchInput, { marginHorizontal: 24, backgroundColor: theme.colors.bgSurface, height: 48, borderRadius: 8, paddingHorizontal: 16, marginBottom: 24, marginLeft: 24 }]}
              placeholder={t('Novo nome...')}
              placeholderTextColor={theme.colors.textSecondary}
              value={duplicateName}
              onChangeText={setDuplicateName}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              importantForAutofill="no"
              keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
              disableFullscreenUI
              autoFocus
            />
            <View style={{ flexDirection: 'row', paddingHorizontal: 24, gap: 12 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: theme.colors.bgSurface, borderRadius: 8 }} onPress={() => setDuplicateModalVisible(false)}>
                <Text style={{ color: theme.colors.textPrimary, fontWeight: 'bold' }}>{t('Cancelar')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: theme.colors.accentBlue, borderRadius: 8 }} onPress={handleDuplicate}>
                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{t('Salvar')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  title: {
    fontFamily: theme.typography.ui,
    fontSize: 28,
    color: theme.colors.textPrimary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgElevated,
    marginHorizontal: 20,
    paddingHorizontal: 16,
    height: 50,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontFamily: theme.typography.ui,
    fontSize: 16,
    lineHeight: 20,
    color: theme.colors.textPrimary,
    paddingVertical: 0,
  },
  searchClearBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: theme.colors.bgSurface,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgElevated,
    padding: 16,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  projectIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontFamily: theme.typography.ui,
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  projectMeta: {
    fontFamily: theme.typography.ui,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontFamily: theme.typography.ui,
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: 16,
    marginBottom: 18,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.accentBlue,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#FFF',
    fontFamily: theme.typography.uiBold,
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.accentBlue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.bgElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  modalTitle: {
    fontFamily: theme.typography.ui,
    fontSize: 20,
    color: theme.colors.textPrimary,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.bgSurface,
    borderRadius: 8,
  },
  optionBtnText: {
    fontFamily: theme.typography.ui,
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginLeft: 12,
    fontWeight: '500',
  },
  templateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  templateInfo: {
    marginLeft: 16,
  },
  templateName: {
    fontFamily: theme.typography.ui,
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  templateDesc: {
    fontFamily: theme.typography.ui,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  templateOptionSelected: {
    backgroundColor: theme.colors.bgSurface,
    borderColor: theme.colors.accentBlue,
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 16,
    borderBottomWidth: 1,
  },
  sectionLabel: {
    fontFamily: theme.typography.ui,
    fontSize: 11,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    paddingHorizontal: 24,
    marginBottom: 8,
    marginTop: 8,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgSurface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipSelected: {
    backgroundColor: theme.colors.accentBlue,
    borderColor: theme.colors.accentBlue,
  },
  chipText: {
    fontFamily: theme.typography.ui,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginLeft: 6,
  },
  chipTextSelected: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: theme.colors.accentBlue,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#FFF',
    fontFamily: theme.typography.ui,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
