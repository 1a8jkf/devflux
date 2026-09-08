import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSettings } from '../../contexts/SettingsContext';
import { Icon } from '../Icon';

const CORE_SETUP_PACKAGES = ['nodejs', 'npm', 'git', 'python3', 'build-base', 'curl', 'wget', 'openssh-client', 'sshpass'];

const OPTIONAL_PACKAGES = [
  { id: 'nodejs', label: 'Node.js', desc: 'Runtime JavaScript' },
  { id: 'npm', label: 'NPM', desc: 'Gerenciador de pacotes' },
  { id: 'git', label: 'Git', desc: 'Controle de versão' },
  { id: 'python3', label: 'Python 3', desc: 'Linguagem de programação' },
  { id: 'build-base', label: 'Build Tools', desc: 'gcc, make, etc.' },
  { id: 'curl', label: 'cURL', desc: 'Transferência de dados' },
  { id: 'wget', label: 'Wget', desc: 'Download de arquivos' },
  { id: 'nano', label: 'Nano', desc: 'Editor de texto' },
  { id: 'vim', label: 'Vim', desc: 'Editor avançado' },
  { id: 'openssh-client', label: 'OpenSSH', desc: 'Cliente SSH/SCP para VPS' },
  { id: 'sshpass', label: 'sshpass', desc: 'Login SSH com senha no app' },
];

