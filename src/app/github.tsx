import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Linking } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../contexts/LanguageContext';

interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  stargazers_count: number;
  language: string;
  updated_at: string;
}

export default function GitHubScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  React.useEffect(() => {
    AsyncStorage.getItem('@github_username').then(saved => {
      if (saved) setUsername(saved);
    });
  }, []);

  const fetchRepositories = async () => {
    if (!username.trim()) {
      Alert.alert(t('Erro'), t('Por favor, insira o nome de usuário do GitHub.'));
      return;
    }
    
    setLoading(true);
    setHasSearched(true);
    
    try {
      const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json'
      };
      if (token.trim()) {
        headers['Authorization'] = `token ${token.trim()}`;
      }

      const res = await fetch(`https://api.github.com/users/${username.trim()}/repos?sort=updated&per_page=50`, {
        headers
      });

      if (!res.ok) {
        throw new Error(res.status === 404 ? t('Usuário não encontrado') : t('Falha na requisição'));
      }

      const data = await res.json();
      setRepos(data);
      AsyncStorage.setItem('@github_username', username.trim());
    } catch (e: any) {
      Alert.alert(t('Erro'), e.message || t('Não foi possível buscar repositórios'));
      setRepos([]);
    } finally {
      setLoading(false);
    }
  };

  const getLanguageColor = (lang: string) => {
    switch(lang) {
      case 'TypeScript': return theme.colors.accentBlue;
      case 'JavaScript': return theme.colors.accentAmber;
      case 'Python': return theme.colors.accentPurple;
      case 'Java': return '#b07219';
      case 'C++': return '#f34b7d';
      case 'C#': return '#178600';
      case 'PHP': return '#4F5D95';
      case 'HTML': return '#e34c26';
      case 'CSS': return '#563d7c';
      case 'Shell': return '#89e051';
      default: return theme.colors.textSecondary;
    }
  };

  const renderRepo = ({ item }: { item: Repository }) => {
    return (
      <View style={styles.repoCard}>
        <View style={styles.repoHeader}>
          <Icon name="Book" size={20} color={theme.colors.textPrimary} />
          <Text style={styles.repoName} numberOfLines={1}>{item.name}</Text>
          <TouchableOpacity onPress={() => Linking.openURL(item.html_url)} style={styles.linkBtn}>
            <Icon name="ExternalLink" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
        
        {item.description ? (
          <Text style={styles.repoDescription} numberOfLines={2}>{item.description}</Text>
        ) : null}
        
        <View style={styles.repoFooter}>
          {item.language && (
            <View style={styles.badgeContainer}>
              <View style={[styles.langDot, { backgroundColor: getLanguageColor(item.language) }]} />
              <Text style={styles.badgeText}>{item.language}</Text>
            </View>
          )}
          <View style={styles.badgeContainer}>
            <Icon name="Star" size={14} color={theme.colors.accentAmber} />
            <Text style={[styles.badgeText, { marginLeft: 4 }]}>{item.stargazers_count}</Text>
          </View>
          <View style={styles.badgeContainer}>
            <Icon name="Clock" size={14} color={theme.colors.textSecondary} />
            <Text style={[styles.badgeText, { marginLeft: 4 }]}>
              {new Date(item.updated_at).toLocaleDateString()}
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.cloneBtn} 
          onPress={() => {
            Alert.alert(t('Em breve'), t('github.cloneSoon', 'O recurso de clonar "{name}" para um projeto local será lançado na próxima versão!').replace('{name}', item.name));
          }}
        >
          <Icon name="DownloadCloud" size={16} color="#000" />
          <Text style={styles.cloneBtnText}>{t('Clonar Repositório')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={24} color={theme.colors.textPrimary} />
          <Text style={styles.headerTitle}>GitHub</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.searchContainer}>
          <Text style={styles.label}>{t('Usuário do GitHub')}</Text>
          <View style={styles.inputRow}>
            <Icon name="User" size={20} color={theme.colors.textSecondary} style={styles.inputIcon} />
            <TextInput 
              style={styles.input} 
              value={username} 
              onChangeText={setUsername} 
              placeholder="Ex: octocat"
              placeholderTextColor={theme.colors.textSecondary}
              autoCapitalize="none"
              onSubmitEditing={fetchRepositories}
            />
          </View>

          <Text style={styles.label}>{t('Token de Acesso (Opcional - para repos privados)')}</Text>
          <View style={styles.inputRow}>
            <Icon name="Key" size={20} color={theme.colors.textSecondary} style={styles.inputIcon} />
            <TextInput 
              style={styles.input} 
              value={token} 
              onChangeText={setToken} 
              placeholder="ghp_xxxxxxxxxxxx"
              placeholderTextColor={theme.colors.textSecondary}
              autoCapitalize="none"
              secureTextEntry
              onSubmitEditing={fetchRepositories}
            />
          </View>

          <TouchableOpacity style={styles.searchBtn} onPress={fetchRepositories}>
            <Text style={styles.searchBtnText}>{t('Buscar Repositórios')}</Text>
            <Icon name="Search" size={18} color="#000" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.accentBlue} />
            <Text style={styles.loadingText}>{t('Carregando repositórios...')}</Text>
          </View>
        ) : (
          <FlatList
            data={repos}
            keyExtractor={item => item.id.toString()}
            renderItem={renderRepo}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={() => (
              hasSearched && !loading ? (
                <View style={styles.emptyContainer}>
                  <Icon name="Inbox" size={48} color={theme.colors.textSecondary} />
                  <Text style={styles.emptyText}>{t('Nenhum repositório encontrado.')}</Text>
                </View>
              ) : null
            )}
          />
        )}
      </KeyboardAvoidingView>
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
  searchContainer: {
    padding: 20,
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginBottom: 8,
    marginTop: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    color: theme.colors.textPrimary,
    fontSize: 16,
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentBlue,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 20,
  },
  searchBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: theme.colors.textSecondary,
    marginTop: 16,
    fontSize: 16,
  },
  listContent: {
    padding: 16,
  },
  repoCard: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  repoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  repoName: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
    flex: 1,
  },
  linkBtn: {
    padding: 4,
  },
  repoDescription: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  repoFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    marginBottom: 8,
  },
  langDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  badgeText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  cloneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentTeal,
    paddingVertical: 10,
    borderRadius: 6,
  },
  cloneBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    marginTop: 16,
  }
});
