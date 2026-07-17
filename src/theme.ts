import { StyleSheet, Platform } from 'react-native';

export const theme = {
  colors: {
    bgPrimary: '#000000',
    bgElevated: '#0A0A0A',
    bgSurface: '#111111',
    accentBlue: '#2563EB',
    accentTeal: '#0EA5A9',
    accentAmber: '#D97706',
    accentPurple: '#7C3AED',
    textPrimary: '#F8FAFC',
    textSecondary: '#A1A1AA',
    border: '#1A1A1A',
    error: '#EF4444',
    success: '#10B981',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radii: {
    sm: 8,
    md: 12,
    full: 9999,
  },
  typography: {
    mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    ui: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }) as string,
    uiBold: Platform.select({ ios: 'System', android: 'sans-serif-medium', default: 'system-ui' }) as string,
  },
};

export type AppTheme = typeof theme;

export const darkTheme: AppTheme = theme;

export const lightTheme: AppTheme = {
  colors: {
    bgPrimary: '#F8FAFC',
    bgElevated: '#FFFFFF',
    bgSurface: '#F1F5F9', // light gray for surface
    accentBlue: '#2563EB',
    accentTeal: '#0EA5A9',
    accentAmber: '#D97706',
    accentPurple: '#7C3AED',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    border: '#CBD5E1',
    error: '#EF4444',
    success: '#10B981',
  },
  spacing: theme.spacing,
  radii: theme.radii,
  typography: theme.typography,
};
