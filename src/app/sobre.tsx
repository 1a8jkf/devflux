import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';

export default function SobreScreen() {
  const { theme, variant } = useAppTheme();
  const styles = getStyles(theme);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.hero}>
        <Image 
          source={require('../../assets/top-bar-icon.png')} 
          style={{ width: 48, height: 48, resizeMode: 'contain', marginRight: 16 }} 
        />
        <Text style={styles.title}>CodeFlex</Text>
        <Text style={styles.version}>Versão 1.0.0 (Build 42)</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.description}>
          O CodeFlex é a primeira IDE mobile de nível corporativo focada na tríade: Sincronização em tempo real (Bridge), Inteligência Artificial Integrada e Execução Local.
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.linksCard}>
          <TouchableOpacity style={styles.linkRow}>
            <View style={styles.linkLeft}>
              <Icon name="Globe" size={20} color={theme.colors.textPrimary} />
              <Text style={styles.linkText}>Site Oficial</Text>
            </View>
            <Icon name="ExternalLink" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.linkRow}>
            <View style={styles.linkLeft}>
              <Icon name="Twitter" size={20} color={theme.colors.textPrimary} />
              <Text style={styles.linkText}>@CodeFlexIDE</Text>
            </View>
            <Icon name="ExternalLink" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.linkRow, styles.lastLinkRow]}>
            <View style={styles.linkLeft}>
              <Icon name="Shield" size={20} color={theme.colors.textPrimary} />
              <Text style={styles.linkText}>Política de Privacidade</Text>
            </View>
            <Icon name="ExternalLink" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>© 2026 CodeFlex Inc.</Text>
        <Text style={styles.footerText}>Feito com ♥ para desenvolvedores.</Text>
      </View>
    </ScrollView>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 32,
  },
  logo: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    marginBottom: 4,
  },
  version: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  description: {
    fontSize: 15,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    lineHeight: 24,
    textAlign: 'center',
  },
  linksCard: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  lastLinkRow: {
    borderBottomWidth: 0,
  },
  linkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkText: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    fontSize: 15,
    marginLeft: 12,
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
    paddingBottom: 48,
  },
  footerText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    marginTop: 4,
  },
});
