import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';

interface ArticleBlock {
  type: 'p' | 'h1' | 'h2' | 'code' | 'li';
  text: string;
}

interface Article {
  id: string;
  title: string;
  content: ArticleBlock[];
}

interface Category {
  id: string;
  title: string;
  icon: string;
  articles: Article[];
}

const DOCS_DATA: Category[] = [
  {
    id: 'start', title: 'Primeiros Passos', icon: 'Rocket',
    articles: [
      {
        id: 'what-is', title: 'O que é o DevFlux?',
        content: [
          { type: 'p', text: 'O DevFlux é a IDE mobile definitiva para desenvolvimento de software direto do seu celular.' },
          { type: 'p', text: 'Desenvolvido para oferecer uma experiência muito próxima ao VS Code no desktop, ele inclui o Monaco Editor, suporte a projetos e controle de versão Git completo.' }
        ]
      },
      {
        id: 'new-project', title: 'Como criar um projeto',
        content: [
          { type: 'p', text: 'Na tela inicial, você verá seus Projetos Recentes. Para começar do zero:' },
          { type: 'li', text: '1. Clique em "Novo arquivo" ou "Criar Novo Projeto".' },
          { type: 'li', text: '2. Escolha o tipo de projeto adequado.' },
          { type: 'li', text: '3. Digite o nome do projeto e comece a codificar.' }
        ]
      }
    ]
  },
  {
    id: 'bridge', title: 'CodeFlex Bridge (Sync PC)', icon: 'RefreshCw',
    articles: [
      {
        id: 'what-is-bridge', title: 'Conectando o celular ao PC',
        content: [
          { type: 'p', text: 'O LiveSync (Bridge) permite que você digite o código no teclado e tela do seu PC e veja as alterações instantaneamente aplicadas no celular.' },
          { type: 'h2', text: 'Como usar' },
          { type: 'li', text: '1. Instale a extensão "CodeFlex Sync" no seu VS Code do computador.' },
          { type: 'li', text: '2. Na tela inicial do DevFlux, toque em "Live Coding / Sync PC".' },
          { type: 'li', text: '3. Aponte a câmera do celular para o QR Code gerado no VS Code.' },
          { type: 'p', text: 'Pronto! Qualquer arquivo modificado no PC será automaticamente refletido no app móvel, garantindo um hot-reload super rápido.' }
        ]
      }
    ]
  },
  {
    id: 'terminal', title: 'Terminal e Comandos', icon: 'Terminal',
    articles: [
      {
        id: 'terminal-intro', title: 'Como usar o Terminal',
        content: [
          { type: 'p', text: 'O Terminal embutido permite que você acompanhe logs de execução, instale pacotes e rode scripts de build.' },
          { type: 'h2', text: 'Acesso Rápido' },
          { type: 'p', text: 'Dentro do editor de código, basta navegar para a aba "Terminal" na barra inferior ou no menu lateral.' },
          { type: 'h2', text: 'Ambientes Node' },
          { type: 'p', text: 'Em projetos baseados em WebContainers, o terminal se comporta como um ambiente Linux real.' },
          { type: 'code', text: 'npm install express\nnode server.js' },
          { type: 'p', text: 'Lembre-se de não rodar processos pesados que consumam muita memória no celular.' }
        ]
      }
    ]
  },
  {
    id: 'git', title: 'Controle de Versão', icon: 'GitBranch',
    articles: [
      {
        id: 'git-usage', title: 'Vincular e Commitar',
        content: [
          { type: 'p', text: 'O DevFlux possui Git nativo via isomorphic-git, permitindo fluxo de trabalho offline.' },
          { type: 'h2', text: 'Como vincular ao GitHub' },
          { type: 'li', text: '1. Abra seu projeto e navegue até a aba "Git".' },
          { type: 'li', text: '2. Insira a URL do seu repositório remoto.' },
          { type: 'li', text: '3. O app listará automaticamente arquivos modificados, adicionados ou deletados.' },
          { type: 'h2', text: 'Diff e Reverter' },
          { type: 'p', text: 'Você pode clicar no ícone de "Visualizar" para comparar exatamente as linhas alteradas lado-a-lado, ou em "Reverter" para descartar e restaurar o arquivo ao estado original (HEAD).' }
        ]
      }
    ]
  },
  {
    id: 'editor', title: 'Editor e Atalhos', icon: 'Code',
    articles: [
      {
        id: 'monaco', title: 'O Poder do Monaco Editor',
        content: [
          { type: 'p', text: 'O editor de código do DevFlux utiliza a mesma engine que alimenta o Visual Studio Code: o Monaco Editor.' },
          { type: 'p', text: 'Ele suporta realce de sintaxe avançado para mais de 50 linguagens, autocompletar inteligente via TypeScript Server e minimapa embutido.' },
          { type: 'h2', text: 'Configurações' },
          { type: 'p', text: 'Navegue até a tela de Configurações (ícone de engrenagem) para personalizar:' },
          { type: 'li', text: '• Tamanho da Fonte (FontSize)' },
          { type: 'li', text: '• Quebra de Linha Automática (WordWrap)' },
          { type: 'li', text: '• Minimapa' },
          { type: 'li', text: '• Temas Claros e Escuros' }
        ]
      }
    ]
  }
];

