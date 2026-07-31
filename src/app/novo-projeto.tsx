import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { FileSystemService, ProjectType } from '../services/FileSystemService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PACKAGES: Record<string, string[]> = {
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

  const [step, setStep] = useState(1);
  const [newProjectName, setNewProjectName] = useState('');
  const [installPath, setInstallPath] = useState('/storage/projects/');
  const [selectedType, setSelectedType] = useState<ProjectType | null>(null);
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [alpineInstalled, setAlpineInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    const check = async () => {
      const done = await AsyncStorage.getItem('devflux_alpine_installed');
      setAlpineInstalled(done === 'true');
    };
    check();
  }, []);

  const handleNext = () => {
    if (step === 1 && newProjectName.trim() && installPath.trim()) setStep(2);
    else if (step === 2 && selectedType) setStep(3);
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !selectedType) return;

    // Block if Alpine Linux is not installed
    if (!alpineInstalled) {
      Alert.alert(
        'Alpine Linux Necessário',
        'Para criar projetos, é necessário instalar o Alpine Linux primeiro. Vá até a tela inicial e execute a instalação.',
        [
          { text: 'Voltar', onPress: () => router.back() },
          { text: 'OK', style: 'cancel' }
        ]
      );
      return;
    }
    
    // Pass custom path combined with name to FileSystemService if we supported it
    // For now we'll just use the name as projectId to maintain compatibility with our simple VFS
    // In a fully native environment we would create directories recursively
    const newProject = await FileSystemService.createProject(newProjectName.trim(), selectedType, selectedPackages);
    
    // Redirect to editor with terminal expansion params
    router.replace({ 
      pathname: '/editor/codigo', 
      params: { 
        projectId: newProject.id, 
        isNewProject: 'true', 
        deps: selectedPackages.join(','),
        cwd: installPath,
        templateType: selectedType
      } 
    });
  };

  const togglePackage = (pkg: string) => {
    setSelectedPackages(prev => 
      prev.includes(pkg) ? prev.filter(p => p !== pkg) : [...prev, pkg]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => step > 1 ? setStep(step - 1) : router.back()}>
          <Icon name="ArrowLeft" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Novo Projeto (Wizard)</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.progressContainer}>
        <View style={[styles.progressLine, { width: `${(step / 3) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Informações Básicas</Text>
            
            <Text style={styles.label}>Nome do Projeto</Text>
            <TextInput 
              style={styles.input}
              placeholder="Ex: meu-super-app"
              placeholderTextColor={theme.colors.textSecondary}
              value={newProjectName}
              onChangeText={setNewProjectName}
              autoFocus
            />

            <Text style={styles.label}>Caminho de Instalação (Path)</Text>
            <TextInput 
              style={styles.input}
              placeholder="/storage/projects/"
              placeholderTextColor={theme.colors.textSecondary}
              value={installPath}
              onChangeText={setInstallPath}
            />
            <Text style={styles.helperText}>Onde o diretório raiz será criado no Virtual File System.</Text>

            <TouchableOpacity 
              style={[styles.nextButton, (!newProjectName.trim() || !installPath.trim()) && styles.disabledButton]} 
              onPress={handleNext}
              disabled={!newProjectName.trim() || !installPath.trim()}
            >
              <Text style={styles.nextButtonText}>Avançar</Text>
              <Icon name="ArrowRight" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Framework e Template</Text>
            
            <TouchableOpacity style={[styles.templateOption, selectedType === 'html' && styles.templateOptionSelected]} onPress={() => { setSelectedType('html'); setSelectedPackages([]); }}>
              <Icon name="FileCode2" size={24} color={theme.colors.accentBlue} />
              <View style={styles.templateInfo}>
                <Text style={styles.templateName}>HTML / CSS / JS</Text>
                <Text style={styles.templateDesc}>Projeto web básico</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.templateOption, selectedType === 'react' && styles.templateOptionSelected]} onPress={() => { setSelectedType('react'); setSelectedPackages([]); }}>
              <Icon name="Layout" size={24} color={theme.colors.accentPurple} />
              <View style={styles.templateInfo}>
                <Text style={styles.templateName}>React (Vite)</Text>
                <Text style={styles.templateDesc}>Single Page Application</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.templateOption, selectedType === 'node' && styles.templateOptionSelected]} onPress={() => { setSelectedType('node'); setSelectedPackages([]); }}>
              <Icon name="Server" size={24} color={theme.colors.accentTeal} />
              <View style={styles.templateInfo}>
                <Text style={styles.templateName}>Node.js API</Text>
                <Text style={styles.templateDesc}>Servidor Backend</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.templateOption, selectedType === 'blank' && styles.templateOptionSelected]} onPress={() => { setSelectedType('blank'); setSelectedPackages([]); }}>
              <Icon name="TerminalSquare" size={24} color={theme.colors.textPrimary} />
              <View style={styles.templateInfo}>
                <Text style={styles.templateName}>Projeto em Branco (Linux)</Text>
                <Text style={styles.templateDesc}>Apenas o terminal livre</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.nextButton, !selectedType && styles.disabledButton, { marginTop: 24 }]} 
              onPress={handleNext}
              disabled={!selectedType}
            >
              <Text style={styles.nextButtonText}>Avançar para Pacotes</Text>
              <Icon name="ArrowRight" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {step === 3 && selectedType && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Dependências (NPM)</Text>
            <Text style={styles.helperText}>Selecione os pacotes que o Terminal instalará na inicialização.</Text>
            
            {selectedType === 'html' ? (
              <View style={styles.emptyPackages}>
                <Icon name="Box" size={48} color={theme.colors.border} />
                <Text style={styles.emptyPackagesText}>Nenhum pacote NPM necessário para HTML estático.</Text>
              </View>
            ) : (
              <View style={styles.chipsContainer}>
                {PACKAGES[selectedType].map(pkg => {
                  const isSelected = selectedPackages.includes(pkg);
                  return (
                    <TouchableOpacity 
                      key={pkg} 
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

            <TouchableOpacity style={[styles.nextButton, { marginTop: 32, backgroundColor: theme.colors.success }]} onPress={handleCreateProject}>
              <Text style={styles.nextButtonText}>Montar Projeto e Abrir Shell</Text>
              <Icon name="Terminal" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
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
    paddingTop: 32,
    paddingBottom: 40,
  },
  stepContainer: {
    flex: 1,
  },
  stepTitle: {
    fontFamily: theme.typography.ui,
    fontSize: 24,
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
  }
});
