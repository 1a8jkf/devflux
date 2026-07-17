import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';

export default function EditorLayout() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);

  return (
    <View style={styles.container}>
      <View style={styles.mainContent}>
        <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
          <Stack.Screen name="codigo" />
          <Stack.Screen name="terminal" />
          <Stack.Screen name="git" />
          <Stack.Screen name="debug" />
          <Stack.Screen name="configuracoes" />
        </Stack>
      </View>
    </View>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  mainContent: {
    flex: 1,
  },
});
