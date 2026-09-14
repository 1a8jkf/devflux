import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { FileSystemService } from '../services/FileSystemService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../contexts/LanguageContext';
import { NodeRunner } from '../utils/nodeRunner';
import { NpmService } from '../services/NpmService';

type TemplateType = 'html' | 'node' | 'react' | 'blank';

const PACKAGES: Record<TemplateType, string[]> = {
  html: [],
  react: ['react-router-dom', 'lucide-react', 'axios'],
  node: ['express', 'mongoose', 'cors', 'dotenv'],
  blank: []
};

export default function NovoProjetoScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [step, setStep] = useState(1);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedType, setSelectedType] = useState<TemplateType | null>(null);
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [alpineInstalled, setAlpineInstalled] = useState<boolean | null>(null);
  const [showAlpineModal, setShowAlpineModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [creationStatus, setCreationStatus] = useState('');

  useEffect(() => {
    const check = async () => {
      const done = await AsyncStorage.getItem('devflux_alpine_installed');
      if (done === 'true') {
        setAlpineInstalled(true);
        return;
      }

      // AsyncStorage flag is not set — query the backend to confirm real state
      try {
        await NodeRunner.waitForEnvironment(8000);
        const reqId = `check-alpine-wizard-${Date.now()}`;
        const backendResult = await new Promise<boolean>((resolve) => {
          let settled = false;
          const removeListener = NodeRunner.addListener((data: any) => {
            if (settled || data?.type !== 'LINUX_CHECK_STATUS' || data?.reqId !== reqId) return;
            settled = true;
            removeListener();
            resolve(data?.payload?.installed === true);
          });
          setTimeout(() => {
            if (!settled) { settled = true; removeListener(); resolve(false); }
          }, 6000);
          NodeRunner.send({ type: 'CHECK_ALPINE', reqId });
        });

        if (backendResult) {
          // Backend confirms Alpine is installed — fix the stale AsyncStorage flag
          await AsyncStorage.setItem('devflux_alpine_installed', 'true');
          setAlpineInstalled(true);
        } else {
          setAlpineInstalled(false);
        }
      } catch {
        // If backend is unreachable, assume not installed
        setAlpineInstalled(false);
      }
    };
    check();
  }, []);

  // Reset all wizard state whenever this screen gains focus (e.g. navigating back from editor)
  useFocusEffect(
    useCallback(() => {
      setStep(1);
      setNewProjectName('');
      setSelectedType(null);
      setSelectedPackages([]);
    }, [])
  );

  const handleNext = () => {
    if (step === 1 && newProjectName.trim()) setStep(2);
    else if (step === 2 && selectedType) setStep(3);
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !selectedType || creatingRef.current) return;

    // Block if Alpine Linux is not installed
    if (!alpineInstalled) {
      setShowAlpineModal(true);
      return;
    }

    creatingRef.current = true;
    setCreating(true);
    setCreationStatus(t('Criando arquivos...'));
    try {
      const newProject = await FileSystemService.createProject(newProjectName.trim(), selectedType, selectedPackages);
      const openProject = () => {
        creatingRef.current = false;
        setCreating(false);
        router.replace({
          pathname: '/editor/codigo',
          params: { projectId: newProject.id, isNewProject: 'true', templateType: selectedType,
            openFile: selectedType === 'react' ? 'src/App.jsx' : selectedType === 'node' ? 'server.js' : selectedType === 'html' ? 'index.html' : '' },
        });
      };
      const installAndOpen = async () => {
        try {
          if (selectedType === 'react' || (selectedType === 'node' && selectedPackages.length > 0)) {
            setCreationStatus(t('Instalando dependências...'));
            await NpmService.runCommand(newProject.id, ['install']);
          }
          openProject();
        } catch (error: any) {
          setCreationStatus(t('Arquivos criados. Instalação pendente.'));
          Alert.alert(t('Dependências não instaladas'), error.message, [
            { text: t('Abrir arquivos'), onPress: openProject },
            { text: t('Tentar novamente'), onPress: () => void installAndOpen() },
          ], { cancelable: false });
        }
      };
      await installAndOpen();
    } catch (error: any) {
      creatingRef.current = false;
      setCreating(false);
      setCreationStatus('');
      Alert.alert(t('Falha ao criar projeto'), error.message);
    }
  };

  const togglePackage = (pkg: string) => {
    setSelectedPackages(prev =>
      prev.includes(pkg) ? prev.filter(p => p !== pkg) : [...prev, pkg]
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity disabled={creating} onPress={() => step > 1 ? setStep(step - 1) : router.back()}>
          <Icon name="ArrowLeft" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('Novo Projeto (Wizard)')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.progressContainer}>
        <View style={[styles.progressLine, { width: `${(step / 3) * 100}%` }]} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>{t('Informações Básicas')}</Text>

            <Text style={styles.label}>{t('Nome do Projeto')}</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: meu-super-app"
              placeholderTextColor={theme.colors.textSecondary}
              value={newProjectName}
              onChangeText={setNewProjectName}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              importantForAutofill="no"
              keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
              disableFullscreenUI
              autoFocus
            />

            <View style={styles.storageNotice}>
              <Icon name="FolderLock" size={20} color={theme.colors.accentTeal} />
              <View style={{ flex: 1 }}>
                <Text style={styles.storageNoticeText}>
                  {t('Por limitação do Android, todos os projetos ficam na pasta de projetos do próprio DevFlux.')}
                </Text>
                <Text style={styles.storagePath}>DevFluxProjects/</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.nextButton, !newProjectName.trim() && styles.disabledButton]}
              onPress={handleNext}
              disabled={!newProjectName.trim()}
            >
              <Text style={styles.nextButtonText}>{t('Avançar')}</Text>
              <Icon name="ArrowRight" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>{t('Framework e Template')}</Text>

            <TouchableOpacity style={[styles.templateOption, selectedType === 'html' && styles.templateOptionSelected]} onPress={() => { setSelectedType('html'); setSelectedPackages([]); }}>
              <Icon name="FileCode2" size={24} color={theme.colors.accentBlue} />
              <View style={styles.templateInfo}>
                <Text style={styles.templateName}>HTML / CSS / JS</Text>
                <Text style={styles.templateDesc}>{t('Projeto web básico')}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.templateOption, selectedType === 'react' && styles.templateOptionSelected]} onPress={() => { setSelectedType('react'); setSelectedPackages([]); }}>
              <Icon name="Layout" size={24} color={theme.colors.accentPurple} />
              <View style={styles.templateInfo}>
                <Text style={styles.templateName}>React (Vite)</Text>
                <Text style={styles.templateDesc}>{t('Single Page Application')}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.templateOption, selectedType === 'node' && styles.templateOptionSelected]} onPress={() => { setSelectedType('node'); setSelectedPackages([]); }}>
              <Icon name="Server" size={24} color={theme.colors.accentTeal} />
              <View style={styles.templateInfo}>
                <Text style={styles.templateName}>Node.js API</Text>
                <Text style={styles.templateDesc}>{t('Servidor Backend')}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.templateOption, selectedType === 'blank' && styles.templateOptionSelected]} onPress={() => { setSelectedType('blank'); setSelectedPackages([]); }}>
              <Icon name="TerminalSquare" size={24} color={theme.colors.textPrimary} />
              <View style={styles.templateInfo}>
                <Text style={styles.templateName}>{t('Projeto em Branco (Linux)')}</Text>
                <Text style={styles.templateDesc}>{t('Apenas o terminal livre')}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.nextButton, !selectedType && styles.disabledButton, { marginTop: 24 }]}
              onPress={handleNext}
              disabled={!selectedType}
            >
              <Text style={styles.nextButtonText}>{t('Avançar para Pacotes')}</Text>
              <Icon name="ArrowRight" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {step === 3 && selectedType && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>{t('Dependências (NPM)')}</Text>
            <Text style={styles.helperText}>{t('Selecione os pacotes que o Terminal instalará na inicialização.')}</Text>

            {selectedType === 'html' ? (
              <View style={styles.emptyPackages}>
                <Icon name="Box" size={48} color={theme.colors.border} />
                <Text style={styles.emptyPackagesText}>{t('Nenhum pacote NPM necessário para HTML estático.')}</Text>
              </View>
            ) : (
              <View style={styles.chipsContainer}>
                {PACKAGES[selectedType].map(pkg => {
                  const isSelected = selectedPackages.includes(pkg);
                  return (
                    <TouchableOpacity
                      key={pkg}
                      disabled={creating}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => togglePackage(pkg)}
                    >
                      <Icon name={isSelected ? 'Check' : 'Plus'} size={14} color={isSelected ? '#FFF' : theme.colors.textSecondary} />
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{pkg}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {!!creationStatus && <Text style={styles.helperText}>{creationStatus}</Text>}
            <TouchableOpacity disabled={creating} style={[styles.nextButton, { marginTop: 32, backgroundColor: theme.colors.success }, creating && styles.disabledButton]} onPress={handleCreateProject}>
              <Text style={styles.nextButtonText}>{t(creating ? 'Preparando projeto...' : 'Criar projeto')}</Text>
              <Icon name="Terminal" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Alpine Linux Required Custom Modal */}
      <Modal visible={showAlpineModal} transparent animationType="fade" onRequestClose={() => setShowAlpineModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <Icon name="Box" size={48} color={theme.colors.accentBlue} />
            </View>
            <Text style={styles.modalTitle}>{t('Alpine Linux Necessário')}</Text>
            <Text style={styles.modalDesc}>
              {t('Para criar projetos, é necessário instalar o ecossistema Alpine Linux primeiro. Volte até a tela inicial para executar a instalação.')}
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
              <TouchableOpacity style={[styles.nextButton, { flex: 1, backgroundColor: theme.colors.bgSurface, borderWidth: 1, borderColor: theme.colors.border }]} onPress={() => setShowAlpineModal(false)}>
                <Text style={[styles.nextButtonText, { color: theme.colors.textPrimary }]}>{t('OK')}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={[styles.nextButton, { flex: 1 }]} onPress={() => { setShowAlpineModal(false); router.back(); }}>
                <Text style={styles.nextButtonText}>{t('Voltar ao Início')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  headerTitle: {
    fontFamily: theme.typography.ui,
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  progressContainer: {
    height: 2,
    backgroundColor: theme.colors.border,
    width: '100%',
  },
  progressLine: {
    height: '100%',
    backgroundColor: theme.colors.accentBlue,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  stepContainer: {
    flex: 1,
  },
  stepTitle: {
    fontFamily: theme.typography.ui,
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 24,
  },
  label: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.colors.bgSurface,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    fontSize: 16,
    paddingHorizontal: 16,
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
  },
  storageNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.accentTeal + '35',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    marginBottom: 24,
  },
  storageNoticeText: {
    fontFamily: theme.typography.ui,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.textSecondary,
  },
  storagePath: {
    fontFamily: theme.typography.mono,
    fontSize: 12,
    color: theme.colors.accentTeal,
    marginTop: 6,
  },
  helperText: {
    fontFamily: theme.typography.ui,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 24,
  },
  nextButton: {
    backgroundColor: theme.colors.accentBlue,
    height: 56,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  nextButtonText: {
    color: '#FFF',
    fontFamily: theme.typography.ui,
    fontSize: 16,
    fontWeight: 'bold',
  },
  templateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgElevated,
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  templateOptionSelected: {
    backgroundColor: theme.colors.bgSurface,
    borderColor: theme.colors.accentBlue,
    borderWidth: 2,
  },
  templateInfo: {
    marginLeft: 16,
  },
  templateName: {
    fontFamily: theme.typography.ui,
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  templateDesc: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgElevated,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipSelected: {
    backgroundColor: theme.colors.accentBlue,
    borderColor: theme.colors.accentBlue,
  },
  chipText: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 8,
  },
  chipTextSelected: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  emptyPackages: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 12,
  },
  emptyPackagesText: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalTitle: {
    fontFamily: theme.typography.uiBold,
    fontSize: 20,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  modalDesc: {
    fontFamily: theme.typography.ui,
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
