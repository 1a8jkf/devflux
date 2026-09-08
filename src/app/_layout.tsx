import '../polyfills/globals';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Modal, TextInput, PermissionsAndroid, NativeModules, Platform, BackHandler, StatusBar as NativeStatusBar } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAppTheme, ThemeProvider } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { FileTree } from '../components/FileTree';
import { EditorSidebar } from '../components/EditorSidebar';
import { useRouter, usePathname, useNavigation, useGlobalSearchParams } from 'expo-router';
import { Icon } from '../components/Icon';
import { CommandPaletteProvider, useCommandPalette } from '../contexts/CommandPaletteContext';
import { SettingsProvider } from '../contexts/SettingsContext';
import { AISettingsProvider } from '../contexts/AISettingsContext';
import { AIProvider } from '../contexts/AIContext';
import { CommandPalette } from '../components/CommandPalette';
import { KeyboardToolbar } from '../components/KeyboardToolbar';
import { LanguageProvider, useLanguage } from '../contexts/LanguageContext';
import { AppSetupGate } from '../components/InitialSetup/AppSetupGate';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MOCK_FILES = [
  {
    id: 'src',
    name: 'src',
    type: 'directory' as const,
    isExpanded: true,
    children: [
      {
        id: 'components',
        name: 'components',
        type: 'directory' as const,
        isExpanded: false,
        children: [
          { id: 'Header.jsx', name: 'Header.jsx', type: 'file' as const, fileType: 'jsx' as const },
          { id: 'Button.jsx', name: 'Button.jsx', type: 'file' as const, fileType: 'jsx' as const },
        ]
      },
      { id: 'App.jsx', name: 'App.jsx', type: 'file' as const, fileType: 'jsx' as const },
      { id: 'index.css', name: 'index.css', type: 'file' as const, fileType: 'css' as const },
    ]
  },
  { id: 'index.html', name: 'index.html', type: 'file' as const, fileType: 'html' as const },
  { id: 'package.json', name: 'package.json', type: 'file' as const, fileType: 'json' as const },
  { id: 'README.md', name: 'README.md', type: 'file' as const, fileType: 'markdown' as const },
];