export default function DocumentacaoScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);

  const currentCat = DOCS_DATA.find(c => c.id === activeCategory);

  const renderCategoryList = () => (
    <View style={styles.categories}>
      {DOCS_DATA.map((cat) => (
        <TouchableOpacity 
          key={cat.id} 
          style={styles.categoryCard}
          onPress={() => setActiveCategory(cat.id)}
        >
          <View style={styles.categoryIcon}>
            <Icon name={cat.icon as any} size={24} color={theme.colors.accentBlue} />
          </View>
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryTitle}>{cat.title}</Text>
            <Text style={styles.categoryCount}>{cat.articles.length} artigos</Text>
          </View>
          <Icon name="ChevronRight" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderArticleList = () => (
    <View style={styles.articleView}>
      <TouchableOpacity 
        style={styles.backToCategories}
        onPress={() => setActiveCategory(null)}
      >
        <Icon name="ArrowLeft" size={20} color={theme.colors.textPrimary} />
        <Text style={styles.backText}>Voltar às categorias</Text>
      </TouchableOpacity>
      
      <Text style={styles.articleListTitle}>Artigos de {currentCat?.title}</Text>
      
      {currentCat?.articles.map((art) => (
        <TouchableOpacity key={art.id} style={styles.articleCard} onPress={() => setActiveArticle(art)}>
          <Icon name="FileText" size={20} color={theme.colors.textSecondary} />
          <Text style={styles.articleTitle}>{art.title}</Text>
          <Icon name="ChevronRight" size={16} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderArticle = () => {
    if (!activeArticle) return null;
    return (
      <View style={styles.articleView}>
        <TouchableOpacity 
          style={styles.backToCategories}
          onPress={() => setActiveArticle(null)}
        >
          <Icon name="ArrowLeft" size={20} color={theme.colors.textPrimary} />
          <Text style={styles.backText}>Voltar para {currentCat?.title}</Text>
        </TouchableOpacity>
        
        <Text style={styles.readingTitle}>{activeArticle.title}</Text>
        
        <View style={styles.readingContent}>
          {activeArticle.content.map((block, idx) => {
            switch(block.type) {
              case 'p':
                return <Text key={idx} style={styles.textP}>{block.text}</Text>;
              case 'h2':
                return <Text key={idx} style={styles.textH2}>{block.text}</Text>;
              case 'li':
                return <Text key={idx} style={styles.textLi}>{block.text}</Text>;
              case 'code':
                return (
                  <View key={idx} style={styles.codeBlock}>
                    <Text style={styles.codeText}>{block.text}</Text>
                  </View>
                );
              default:
                return null;
            }
          })}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Documentação</Text>
        <Text style={styles.subtitle}>Tudo que você precisa para dominar o DevFlux.</Text>
      </View>

      <View style={styles.content}>
        {activeArticle ? renderArticle() : activeCategory ? renderArticleList() : renderCategoryList()}
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
    lineHeight: 20,
  },
  content: {
    paddingHorizontal: 24,
  },
  categories: {
    paddingBottom: 48,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgElevated,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: theme.colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    marginBottom: 4,
  },
  categoryCount: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
  },
  articleView: {
    paddingBottom: 48,
  },
  backToCategories: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 8,
  },
  backText: {
    color: theme.colors.accentBlue,
    fontFamily: theme.typography.ui,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  articleListTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    marginBottom: 16,
  },
  articleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  articleTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    marginLeft: 12,
    flex: 1,
  },
  readingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    marginBottom: 24,
  },
  readingContent: {
    flex: 1,
  },
  textP: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    lineHeight: 24,
    marginBottom: 16,
  },
  textH2: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    marginTop: 16,
    marginBottom: 12,
  },
  textLi: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
    lineHeight: 24,
    marginBottom: 8,
    marginLeft: 8,
  },
  codeBlock: {
    backgroundColor: theme.colors.bgSurface,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 16,
    marginTop: 8,
  },
  codeText: {
    fontFamily: theme.typography.mono,
    fontSize: 13,
    color: theme.colors.accentAmber,
    lineHeight: 20,
  }
});
