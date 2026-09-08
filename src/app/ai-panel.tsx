import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, Platform, ActivityIndicator, ScrollView, Modal, Keyboard, DeviceEventEmitter, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { AIProviderConfig, useAISettings } from '../contexts/AISettingsContext';
import { FileSystemService, ProjectInfo } from '../services/FileSystemService';
import { MonacoEditor } from '../components/MonacoEditor';
import { AIService, Message } from '../services/AIService';
import { ContextManager } from '../services/ContextManager';
import { DebugService } from '../services/DebugService';


const configHasKey = (config: AIProviderConfig) => config.apiKey.trim().length > 10 && config.model.trim().length > 0;

export default function AIPanelScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const [pendingWrite, setPendingWrite] = useState<{ path: string, content: string, originalContent: string } | null>(null);
  const pendingResolver = useRef<((value: boolean) => void) | null>(null);
  const { settings, isConfigured, isLoading: isSettingsLoading, configs, activeConfigId, selectConfig } = useAISettings();
  const initialProjectId = Array.isArray(params.projectId) ? params.projectId[0] : (params.projectId as string) || null;
  const initialProjectIdRef = useRef<string | null>(initialProjectId);
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [allProjects, setAllProjects] = useState<ProjectInfo[]>([]);
  const [keyboardInset, setKeyboardInset] = useState(insets.bottom);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    (global as any).activeInputTarget = 'chat';
    DeviceEventEmitter.emit('HIDE_KEYBOARD_TOOLBAR');
  }, []);

  useEffect(() => {
    if (!projectId) return;
    ContextManager.setActiveProject(projectId);
    if (!initialProjectIdRef.current || initialProjectIdRef.current !== projectId) {
      ContextManager.setActiveFile(null);
    }
  }, [projectId]);

  useEffect(() => {
    if (isSettingsLoading) return;
    if (isConfigured) return;

    const firstConfigured = configs.find(configHasKey);
    if (firstConfigured) {
      selectConfig(firstConfigured.id);
      return;
    }

    DebugService.log('ai', 'warn', 'Chat aberto sem configuração de IA cadastrada.');
    router.replace('/ai-settings');
  }, [isSettingsLoading, isConfigured, configs, selectConfig, router]);

  useEffect(() => {
    const updateFromKeyboard = (e?: any) => {
      DeviceEventEmitter.emit('HIDE_KEYBOARD_TOOLBAR');
      const windowHeight = Dimensions.get('window').height;
      const keyboardTop = e?.endCoordinates?.screenY;
      const overlap = typeof keyboardTop === 'number' ? Math.max(0, windowHeight - keyboardTop) : 0;
      setKeyboardInset(Math.max(insets.bottom, overlap));
    };
    const resetKeyboard = () => setKeyboardInset(insets.bottom);

    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', updateFromKeyboard);
    const changeSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow', updateFromKeyboard);
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', resetKeyboard);

    let cleanupViewport: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.visualViewport) {
      const syncViewport = () => {
        const viewport = window.visualViewport!;
        const hiddenBottom = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        setKeyboardInset(Math.max(insets.bottom, hiddenBottom));
      };
      window.visualViewport.addEventListener('resize', syncViewport);
      window.visualViewport.addEventListener('scroll', syncViewport);
      syncViewport();
      cleanupViewport = () => {
        window.visualViewport?.removeEventListener('resize', syncViewport);
        window.visualViewport?.removeEventListener('scroll', syncViewport);
      };
    }

    return () => {
      showSub.remove();
      changeSub.remove();
      hideSub.remove();
      cleanupViewport?.();
    };
  }, [insets.bottom]);

  useEffect(() => {
    if (isSettingsLoading || !isConfigured) return;

    const loadProjects = async () => {
      try {
        const projs = await FileSystemService.getProjects();
        setAllProjects(projs);
        const selectedProjectId = projectId || projs[0]?.id || null;
        if (!projectId && selectedProjectId) setProjectId(selectedProjectId);
      } catch (e: any) {
        DebugService.log('file', 'error', 'Projetos não carregaram para o Chat IA.', { error: e?.message || String(e) });
      }
    };

    loadProjects();
  }, [isSettingsLoading, isConfigured, projectId]);

  useEffect(() => {
    if (!projectId || !isConfigured) return;

    let mounted = true;
    const loadConversation = async () => {
      const history = await AIService.loadHistory(projectId);
      if (!mounted) return;
      if (history.length > 0) {
        setMessages(history);
      } else {
        setMessages([{ role: 'assistant', content: 'Olá! Sou seu Agente IA Autônomo. Como posso ajudar com seu código hoje?' }]);
      }
    };

    loadConversation();
    return () => { mounted = false; };
  }, [projectId, isConfigured]);

  const getSystemPrompt = async (projectName: string) => {
    const context = await ContextManager.buildContextString();
    return `Você é o DevFlux Copilot, um Agente IA autônomo dentro de uma IDE Mobile.
Você está trabalhando no projeto "${projectName}".
${context ? `Contexto Atual:\n${context}` : ''}
Você PODE ler e modificar o sistema de arquivos local do usuário usando tools.
Sempre que o usuário pedir para modificar um arquivo, use a tool 'write_file'.
Seja conciso nas suas respostas em texto, pois estamos no mobile.`;
  };

  const executeToolCall = async (toolCall: any): Promise<string> => {
    try {
      const args = JSON.parse(toolCall.function.arguments);
      if (toolCall.function.name === 'list_dir') {
        const tree = await FileSystemService.getProjectFileTree(projectId!);
        DebugService.log('ai', 'info', 'IA listou arquivos do projeto.', { project: projectId! });
        return JSON.stringify(tree);
      }
      if (toolCall.function.name === 'read_file') {
        const content = await FileSystemService.readFile(projectId!, args.path);
        DebugService.log('ai', 'info', 'IA leu arquivo do projeto.', { project: projectId!, file: args.path, bytes: content.length });
        return content;
      }
      if (toolCall.function.name === 'write_file') {
        let originalContent = '';
        try {
          originalContent = await FileSystemService.readFile(projectId!, args.path);
        } catch {}

        const approved = await new Promise<boolean>((resolve) => {
          setPendingWrite({ path: args.path, content: args.content, originalContent });
          pendingResolver.current = resolve;
        });

        if (approved) {
          await FileSystemService.writeFile(projectId!, args.path, args.content);
          DebugService.log('ai', 'info', `Arquivo ${args.path} modificado pela IA.`, { project: projectId!, file: args.path });
          return `File ${args.path} written successfully.`;
        }

        DebugService.log('ai', 'warn', `Usuário rejeitou alteração no arquivo ${args.path}.`, { project: projectId!, file: args.path });
        return `User rejected the write operation for ${args.path}.`;
      }
      return 'Tool not found';
    } catch (e: any) {
      DebugService.log('ai', 'error', `Erro executando tool da IA: ${e.message}`, { project: projectId || undefined, tool: toolCall?.function?.name });
      return `Error executing tool: ${e.message}`;
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !projectId || !isConfigured) return;

    const userMsg: Message = { role: 'user', content: input.trim() };
    setInput('');

    const project = allProjects.find(p => p.id === projectId);
    const systemContent = await getSystemPrompt(project?.name || 'Desconhecido');
    const systemPrompt: Message = { role: 'system', content: systemContent };

    let currentMessages = [...messages, userMsg];
    setMessages(currentMessages);
    setIsLoading(true);
    DebugService.log('ai', 'info', 'Gerando resposta...', { project: projectId, provider: settings.provider, model: settings.model });

    try {
      let isDone = false;
      let conversation = [systemPrompt, ...currentMessages];

      while (!isDone) {
        const response = await AIService.fetchChat(settings, conversation, getTools());
        const assistantMsg = response.choices[0].message;

        currentMessages = [...currentMessages, assistantMsg];
        setMessages([...currentMessages]);
        await AIService.saveHistory(projectId, currentMessages);

        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          for (const toolCall of assistantMsg.tool_calls) {
            const toolResult = await executeToolCall(toolCall);
            const toolMsg: Message = {
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: toolResult
            };
            currentMessages = [...currentMessages, toolMsg];
            setMessages([...currentMessages]);
            await AIService.saveHistory(projectId, currentMessages);
            conversation = [systemPrompt, ...currentMessages];
          }
        } else {
          isDone = true;
        }
      }
      DebugService.log('ai', 'info', 'Resposta recebida.', { project: projectId, provider: settings.provider, model: settings.model });
    } catch (e: any) {
      DebugService.log('ai', 'error', `Falha na requisição: ${e.message}`, { project: projectId, provider: settings.provider, model: settings.model });
      setMessages([...currentMessages, { role: 'assistant', content: `Erro: ${e.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const getTools = () => [
    {
      type: 'function',
      function: {
        name: 'list_dir',
        description: 'Lista todos os arquivos do projeto atual.',
        parameters: { type: 'object', properties: {}, required: [] }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Lê o conteúdo de um arquivo.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Caminho do arquivo (ex: src/index.js)' }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Cria ou sobrescreve um arquivo no projeto.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Caminho do arquivo' },
            content: { type: 'string', description: 'Conteúdo completo do arquivo' }
          },
          required: ['path', 'content']
        }
      }
    }
  ];


  const renderMessage = ({ item }: { item: Message }) => {
    if (item.role === 'system' || item.role === 'tool') return null;
    if (item.role === 'assistant' && item.tool_calls) {
      return (
        <View style={[styles.messageBubble, styles.toolBubble]}>
          <Icon name="Wrench" size={14} color={theme.colors.accentPurple} style={{ marginRight: 6 }} />
          <Text style={styles.toolText}>Executando ação...</Text>
        </View>
      );
    }
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>{item.content}</Text>
      </View>
    );
  };

  const configuredConfigs = configs.filter(configHasKey);
  const activeProject = allProjects.find(p => p.id === projectId);
  const selectedProjectLabel = activeProject?.name || projectId || 'Nenhum projeto';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Chat IA</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{selectedProjectLabel} → {settings.model}</Text>
        </View>

        <View style={styles.headerSpacer} />

      </View>

      <View style={styles.flowPanel}>
        <View style={styles.selectorRow}>
          <Text style={styles.selectorLabel}>Projeto</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroller} keyboardShouldPersistTaps="handled">
            {allProjects.length > 0 ? allProjects.map(p => (
              <TouchableOpacity key={p.id} style={[styles.optionChip, projectId === p.id && styles.optionChipActive]} onPress={() => setProjectId(p.id)}>
                <Text style={[styles.optionChipText, projectId === p.id && styles.optionChipTextActive]} numberOfLines={1}>{p.name}</Text>
              </TouchableOpacity>
            )) : projectId ? (
              <View style={[styles.optionChip, styles.optionChipActive]}>
                <Text style={[styles.optionChipText, styles.optionChipTextActive]} numberOfLines={1}>{projectId}</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>

        <View style={[styles.selectorRow, styles.lastSelectorRow]}>
          <Text style={styles.selectorLabel}>Modelo</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroller} keyboardShouldPersistTaps="handled">
            {configuredConfigs.map(config => (
              <TouchableOpacity key={config.id} style={[styles.optionChip, activeConfigId === config.id && styles.optionChipActive]} onPress={() => selectConfig(config.id)}>
                <Text style={[styles.optionChipText, activeConfigId === config.id && styles.optionChipTextActive]} numberOfLines={1}>{config.model}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(_, index) => index.toString()}
        style={styles.messagesList}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      />

      <View style={[styles.inputContainer, { paddingBottom: Math.max(12, keyboardInset + 8) }]}>
        <TextInput
          style={styles.input}
          placeholder={projectId ? 'Peça para a IA editar algo...' : 'Selecione um projeto primeiro'}
          placeholderTextColor={theme.colors.textSecondary}
          value={input}
          onChangeText={setInput}
          multiline
          onFocus={() => {
            (global as any).activeInputTarget = 'chat';
            DeviceEventEmitter.emit('HIDE_KEYBOARD_TOOLBAR');
          }}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || isLoading || !isConfigured) && { opacity: 0.5 }]}
          onPress={handleSend}
          disabled={!input.trim() || isLoading || !isConfigured}
        >
          {isLoading ? <ActivityIndicator color="#FFF" size="small" /> : <Icon name="Send" size={20} color="#FFF" />}
        </TouchableOpacity>
      </View>

      <Modal visible={!!pendingWrite} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Revisão Necessária</Text>
              <Text style={styles.modalSubtitle}>{pendingWrite?.path}</Text>
            </View>
            <View style={{ flex: 1 }}>
              {pendingWrite && (
                <MonacoEditor
                  code={pendingWrite.content}
                  originalCode={pendingWrite.originalContent}
                  language={pendingWrite.path.split('.').pop() || 'typescript'}
                  onChangeCode={() => {}}
                  readOnly={true}
                />
              )}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnReject]} onPress={() => { pendingResolver.current?.(false); setPendingWrite(null); }}>
                <Text style={styles.modalBtnText}>Rejeitar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnApprove]} onPress={() => { pendingResolver.current?.(true); setPendingWrite(null); }}>
                <Text style={styles.modalBtnText}>Aprovar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  backButton: { marginRight: 14, paddingVertical: 4 },
  headerText: { flex: 1, minWidth: 0 },
  headerSpacer: { width: 40 },
  title: { fontSize: 16, color: theme.colors.textPrimary, fontFamily: theme.typography.uiBold },
  subtitle: { fontSize: 11, color: theme.colors.textSecondary, fontFamily: theme.typography.mono, marginTop: 2 },
  flowPanel: {
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  selectorRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    minHeight: 46,
  },
  lastSelectorRow: { borderBottomWidth: 0 },
  selectorLabel: {
    width: 104, fontSize: 11, color: theme.colors.textSecondary, fontFamily: theme.typography.uiBold,
  },
  selectorScroller: { flex: 1 },
  optionChip: {
    maxWidth: 210,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: theme.colors.bgSurface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  optionChipActive: { backgroundColor: theme.colors.accentBlue, borderColor: theme.colors.accentBlue },
  optionChipText: { fontSize: 12, color: theme.colors.textPrimary, fontFamily: theme.typography.uiBold },
  optionChipTextActive: { color: '#FFF' },
  messagesList: { flex: 1 },
  chatContent: { padding: 16, gap: 16, flexGrow: 1 },
  messageBubble: { maxWidth: '85%', padding: 12, borderRadius: 8 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: theme.colors.accentBlue },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: theme.colors.bgElevated },
  toolBubble: { alignSelf: 'flex-start', backgroundColor: theme.colors.bgSurface, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  messageText: { fontFamily: theme.typography.ui, fontSize: 14, lineHeight: 20 },
  userText: { color: '#FFF' },
  assistantText: { color: theme.colors.textPrimary },
  toolText: { color: theme.colors.accentPurple, fontFamily: theme.typography.uiBold, fontSize: 12 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingTop: 12, paddingHorizontal: 12, backgroundColor: theme.colors.bgElevated,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border,
  },
  input: {
    flex: 1, backgroundColor: theme.colors.bgSurface,
    color: theme.colors.textPrimary, fontFamily: theme.typography.ui,
    fontSize: 14, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    borderRadius: 8, maxHeight: 112, marginRight: 12,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 8,
    backgroundColor: theme.colors.accentBlue,
    alignItems: 'center', justifyContent: 'center'
  },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: theme.colors.bgPrimary, borderRadius: 8, overflow: 'hidden', flex: 1, marginVertical: 40 },
  modalHeader: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  modalTitle: { color: theme.colors.textPrimary, fontFamily: theme.typography.uiBold, fontSize: 16 },
  modalSubtitle: { color: theme.colors.textSecondary, fontFamily: theme.typography.mono, fontSize: 12, marginTop: 4 },
  modalActions: { flexDirection: 'row', padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalBtnReject: { backgroundColor: '#EF4444' },
  modalBtnApprove: { backgroundColor: '#10B981' },
  modalBtnText: { color: '#FFF', fontFamily: theme.typography.uiBold, fontSize: 14 }
});