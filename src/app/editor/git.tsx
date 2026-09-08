import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { Icon } from '../../components/Icon';
import { GitService, ChangedFile } from '../../services/GitService';
import { GithubService } from '../../services/GithubService';
import { FileSystemService, ProjectInfo } from '../../services/FileSystemService';
import { MonacoEditor } from '../../components/MonacoEditor';
import { useLanguage } from '../../contexts/LanguageContext';

export default function GitScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { t } = useLanguage();

  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [repoUrlToConnect, setRepoUrlToConnect] = useState('');

  const [message, setMessage] = useState('');
  const [changes, setChanges] = useState<ChangedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  const [diffFile, setDiffFile] = useState<string | null>(null);
  const [diffOriginal, setDiffOriginal] = useState('');
  const [diffCurrent, setDiffCurrent] = useState('');

  const loadProject = async () => {
    if (!projectId) return null;
    const projects = await FileSystemService.getProjects();
    const proj = projects.find(p => p.id === projectId);
    if (proj) setProjectInfo(proj);
    return proj;
  };

  useEffect(() => {
    loadProject().then(proj => {
      if (proj?.githubRepo) {
        loadChanges();
      } else {
        setLoading(false);
      }
    });
  }, [projectId]);

  const handleConnectRepo = async () => {
    if (!repoUrlToConnect) return;
    setLoading(true);
    try {
      await GitService.initAndAddRemote(projectId, repoUrlToConnect);
      await FileSystemService.updateProject(projectId, { githubRepo: repoUrlToConnect });
      await loadProject();
      await loadChanges();
    } catch (e: any) {
      Alert.alert(t('Erro'), e.message);
      setLoading(false);
    }
  };

  const loadChanges = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const changedFiles = await GitService.getChangedFiles(projectId);
      setChanges(changedFiles);
    } catch (e) {
      console.error(e);
      Alert.alert(t('Erro'), t('git.loadError', 'Não foi possível carregar as alterações.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!message.trim()) {
      Alert.alert(t('Erro'), t('git.emptyCommitMessage', 'Digite uma mensagem de commit.'));
      return;
    }
    if (changes.length === 0) {
      Alert.alert(t('Aviso'), t('git.noChanges', 'Nenhuma alteração para commitar.'));
      return;
    }
    
    setIsCommitting(true);
    try {
      const user = await GithubService.getUser();
      await GitService.commit(
        projectId, 
        message, 
        user.name || user.login, 
        user.login + '@users.noreply.github.com'
      );
      setMessage('');
      Alert.alert(t('Sucesso'), t('git.commitSuccess', 'Commit criado com sucesso!'));
      await loadChanges();
    } catch (e: any) {
      console.error(e);
      Alert.alert(t('Erro no commit'), e.message);
    } finally {
      setIsCommitting(false);
    }
  };

  const handlePush = async () => {
    setIsPushing(true);
    try {
      await GitService.push(projectId);
      Alert.alert(t('Sucesso'), t('git.pushSuccess', 'Alterações enviadas para o GitHub!'));
    } catch (e: any) {
      console.error(e);
      Alert.alert(t('Erro no push'), e.message);
    } finally {
      setIsPushing(false);
    }
  };

  const handleRevert = (filepath: string) => {
    Alert.alert(t('Reverter Arquivo'), `${t('git.revertConfirm', 'Deseja descartar todas as alterações em')} ${filepath}?`, [
      { text: t('Cancelar'), style: 'cancel' },
      { text: t('Reverter'), style: 'destructive', onPress: async () => {
        setLoading(true);
        try {
          await GitService.revertFile(projectId, filepath);
          await loadChanges();
        } catch (e: any) {
          Alert.alert(t('Erro'), `${t('git.revertError', 'Falha ao reverter arquivo:')} ${e.message}`);
          setLoading(false);
        }
      }}
    ]);
  };

  const handleViewDiff = async (filepath: string) => {
    setLoading(true);
    try {
      const currentCode = await FileSystemService.readFile(projectId, filepath).catch(() => '');
      const originalCode = await GitService.getFileFromHead(projectId, filepath);
      
      setDiffOriginal(originalCode);
      setDiffCurrent(currentCode);
      setDiffFile(filepath);
    } catch (e: any) {
      Alert.alert(t('Erro'), `${t('git.diffError', 'Não foi possível gerar diff:')} ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!loading && projectInfo && !projectInfo.githubRepo) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('Vincular GitHub')}</Text>
        </View>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.colors.textPrimary, marginBottom: 12, fontFamily: theme.typography.ui, fontSize: 15, lineHeight: 22 }}>
            {t('git.linkDesc', 'Este projeto não está vinculado a um repositório remoto.\nInsira a URL do repositório para conectar e monitorar alterações com precisão.')}
          </Text>
          <TextInput
            style={[styles.input, { minHeight: 44, padding: 12, backgroundColor: theme.colors.bgSurface, borderRadius: 8, marginBottom: 12 }]}
            placeholder="https://github.com/user/repo"
            placeholderTextColor={theme.colors.textSecondary}
            value={repoUrlToConnect}
            onChangeText={setRepoUrlToConnect}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.commitBtn} onPress={handleConnectRepo} disabled={loading}>
            <Text style={styles.commitBtnText}>{loading ? t('Conectando...') : t('Conectar Repositório')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('Controle de Versão (Git)')}</Text>
        <View style={styles.branchPill}>
          <Icon name="GitBranch" size={14} color={theme.colors.accentBlue} />
          <Text style={styles.branchName}>main</Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.commitArea}>
          <TextInput
            style={styles.input}
            placeholder={t('Mensagem do commit...')}
            placeholderTextColor={theme.colors.textSecondary}
            value={message}
            onChangeText={setMessage}
            multiline
          />
          <TouchableOpacity 
            style={[styles.commitBtn, isCommitting && { opacity: 0.7 }]} 
            onPress={handleCommit}
            disabled={isCommitting}
          >
            <Text style={styles.commitBtnText}>
              {isCommitting ? t('Commitando...') : t('Commit')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionsGrid}>
          <TouchableOpacity 
            style={[styles.actionGridBtn, isPushing && { opacity: 0.7 }]} 
            onPress={handlePush}
            disabled={isPushing}
          >
            {isPushing ? (
              <ActivityIndicator size="small" color={theme.colors.textPrimary} style={{ marginRight: 8 }} />
            ) : (
              <Icon name="ArrowUpCircle" size={24} color={theme.colors.textPrimary} />
            )}
            <Text style={styles.actionGridText}>{isPushing ? t('Enviando...') : t('Push')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionGridBtn} onPress={loadChanges}>
            <Icon name="RefreshCw" size={24} color={theme.colors.textPrimary} />
            <Text style={styles.actionGridText}>{t('Refresh')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>
          {t('Arquivos Alterados')} ({loading ? '...' : changes.length})
        </Text>
        
        <View style={styles.changesList}>
          {loading ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.accentBlue} />
            </View>
          ) : changes.length === 0 ? (
            <View style={{ padding: 32, alignItems: 'center' }}>
              <Icon name="CheckCircle" size={48} color={theme.colors.textSecondary} style={{ marginBottom: 16 }} />
              <Text style={{ color: theme.colors.textSecondary, textAlign: 'center', fontFamily: theme.typography.ui, fontSize: 15, marginBottom: 24 }}>
                {t('Nenhuma alteração detectada.')}
              </Text>
              <TouchableOpacity 
                style={[styles.commitBtn, { width: '80%', backgroundColor: theme.colors.bgSurface, borderWidth: 1, borderColor: theme.colors.border }]} 
                onPress={handlePush}
                disabled={isPushing}
              >
                {isPushing ? (
                  <ActivityIndicator size="small" color={theme.colors.textPrimary} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="ArrowUpCircle" size={18} color={theme.colors.textPrimary} style={{ marginRight: 8 }} />
                    <Text style={[styles.commitBtnText, { color: theme.colors.textPrimary }]}>{t('Forçar Push')}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            changes.map(change => (
              <View key={change.path} style={styles.changeItem}>
                <View style={styles.changeInfo}>
                  {change.status === 'added' || change.status === 'untracked' ? (
                    <Text style={[styles.statusChar, { color: theme.colors.accentTeal }]}>A</Text>
                  ) : change.status === 'modified' ? (
                    <Text style={[styles.statusChar, { color: theme.colors.accentAmber }]}>M</Text>
                  ) : change.status === 'deleted' ? (
                    <Text style={[styles.statusChar, { color: theme.colors.error }]}>D</Text>
                  ) : null}
                  <Text style={styles.changeFile}>{change.path}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <TouchableOpacity onPress={() => handleViewDiff(change.path)}>
                    <Icon name="Eye" size={18} color={theme.colors.accentBlue} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRevert(change.path)}>
                    <Icon name="RotateCcw" size={18} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {diffFile && (
        <View style={styles.diffModalContainer}>
          <View style={styles.diffModalHeader}>
            <Text style={styles.diffModalTitle}>{t('Diff:')} {diffFile}</Text>
            <TouchableOpacity onPress={() => setDiffFile(null)} style={{ padding: 4 }}>
              <Icon name="X" size={24} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <MonacoEditor
              code={diffCurrent}
              originalCode={diffOriginal}
              language={diffFile.split('.').pop() || 'txt'}
              onChangeCode={() => {}}
              readOnly={true}
            />
          </View>
        </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
  },
  title: {
    fontFamily: theme.typography.ui,
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  branchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgSurface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  branchName: {
    fontFamily: theme.typography.mono,
    fontSize: 12,
    color: theme.colors.accentBlue,
    marginLeft: 6,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  commitArea: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 16,
  },
  input: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  commitBtn: {
    backgroundColor: theme.colors.accentBlue,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  commitBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontFamily: theme.typography.ui,
  },
  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  actionGridBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgElevated,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginHorizontal: 4,
  },
  actionGridText: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    marginLeft: 8,
    fontWeight: '500',
  },
  sectionTitle: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  changesList: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  changeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  changeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusChar: {
    fontFamily: theme.typography.mono,
    fontWeight: 'bold',
    fontSize: 14,
    width: 20,
  },
  changeFile: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    fontSize: 14,
  },
  diffModalContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.bgPrimary,
    zIndex: 100,
  },
  diffModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
  },
  diffModalTitle: {
    fontFamily: theme.typography.ui,
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
});
