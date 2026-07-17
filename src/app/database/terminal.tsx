import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, PanResponder, Animated } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAppTheme } from '../../contexts/ThemeContext';
import { AppTheme } from '../../theme';
import { Icon } from '../../components/Icon';
import { DatabaseService } from '../../services/DatabaseService';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface QueryResult {
  columns: string[];
  rows: any[][];
  rowCount?: number;
}

interface QueryTab {
  id: string;
  title: string;
  query: string;
  result: QueryResult | null;
  errorMsg: string;
}

export default function SQLTerminalScreen() {
  const { theme, variant } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const connectionId = params.connectionId as string;
  const connectionName = (params.connectionName as string) || 'Database';

  const [config, setConfig] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  
  // Tabs
  const [tabs, setTabs] = useState<QueryTab[]>([
    { id: '1', title: 'Query 1', query: '', result: null, errorMsg: '' }
  ]);
  const [activeTabId, setActiveTabId] = useState('1');
  const tabCounter = useRef(1);

  // Resizable Editor (Smooth)
  const editorHeightAnim = useRef(new Animated.Value(150)).current;
  const lastHeight = useRef(150);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        editorHeightAnim.setOffset(lastHeight.current);
        editorHeightAnim.setValue(0);
      },
      onPanResponderMove: Animated.event([
        null, { dy: editorHeightAnim }
      ], { useNativeDriver: false }),
      onPanResponderRelease: (evt, gestureState) => {
        editorHeightAnim.flattenOffset();
        let newHeight = lastHeight.current + gestureState.dy;
        if (newHeight < 80) newHeight = 80;
        if (newHeight > 500) newHeight = 500;
        
        Animated.spring(editorHeightAnim, {
          toValue: newHeight,
          useNativeDriver: false,
        }).start();
        
        lastHeight.current = newHeight;
      },
    })
  ).current;

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    if (connectionId) {
      AsyncStorage.getItem('@db_connections').then(data => {
        if (data) {
          const conns = JSON.parse(data);
          const current = conns.find((c: any) => c.id === connectionId);
          if (current) setConfig(current);
        }
      });
    }
  }, [connectionId]);

  const updateActiveTab = (updates: Partial<QueryTab>) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
  };

  const addTab = () => {
    tabCounter.current += 1;
    const newTab: QueryTab = {
      id: Date.now().toString(),
      title: `Query ${tabCounter.current}`,
      query: '',
      result: null,
      errorMsg: '',
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const closeTab = (id: string) => {
    if (tabs.length <= 1) return; // keep at least 1 tab
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  const handleRunQuery = async () => {
    if (!config) {
      updateActiveTab({ errorMsg: 'Configuração de conexão não encontrada.' });
      return;
    }
    if (!activeTab.query.trim()) {
      updateActiveTab({ errorMsg: 'Digite uma query SQL para executar.' });
      return;
    }
    setIsRunning(true);
    updateActiveTab({ errorMsg: '' });
    try {
      const res = await DatabaseService.query({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.dbName
      }, activeTab.query);
      
      updateActiveTab({
        result: {
          columns: res.columns || [],
          rows: res.rows || [],
          rowCount: res.rowCount,
        },
        errorMsg: '',
      });
    } catch (err: any) {
      updateActiveTab({
        errorMsg: err?.message || 'Erro desconhecido ao executar query.',
        result: null,
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header - sem logo */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Icon name="ArrowLeft" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Terminal SQL</Text>
          <Text style={styles.subtitle}>{connectionName}</Text>
        </View>
        <TouchableOpacity style={styles.runBtn} onPress={handleRunQuery} disabled={isRunning}>
          {isRunning ? <ActivityIndicator size="small" color="#FFF" /> : <Icon name="Play" size={16} color="#FFF" style={{ marginRight: 6 }} />}
          {!isRunning && <Text style={styles.runBtnText}>Executar</Text>}
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
          {tabs.map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, tab.id === activeTabId && styles.tabActive]}
              onPress={() => setActiveTabId(tab.id)}
            >
              <Icon name="FileText" size={13} color={tab.id === activeTabId ? theme.colors.accentBlue : theme.colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={[styles.tabText, tab.id === activeTabId && styles.tabTextActive]}>{tab.title}</Text>
              {tabs.length > 1 && (
                <TouchableOpacity onPress={() => closeTab(tab.id)} style={styles.tabClose}>
                  <Icon name="X" size={12} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity onPress={addTab} style={styles.tabAdd}>
          <Icon name="Plus" size={18} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* SQL Editor */}
      <Animated.View style={[styles.editorContainer, { height: editorHeightAnim }]}>
        <View style={styles.editorLineNumbers}>
          {(activeTab.query || '').split('\n').map((_: string, i: number) => (
            <Text key={i} style={styles.lineNumber}>{i + 1}</Text>
          ))}
        </View>
        <TextInput
          style={styles.editorInput}
          value={activeTab.query}
          onChangeText={(text) => updateActiveTab({ query: text })}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          textAlignVertical="top"
          placeholder="SELECT * FROM tabela;"
          placeholderTextColor={theme.colors.textSecondary + '80'}
        />
      </Animated.View>

      {/* Resizer Handle */}
      <View {...panResponder.panHandlers} style={styles.resizer}>
        <View style={styles.resizerGrip} />
      </View>

      {/* Resultados */}
      <View style={styles.resultsContainer}>
        <View style={styles.resultsHeader}>
          <Icon name="Table" size={16} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
          <Text style={styles.resultsTitle}>Resultados</Text>
          {activeTab.result && (
            <Text style={styles.rowCount}>{activeTab.result.rowCount ?? activeTab.result.rows.length} linhas</Text>
          )}
        </View>
        
        {activeTab.errorMsg ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: '#EF4444', fontFamily: theme.typography.mono, fontSize: 13 }}>{activeTab.errorMsg}</Text>
          </View>
        ) : activeTab.result ? (
          <ScrollView horizontal style={styles.tableScrollX}>
            <View>
              {/* Table Header */}
              <View style={styles.tableRowHeader}>
                {activeTab.result.columns.map((col: string, idx: number) => (
                  <View key={`th-${idx}`} style={styles.tableCellHeader}>
                    <Text style={styles.tableCellHeaderText}>{col}</Text>
                  </View>
                ))}
              </View>
              
              {/* Table Body */}
              <ScrollView style={styles.tableScrollY}>
                {activeTab.result.rows.map((row: any[], rIdx: number) => (
                  <View key={`tr-${rIdx}`} style={[styles.tableRow, rIdx % 2 !== 0 && styles.tableRowStriped]}>
                    {row.map((cell: any, cIdx: number) => (
                      <View key={`td-${rIdx}-${cIdx}`} style={styles.tableCell}>
                        <Text style={styles.tableCellText} numberOfLines={1}>{cell === null ? 'NULL' : String(cell)}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>
            </View>
          </ScrollView>
        ) : (
          <View style={styles.emptyResults}>
            <Icon name="TerminalSquare" size={32} color={theme.colors.border} />
            <Text style={styles.emptyResultsText}>Execute uma query SQL para ver os resultados.</Text>
          </View>
        )}
      </View>
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
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: { marginRight: 16 },
  title: {
    fontFamily: theme.typography.ui,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  subtitle: {
    fontFamily: theme.typography.mono,
    fontSize: 12,
    color: theme.colors.accentBlue,
    marginTop: 2,
  },
  runBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  runBtnText: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFF',
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingLeft: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginRight: 2,
  },
  tabActive: {
    borderBottomColor: theme.colors.accentBlue,
    backgroundColor: theme.colors.bgSurface,
  },
  tabText: {
    fontFamily: theme.typography.ui,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: theme.colors.accentBlue,
    fontWeight: '600',
  },
  tabClose: {
    marginLeft: 8,
    padding: 2,
  },
  tabAdd: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
  },

  // Editor
  editorContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  editorLineNumbers: {
    paddingTop: 14,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.bgPrimary,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    alignItems: 'flex-end',
    minWidth: 36,
  },
  lineNumber: {
    fontFamily: theme.typography.mono,
    fontSize: 13,
    lineHeight: 20,
    color: theme.colors.textSecondary + '80',
  },
  editorInput: {
    flex: 1,
    fontFamily: theme.typography.mono,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textPrimary,
    padding: 12,
    textAlignVertical: 'top',
  },

  // Results
  resultsContainer: {
    flex: 1,
    backgroundColor: theme.colors.bgElevated,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  resultsTitle: {
    fontFamily: theme.typography.ui,
    fontSize: 13,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    flex: 1,
  },
  rowCount: {
    fontFamily: theme.typography.mono,
    fontSize: 12,
    color: theme.colors.accentBlue,
  },
  emptyResults: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyResultsText: {
    fontFamily: theme.typography.ui,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 12,
  },
  tableScrollX: {
    flex: 1,
  },
  tableScrollY: {
    flex: 1,
  },
  tableRowHeader: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgPrimary,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.border,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tableRowStriped: {
    backgroundColor: theme.colors.bgSurface,
  },
  tableCellHeader: {
    width: 140,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  tableCellHeaderText: {
    fontFamily: theme.typography.ui,
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  tableCell: {
    width: 140,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  tableCellText: {
    fontFamily: theme.typography.mono,
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  // Resizer
  resizer: {
    height: 16,
    backgroundColor: theme.colors.bgPrimary,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  resizerGrip: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  }
});
