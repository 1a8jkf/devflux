import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, KeyboardAvoidingView, Image, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { Icon } from '../../components/Icon';
import { DatabaseService } from '../../services/DatabaseService';
import { useLanguage } from '../../contexts/LanguageContext';

interface DBConnection {
  id: string;
  name: string;
  type: 'postgres' | 'mysql' | 'sqlite';
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  dbName?: string;
  useRelay?: boolean;
  relayUrl?: string;
}

export default function DatabaseConnectionsScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [connections, setConnections] = useState<DBConnection[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('5432');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [dbName, setDbName] = useState('');
  const [useRelay, setUseRelay] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('@db_connections').then(data => {
      if (data) setConnections(JSON.parse(data));
    });
  }, []);

  const handleConnect = (conn: DBConnection) => {
    // Navigate to terminal
    router.push({ pathname: '/database/terminal', params: { connectionId: conn.id, connectionName: conn.name } });
  };

  const testConnection = async () => {
    if (!host || !port || !user || !password || !dbName) {
      Alert.alert(t('Erro'), t('Por favor, preencha todos os campos para testar a conexão.'));
      return;
    }

    // Clean up host in case user pasted a URL with // or spaces
    const cleanHost = host.replace(/^(https?:\/\/|postgres:\/\/|\/\/)/, '').split('/')[0].trim();

    setIsTesting(true);
    try {
      await DatabaseService.query({
        host: cleanHost,
        port: parseInt(port, 10) || 5432,
        user,
        password,
        database: dbName,
        useRelay
      }, 'SELECT 1');
      Alert.alert(t('Sucesso'), `${t('Conexão estabelecida com sucesso via')} ${useRelay ? 'DevFlux Cloud Relay!' : t('Conexão Direta!')}`);
    } catch (err: any) {
      Alert.alert(t('Falha na Conexão'), err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleAdd = async () => {
    if (!name || !host || !port || !user || !password || !dbName) {
      Alert.alert(t('Erro'), t('Por favor, preencha todos os campos para salvar a conexão.'));
      return;
    }
    const cleanHost = host.replace(/^(https?:\/\/|postgres:\/\/|\/\/)/, '').split('/')[0].trim();
    
    const newConn: DBConnection = {
      id: Date.now().toString(),
      name, type: 'postgres', host: cleanHost, port: parseInt(port, 10) || 5432, user, password, dbName, useRelay
    };
    const updated = [...connections, newConn];
    setConnections(updated);
    await AsyncStorage.setItem('@db_connections', JSON.stringify(updated));
    setIsAdding(false);
    setName(''); setHost(''); setPort('5432'); setUser(''); setPassword(''); setDbName(''); setUseRelay(true);
  };

  const handleDelete = async (id: string) => {
    const updated = connections.filter(c => c.id !== id);
    setConnections(updated);
    await AsyncStorage.setItem('@db_connections', JSON.stringify(updated));
  };

  const handleEdit = (conn: DBConnection) => {
    handleDelete(conn.id);
    setName(conn.name);
    setHost(conn.host || '');
    setPort((conn.port || 5432).toString());
    setUser(conn.user || '');
    setPassword(conn.password || '');
    setDbName(conn.dbName || '');
    setUseRelay(conn.useRelay !== undefined ? conn.useRelay : true);
    setIsAdding(true);
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >


      <ScrollView style={styles.content}>
        {isAdding ? (
          <View style={styles.formContainer}>
            <Text style={styles.sectionTitle}>{t('Nova Conexão PostgreSQL')}</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('Nome da Conexão')}</Text>
              <TextInput style={styles.input} placeholder={t('Ex: Produção DB')} placeholderTextColor={theme.colors.textSecondary} value={name} onChangeText={setName} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Host</Text>
              <TextInput style={styles.input} placeholder={t('Ex: localhost ou meu-banco.com')} placeholderTextColor={theme.colors.textSecondary} value={host} onChangeText={setHost} autoCapitalize="none" />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('Porta')}</Text>
              <TextInput style={styles.input} placeholder="Ex: 5432" placeholderTextColor={theme.colors.textSecondary} value={port} onChangeText={setPort} keyboardType="numeric" />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('Usuário')}</Text>
              <TextInput style={styles.input} placeholder="postgres" placeholderTextColor={theme.colors.textSecondary} value={user} onChangeText={setUser} autoCapitalize="none" />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('Senha')}</Text>
              <TextInput style={styles.input} placeholder={t('sua senha')} placeholderTextColor={theme.colors.textSecondary} value={password} onChangeText={setPassword} secureTextEntry />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('Nome do Banco de Dados')}</Text>
              <TextInput style={styles.input} placeholder="meu_banco" placeholderTextColor={theme.colors.textSecondary} value={dbName} onChangeText={setDbName} autoCapitalize="none" />
            </View>

            <View style={styles.relayToggle}>
              <View style={styles.relayToggleText}>
                <Text style={styles.relayTitle}>☁️ {t('DevFlux Cloud Relay (Ativo)')}</Text>
                <Text style={styles.relaySub}>{t('Conexão roteada exclusivamente via nuvem de alta velocidade no servidor VPS sem bloqueios.')}</Text>
              </View>
              <Icon name="Cloud" size={22} color={theme.colors.accentBlue} />
            </View>

            <View style={styles.formActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setIsAdding(false)}>
                <Text style={styles.btnCancelText}>{t('Cancelar')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnTest} onPress={testConnection} disabled={isTesting}>
                {isTesting ? <ActivityIndicator size="small" color={theme.colors.accentBlue} /> : <Text style={styles.btnTestText}>{t('Testar')}</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSave} onPress={handleAdd}>
                <Text style={styles.btnSaveText}>{t('Salvar')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View>
            <TouchableOpacity style={styles.addBtn} onPress={() => setIsAdding(true)}>
              <Icon name="PlusCircle" size={20} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.addBtnText}>{t('Adicionar Servidor')}</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>{t('Servidores Salvos')}</Text>
            
            {connections.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="Database" size={48} color={theme.colors.border} />
                <Text style={styles.emptyText}>{t('Nenhuma conexão salva ainda.')}</Text>
              </View>
            ) : (
              connections.map(conn => (
                <View key={conn.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <TouchableOpacity style={[styles.card, { flex: 1, marginBottom: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 }]} onPress={() => handleConnect(conn)}>
                    <View style={styles.cardIcon}>
                      <Icon name="Database" size={24} color={theme.colors.accentBlue} />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardName}>{conn.name}</Text>
                      <Text style={styles.cardHost}>{conn.user} @ {conn.host}:{conn.port}</Text>
                    </View>
                    <Icon name="ChevronRight" size={20} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                  
                  <View style={{ flexDirection: 'row', backgroundColor: theme.colors.bgElevated, height: '100%', borderTopRightRadius: 12, borderBottomRightRadius: 12, borderWidth: 1, borderColor: theme.colors.border, borderLeftWidth: 0, paddingRight: 8 }}>
                    <TouchableOpacity onPress={() => handleEdit(conn)} style={{ paddingHorizontal: 10, justifyContent: 'center' }}>
                      <Icon name="Edit2" size={18} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(conn.id)} style={{ paddingHorizontal: 10, justifyContent: 'center' }}>
                      <Icon name="Trash2" size={18} color="#FF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontFamily: theme.typography.ui,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  subtitle: {
    fontFamily: theme.typography.mono,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  content: {
    padding: 20,
  },
  sectionTitle: {
    fontFamily: theme.typography.ui,
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
    marginBottom: 16,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentBlue,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 32,
  },
  addBtnText: {
    fontFamily: theme.typography.ui,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFF',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgElevated,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardIcon: {
    width: 44, height: 44,
    borderRadius: 10,
    backgroundColor: theme.colors.bgSurface,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 16,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontFamily: theme.typography.ui,
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  cardHost: {
    fontFamily: theme.typography.mono,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  formContainer: {
    backgroundColor: theme.colors.bgElevated,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontFamily: theme.typography.ui,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.ui,
    fontSize: 15,
  },
  formActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: theme.colors.bgSurface,
    alignItems: 'center',
  },
  btnCancelText: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: 'bold',
  },
  btnTest: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnTestText: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    color: theme.colors.accentBlue,
    fontWeight: 'bold',
  },
  btnSave: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: theme.colors.accentBlue,
    alignItems: 'center',
  },
  btnSaveText: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    color: '#FFF',
    fontWeight: 'bold',
  },
  relayToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 1,
    borderColor: theme.colors.accentBlue + '50',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    marginTop: 4,
  },
  relayToggleText: {
    flex: 1,
    marginRight: 12,
  },
  relayTitle: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  relaySub: {
    fontFamily: theme.typography.ui,
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgPrimary,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.accentBlue,
    borderColor: theme.colors.accentBlue,
  }
});