export const AppSetupGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useAppTheme();
  const { t } = useLanguage();
  const styles = getStyles(theme);

  const [setupStep, setSetupStep] = React.useState<0 | 1 | 2 | 3>(1);
  const [showSetupModal, setShowSetupModal] = React.useState(false);
  const [setupRunning, setSetupRunning] = React.useState(false);
  const [setupLog, setSetupLog] = React.useState('');
  const [selectedSetupPackages, setSelectedSetupPackages] = React.useState<string[]>(CORE_SETUP_PACKAGES);
  const [installedPackages, setInstalledPackages] = React.useState<Record<string, boolean>>({});
  const [isEnvironmentReady, setIsEnvironmentReady] = React.useState(false);

  // Step 0: Editor configuration state
  const { settings, updateSettings } = useSettings();
  const [step0Engine, setStep0Engine] = React.useState<'monaco' | 'lightweight'>(settings.editorEngine || 'monaco');
  const [step0FontSize, setStep0FontSize] = React.useState<number>(settings.fontSize || 14);
  const [previewLine, setPreviewLine] = React.useState(0);

  // Animated code preview lines
  const PREVIEW_LINES = [
    'const devflux = "Your IDE on Android";',
    '',
    'function start() {',
    '  console.log(devflux);',
    '  return true;',
    '}',
    '',
    'start();',
  ];

  // Animate the preview to look "alive"
  useEffect(() => {
    if (showSetupModal && setupStep === 0) {
      const interval = setInterval(() => {
        setPreviewLine(prev => (prev + 1) % PREVIEW_LINES.length);
      }, 900);
      return () => clearInterval(interval);
    }
  }, [showSetupModal, setupStep]);

  useEffect(() => {
    let cancelled = false;

    const requestNodeMessage = async (message: Record<string, unknown>, expectedType: string, timeoutMs = 15000) => {
      const { NodeRunner } = await import('../../utils/nodeRunner');
      await NodeRunner.waitForEnvironment();
      const reqId = `${expectedType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const request = { ...message, reqId };

      return new Promise<any>((resolve, reject) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout>;
        let removeListener: (() => void) | null = null;

        const cleanup = () => {
          clearTimeout(timer);
          removeListener?.();
          removeListener = null;
        };

        const listener = (data: any) => {
          if (settled || data?.type !== expectedType || data?.reqId !== reqId) return;
          settled = true;
          cleanup();
          resolve(data.payload);
        };

        timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error('Timeout waiting for ' + expectedType));
        }, timeoutMs);

        try {
          removeListener = NodeRunner.addListener(listener);
          if (!NodeRunner.send(request)) {
            throw new Error('Failed to send request to Node backend.');
          }
        } catch (error) {
          if (!settled) {
            settled = true;
            cleanup();
            reject(error);
          }
        }
      });
    };

    const checkSetup = async () => {
      try {
        const alpineDone = await AsyncStorage.getItem('devflux_alpine_installed');
        const pkgsDone = await AsyncStorage.getItem('devflux_global_packages_installed');

        if (alpineDone === 'true' && pkgsDone === 'true') {
          setIsEnvironmentReady(true);
          setShowSetupModal(false);
          // Initialize Node.js backend silently in the background
          import('../../utils/nodeRunner').then(({ NodeRunner }) => {
            NodeRunner.init().catch(e => console.log('Background node init error:', e));
          });
          return;
        }

        const { NodeRunner } = await import('../../utils/nodeRunner');
        await NodeRunner.waitForEnvironment();

        const alpineStatus = await requestNodeMessage({ type: 'CHECK_ALPINE' }, 'LINUX_CHECK_STATUS', 12000);
        if (cancelled) return;

        if (!alpineStatus?.installed) {
          await Promise.all(['devflux_alpine_installed', 'devflux_global_packages_installed'].map(key => AsyncStorage.removeItem(key)));
          // Show step 1 (alpine install) first
          setSetupStep(1);
          setShowSetupModal(true);
          return;
        }

        await AsyncStorage.setItem('devflux_alpine_installed', 'true');

        const packageStatus = await requestNodeMessage(
          { type: 'LINUX_CHECK_PACKAGES', packages: CORE_SETUP_PACKAGES },
          'LINUX_PACKAGES_STATUS',
          18000,
        ).catch(() => null);
        if (cancelled) return;

        if (packageStatus) {
          setInstalledPackages(prev => ({ ...prev, ...packageStatus }));
        }

        const missingCorePackages = CORE_SETUP_PACKAGES.filter(pkg => !packageStatus?.[pkg]);

        if (missingCorePackages.length > 0) {
          await AsyncStorage.removeItem('devflux_global_packages_installed');
          setSelectedSetupPackages(missingCorePackages);
          setSetupStep(2);
          setShowSetupModal(true);
          return;
        }

        await AsyncStorage.setItem('devflux_global_packages_installed', 'true');
        setShowSetupModal(false);
        setIsEnvironmentReady(true);
      } catch(e) {
        console.error('[DevFlux] Failed to check setup status:', e);
        if (!cancelled) {
          setSetupStep(0);
          setShowSetupModal(true);
        }
      }
    };

    checkSetup();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStartSetup = async () => {
    setSetupRunning(true);
    setSetupLog('Installing Alpine Linux...\n');
    let removeListener: (() => void) | null = null;
    let setupTimeout: ReturnType<typeof setTimeout> | null = null;
    const cleanupSetupListener = () => {
      if (setupTimeout) clearTimeout(setupTimeout);
      setupTimeout = null;
      removeListener?.();
      removeListener = null;
    };

    try {
      const { NodeRunner } = await import('../../utils/nodeRunner');
      await NodeRunner.waitForEnvironment();

      const reqId = `setup-alpine-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      removeListener = NodeRunner.addListener((data: any) => {
        if (data?.reqId !== reqId) return;
        if (data?.type === 'LINUX_INSTALL_LOG') {
          setSetupLog(prev => prev + String(data.payload || ''));
        } else if (data?.type === 'LINUX_INSTALL_DONE') {
          setSetupLog(prev => prev + '\nAlpine Linux is ready. Configure your editor.\n');
          AsyncStorage.setItem('devflux_alpine_installed', 'true');
          setSelectedSetupPackages(CORE_SETUP_PACKAGES);
          setSetupStep(0);
          setSetupRunning(false);
          cleanupSetupListener();
        } else if (data?.type === 'LINUX_INSTALL_ERROR') {
          setSetupLog(prev => prev + `\nError: ${data.payload || 'Alpine setup failed.'}\n`);
          setSetupRunning(false);
          cleanupSetupListener();
        }
      });

      setupTimeout = setTimeout(() => {
        setSetupLog(prev => prev + '\nError: Alpine setup timed out. Try again.\n');
        setSetupRunning(false);
        cleanupSetupListener();
      }, 120000);

      if (!NodeRunner.send({ type: 'LINUX_INSTALL', reqId, packages: [] })) {
        throw new Error('Failed to send install request to Node backend.');
      }
    } catch(e) {
      cleanupSetupListener();
      setSetupLog(prev => prev + `\nConnection error: ${(e as any)?.message || 'Unable to reach Node backend.'}\n`);
      setSetupRunning(false);
    }
  };

  const handleInstallPackages = async () => {
    setSetupRunning(true);
    setSetupLog('Installing packages...\n');
    let removeListener: (() => void) | null = null;
    let setupTimeout: ReturnType<typeof setTimeout> | null = null;
    const pendingPackages = selectedSetupPackages.filter(pkg => !installedPackages[pkg]);

    if (pendingPackages.length === 0) {
      setSetupStep(3);
      setSetupRunning(false);
      return;
    }

    const cleanupSetupListener = () => {
      if (setupTimeout) clearTimeout(setupTimeout);
      setupTimeout = null;
      removeListener?.();
      removeListener = null;
    };

    try {
      const { NodeRunner } = await import('../../utils/nodeRunner');
      await NodeRunner.waitForEnvironment();

      const reqId = `setup-packages-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      removeListener = NodeRunner.addListener((data: any) => {
        if (data?.reqId !== reqId) return;
        if (data?.type === 'LINUX_INSTALL_LOG') {
          setSetupLog(prev => prev + String(data.payload || ''));
        } else if (data?.type === 'LINUX_INSTALL_DONE' || data?.type === 'LINUX_PACKAGES_STATUS') {
          const verifiedPackages = data.payload?.packages || {};
          const missingPackages = pendingPackages.filter(pkg => verifiedPackages[pkg] !== true);
          
          setInstalledPackages(prev => ({ ...prev, ...verifiedPackages }));
          setSetupRunning(false);
          cleanupSetupListener();

          if (missingPackages.length > 0) {
            setSetupLog(prev => prev + `\n⚠️ Aviso: Alguns pacotes falharam ou podem demorar a aparecer no PATH: ${missingPackages.join(', ')}.\n`);
          }

          setSelectedSetupPackages(prev => prev.filter(pkg => verifiedPackages[pkg] !== true));
          setSetupStep(3);
          setSetupLog(prev => prev + '\nGlobal packages installed and verified. Setup completed.\n');
          AsyncStorage.setItem('devflux_global_packages_installed', 'true');
        } else if (data?.type === 'LINUX_INSTALL_ERROR') {
          setSetupLog(prev => prev + `\nError: ${data.payload || 'Package installation failed.'}\n`);
          setSetupRunning(false);
          cleanupSetupListener();
        }
      });

      setupTimeout = setTimeout(() => {
        setSetupLog(prev => prev + '\nError: package installation timed out. Try again.\n');
        setSetupRunning(false);
        cleanupSetupListener();
      }, 300000);

      if (!NodeRunner.send({ type: 'LINUX_INSTALL', reqId, packages: pendingPackages, reinstall: true })) {
        throw new Error('Failed to send package install request to Node backend.');
      }
    } catch(e) {
      cleanupSetupListener();
      setSetupLog(prev => prev + `\nConnection error: ${(e as any)?.message || 'Unable to reach Node backend.'}\n`);
      setSetupRunning(false);
    }
  };

  const toggleSetupPackage = (pkgId: string) => {
    setSelectedSetupPackages(prev =>
      prev.includes(pkgId) ? prev.filter(p => p !== pkgId) : [...prev, pkgId]
    );
  };

  const handleFinishSetup = async (markGlobalPackagesDone = false) => {
    await AsyncStorage.setItem('devflux_alpine_installed', 'true');
    if (markGlobalPackagesDone) {
      await AsyncStorage.setItem('devflux_global_packages_installed', 'true');
    }
    setShowSetupModal(false);
    setSetupStep(1);
    setSetupRunning(false);
    setSetupLog('');
    setIsEnvironmentReady(true);
  };

  const handleDismissSetup = () => {
    setShowSetupModal(false);
    setSetupRunning(false);
    setSetupLog('');
    setIsEnvironmentReady(true);
  };

  // Step 0: save editor & font preferences and proceed to packages install
  const handleStep0Continue = async () => {
    updateSettings({ editorEngine: step0Engine, fontSize: step0FontSize });
    const pendingPackages = selectedSetupPackages.filter(pkg => !installedPackages[pkg]);
    if (pendingPackages.length > 0) {
      setSetupStep(2);
    } else {
      await AsyncStorage.setItem('devflux_global_packages_installed', 'true');
      setShowSetupModal(false);
      setIsEnvironmentReady(true);
    }
  };

  return (
    <>
      {children}
      <Modal
        visible={!isEnvironmentReady && showSetupModal}
        transparent
        animationType="fade"
      >
        <View style={styles.fullscreenOverlay}>
          <View style={styles.modalContent}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: theme.colors.accentBlue + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Icon name={setupStep === 0 ? 'Settings' : setupStep === 1 ? 'Terminal' : setupStep === 2 ? 'Package' : 'CheckCircle'} size={28} color={setupStep === 3 ? theme.colors.success : theme.colors.accentBlue} />
              </View>
              <Text style={{ fontFamily: theme.typography.ui, fontSize: 20, fontWeight: 'bold', color: theme.colors.textPrimary, textAlign: 'center', marginBottom: 6 }}>
                {setupStep === 0 ? t('Escolha seu editor') : setupStep === 1 ? t('Instalar Alpine Linux') : setupStep === 2 ? t('Setup global do DevFlux') : t('Setup concluído')}
              </Text>
              <Text style={{ fontFamily: theme.typography.ui, fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center' }}>
                {setupStep === 0
                  ? t('Personalize o editor de código antes de começar.')
                  : setupStep === 1
                  ? t('O Alpine Linux será extraído localmente (sem necessidade de internet). Este passo é obrigatório para usar o terminal e criar projetos.')
                  : setupStep === 2
                    ? t('Instale os pacotes globais para todo projeto: npm, git, Python, build tools, SSH/SCP e utilitários básicos.')
                    : t('Tudo pronto. O ambiente local e as ferramentas globais foram verificados.')}
              </Text>
            </View>


            {/* Step 0: Editor & Font Configuration */}
            {setupStep === 0 && (
              <>
                {/* Editor Selection */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontFamily: theme.typography.ui, fontSize: 12, color: theme.colors.textSecondary, marginBottom: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('Editor de código')}</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {(['monaco', 'lightweight'] as const).map(eng => (
                      <TouchableOpacity
                        key={eng}
                        style={{
                          flex: 1, padding: 12, borderRadius: 10, alignItems: 'center',
                          backgroundColor: step0Engine === eng ? theme.colors.accentBlue + '20' : theme.colors.bgSurface,
                          borderWidth: 1.5,
                          borderColor: step0Engine === eng ? theme.colors.accentBlue : theme.colors.border,
                        }}
                        onPress={() => setStep0Engine(eng)}
                      >
                        <Icon name={eng === 'monaco' ? 'Code2' : 'Zap'} size={22} color={step0Engine === eng ? theme.colors.accentBlue : theme.colors.textSecondary} />
                        <Text style={{ fontFamily: theme.typography.uiBold, fontSize: 14, color: step0Engine === eng ? theme.colors.accentBlue : theme.colors.textPrimary, marginTop: 6 }}>
                          {eng === 'monaco' ? 'Monaco' : 'Ace'}
                        </Text>
                        <Text style={{ fontFamily: theme.typography.ui, fontSize: 11, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 3 }}>
                          {eng === 'monaco' ? t('Editor completo') : t('Leve e rápido')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Font Size */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontFamily: theme.typography.ui, fontSize: 12, color: theme.colors.textSecondary, marginBottom: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('Tamanho da fonte')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.bgSurface, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>
                    <TouchableOpacity
                      style={{ padding: 14, paddingHorizontal: 18 }}
                      onPress={() => setStep0FontSize(prev => Math.max(10, prev - 1))}
                    >
                      <Text style={{ color: theme.colors.accentBlue, fontSize: 18, fontWeight: 'bold' }}>−</Text>
                    </TouchableOpacity>
                    <Text style={{ flex: 1, textAlign: 'center', fontFamily: theme.typography.mono, fontSize: 16, color: theme.colors.textPrimary, fontWeight: 'bold' }}>{step0FontSize}px</Text>
                    <TouchableOpacity
                      style={{ padding: 14, paddingHorizontal: 18 }}
                      onPress={() => setStep0FontSize(prev => Math.min(28, prev + 1))}
                    >
                      <Text style={{ color: theme.colors.accentBlue, fontSize: 18, fontWeight: 'bold' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Live Code Preview */}
                <View style={{
                  backgroundColor: '#000000',
                  borderRadius: 10, padding: 14, marginBottom: 16,
                  borderWidth: 1, borderColor: theme.colors.border
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#333' }}>
                    <Text style={{ fontFamily: theme.typography.mono, fontSize: 10, color: '#888' }}>preview.tsx</Text>
                  </View>
                  {PREVIEW_LINES.map((line, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', marginBottom: 2 }}>
                      <Text style={{
                        fontFamily: theme.typography.mono,
                        fontSize: step0FontSize,
                        color: idx === previewLine ? theme.colors.accentBlue : '#A1A1AA',
                        opacity: idx === previewLine ? 1 : 0.5,
                      }}>{line || ' '}</Text>
                      {idx === previewLine && (
                        <Text style={{ fontFamily: theme.typography.mono, fontSize: step0FontSize, color: theme.colors.accentBlue }}>▋</Text>
                      )}
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={{ paddingVertical: 14, borderRadius: 10, backgroundColor: theme.colors.accentBlue, alignItems: 'center' }}
                  onPress={handleStep0Continue}
                >
                  <Text style={{ fontFamily: theme.typography.uiBold, color: '#fff', fontSize: 16, fontWeight: 'bold' }}>{t('Continuar')}</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Step 1: Alpine Installation */}
            {setupStep === 1 && (
              <>
                {setupLog ? (
                  <ScrollView style={{ maxHeight: 180, backgroundColor: '#0D0D0D', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                    <Text style={{ fontFamily: theme.typography.mono, fontSize: 11, color: '#A0AEC0', lineHeight: 18 }}>{setupLog}</Text>
                  </ScrollView>
                ) : null}

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: theme.colors.bgSurface, alignItems: 'center' }}
                    onPress={handleDismissSetup}
                    disabled={setupRunning}
                  >
                    <Text style={{ fontFamily: theme.typography.ui, color: setupRunning ? theme.colors.textSecondary : theme.colors.textPrimary, fontWeight: 'bold' }}>{t('Pular')}</Text>
                  </TouchableOpacity>
                  {!setupRunning && (
                    <TouchableOpacity
                      style={{ flex: 2, paddingVertical: 12, borderRadius: 8, backgroundColor: theme.colors.accentBlue, alignItems: 'center' }}
                      onPress={handleStartSetup}
                    >
                      <Text style={{ fontFamily: theme.typography.ui, color: '#fff', fontWeight: 'bold' }}>{t('Instalar Alpine Linux')}</Text>
                    </TouchableOpacity>
                  )}
                  {setupRunning && (
                     <View style={{ flex: 2, paddingVertical: 12, borderRadius: 8, backgroundColor: theme.colors.accentBlue, alignItems: 'center', opacity: 0.7 }}>
                       <Text style={{ fontFamily: theme.typography.ui, color: '#fff', fontWeight: 'bold' }}>{t('Instalando...')}</Text>
                     </View>
                  )}
                </View>
              </>
            )}

            {/* Step 2: Optional Packages Checklist */}
            {setupStep === 2 && (
              <>
                {setupLog && (setupRunning || selectedSetupPackages.filter(pkg => !installedPackages[pkg]).length === 0) ? (
                  <ScrollView style={{ maxHeight: 180, backgroundColor: '#0D0D0D', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                    <Text style={{ fontFamily: theme.typography.mono, fontSize: 11, color: '#A0AEC0', lineHeight: 18 }}>{setupLog}</Text>
                  </ScrollView>
                ) : (
                  <ScrollView style={{ maxHeight: 260, marginBottom: 16 }}>
                    {OPTIONAL_PACKAGES.map(pkg => {
                      const isInstalled = installedPackages[pkg.id];
                      const isSelected = selectedSetupPackages.includes(pkg.id) && !isInstalled;
                      return (
                        <TouchableOpacity
                          key={pkg.id}
                          disabled={isInstalled}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            marginBottom: 6,
                            borderRadius: 8,
                            backgroundColor: isInstalled ? theme.colors.success + '15' : isSelected ? theme.colors.accentBlue + '15' : theme.colors.bgSurface,
                            borderWidth: 1,
                            borderColor: isInstalled ? theme.colors.success + '50' : isSelected ? theme.colors.accentBlue + '50' : theme.colors.border,
                          }}
                          onPress={() => toggleSetupPackage(pkg.id)}
                        >
                          <View style={{
                            width: 22, height: 22, borderRadius: 4,
                            backgroundColor: isInstalled ? theme.colors.success : isSelected ? theme.colors.accentBlue : 'transparent',
                            borderWidth: (isSelected || isInstalled) ? 0 : 1.5,
                            borderColor: theme.colors.textSecondary,
                            alignItems: 'center', justifyContent: 'center', marginRight: 12,
                          }}>
                            {(isSelected || isInstalled) && <Icon name="Check" size={14} color="#FFF" />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: theme.typography.ui, fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary }}>{t(pkg.label)} {isInstalled && t('(Instalado)')}</Text>
                            <Text style={{ fontFamily: theme.typography.ui, fontSize: 11, color: theme.colors.textSecondary, marginTop: 1 }}>{t(pkg.desc)}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: theme.colors.bgSurface, alignItems: 'center' }}
                    onPress={() => handleFinishSetup(false)}
                    disabled={setupRunning}
                  >
                    <Text style={{ fontFamily: theme.typography.ui, color: setupRunning ? theme.colors.textSecondary : theme.colors.textPrimary, fontWeight: 'bold' }}>
                      {setupRunning ? t('Aguarde...') : t('Pular')}
                    </Text>
                  </TouchableOpacity>
                  {!setupRunning && (
                    <TouchableOpacity
                      style={{ flex: 2, paddingVertical: 12, borderRadius: 8, backgroundColor: theme.colors.success, alignItems: 'center' }}
                      onPress={handleInstallPackages}
                    >
                      <Text style={{ fontFamily: theme.typography.ui, color: '#fff', fontWeight: 'bold' }}>
                        {selectedSetupPackages.filter(pkg => !installedPackages[pkg]).length > 0 ? t('Instalar') + ` (${selectedSetupPackages.filter(pkg => !installedPackages[pkg]).length})` : t('Continuar')}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {setupRunning && (
                     <View style={{ flex: 2, paddingVertical: 12, borderRadius: 8, backgroundColor: theme.colors.success, alignItems: 'center', opacity: 0.7 }}>
                       <Text style={{ fontFamily: theme.typography.ui, color: '#fff', fontWeight: 'bold' }}>{t('Aguarde...')}</Text>
                     </View>
                  )}
                </View>
              </>
            )}

            {setupStep === 3 && (
              <>
                {setupLog ? (
                  <ScrollView style={{ maxHeight: 180, backgroundColor: '#0D0D0D', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                    <Text style={{ fontFamily: theme.typography.mono, fontSize: 11, color: '#A0AEC0', lineHeight: 18 }}>{setupLog}</Text>
                  </ScrollView>
                ) : null}

                <TouchableOpacity
                  style={{ paddingVertical: 12, borderRadius: 8, backgroundColor: theme.colors.success, alignItems: 'center' }}
                  onPress={() => handleFinishSetup(true)}
                >
                  <Text style={{ fontFamily: theme.typography.ui, color: '#fff', fontWeight: 'bold' }}>{t('OK, continuar')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
};

const getStyles = (theme: any) => StyleSheet.create({
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: theme.colors.bgElevated,
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    borderRadius: 16,
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
  }
});