function CustomDrawerContent(props: any) {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [showGithubModal, setShowGithubModal] = React.useState(false);
  const [githubTokenInput, setGithubTokenInput] = React.useState('');
  const [githubUser, setGithubUser] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    import('../services/GithubService').then(({ GithubService }) => {
      GithubService.getUser().then(setGithubUser).catch(() => setGithubUser(null));

      const unsubscribe = GithubService.subscribe(() => {
        GithubService.getUser().then(setGithubUser).catch(() => setGithubUser(null));
      });
      return unsubscribe;
    });
  }, []);

  const handleConnectGithub = async () => {
    setIsLoading(true);
    try {
      const { GithubService } = await import('../services/GithubService');
      await GithubService.setToken(githubTokenInput);
      const user = await GithubService.getUser();
      setGithubUser(user);
      setShowGithubModal(false);
      setGithubTokenInput('');
    } catch (e) {
      alert(t('drawer.invalidToken', 'Token inválido ou erro de conexão.'));
      const { GithubService } = await import('../services/GithubService');
      await GithubService.removeToken();
    } finally {
      setIsLoading(false);
    }
  };

  const isEditor = pathname.startsWith('/editor');

  type MenuOption = {
    label: string;
    icon: string;
    route?: string | null;
    action?: string;
  };

  const MENU_OPTIONS: MenuOption[] = githubUser ? [
    { label: 'Início', icon: 'Home', route: '/' },
    { label: 'Repositórios', icon: 'FolderGit2', route: '/github/repos' },
    { label: 'Pull Requests', icon: 'GitPullRequest', route: '/github/prs' },
    { label: 'Issues', icon: 'AlertCircle', route: '/github/issues' },
    { label: 'Meus Gists', icon: 'Code', route: '/github/gists' },
    { label: 'Favoritos', icon: 'Star', route: '/github/starred' },
    { label: 'Sair da Conta', icon: 'LogOut', action: 'logout' },
  ] : [
    { label: 'Home', icon: 'Home', route: '/' },
    { label: 'Configurações Gerais', icon: 'Settings', route: '/editor/configuracoes' },
    { label: 'Plugins', icon: 'Puzzle', route: null },
    { label: 'Novo Projeto', icon: 'FolderPlus', route: '/projetos' },
  ];

  return (
    <View style={styles.drawerContainer}>
      {isEditor ? (
        <EditorSidebar
          onClose={() => props.navigation.closeDrawer()}
          onOpenDrawer={() => setShowGithubModal(true)}
        />
      ) : (
        <>
          <TouchableOpacity style={[styles.drawerUserSection, { paddingTop: insets.top + 16 }]} onPress={() => {
        if (!githubUser) setShowGithubModal(true);
      }}>
        {githubUser ? (
          <>
            <Image source={{ uri: githubUser.avatar_url }} style={styles.userAvatarImage} />
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{githubUser.name || githubUser.login}</Text>
              <Text style={styles.userSub}>@{githubUser.login}</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.userAvatar}>
              <Icon name="GitBranch" size={24} color={theme.colors.bgPrimary} />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{t('drawer.connectGithub', 'Conectar GitHub')}</Text>
              <Text style={styles.userSub}>{t('drawer.syncRepos', 'Sincronize repositórios')}</Text>
            </View>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.menuSection}>
        {MENU_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.label}
            style={styles.menuOption}
            onPress={() => {
              if (opt.action === 'logout') {
                import('../services/GithubService').then(({ GithubService }) => {
                  GithubService.removeToken();
                });
              } else if (opt.route) {
                router.navigate(opt.route as any);
                props.navigation.closeDrawer();
              }
            }}
          >
            <Icon name={opt.icon as any} size={18} color={theme.colors.textSecondary} />
            <Text style={styles.menuOptionText}>{t(opt.label)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      </>
      )}

      {/* GitHub Modal always rendered */}
      <Modal visible={showGithubModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('drawer.connectGithubTitle', 'Conectar ao GitHub')}</Text>
            <Text style={styles.modalSub}>
              {t('drawer.connectGithubSub', 'Para acessar seus repositórios, insira um Personal Access Token (classic) com permissão de "repo".')}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              placeholderTextColor={theme.colors.textSecondary}
              value={githubTokenInput}
              onChangeText={setGithubTokenInput}
              secureTextEntry
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowGithubModal(false)}>
                <Text style={styles.modalBtnText}>{t('Cancelar')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleConnectGithub}>
                <Text style={styles.modalBtnTextPrimary}>{isLoading ? t('drawer.connectingBtn', 'Conectando...') : t('drawer.connectBtn', 'Conectar')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InnerLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const { openPalette } = useCommandPalette();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  useEffect(() => {
    const startForegroundService = async () => {
      if (Platform.OS === 'android') {
        try {
          if (Platform.Version >= 33) {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
              {
                title: t('Permissão de Notificação'),
                message: t('DevFlux precisa exibir uma notificação para manter o servidor web rodando em segundo plano.'),
                buttonNeutral: t('Depois'),
                buttonNegative: t('Cancelar'),
                buttonPositive: t('OK'),
              }
            );
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
              return;
            }
          }
        } catch (err) {
          console.warn(err);
        }
      }
    };
    startForegroundService();
  }, []);

  // Android hardware back button handler
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onBackPress = () => {
      const isRoot = pathname === '/' || pathname === '/index';
      if (isRoot) {
        return false; // Allow default behavior (exit app)
      }
      if (router.canGoBack()) {
        router.back();
        return true; // Prevent default
      }
      // If can't go back but not on root, navigate to root
      router.replace('/');
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [pathname, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
      <NativeStatusBar barStyle="light-content" backgroundColor={theme.colors.bgElevated} translucent={false} />
      <CommandPalette />
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={({ navigation }) => {
          const hideHeaderPaths = ['/editor/codigo', '/novo-projeto', '/onboarding', '/ai-panel', '/debug'];
          return {
          headerShown: !hideHeaderPaths.includes(pathname) && !pathname.startsWith('/database/terminal') && !pathname.startsWith('/editor/terminal'),
          headerStatusBarHeight: Platform.OS === 'android' ? Math.max(insets.top, 24) : insets.top,
          headerStyle: {
            backgroundColor: theme.colors.bgElevated,
            minHeight: Platform.OS === 'android' ? 56 + Math.max(insets.top, 24) : undefined,
            borderBottomWidth: 0,
            shadowOpacity: 0,
            elevation: 0,
          },
          headerTintColor: theme.colors.textPrimary,
          headerLeft: () => {
            const isEditorCode = pathname === '/editor/codigo';
            const isRoot = pathname === '/' || pathname === '/index';
            const canGoBack = router.canGoBack();

            if (isEditorCode) {
              return (
                <TouchableOpacity
                  style={{ marginLeft: 16, marginRight: 8 }}
                  onPress={() => navigation.toggleDrawer()}
                >
                  <Icon name="MoreVertical" size={22} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              );
            }

            if (canGoBack && !isRoot) {
              return (
                <TouchableOpacity
                  onPress={() => router.back()}
                  style={{ marginLeft: 16 }}
                >
                  <Icon name="ArrowLeft" size={24} color={theme.colors.textPrimary} />
                </TouchableOpacity>
              );
            }

            if (isRoot) {
              return null;
            }

            return (
              <TouchableOpacity onPress={() => navigation.toggleDrawer()} style={{ marginLeft: 16 }}>
                <Icon name="Menu" size={24} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            );
          },
          headerTitleAlign: 'left',
          headerTitle: (props) => {
            const isRoot = pathname === '/' || pathname === '/index';
            if (isRoot) {
              return (
                <Image
                  source={require('../../assets/images/devflux-logo.png')}
                  style={{ width: 36, height: 36, resizeMode: 'contain', marginLeft: 4 }}
                />
              );
            }
            const fallbackTitles: Record<string, string> = {
              '/editor/configuracoes': 'Configurações Gerais',
            };
            const title = typeof props.children === 'string' && props.children.trim()
              ? props.children
              : fallbackTitles[pathname] || 'DevFlux';
            return (
              <Text
                numberOfLines={1}
                style={{ color: theme.colors.textPrimary, fontSize: 18, fontFamily: theme.typography.uiBold }}
              >
                {title}
              </Text>
            );
          },
          headerRight: () => (
            <TouchableOpacity onPress={openPalette} style={{ marginRight: 16 }}>
              <Icon name="Search" size={20} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          ),
          drawerStyle: {
            backgroundColor: theme.colors.bgElevated,
            width: 280,
          },
          sceneStyle: {
            backgroundColor: theme.colors.bgPrimary,
          }
        };
        }}
      >
        <Drawer.Screen name="index" options={{ title: t('drawer.titles.home', 'DevFlux'), headerShown: true }} />
        <Drawer.Screen name="github/repos" options={{ title: t('drawer.titles.repos', 'Repositórios'), headerShown: true }} />
        <Drawer.Screen name="github/prs" options={{ title: t('drawer.titles.prs', 'Pull Requests'), headerShown: true }} />
        <Drawer.Screen name="github/issues" options={{ title: t('drawer.titles.issues', 'Issues'), headerShown: true }} />
        <Drawer.Screen name="github/gists" options={{ title: t('drawer.titles.gists', 'Meus Gists'), headerShown: true }} />
        <Drawer.Screen name="github/starred" options={{ title: t('drawer.titles.starred', 'Favoritos'), headerShown: true }} />
        <Drawer.Screen name="projetos" options={{ title: t('drawer.titles.projects', 'Projetos'), headerShown: true }} />
        <Drawer.Screen name="editor" options={{ title: t('drawer.titles.editor', 'Editor'), headerShown: true }} />
        <Drawer.Screen name="editor/configuracoes" options={{ title: t('drawer.titles.settings', 'Configurações Gerais'), headerShown: true }} />
        <Drawer.Screen name="database/index" options={{ title: t('drawer.titles.database', 'Terminal SQL (DB)'), headerShown: true }} />
        <Drawer.Screen name="debug" options={{ title: t('drawer.titles.debug', 'Debug'), headerShown: false }} />
        <Drawer.Screen name="ai-panel" options={{ title: t('drawer.titles.aiPanel', 'Assistente (BYOK)'), headerShown: false }} />
        <Drawer.Screen name="ai-settings" options={{ title: t('drawer.titles.aiSettings', 'Provedores de IA'), headerShown: true }} />
        <Drawer.Screen name="bridge" options={{ title: t('drawer.titles.bridge', 'DevFlux Bridge'), headerShown: true }} />
        <Drawer.Screen name="ajuda" options={{ title: t('drawer.titles.help', 'Ajuda'), headerShown: true }} />
        <Drawer.Screen name="sobre" options={{ title: t('drawer.titles.about', 'Sobre'), headerShown: true }} />
        <Drawer.Screen name="suporte" options={{ title: t('drawer.titles.support', 'Suporte'), headerShown: true }} />
        <Drawer.Screen name="documentacao" options={{ title: t('drawer.titles.docs', 'Documentação'), headerShown: true }} />
        <Drawer.Screen name="servers" options={{ title: t('drawer.titles.servers', 'Gerenciador de Servidores'), headerShown: true }} />
        <Drawer.Screen name="ssh" options={{ title: t('drawer.titles.ssh', 'Conexão SSH Remota'), headerShown: false }} />
        <Drawer.Screen name="shell" options={{ title: t('drawer.titles.shell', 'Terminal Linux'), headerShown: false }} />
        <Drawer.Screen name="onboarding" options={{ title: t('drawer.titles.onboarding', 'Onboarding'), headerShown: false }} />
      </Drawer>
      <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} pointerEvents="box-none">
        <KeyboardToolbar />
      </View>
    </GestureHandlerRootView>
  );
}

