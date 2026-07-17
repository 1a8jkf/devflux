import React, { createContext, useContext, useState, ReactNode } from 'react';
import { FileSystemService } from '../services/FileSystemService';
import { LiveSyncService } from '../services/LiveSyncService';

export interface PendingChange {
  path: string;
  originalContent: string;
  newContent: string;
}

interface AIContextProps {
  pendingChanges: Record<string, PendingChange>;
  addPendingChange: (projectId: string, path: string, originalContent: string, newContent: string) => void;
  approveChange: (projectId: string, path: string) => Promise<void>;
  rejectChange: (path: string) => void;
  clearAll: () => void;
}

const AIContext = createContext<AIContextProps | undefined>(undefined);

export const AIProvider = ({ children }: { children: ReactNode }) => {
  const [pendingChanges, setPendingChanges] = useState<Record<string, PendingChange>>({});

  const addPendingChange = (projectId: string, path: string, originalContent: string, newContent: string) => {
    setPendingChanges(prev => ({
      ...prev,
      [path]: { path, originalContent, newContent }
    }));
  };

  const approveChange = async (projectId: string, path: string) => {
    const change = pendingChanges[path];
    if (change) {
      await FileSystemService.writeFile(projectId, path, change.newContent);
      setPendingChanges(prev => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
    }
  };

  const rejectChange = (path: string) => {
    setPendingChanges(prev => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
  };

  const clearAll = () => {
    setPendingChanges({});
  };

  return (
    <AIContext.Provider value={{ pendingChanges, addPendingChange, approveChange, rejectChange, clearAll }}>
      {children}
    </AIContext.Provider>
  );
};

export const useAIContext = () => {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAIContext must be used within an AIProvider');
  }
  return context;
};
