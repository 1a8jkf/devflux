import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, TextInput, ActivityIndicator, Alert, Modal } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme, THEME_LIST } from '../../theme';
import { Icon } from '../../components/Icon';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { CloudBackupService } from '../../services/CloudBackupService';

const OPTIONAL_PACKAGES = [
  { id: 'nodejs', labelKey: 'settings.packageNode', descKey: 'settings.packageNodeDesc', fallbackLabel: 'Node.js', fallbackDesc: 'JavaScript runtime (nodejs)' },
  { id: 'npm', labelKey: 'settings.packageNpm', descKey: 'settings.packageNpmDesc', fallbackLabel: 'NPM', fallbackDesc: 'Package manager (npm)' },
  { id: 'git', labelKey: 'settings.packageGit', descKey: 'settings.packageGitDesc', fallbackLabel: 'Git', fallbackDesc: 'Version control (git)' },
  { id: 'python3', labelKey: 'settings.packagePython', descKey: 'settings.packagePythonDesc', fallbackLabel: 'Python 3', fallbackDesc: 'Programming language (python3)' },
  { id: 'build-base', labelKey: 'settings.packageBuildBase', descKey: 'settings.packageBuildBaseDesc', fallbackLabel: 'Build Tools', fallbackDesc: 'gcc, make, and build tools (build-base)' },
  { id: 'curl', labelKey: 'settings.packageCurl', descKey: 'settings.packageCurlDesc', fallbackLabel: 'cURL', fallbackDesc: 'Data transfer tool (curl)' },
  { id: 'wget', labelKey: 'settings.packageWget', descKey: 'settings.packageWgetDesc', fallbackLabel: 'Wget', fallbackDesc: 'Download files (wget)' },
  { id: 'openssh-client', labelKey: 'settings.packageOpenssh', descKey: 'settings.packageOpensshDesc', fallbackLabel: 'OpenSSH', fallbackDesc: 'SSH/SCP client for VPS (openssh-client)' },
  { id: 'sshpass', labelKey: 'settings.packageSshpass', descKey: 'settings.packageSshpassDesc', fallbackLabel: 'sshpass', fallbackDesc: 'SSH password login in the app (sshpass)' },
  { id: 'nano', labelKey: 'settings.packageNano', descKey: 'settings.packageNanoDesc', fallbackLabel: 'Nano', fallbackDesc: 'Terminal text editor (nano)' },
  { id: 'vim', labelKey: 'settings.packageVim', descKey: 'settings.packageVimDesc', fallbackLabel: 'Vim', fallbackDesc: 'Advanced editor (vim)' },
] as const;

const PACKAGE_NAME_PATTERN = /^[a-zA-Z0-9._+@\/-]+$/;

const normalizePackageName = (pkgName: string) => pkgName.trim().toLowerCase();

const normalizePackageStatus = (payload: unknown): Record<string, boolean> => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};

  return Object.entries(payload).reduce<Record<string, boolean>>((acc, [pkg, installed]) => {
    const cleanName = normalizePackageName(pkg);
    if (cleanName) acc[cleanName] = installed === true;
    return acc;
  }, {});
};