// Catch any errors thrown by the Layout component
export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <SettingsProvider>
          <AISettingsProvider>
            <AIProvider>
              <CommandPaletteProvider>
                <AppSetupGate>
                  <InnerLayout />
                </AppSetupGate>
              </CommandPaletteProvider>
            </AIProvider>
          </AISettingsProvider>
        </SettingsProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  drawerContainer: {
    flex: 1,
    backgroundColor: theme.colors.bgElevated,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.bgPrimary,
  },
  drawerTitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    fontFamily: theme.typography.ui,
  },
  drawerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  drawerUserSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.bgPrimary,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  userInfo: {
    marginLeft: 12,
  },
  userName: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontFamily: theme.typography.uiBold,
  },
  userSub: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontFamily: theme.typography.ui,
  },
  menuSection: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuOptionText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontFamily: theme.typography.ui,
    marginLeft: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontFamily: theme.typography.uiBold,
    marginBottom: 8,
  },
  modalSub: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontFamily: theme.typography.ui,
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: theme.colors.bgPrimary,
    color: theme.colors.textPrimary,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    fontFamily: theme.typography.mono,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalBtnCancel: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginRight: 12,
  },
  modalBtnPrimary: {
    backgroundColor: theme.colors.accentBlue,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  modalBtnText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.uiBold,
  },
  modalBtnTextPrimary: {
    color: '#FFF',
    fontFamily: theme.typography.uiBold,
  }
});
