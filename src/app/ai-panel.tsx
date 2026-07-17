import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../contexts/ThemeContext';
import { AppTheme } from '../theme';
import { Icon } from '../components/Icon';
import { useAISettings } from '../contexts/AISettingsContext';
import { FileSystemService, ProjectInfo } from '../services/FileSystemService';
import { MonacoEditor } from '../components/MonacoEditor';

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export default function AIPanelScreen() {
  const { theme } = useAppTheme();
  const styles = getStyles(theme);
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  
  const [pendingWrite, setPendingWrite] = useState<{ path: string, content: string, originalContent: string } | null>(null);
  const pendingResolver = useRef<((value: boolean) => void) | null>(null);
  const { settings, isConfigured } = useAISettings();
  const [projectId, setProjectId] = useState<string | null>((params.projectId as string) || null);
  const [allProjects, setAllProjects] = useState<ProjectInfo[]>([]);
  
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!isConfigured) {
      alert('Por favor, configure sua API Key primeiro.');
      router.replace('/ai-settings');
      return;
    }
    
    const loadProjects = async () => {
      const projs = await FileSystemService.getProjects();
      setAllProjects(projs);
      if (!projectId && projs.length > 0) {
        setProjectId(projs[0].id);
      }
    };
    loadProjects();

    setMessages([
      { role: 'assistant', content: 'Olá! Sou seu Agente IA Autônomo. Como posso ajudar com seu código hoje?' }
    ]);
  }, []);

  const getSystemPrompt = (projectName: string) => {
    return `Você é o CodeFlex Copilot, um Agente IA autônomo dentro de uma IDE Mobile.
Você está trabalhando no projeto "${projectName}".
Você PODE ler e modificar o sistema de arquivos local do usuário usando tools.
Sempre que o usuário pedir para modificar um arquivo, use a tool 'write_file'.
Seja conciso nas suas respostas em texto, pois estamos no mobile.`;
  };

  const executeToolCall = async (toolCall: any): Promise<string> => {
    try {
      const args = JSON.parse(toolCall.function.arguments);
      if (toolCall.function.name === 'list_dir') {
        const tree = await FileSystemService.getProjectFileTree(projectId!);
        return JSON.stringify(tree);
      }
      if (toolCall.function.name === 'read_file') {
        const content = await FileSystemService.readFile(projectId!, args.path);
        return content;
      }
      if (toolCall.function.name === 'write_file') {
        let originalContent = '';
        try {
          originalContent = await FileSystemService.readFile(projectId!, args.path);
        } catch (e) {
          // File might not exist yet
        }

        const approved = await new Promise<boolean>((resolve) => {
          setPendingWrite({
            path: args.path,
            content: args.content,
            originalContent
          });
          pendingResolver.current = resolve;
        });

        if (approved) {
          await FileSystemService.writeFile(projectId!, args.path, args.content);
          return `File ${args.path} written successfully.`;
        } else {
          return `User rejected the write operation for ${args.path}.`;
        }
      }
      return 'Tool not found';
    } catch (e: any) {
      return `Error executing tool: ${e.message}`;
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !projectId) return;
    
    const userMsg: Message = { role: 'user', content: input.trim() };
    setInput('');
    
    const project = allProjects.find(p => p.id === projectId);
    const systemPrompt: Message = { role: 'system', content: getSystemPrompt(project?.name || 'Desconhecido') };
    
    let currentMessages = [...messages, userMsg];
    setMessages(currentMessages);
    setIsLoading(true);

    try {
      let isDone = false;
      let conversation = [systemPrompt, ...currentMessages];

      while (!isDone) {
        const response = await fetchOpenAIChat(conversation);
        const assistantMsg = response.choices[0].message;
        
        currentMessages = [...currentMessages, assistantMsg];
        setMessages([...currentMessages]);

        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          // Execute tools
          for (const toolCall of assistantMsg.tool_calls) {
            const toolResult = await executeToolCall(toolCall);
            const toolMsg: Message = {
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: toolResult
            };
            currentMessages = [...currentMessages, toolMsg];
            conversation = [systemPrompt, ...currentMessages];
          }
          // Loop will continue and send the tool results back to LLM
        } else {
          isDone = true;
        }
      }
    } catch (e: any) {
      setMessages([...currentMessages, { role: 'assistant', content: `Erro: ${e.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchOpenAIChat = async (msgs: Message[]) => {
    const url = settings.provider === 'openrouter' 
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : settings.provider === 'google'
      ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
      
    const tools = [
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

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey.trim()}`,
        'HTTP-Referer': 'https://codeflex.app',
        'X-Title': 'CodeFlex Mobile IDE',
      },
      body: JSON.stringify({
        model: settings.model,
        messages: msgs,
        tools: tools,
        tool_choice: 'auto'
      })
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText);
    }
    return await res.json();
  };

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

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.projectSelector}>
        <Text style={styles.projectLabel}>Projeto Atual:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {allProjects.map(p => (
            <TouchableOpacity 
              key={p.id} 
              style={[styles.projectChip, projectId === p.id && styles.projectChipActive]}
              onPress={() => setProjectId(p.id)}
            >
              <Text style={[styles.projectChipText, projectId === p.id && styles.projectChipTextActive]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.projectSelector, { paddingVertical: 8, paddingTop: 0, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <Text style={styles.projectLabel}>Modelo IA:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity 
            style={[styles.projectChip, { flexDirection: 'row', alignItems: 'center' }]}
            onPress={() => router.push('/ai-settings')}
          >
            <Icon name="Settings" size={12} color={theme.colors.textPrimary} style={{ marginRight: 6 }} />
            <Text style={styles.projectChipText}>{settings.provider} - {settings.model || 'Padrão'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(_, index) => index.toString()}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Peça para a IA editar algo..."
          placeholderTextColor={theme.colors.textSecondary}
          value={input}
          onChangeText={setInput}
          multiline
        />
        <TouchableOpacity 
          style={[styles.sendBtn, (!input.trim() || isLoading) && { opacity: 0.5 }]} 
          onPress={handleSend}
          disabled={!input.trim() || isLoading}
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
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalBtnReject]} 
                onPress={() => {
                  pendingResolver.current?.(false);
                  setPendingWrite(null);
                }}
              >
                <Text style={styles.modalBtnText}>Rejeitar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.modalBtnApprove]} 
                onPress={() => {
                  pendingResolver.current?.(true);
                  setPendingWrite(null);
                }}
              >
                <Text style={styles.modalBtnText}>Aprovar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const getStyles = (theme: AppTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: theme.colors.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  backButton: { marginRight: 16 },
  title: { fontSize: 16, color: theme.colors.textPrimary, fontFamily: theme.typography.uiBold },
  subtitle: { fontSize: 10, color: theme.colors.textSecondary, fontFamily: theme.typography.mono },
  projectSelector: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  projectLabel: { fontSize: 12, color: theme.colors.textSecondary, fontFamily: theme.typography.uiBold, marginRight: 12 },
  projectChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: theme.colors.bgSurface, marginRight: 8 },
  projectChipActive: { backgroundColor: theme.colors.accentBlue },
  projectChipText: { fontSize: 12, color: theme.colors.textPrimary, fontFamily: theme.typography.uiBold },
  projectChipTextActive: { color: '#FFF' },
  chatContent: { padding: 16, gap: 16 },
  messageBubble: { maxWidth: '85%', padding: 12, borderRadius: 16 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: theme.colors.accentBlue, borderBottomRightRadius: 4 },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: theme.colors.bgElevated, borderBottomLeftRadius: 4 },
  toolBubble: { alignSelf: 'flex-start', backgroundColor: theme.colors.bgSurface, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  messageText: { fontFamily: theme.typography.ui, fontSize: 14, lineHeight: 20 },
  userText: { color: '#FFF' },
  assistantText: { color: theme.colors.textPrimary },
  toolText: { color: theme.colors.accentPurple, fontFamily: theme.typography.uiBold, fontSize: 12 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: 12, backgroundColor: theme.colors.bgElevated,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border,
  },
  input: {
    flex: 1, backgroundColor: theme.colors.bgSurface,
    color: theme.colors.textPrimary, fontFamily: theme.typography.ui,
    fontSize: 14, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    borderRadius: 20, maxHeight: 100, marginRight: 12,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.colors.accentBlue,
    alignItems: 'center', justifyContent: 'center'
  },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: theme.colors.bgPrimary, borderRadius: 12, overflow: 'hidden', flex: 1, marginVertical: 40 },
  modalHeader: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  modalTitle: { color: theme.colors.textPrimary, fontFamily: theme.typography.uiBold, fontSize: 16 },
  modalSubtitle: { color: theme.colors.textSecondary, fontFamily: theme.typography.mono, fontSize: 12, marginTop: 4 },
  modalActions: { flexDirection: 'row', padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalBtnReject: { backgroundColor: '#EF4444' },
  modalBtnApprove: { backgroundColor: '#10B981' },
  modalBtnText: { color: '#FFF', fontFamily: theme.typography.uiBold, fontSize: 14 }
});
