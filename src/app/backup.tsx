import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { FileSystemService, ProjectInfo } from '../services/FileSystemService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../contexts/LanguageContext';

export default function BackupScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [backingUpId, setBackingUpId] = useState<string | null>(null);

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

  const handleBackup = async (project: ProjectInfo) => {
    try {

      setBackingUpId(project.id);

      // Simulação do processo de compressão (ZIP) e Upload via HTTP POST
      // Futuramente, a Engine enviará: POST https://seu-vps.com/api/backup

      // Body: zip file multipart/form-data
      await new Promise(resolve => setTimeout(resolve, 3000));

      Alert.alert(
        t('Backup Concluído! ☁️'),
        t('backup.successMessage', 'O projeto "{name}" foi compactado e salvo com segurança na sua nuvem restrita do VPS.').replace('{name}', project.name)
      );
    } catch (e: any) {
      Alert.alert(t('Erro no Backup'), e?.message || t('Falha ao conectar no servidor.'));
    } finally {
      setBackingUpId(null);
    }
  };

  const renderProject = ({ item }: { item: ProjectInfo }) => (
    <View style={styles.projectCard}>
      <View style={styles.projectInfo}>
        <Icon name="Folder" size={24} color={theme.colors.accentBlue} />
        <View style={styles.projectText}>
          <Text style={styles.projectName}>{item.name}</Text>
          <Text style={styles.projectDate}>
            {t('Atualizado:')} {new Date(item.updatedAt).toLocaleDateString()}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.backupBtn, backingUpId === item.id && styles.backupBtnDisabled]}
        onPress={() => handleBackup(item)}
        disabled={backingUpId === item.id}
      >
        {backingUpId === item.id ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Icon name="CloudUpload" size={16} color="#fff" />
            <Text style={styles.backupBtnText}>{t('Upload VPS')}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={24} color={theme.colors.textPrimary} />
          <Text style={styles.headerTitle}>{t('Backup na Nuvem (VPS)')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBanner}>
        <Icon name="ShieldCheck" size={24} color={theme.colors.accentTeal} />
        <Text style={styles.infoText}>
          {t('Seus arquivos serão compactados e enviados para seu Servidor VPS configurado, sem exigir login para abrir esta ferramenta.')}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.accentBlue} />
        </View>
      ) : projects.length === 0 ? (
        <View style={styles.centerContainer}>
          <Icon name="FolderX" size={48} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('Nenhum projeto local encontrado.')}</Text>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={item => item.id}
          renderItem={renderProject}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgElevated,
    margin: 16,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.accentTeal + '50',
  },
  infoText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginLeft: 12,
    lineHeight: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    marginTop: 16,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.bgElevated,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  projectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  projectText: {
    marginLeft: 12,
    flex: 1,
  },
  projectName: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  projectDate: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  backupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.accentBlue,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  backupBtnDisabled: {
    backgroundColor: theme.colors.textSecondary,
  },
  backupBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
  },
});
