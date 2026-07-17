import React from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';

interface CodeEditorMockProps {
  code: string;
  language: 'html' | 'css' | 'js' | 'jsx' | 'json' | 'markdown';
  onChangeCode: (code: string) => void;
}

export const CodeEditorMock: React.FC<CodeEditorMockProps> = ({ code, language, onChangeCode }) => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);

  const lines = code.split('\n');
  const lineNumbers = Array.from({ length: Math.max(lines.length, 30) }, (_, i) => i + 1);

  const highlightCode = (text: string) => {
    if (!text) return null;
    const tokenRegex = /(['"`].*?['"`]|\b(?:const|let|var|function|return|import|export|from|default|class|interface|type|if|else|for|while|await|async)\b|\b\d+\b|\b(?:true|false|null|undefined)\b|\w+|[^\w\s]+|\s+)/g;
    const tokens = text.match(tokenRegex) || [];
    
    return tokens.map((token, i) => {
      let color = theme.colors.textPrimary;
      if (/^['"`]/.test(token)) {
        color = theme.colors.success; // Strings (Green)
      } else if (/^(const|let|var|function|return|import|export|from|default|class|interface|type|if|else|for|while|await|async)$/.test(token)) {
        color = theme.colors.accentPurple; // Keywords (Purple)
      } else if (/^\d+$/.test(token)) {
        color = theme.colors.accentAmber; // Numbers (Orange)
      } else if (/^(true|false|null|undefined)$/.test(token)) {
        color = theme.colors.accentBlue; // Booleans (Blue)
      } else if (/^[A-Z][a-zA-Z0-9]*$/.test(token) && token.length > 1) {
        color = theme.colors.accentTeal; // Classes/Components (Teal)
      } else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(token)) {
        color = '#9CDCFE'; // Light Blue for variables (VS Code style)
      } else if (/^[^\w\s]+$/.test(token)) {
        color = theme.colors.textSecondary; // Operators and brackets (Gray)
      }

      return <Text key={i} style={{ color }}>{token}</Text>;
    });
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.shortcutBar}>
        {['{', '}', '(', ')', ';', '<', '>', 'Tab'].map((key) => (
          <View key={key} style={styles.shortcutKey}>
            <Text style={styles.shortcutText}>{key}</Text>
          </View>
        ))}
      </View>

      <ScrollView style={styles.editorArea} horizontal>
        <ScrollView style={styles.editorArea}>
          <View style={styles.content}>
            <View style={styles.gutter}>
              {lineNumbers.map(num => (
                <Text key={num} style={styles.lineNumber}>{num}</Text>
              ))}
            </View>
            <View style={styles.inputContainer}>
              <View style={styles.highlightLayer}>
                <Text style={styles.highlightText}>
                  {highlightCode(code)}
                </Text>
              </View>
              <TextInput
                style={styles.input}
                multiline
                value={code}
                onChangeText={onChangeCode}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                textAlignVertical="top"
                placeholderTextColor={theme.colors.textSecondary}
              />
            </View>
          </View>
        </ScrollView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgSurface,
  },
  shortcutBar: {
    flexDirection: 'row',
    height: 40,
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  shortcutKey: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.bgSurface,
    borderRadius: 4,
    marginRight: 6,
  },
  shortcutText: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.mono,
    fontSize: 12,
  },
  editorArea: {
    flex: 1,
  },
  content: {
    flexDirection: 'row',
    minWidth: '100%',
  },
  gutter: {
    width: 40,
    paddingVertical: 16,
    alignItems: 'flex-end',
    paddingRight: 8,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.bgSurface,
  },
  lineNumber: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.mono,
    fontSize: 14,
    lineHeight: 22,
    opacity: 0.5,
  },
  inputContainer: {
    flex: 1,
    minWidth: 800,
    position: 'relative',
  },
  highlightLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
  },
  highlightText: {
    fontFamily: theme.typography.mono,
    fontSize: 14,
    lineHeight: 22,
  },
  input: {
    flex: 1,
    color: 'transparent', // Make text transparent so highlight layer shows through
    fontFamily: theme.typography.mono,
    fontSize: 14,
    lineHeight: 22,
    padding: 16,
  },
});
