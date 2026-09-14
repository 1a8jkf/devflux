import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from './Icon';

interface ChatBubbleProps {
  message: string;
  isUser: boolean;
  hasCodeBlock?: boolean;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, isUser, hasCodeBlock }) => {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.aiContainer]}>
      {!isUser && (
        <View style={styles.aiAvatar}>
          <Icon name="Sparkles" size={16} color={theme.colors.bgPrimary} outline={false} />
        </View>
      )}
      
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        {hasCodeBlock ? (
          <View>
            <Text style={[styles.text, isUser ? styles.userText : styles.aiText]}>
              {message.split('```')[0]}
            </Text>
            <View style={styles.codeBlock}>
              <Text style={styles.codeText}>{message.split('```')[1]}</Text>
            </View>
            <Text style={[styles.text, isUser ? styles.userText : styles.aiText]}>
              {message.split('```')[2]}
            </Text>
          </View>
        ) : (
          <Text style={[styles.text, isUser ? styles.userText : styles.aiText]}>{message}</Text>
        )}
      </View>
    </View>
  );
};

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 16,
    maxWidth: '85%',
  },
  userContainer: {
    alignSelf: 'flex-end',
  },
  aiContainer: {
    alignSelf: 'flex-start',
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.accentPurple,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 4,
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: theme.colors.accentBlue,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: theme.colors.bgElevated,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  text: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: '#FFFFFF',
  },
  aiText: {
    color: theme.colors.textPrimary,
  },
  codeBlock: {
    backgroundColor: theme.colors.bgSurface,
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  codeText: {
    fontFamily: theme.typography.mono,
    color: theme.colors.accentTeal,
    fontSize: 12,
  },
});
