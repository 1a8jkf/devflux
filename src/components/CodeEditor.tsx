import React, { forwardRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { MonacoEditor } from './MonacoEditor';
import { LightweightEditor } from './LightweightEditor';

export interface CodeEditorProps {
  code: string;
  originalCode?: string;
  language: string;
  onChangeCode: (code: string) => void;
  onSaveCode?: (code: string) => Promise<void>;
  readOnly?: boolean;
  filePath?: string;
  filePaths?: string[];
  onFocus?: () => void;
  onBlur?: () => void;
}

export interface CodeEditorRef {
  undo: () => void;
  redo: () => void;
  handleToolbarAction?: (type: string, meta?: any) => void;
}

export const CodeEditor = forwardRef<CodeEditorRef, CodeEditorProps>((props, ref) => {
  const { settings } = useSettings();

  if (settings.editorEngine !== 'monaco') {
    return <LightweightEditor {...props} ref={ref} />;
  }

  return <MonacoEditor {...props} ref={ref} />;
});

CodeEditor.displayName = 'CodeEditor';
