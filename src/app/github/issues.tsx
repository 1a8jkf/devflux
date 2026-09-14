import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { GithubService } from '../../services/GithubService';
import { Icon } from '../../components/Icon';
import { useLanguage } from '../../contexts/LanguageContext';

export default function IssuesScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const { t } = useLanguage();
  
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadIssues();
  }, []);

  const loadIssues = async () => {
    try {
      setLoading(true);
      const data = await GithubService.getIssues();
      setIssues(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const repoMatch = item.repository_url?.match(/repos\/(.*)$/);
    const repoName = repoMatch ? repoMatch[1] : '';

    return (
      <TouchableOpacity 
        style={styles.card}
        onPress={() => {
          if (item.html_url) {
            Linking.openURL(item.html_url);
          }
        }}
      >
        <View style={styles.cardHeader}>
          <Icon name="AlertCircle" size={20} color={theme.colors.accentRed || '#e74c3c'} />
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        </View>
        <Text style={styles.cardDescription}>{repoName} #{item.number}</Text>
        <View style={styles.cardFooter}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Icon name="MessageSquare" size={12} color={theme.colors.textSecondary} />
            <Text style={[styles.cardDate, {marginLeft: 4}]}>{item.comments}</Text>
          </View>
          <Text style={styles.cardDate}>
            {t('Atualizado em')} {new Date(item.updated_at).toLocaleDateString()}
          </Text>
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
      ) : issues.length === 0 ? (
        <View style={styles.center}>
          <Icon name="CheckCircle" size={48} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('Nenhuma Issue pendente.')}</Text>
        </View>
      ) : (
        <FlatList
          data={issues}
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
