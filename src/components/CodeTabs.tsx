import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon, IconName } from './Icon';

interface Tab {
  id: string;
  name: string;
  type: 'html' | 'css' | 'js' | 'jsx' | 'json' | 'markdown';
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
    case 'js': return theme.colors.accentTeal;
    case 'jsx': return theme.colors.accentAmber;
    case 'json': return theme.colors.textPrimary;
    case 'markdown': return theme.colors.textSecondary;
    default: return theme.colors.textPrimary;
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
              <Text style={[styles.tabText, { color: isActive ? color : theme.colors.textSecondary }]}>
                {tab.name}
              </Text>
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
  closeBtn: {
    padding: 2,
  },
});
