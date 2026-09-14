import * as Clipboard from 'expo-clipboard';
import { DeviceEventEmitter } from 'react-native';
import { DebugService } from '../services/DebugService';
import { ContextManager } from '../services/ContextManager';

export async function handleEditorNativeMessage(
  data: any,
  post: (message: any) => void,
  isCurrent: () => boolean,
  file: string | undefined,
  onSave?: (content: string) => Promise<void>,
) {
  if (data.type === 'clipboard') {
    try {
      if (!isCurrent()) throw new Error('Editor sem foco.');
      let text = '';
      if (data.operation === 'paste') text = await Clipboard.getStringAsync();
      else await Clipboard.setStringAsync(data.text || '');
      if (!isCurrent()) return true;
      post({ type: 'clipboardResult', requestId: data.requestId, text });
    } catch (error) {
      DebugService.log('editor', 'error', 'Falha na area de transferencia.', {
        project: ContextManager.getActiveProject() || undefined, file, error: String(error),
      });
      post({ type: 'clipboardResult', requestId: data.requestId, error: String(error) });
    }
    return true;
  }
  if (data.type === 'save') {
    try {
      if (!isCurrent() || !onSave) throw new Error('Salvamento indisponivel neste editor.');
      await onSave(data.content);
      DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_ACTION_COMPLETE', { target: 'editor', requestId: data.requestId });
    } catch (error) {
      DebugService.log('file', 'error', 'Falha ao salvar pelo atalho.', { file, error: String(error) });
    }
    return true;
  }
  if (data.type === 'actionComplete') {
    if (data.error) DebugService.log('editor', 'error', 'Atalho falhou.', { file, error: data.error });
    if (isCurrent()) DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_ACTION_COMPLETE', { target: 'editor', requestId: data.requestId });
    return true;
  }
  if (data.type === 'modifiersConsumed') {
    if (isCurrent()) DeviceEventEmitter.emit('KEYBOARD_TOOLBAR_MODIFIERS_CONSUMED', { target: 'editor' });
    return true;
  }
  return false;
}
