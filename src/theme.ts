import { StyleSheet, Platform } from 'react-native';

// ─── Base Structure ───
const baseSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

const baseRadii = {
  sm: 8,
  md: 12,
  full: 9999,
};

const baseTypography = {
  mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  ui: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }) as string,
  uiBold: Platform.select({ ios: 'System', android: 'sans-serif-medium', default: 'system-ui' }) as string,
};

// ─── Theme Colors Interface ───
interface ThemeColors {
  bgPrimary: string;
  bgElevated: string;
  bgSurface: string;
  accentBlue: string;
  accentTeal: string;
  accentAmber: string;
  accentPurple: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
  accentGreen: string;
  accentRed: string;
  accentYellow: string;
}

export interface AppTheme {
  colors: ThemeColors;
  spacing: typeof baseSpacing;
  radii: typeof baseRadii;
  typography: typeof baseTypography;
}

const makeTheme = (colors: ThemeColors): AppTheme => ({
  colors,
  spacing: baseSpacing,
  radii: baseRadii,
  typography: baseTypography,
});

// ─── Theme Definitions ───

// 1. DevFlux Dark (Default — OLED Black)
export const devfluxDarkTheme = makeTheme({
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
  accentGreen: '#10B981',
  accentRed: '#EF4444',
  accentYellow: '#FBBF24',
});

// 2. DevFlux Light
export const devfluxLightTheme = makeTheme({
  bgPrimary: '#F8FAFC',
  bgElevated: '#FFFFFF',
  bgSurface: '#F1F5F9',
  accentBlue: '#2563EB',
  accentTeal: '#0EA5A9',
  accentAmber: '#D97706',
  accentPurple: '#7C3AED',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  border: '#CBD5E1',
  error: '#EF4444',
  success: '#10B981',
  accentGreen: '#10B981',
  accentRed: '#EF4444',
  accentYellow: '#F59E0B',
});

// 3. Dracula
export const draculaTheme = makeTheme({
  bgPrimary: '#282A36',
  bgElevated: '#21222C',
  bgSurface: '#343746',
  accentBlue: '#8BE9FD',
  accentTeal: '#50FA7B',
  accentAmber: '#FFB86C',
  accentPurple: '#BD93F9',
  textPrimary: '#F8F8F2',
  textSecondary: '#6272A4',
  border: '#44475A',
  error: '#FF5555',
  success: '#50FA7B',
  accentGreen: '#50FA7B',
  accentRed: '#FF5555',
  accentYellow: '#F1FA8C',
});

// 4. Nord
export const nordTheme = makeTheme({
  bgPrimary: '#2E3440',
  bgElevated: '#3B4252',
  bgSurface: '#434C5E',
  accentBlue: '#88C0D0',
  accentTeal: '#8FBCBB',
  accentAmber: '#EBCB8B',
  accentPurple: '#B48EAD',
  textPrimary: '#ECEFF4',
  textSecondary: '#D8DEE9',
  border: '#4C566A',
  error: '#BF616A',
  success: '#A3BE8C',
  accentGreen: '#A3BE8C',
  accentRed: '#BF616A',
  accentYellow: '#EBCB8B',
});

// 5. Catppuccin Mocha
export const catppuccinTheme = makeTheme({
  bgPrimary: '#1E1E2E',
  bgElevated: '#181825',
  bgSurface: '#313244',
  accentBlue: '#89B4FA',
  accentTeal: '#94E2D5',
  accentAmber: '#FAB387',
  accentPurple: '#CBA6F7',
  textPrimary: '#CDD6F4',
  textSecondary: '#A6ADC8',
  border: '#45475A',
  error: '#F38BA8',
  success: '#A6E3A1',
  accentGreen: '#A6E3A1',
  accentRed: '#F38BA8',
  accentYellow: '#F9E2AF',
});