export default function SettingsScreen() {
  const { theme, themeId, setThemeById } = useAppTheme();
  const styles = getStyles(theme);
  const params = useLocalSearchParams();
  const projectId = params.projectId as string;
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const { language, setLanguage, t } = useLanguage();

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [installedPackages, setInstalledPackages] = useState<Record<string, boolean>>({});
  const [isCheckingPackages, setIsCheckingPackages] = useState(false);
  const [customPackage, setCustomPackage] = useState('');
  const [installLog, setInstallLog] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);

  const requestPackageStatus = React.useCallback(async () => {
    let removeStatusListener: (() => void) | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    setIsCheckingPackages(true);

    try {
      const { NodeRunner } = await import('../../utils/nodeRunner');
      await NodeRunner.waitForEnvironment();

      const reqId = `settings-packages-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      removeStatusListener = NodeRunner.addListener((data: any) => {
        if (data?.type !== 'LINUX_PACKAGES_STATUS' || data?.reqId !== reqId) return;
        // MERGE into existing state — never replace entirely.
        // This prevents a re-check from overwriting packages that were
        // just marked as installed by the install handler.
        const newStatus = normalizePackageStatus(data.payload);
        setInstalledPackages(prev => ({ ...prev, ...newStatus }));
        setIsCheckingPackages(false);
        removeStatusListener?.();
        removeStatusListener = null;
        if (timeout) clearTimeout(timeout);
      });

      if (!NodeRunner.send({
        type: 'LINUX_CHECK_PACKAGES',
        reqId,
        packages: OPTIONAL_PACKAGES.map(pkg => pkg.id),
      })) {
        throw new Error('Failed to send package status request to Node backend.');
      }

      timeout = setTimeout(() => {
        setIsCheckingPackages(false);
        removeStatusListener?.();
        removeStatusListener = null;
      }, 10000);
    } catch (e) {
      setIsCheckingPackages(false);
      removeStatusListener?.();
    }
  }, []);

  React.useEffect(() => {
    void requestPackageStatus();
  }, [requestPackageStatus]);

  const handleInstallPackage = async (pkgName: string, reinstall = false) => {
    const packageId = normalizePackageName(pkgName);
    if (!packageId) return;

    if (!PACKAGE_NAME_PATTERN.test(packageId)) {
      Alert.alert(t('Erro'), 'Invalid package name.');
      return;
    }

    setIsInstalling(true);
    setShowLogModal(true);
    setInstallLog(`${reinstall ? 'Reinstalling' : 'Installing'} ${packageId}...\nInternet connection may be required.\n\n`);

    let removeLogListener: (() => void) | null = null;

    try {
      const { NodeRunner } = await import('../../utils/nodeRunner');
      await NodeRunner.waitForEnvironment();

      const reqId = `settings-install-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      removeLogListener = NodeRunner.addListener((data: any) => {
        if (data?.reqId !== reqId) return;
        if (data?.type === 'LINUX_INSTALL_LOG') {
          setInstallLog(prev => prev + String(data.payload || ''));
        } else if (data?.type === 'LINUX_PACKAGES_STATUS') {
          const checkedStatus = normalizePackageStatus(data.payload);
          setInstalledPackages(prev => ({ ...prev, ...checkedStatus }));
        } else if (data?.type === 'LINUX_INSTALL_DONE') {
          const checkedStatus = normalizePackageStatus(data.payload?.packages);
          setInstallLog(prev => prev + '\n✅ Package installed successfully.\n\nYou can now close this window.');
          setIsInstalling(false);
          // Mark this package as installed immediately and merge backend verification.
          // Do NOT call requestPackageStatus() here — it would race against this
          // state update and may overwrite the 'true' value with a stale check.
          setInstalledPackages(prev => ({ ...prev, ...checkedStatus, [packageId]: true }));
          removeLogListener?.();
          removeLogListener = null;
        } else if (data?.type === 'LINUX_INSTALL_ERROR') {
          setInstallLog(prev => prev + `\n❌ Error: ${data.payload || 'Package installation failed.'}\n`);
          setIsInstalling(false);
          removeLogListener?.();
          removeLogListener = null;
        }
      });

      if (!NodeRunner.send({ type: 'LINUX_INSTALL', reqId, packages: [packageId], reinstall })) {
        throw new Error('Failed to send package install request to Node backend.');
      }
    } catch(e: any) {
      removeLogListener?.();
      setInstallLog(prev => prev + `\n❌ Connection error: ${e?.message || 'Unable to reach Node backend.'}\n`);
      setIsInstalling(false);
    }
  };

  const handleBackup = async () => {
    if (!settings.githubToken) {
      Alert.alert(t('Erro'), t('settings.configGithubToken', 'Configure seu GitHub Token primeiro nas configurações.'));
      return;
    }
    if (!projectId) {
      Alert.alert(t('Erro'), t('settings.openProjectFirst', 'Abra um projeto antes de fazer backup.'));
      return;
    }
    setIsBackingUp(true);
    try {
      CloudBackupService.setServerUrl('http://82.29.61.16:8080');
      await CloudBackupService.backupProject(settings.githubToken, projectId, projectId);
      Alert.alert(t('Sucesso'), t('settings.backupSuccess', 'Backup concluído com sucesso e salvo na nuvem!'));
    } catch (e: any) {
      Alert.alert(t('Erro'), e.message || t('settings.backupFail', 'Falha no backup.'));
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async () => {
    if (!settings.githubToken) {
      Alert.alert(t('Erro'), t('settings.configGithubTokenShort', 'Configure seu GitHub Token primeiro.'));
      return;
    }
    setIsRestoring(true);
    try {
      CloudBackupService.setServerUrl('http://82.29.61.16:8080');

      const list = await CloudBackupService.listBackups(settings.githubToken);
      if (list.length === 0) {
         Alert.alert(t('Aviso'), t('settings.noBackupFound', 'Nenhum backup encontrado na nuvem para esta conta.'));
         setIsRestoring(false);
         return;
      }

      const backup = projectId ? list.find(b => b.id === projectId) || list[0] : list[0];

      await CloudBackupService.restoreBackup(settings.githubToken, backup.id);
      Alert.alert(t('Sucesso'), `${t('settings.backupRestored', 'Backup restaurado com sucesso!')}`);
    } catch (e: any) {
      Alert.alert(t('Erro'), e.message || t('settings.restoreFail', 'Falha ao restaurar.'));
    } finally {
      setIsRestoring(false);
    }
  };

  const handleFontSizeChange = (change: number) => {
    const newSize = Math.max(10, Math.min(30, settings.fontSize + change));
    updateSettings({ fontSize: newSize });
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.appearance', 'APPEARANCE')}</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>{t('settings.language', 'Language')}</Text>
              <Text style={styles.settingDesc}>{t('settings.selectLanguage', 'Select the interface language')}</Text>
            </View>
            <View style={styles.controlsRow}>
              {(['pt', 'en', 'es'] as const).map((lang) => (
                <TouchableOpacity
                  key={lang}
                  style={[
                    styles.controlBtn,
                    { width: 40, backgroundColor: language === lang ? theme.colors.accentBlue : theme.colors.bgSurface }
                  ]}
                  onPress={() => setLanguage(lang)}
                >
                  <Text style={{
                    color: language === lang ? '#FFF' : theme.colors.textPrimary,
                    fontFamily: theme.typography.uiBold,
                    fontSize: 12
                  }}>
                    {lang.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>{t('settings.premiumThemes', 'PREMIUM THEMES')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {THEME_LIST.map((tInfo) => {
              const isSelected = themeId === tInfo.id;
              return (
                <TouchableOpacity
                  key={tInfo.id}
                  style={[
                    styles.themeCard,
                    {
                      backgroundColor: tInfo.theme.colors.bgElevated,
                      borderColor: isSelected ? tInfo.theme.colors.accentBlue : tInfo.theme.colors.border,
                      borderWidth: isSelected ? 2 : 1
                    }
                  ]}
                  onPress={() => setThemeById(tInfo.id)}
                >
                  <Text style={{ color: tInfo.theme.colors.textPrimary, fontFamily: theme.typography.uiBold, fontSize: 13, marginBottom: 8 }}>{tInfo.name}</Text>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {tInfo.preview.map((color, i) => (
                      <View key={i} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color, borderWidth: 1, borderColor: tInfo.theme.colors.border }} />
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.editorTitle', 'CODE EDITOR')}</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>{t('settings.editorEngine', 'Editor Engine')}</Text>
              <Text style={styles.settingDesc}>{t('settings.editorEngineDesc', 'Select the underlying editor')}</Text>
            </View>
            <View style={styles.controlsRow}>
              {(['monaco', 'lightweight'] as const).map((eng) => (
                <TouchableOpacity
                  key={eng}
                  style={[
                    styles.controlBtn,
                    { 
                      width: 'auto', 
                      paddingHorizontal: 12,
                      backgroundColor: settings.editorEngine === eng || (eng === 'monaco' && !settings.editorEngine) 
                        ? theme.colors.accentBlue 
                        : theme.colors.bgSurface 
                    }
                  ]}
                  onPress={() => updateSettings({ editorEngine: eng })}
                >
                  <Text style={{
                    color: settings.editorEngine === eng || (eng === 'monaco' && !settings.editorEngine)
                      ? '#FFF' 
                      : theme.colors.textPrimary,
                    fontFamily: theme.typography.uiBold,
                    fontSize: 12
                  }}>
                    {eng === 'monaco' ? 'Monaco' : 'Ace'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>{t('settings.fontSize', 'Font Size')}</Text>
              <Text style={styles.settingDesc}>{settings.fontSize}px</Text>
            </View>
            <View style={styles.controlsRow}>
              <TouchableOpacity style={styles.controlBtn} onPress={() => handleFontSizeChange(-1)}>
                <Icon name="Minus" size={20} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.controlBtn} onPress={() => handleFontSizeChange(1)}>
                <Icon name="Plus" size={20} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>{t('settings.wordWrap', 'Word Wrap')}</Text>
              <Text style={styles.settingDesc}>{t('settings.wordWrapDesc', 'Prevents horizontal scrolling')}</Text>
            </View>
            <Switch
              value={settings.wordWrap === 'on'}
              onValueChange={(val) => updateSettings({ wordWrap: val ? 'on' : 'off' })}
              trackColor={{ false: theme.colors.border, true: theme.colors.accentBlue }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>{t('settings.minimap', 'Minimap')}</Text>
              <Text style={styles.settingDesc}>{t('settings.minimapDesc', 'Show the code side map')}</Text>
            </View>
            <Switch
              value={settings.minimap}
              onValueChange={(val) => updateSettings({ minimap: val })}
              trackColor={{ false: theme.colors.border, true: theme.colors.accentBlue }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>{t('settings.lineNumbers', 'Line Numbers')}</Text>
              <Text style={styles.settingDesc}>{t('settings.lineNumbersDesc', 'Show numbering on the left')}</Text>
            </View>
            <Switch
              value={settings.lineNumbers === 'on'}
              onValueChange={(val) => updateSettings({ lineNumbers: val ? 'on' : 'off' })}
              trackColor={{ false: theme.colors.border, true: theme.colors.accentBlue }}
            />
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>{t('settings.files', 'FILES')}</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>{t('settings.saveMode', 'Modo de salvamento')}</Text>
              <Text style={styles.settingDesc}>
                {settings.autoSave
                  ? t('settings.saveModeAutoDesc', 'Salva automaticamente depois que você para de digitar')
                  : t('settings.saveModeManualDesc', 'Mantém rascunhos com bolinha até tocar no botão Save')}
              </Text>
            </View>
            <View style={styles.segmentedControl}>
              <TouchableOpacity
                style={[styles.segmentButton, !settings.autoSave && styles.segmentButtonActive]}
                onPress={() => updateSettings({ autoSave: false })}
              >
                <Icon name="Save" size={14} color={!settings.autoSave ? '#FFF' : theme.colors.textSecondary} />
                <Text style={[styles.segmentText, !settings.autoSave && styles.segmentTextActive]}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentButton, settings.autoSave && styles.segmentButtonActive]}
                onPress={() => updateSettings({ autoSave: true })}
              >
                <Icon name="RefreshCw" size={14} color={settings.autoSave ? '#FFF' : theme.colors.textSecondary} />
                <Text style={[styles.segmentText, settings.autoSave && styles.segmentTextActive]}>Auto</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>{t('settings.formatOnSave', 'Format on Save')}</Text>
              <Text style={styles.settingDesc}>{t('settings.formatOnSaveDesc', 'Applies formatting rules (Prettier) when saving')}</Text>
            </View>
            <Switch
              value={settings.formatOnSave}
              onValueChange={(val) => updateSettings({ formatOnSave: val })}
              trackColor={{ false: theme.colors.border, true: theme.colors.accentBlue }}
            />
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>{t('settings.cloudBackupPremium', 'CLOUD BACKUP (PREMIUM)')}</Text>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>{t('settings.githubTokenIdentification', 'GitHub Token (Identification)')}</Text>
              <TextInput
                style={styles.textInput}
                value={settings.githubToken || ''}
                onChangeText={(val) => updateSettings({ githubToken: val })}
                placeholder="ghp_..."
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <TouchableOpacity style={styles.primaryButton} onPress={handleBackup} disabled={isBackingUp}>
              {isBackingUp ? <ActivityIndicator size="small" color="#FFF" /> : <Icon name="UploadCloud" size={18} color="#FFF" />}
              <Text style={styles.primaryButtonText}>{isBackingUp ? t('settings.saving', 'Saving...') : t('settings.backup', 'Back Up')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={handleRestore} disabled={isRestoring}>
              {isRestoring ? <ActivityIndicator size="small" color={theme.colors.accentBlue} /> : <Icon name="DownloadCloud" size={18} color={theme.colors.accentBlue} />}
              <Text style={styles.secondaryButtonText}>{t('settings.restoreBackup', 'Restore Backup')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.packageHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { marginTop: 32, marginBottom: 8 }]}>{t('settings.alpinePackageManager', 'PACKAGE MANAGER (ALPINE LINUX)')}</Text>
              <Text style={styles.settingDesc}>
                {t('settings.alpinePackageManagerDesc', 'Download and install terminal tools (such as node, python, git) directly in the Linux environment.')}
              </Text>
            </View>
            <TouchableOpacity style={styles.refreshPackagesButton} onPress={requestPackageStatus} disabled={isCheckingPackages || isInstalling}>
              {isCheckingPackages ? <ActivityIndicator size="small" color={theme.colors.accentBlue} /> : <Icon name="RefreshCw" size={15} color={theme.colors.accentBlue} />}
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 16 }}>
            {OPTIONAL_PACKAGES.map(pkg => {
              const isInstalled = installedPackages[pkg.id] === true;
              const packageLabel = t(pkg.labelKey, pkg.fallbackLabel);
              const packageDesc = t(pkg.descKey, pkg.fallbackDesc);
              return (
                <View key={pkg.id} style={[styles.packageRow, isInstalled && styles.packageRowInstalled]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Text style={styles.packageTitle}>{packageLabel}</Text>
                      {isInstalled && <Icon name="CheckCircle" size={14} color={theme.colors.success} />}
                    </View>
                    <Text style={styles.packageDesc}>{packageDesc} ({pkg.id})</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleInstallPackage(pkg.id, isInstalled)}
                    disabled={isInstalling}
                    style={[styles.packageActionButton, isInstalling && styles.disabledButton]}
                  >
                    <Text style={[styles.packageActionText, isInstalled && styles.packageReinstallText]}>
                      {isInstalled ? t('settings.reinstall', 'Reinstall') : t('settings.install', 'Install')}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          <View style={styles.customPackageBox}>
            <Text style={styles.customPackageTitle}>{t('settings.customPackage', 'Install Custom Package')}</Text>
            <TextInput
              style={styles.textInput}
              value={customPackage}
              onChangeText={setCustomPackage}
              placeholder={t('settings.customPackagePlaceholder', 'Package name (ex: php, ruby)')}
              placeholderTextColor={theme.colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.primaryButton, { marginTop: 12 }, !customPackage.trim() && styles.disabledButton]}
              onPress={() => {
                const packageName = customPackage;
                setCustomPackage('');
                void handleInstallPackage(packageName);
              }}
              disabled={!customPackage.trim() || isInstalling}
            >
              <Text style={styles.primaryButtonText}>{t('settings.downloadInstallPackage', 'Download and Install Package')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal visible={showLogModal} transparent animationType="fade" onRequestClose={() => setShowLogModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('settings.installProgress', 'Installation Progress')}</Text>
            <ScrollView style={styles.logBox}>
              <Text style={styles.logText}>{installLog}</Text>
            </ScrollView>
            <TouchableOpacity
              style={[styles.primaryButton, styles.modalActionButton, isInstalling && { opacity: 0.7 }]}
              onPress={() => setShowLogModal(false)}
              activeOpacity={0.85}
              disabled={isInstalling}
            >
              {isInstalling && <ActivityIndicator size="small" color="#FFF" />}
              <Text style={styles.primaryButtonText}>{isInstalling ? t('settings.installing', 'Installing...') : t('settings.ok', 'OK')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: theme.typography.uiBold,
    color: theme.colors.textSecondary,
    marginBottom: 16,
    letterSpacing: 1,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.bgElevated,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  settingInfo: {
    flex: 1,
    paddingRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    marginBottom: 4,
  },
  settingDesc: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.ui,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  segmentedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgSurface,
    padding: 3,
    gap: 4,
  },
  segmentButton: {
    minWidth: 66,
    height: 34,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  segmentButtonActive: {
    backgroundColor: theme.colors.accentBlue,
  },
  segmentText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.uiBold,
    fontSize: 12,
  },
  segmentTextActive: {
    color: '#FFF',
  },
  themeCard: {
    padding: 12,
    borderRadius: 8,
    marginRight: 12,
    width: 140,
    alignItems: 'flex-start',
  },
  textInput: {
    backgroundColor: theme.colors.bgSurface,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    fontSize: 14,
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: theme.colors.accentBlue,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFF',
    fontFamily: theme.typography.uiBold,
    fontSize: 14,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: theme.colors.accentBlue + '1A',
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.accentBlue + '33',
  },
  secondaryButtonText: {
    color: theme.colors.accentBlue,
    fontFamily: theme.typography.uiBold,
    fontSize: 14,
  },
  packageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  refreshPackagesButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    marginBottom: 2,
  },
  packageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgElevated,
  },
  packageRowInstalled: {
    borderColor: theme.colors.success + '50',
    backgroundColor: theme.colors.success + '10',
  },
  packageTitle: {
    fontFamily: theme.typography.uiBold,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  packageDesc: {
    fontFamily: theme.typography.ui,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  packageActionButton: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.bgSurface,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  packageActionText: {
    fontFamily: theme.typography.uiBold,
    fontSize: 12,
    color: theme.colors.accentBlue,
  },
  packageReinstallText: {
    color: theme.colors.accentPurple,
  },
  customPackageBox: {
    backgroundColor: theme.colors.bgSurface,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 8,
  },
  customPackageTitle: {
    fontFamily: theme.typography.uiBold,
    fontSize: 14,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  disabledButton: {
    opacity: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#0D0D0D',
    borderRadius: 12,
    padding: 20,
    maxHeight: '80%',
    width: '90%',
  },
  modalTitle: {
    fontFamily: theme.typography.uiBold,
    fontSize: 16,
    color: '#FFF',
    marginBottom: 12,
  },
  logBox: {
    backgroundColor: '#1A202C',
    borderRadius: 8,
    padding: 12,
    maxHeight: 300,
  },
  logText: {
    fontFamily: theme.typography.mono,
    fontSize: 11,
    color: '#A0AEC0',
    lineHeight: 18,
  },
  modalActionButton: {
    flex: 0,
    minHeight: 46,
    marginTop: 16,
  },
});