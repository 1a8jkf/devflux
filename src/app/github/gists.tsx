import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { GithubService } from '../../services/GithubService';
import { Icon } from '../../components/Icon';
import { useLanguage } from '../../contexts/LanguageContext';

export default function GistsScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const { t } = useLanguage();
  
  const [gists, setGists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGists();
  }, []);

  const loadGists = async () => {
    try {
      setLoading(true);
      const data = await GithubService.getGists();
      setGists(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const files = Object.keys(item.files);
    const mainFile = files.length > 0 ? files[0] : 'Gist sem nome';
    const language = files.length > 0 ? item.files[mainFile].language : '';

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
          <Icon name="Code" size={20} color={theme.colors.accentBlue} />
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.description || mainFile}
          </Text>
          {!item.public && <Icon name="Lock" size={14} color={theme.colors.textSecondary} style={{marginLeft: 8}} />}
        </View>
        <Text style={styles.cardDescription}>{files.join(', ')}</Text>
        <View style={styles.cardFooter}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Icon name="FileText" size={12} color={theme.colors.textSecondary} />
            <Text style={[styles.cardDate, {marginLeft: 4}]}>{language || t('Texto')}</Text>
          </View>
          <Text style={styles.cardDate}>
            {new Date(item.updated_at).toLocaleDateString()}
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
      ) : gists.length === 0 ? (
        <View style={styles.center}>
          <Icon name="FileCode" size={48} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('Nenhum Gist encontrado.')}</Text>
        </View>
      ) : (
        <FlatList
          data={gists}
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
    fontFamily: theme.typography.mono,
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
    fontFamily: theme.typography.ui,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.typography.ui,
    marginTop: 16,
  }
});
