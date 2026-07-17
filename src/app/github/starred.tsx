import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { GithubService, GithubRepo } from '../../services/GithubService';
import { Icon } from '../../components/Icon';

export default function StarredScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStarred();
  }, []);

  const loadStarred = async () => {
    try {
      setLoading(true);
      const data = await GithubService.getStarredRepos();
      setRepos(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: GithubRepo }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => {
        if (item.html_url) {
          Linking.openURL(item.html_url);
        }
      }}
    >
      <View style={styles.cardHeader}>
        <Icon name="Star" size={20} color={theme.colors.accentYellow || '#f1c40f'} />
        <Text style={styles.cardTitle} numberOfLines={1}>{item.full_name}</Text>
      </View>
      {item.description && (
        <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
      )}
      <View style={styles.cardFooter}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Icon name="Star" size={12} color={theme.colors.textSecondary} />
          <Text style={[styles.cardDate, {marginLeft: 4}]}>Favoritado</Text>
        </View>
        <Text style={styles.cardDate}>
          {new Date(item.updated_at).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.accentBlue} />
        </View>
      ) : repos.length === 0 ? (
        <View style={styles.center}>
          <Icon name="Star" size={48} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>Você ainda não tem favoritos.</Text>
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
    alignItems: 'center'
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