// 6. GitHub Dark
export const githubDarkTheme = makeTheme({
  bgPrimary: '#0D1117',
  bgElevated: '#161B22',
  bgSurface: '#21262D',
  accentBlue: '#58A6FF',
  accentTeal: '#3FB950',
  accentAmber: '#D29922',
  accentPurple: '#BC8CFF',
  textPrimary: '#E6EDF3',
  textSecondary: '#8B949E',
  border: '#30363D',
  error: '#F85149',
  success: '#3FB950',
  accentGreen: '#3FB950',
  accentRed: '#F85149',
  accentYellow: '#D29922',
});

// 7. Solarized Dark
export const solarizedDarkTheme = makeTheme({
  bgPrimary: '#002B36',
  bgElevated: '#073642',
  bgSurface: '#094959',
  accentBlue: '#268BD2',
  accentTeal: '#2AA198',
  accentAmber: '#B58900',
  accentPurple: '#6C71C4',
  textPrimary: '#FDF6E3',
  textSecondary: '#839496',
  border: '#0A4F5C',
  error: '#DC322F',
  success: '#859900',
  accentGreen: '#859900',
  accentRed: '#DC322F',
  accentYellow: '#B58900',
});

// 8. One Dark Pro
export const oneDarkProTheme = makeTheme({
  bgPrimary: '#282C34',
  bgElevated: '#21252B',
  bgSurface: '#2C313A',
  accentBlue: '#61AFEF',
  accentTeal: '#56B6C2',
  accentAmber: '#D19A66',
  accentPurple: '#C678DD',
  textPrimary: '#ABB2BF',
  textSecondary: '#5C6370',
  border: '#3E4451',
  error: '#E06C75',
  success: '#98C379',
  accentGreen: '#98C379',
  accentRed: '#E06C75',
  accentYellow: '#E5C07B',
});

// ─── Theme Registry ───
export type ThemeId = 'devflux-dark' | 'devflux-light' | 'dracula' | 'nord' | 'catppuccin' | 'github-dark' | 'solarized-dark' | 'one-dark-pro';

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  isDark: boolean;
  theme: AppTheme;
  preview: string[]; // 4 preview colors
}

export const THEME_LIST: ThemeInfo[] = [
  { id: 'devflux-dark', name: 'DevFlux Dark', isDark: true, theme: devfluxDarkTheme, preview: ['#000000', '#2563EB', '#0EA5A9', '#7C3AED'] },
  { id: 'devflux-light', name: 'DevFlux Light', isDark: false, theme: devfluxLightTheme, preview: ['#F8FAFC', '#2563EB', '#0EA5A9', '#7C3AED'] },
  { id: 'dracula', name: 'Dracula', isDark: true, theme: draculaTheme, preview: ['#282A36', '#BD93F9', '#50FA7B', '#FF79C6'] },
  { id: 'nord', name: 'Nord', isDark: true, theme: nordTheme, preview: ['#2E3440', '#88C0D0', '#A3BE8C', '#B48EAD'] },
  { id: 'catppuccin', name: 'Catppuccin Mocha', isDark: true, theme: catppuccinTheme, preview: ['#1E1E2E', '#89B4FA', '#94E2D5', '#CBA6F7'] },
  { id: 'github-dark', name: 'GitHub Dark', isDark: true, theme: githubDarkTheme, preview: ['#0D1117', '#58A6FF', '#3FB950', '#BC8CFF'] },
  { id: 'solarized-dark', name: 'Solarized Dark', isDark: true, theme: solarizedDarkTheme, preview: ['#002B36', '#268BD2', '#2AA198', '#6C71C4'] },
  { id: 'one-dark-pro', name: 'One Dark Pro', isDark: true, theme: oneDarkProTheme, preview: ['#282C34', '#61AFEF', '#98C379', '#C678DD'] },
];

export const getThemeById = (id: ThemeId): AppTheme => {
  return THEME_LIST.find(t => t.id === id)?.theme || devfluxDarkTheme;
};

export const getThemeInfo = (id: ThemeId): ThemeInfo => {
  return THEME_LIST.find(t => t.id === id) || THEME_LIST[0];
};

// Legacy exports for backward compatibility
export const theme = devfluxDarkTheme;
export const darkTheme = devfluxDarkTheme;
export const lightTheme = devfluxLightTheme;
