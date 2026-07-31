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
    const tokenRegex = /(['"`].*?['"`]|\b(?:const|let|var|function|return|import|export|from|default|class|interface|type|if|else|for|while|await|async)\b|\b\d+\b|\b(?:true|false|null|undefined)\b|\b(?:document|window|console|Math|Object|Array|String)\b|\w+|[^\w\s]+|\s+)/g;
    const tokens = text.match(tokenRegex) || [];
    
    return tokens.map((token, i) => {
      let color = '#d4d4d4'; // Default text color
      if (/^['"`]/.test(token)) {
        color = '#ce9178'; // Strings (Orange/Brown)
      } else if (/^(const|let|var|function|return|import|export|from|default|class|interface|type|if|else|for|while|await|async)$/.test(token)) {
        color = '#c586c0'; // Keywords (Purple)
      } else if (/^\d+$/.test(token)) {
        color = '#b5cea8'; // Numbers (Green)
      } else if (/^(true|false|null|undefined)$/.test(token)) {
        color = '#569cd6'; // Booleans (Blue)
      } else if (/^(document|window|console|Math|Object|Array|String)$/.test(token)) {
        color = '#4EC9B0'; // Native classes (Teal)
      } else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(token)) {
        color = '#9cdcfe'; // Variables (Light Blue)
      } else if (/^[^\w\s]+$/.test(token)) {
        color = '#d4d4d4'; // Operators (Gray)
      }

      return <Text key={i} style={{ color }}>{token}</Text>;
    });
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
    paddingTop: 16,
    paddingBottom: 16,
    margin: 0,
  },
  highlightText: {
    fontFamily: theme.typography.mono,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '400',
    letterSpacing: 0,
  },
  input: {
    flex: 1,
    color: 'transparent',
    fontFamily: theme.typography.mono,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '400',
    letterSpacing: 0,
    padding: 16,
    paddingTop: 16,
    paddingBottom: 16,
    margin: 0,
  },
});
