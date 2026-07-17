import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { useRouter } from 'expo-router';

const FAQ_ITEMS = [
  { q: 'O que é o DevFlux?', a: 'O DevFlux é uma IDE completa para celular focada em desenvolvimento Web, Node e React, trazendo o poder do VS Code (Monaco Editor) e ferramentas como Git e Terminal para a palma da sua mão.' },
  { q: 'Como sincronizo com o PC?', a: 'Use a aba "Live Coding / Sync PC" na tela inicial, escaneie o QR Code com a nossa extensão do VS Code e comece a programar no PC enquanto vê as atualizações instantaneamente no celular.' },
  { q: 'Quais linguagens e frameworks são suportados?', a: 'Suportamos HTML, CSS, JavaScript, TypeScript, React, React Native (via Expo Web), Vue, Node.js e muito mais, contando com realce de sintaxe e autocompletar avançado.' },
  { q: 'Como usar a IA embutida?', a: 'Toque no ícone de IA (Sparkles) no menu inferior ou lateral. A inteligência artificial (CodeFlex AI) lerá o contexto do seu projeto e poderá gerar códigos, corrigir bugs e explicar funções.' },
  { q: 'Onde meus arquivos são salvos?', a: 'Eles ficam salvos localmente na sandbox do aplicativo. Você também pode importar projetos de pastas externas usando a Storage Access Framework no Android, ou vincular repositórios do GitHub.' },
  { q: 'O Terminal executa comandos reais?', a: 'Sim! Em projetos baseados em WebContainers (Node), o terminal executa um ambiente bash em webassembly. Em projetos normais, ele interage com as APIs de ferramentas embutidas como o isomorphic-git.' }
];

export default function AjudaScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);

  const router = useRouter();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Central de Ajuda</Text>
        <Text style={styles.subtitle}>Como podemos ajudar você hoje?</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Perguntas Frequentes (FAQ)</Text>
        {FAQ_ITEMS.map((item, idx) => (
          <View key={idx} style={styles.faqCard}>
            <Text style={styles.faqQ}>{item.q}</Text>
            <Text style={styles.faqA}>{item.a}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Suporte</Text>
        <TouchableOpacity style={styles.supportCard} onPress={() => router.push('/suporte')}>
          <Icon name="MessageSquare" size={24} color={theme.colors.accentBlue} />
          <View style={styles.supportInfo}>
            <Text style={styles.supportTitle}>Falar com Suporte</Text>
            <Text style={styles.supportDesc}>Tempo médio de resposta: 2h</Text>
          </View>
          <Icon name="ChevronRight" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.supportCard} onPress={() => router.push('/documentacao')}>
          <Icon name="BookOpen" size={24} color={theme.colors.accentAmber} />
          <View style={styles.supportInfo}>
            <Text style={styles.supportTitle}>Documentação Oficial</Text>
            <Text style={styles.supportDesc}>Guias detalhados e API</Text>
          </View>
          <Icon name="ChevronRight" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
  },
  section: {
    padding: 24,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    marginBottom: 16,
  },
  faqCard: {
    backgroundColor: theme.colors.bgElevated,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  faqQ: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    marginBottom: 8,
  },
  faqA: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    lineHeight: 20,
  },
  supportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgElevated,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  supportInfo: {
    flex: 1,
    marginLeft: 16,
  },
  supportTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
  },
  supportDesc: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    marginTop: 4,
  },
});
