import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { GithubService, GithubRepo } from '../../services/GithubService';
import { FileSystemService } from '../../services/FileSystemService';
import { Icon } from '../../components/Icon';
import { useRouter } from 'expo-router';

export default function ReposScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    loadRepos();
  }, []);

  const loadRepos = async () => {
    try {
      setLoading(true);
      const data = await GithubService.getRepos();
      setRepos(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (repo: GithubRepo) => {
    try {
      setDownloadingId(repo.id.toString());
      await FileSystemService.downloadGitRepo(repo.html_url);
      router.replace('/projetos');
    } catch (e: any) {
      alert(e.message || 'Erro ao baixar o repositório');
    } finally {
      setDownloadingId(null);
    }
  };

  const renderItem = ({ item }: { item: GithubRepo }) => {
    const isDownloading = downloadingId === item.id.toString();

    return (
      <TouchableOpacity 
        style={styles.card}
        onPress={() => {
          if (!isDownloading) alert(`Abrir ${item.name}`);
        }}
      >
      <View style={styles.cardHeader}>
        <Icon name="FolderGit2" size={20} color={theme.colors.accentBlue} />
        <Text style={styles.cardTitle}>{item.full_name}</Text>
        {item.private && <Icon name="Lock" size={14} color={theme.colors.textSecondary} style={{marginLeft: 8}} />}
      </View>
      {item.description && (
        <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
      )}
      <View style={styles.cardFooter}>
        <Text style={styles.cardDate}>
          Atualizado em {new Date(item.updated_at).toLocaleDateString()}
        </Text>
        <TouchableOpacity 
          style={{flexDirection: 'row', alignItems: 'center'}} 
          onPress={() => handleDownload(item)}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <>
              <ActivityIndicator size="small" color={theme.colors.accentBlue} style={{ marginRight: 4 }} />
              <Text style={{color: theme.colors.textSecondary, fontSize: 12, marginLeft: 4, fontFamily: theme.typography.uiBold}}>Baixando...</Text>
            </>
          ) : (
            <>
              <Icon name="DownloadCloud" size={16} color={theme.colors.accentBlue} />
              <Text style={{color: theme.colors.accentBlue, fontSize: 12, marginLeft: 4, fontFamily: theme.typography.uiBold}}>Baixar</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.accentBlue} />
        </View>
      ) : repos.length === 0 ? (
        <View style={styles.center}>
          <Icon name="Inbox" size={48} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>Nenhum repositório encontrado.</Text>
        </View>
      ) : (
        <FlatList
          data={repos}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
  },
  card: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.typography.uiBold,
    marginLeft: 8,
    flex: 1,
  },
  cardDescription: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontFamily: theme.typography.ui,
    marginBottom: 12,
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardDate: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontFamily: theme.typography.mono,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.typography.ui,
    marginTop: 16,
  }
});
