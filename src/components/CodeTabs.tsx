import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon, IconName } from './Icon';

interface Tab {
  id: string;
  name: string;
  type: string;
  isDirty?: boolean;
  saveState?: 'saved' | 'dirty' | 'saving' | 'error';
}

interface CodeTabsProps {
  tabs: Tab[];
  activeTabId: string;
  onTabPress: (id: string) => void;
  onTabClose: (id: string) => void;
}

const getTabColor = (type: Tab['type'], theme: AppTheme) => {
  switch (type) {
    case 'html': return theme.colors.accentBlue;
    case 'css': return theme.colors.accentBlue;
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx': return theme.colors.accentTeal;
    case 'py':
    case 'python': return theme.colors.accentPurple;
    case 'php': return '#777BB4'; // PHP Purple
    case 'java': return '#f89820'; // Java Orange
    case 'c':
    case 'cpp': return '#A8B9CC';
    case 'json': return theme.colors.textPrimary;
    case 'markdown':
    case 'md': return theme.colors.textSecondary;
    case 'shell': return theme.colors.accentBlue;
    default: return theme.colors.textPrimary;
  }
};

const getTabIcon = (type: Tab['type']): IconName => {
  switch (type) {
    case 'php': return 'Server';
    case 'java': return 'Coffee';
    case 'json': return 'Braces';
    case 'markdown':
    case 'md': return 'FileText';
    case 'shell': return 'Terminal';
    default: return 'File';
  }
};

const getTabImage = (type: Tab['type']) => {
  switch (type) {
    case 'html': return require('../../assets/html.png');
    case 'css': return require('../../assets/css.png');
    case 'js':
    case 'jsx': return require('../../assets/js.png');
    case 'ts':
    case 'tsx': return require('../../assets/js.png'); // Fallback para js pois tsx.png está vazio (0 bytes)
    case 'py':
    case 'python': return require('../../assets/python.png');
    case 'c':
    case 'cpp': return require('../../assets/c-.png');
    case 'cs':
    case 'csharp': return require('../../assets/c-sharp.png');
    default: return null;
  }
};

export const CodeTabs: React.FC<CodeTabsProps> = ({ tabs, activeTabId, onTabPress, onTabClose }) => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          const color = getTabColor(tab.type, theme);
          
          return (
            <TouchableOpacity 
              key={tab.id} 
              style={[styles.tab, isActive && styles.activeTab]}
              onPress={() => onTabPress(tab.id)}
            >
              {getTabImage(tab.type) ? (
                <Image 
                  source={getTabImage(tab.type)} 
                  style={{ width: 16, height: 16, marginRight: 6, resizeMode: 'contain' }} 
                />
              ) : (
                <Icon name={getTabIcon(tab.type)} size={14} color={isActive ? color : theme.colors.textSecondary} style={{ marginRight: 6 }} />
              )}
              <Text style={[styles.tabText, { color: isActive ? color : theme.colors.textSecondary }]}>
                {tab.name}
              </Text>
              {tab.saveState === 'saving' ? (
                <ActivityIndicator size="small" color={isActive ? color : theme.colors.textSecondary} style={{ marginRight: 6, transform: [{ scale: 0.5 }] }} />
              ) : tab.saveState === 'error' ? (
                <View accessibilityLabel="Save error" style={[styles.dirtyDot, { backgroundColor: '#f44336' }]} />
              ) : (tab.saveState === 'dirty' || tab.isDirty) ? (
                <View accessibilityLabel="Unsaved changes" style={[styles.dirtyDot, { backgroundColor: isActive ? color : theme.colors.textSecondary }]} />
              ) : null}
              <TouchableOpacity onPress={() => onTabClose(tab.id)} style={styles.closeBtn}>
                <Icon name="X" size={14} color={isActive ? theme.colors.textPrimary : theme.colors.textSecondary} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    height: 44,
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  scrollContent: {
    paddingHorizontal: 8,
    alignItems: 'flex-end',
    flexDirection: 'row',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 4,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: 'transparent',
  },
  activeTab: {
    backgroundColor: theme.colors.bgSurface,
  },
  tabText: {
    fontFamily: theme.typography.mono,
    fontSize: 13,
    marginRight: 8,
  },
  dirtyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  closeBtn: {
    padding: 2,
  },
});
