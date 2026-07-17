import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon, IconName } from './Icon';
import { useRouter, usePathname, useNavigation } from 'expo-router';
// Removed: import { DrawerActions } from '@react-navigation/native';

interface TabBarProps {
  // If we were using this as a custom tab bar for Expo Router's <Tabs>, 
  // it would receive state, descriptors, navigation.
  // For the visual mock, we can pass items directly or hardcode.
}

const TAB_ITEMS = [
  { name: 'Executar', icon: 'Play', route: '/editor/codigo' },
  { name: 'Terminal', icon: 'Terminal', route: '/editor/terminal' },
  { name: 'Git', icon: 'GitBranch', route: '/editor/git' },
];

export const TabBar: React.FC<TabBarProps> = () => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);

  const router = useRouter();
  const pathname = usePathname();
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      {TAB_ITEMS.map((item) => {
        const isActive = pathname === item.route;
        const color = isActive ? theme.colors.accentBlue : theme.colors.textSecondary;

        return (
          <TouchableOpacity
            key={item.name}
            style={styles.tabItem}
            onPress={() => router.push(item.route as any)}
          >
            <Icon name={item.icon as IconName} size={18} color={color} outline={!isActive} />
            <Text style={[styles.tabLabel, { color }]}>{item.name}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: theme.colors.bgElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingBottom: Platform.OS === 'ios' ? 16 : 8,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 9,
    marginTop: 4,
    fontFamily: theme.typography.ui,
    fontWeight: '500',
  },
});
