export interface LineChangeStats {
  addedLines: number;
  removedLines: number;
  modifiedLines: number;
  totalChangedLines: number;
  isUnsaved?: boolean;
}

export type EditorChangeStatsByPath = Record<string, LineChangeStats>;

interface EditorChangeSnapshot {
  projectId: string;
  dirtyFileIds: string[];
  changeStatsByPath: EditorChangeStatsByPath;
  updatedAt: number;
}

type EditorChangeListener = (snapshot: EditorChangeSnapshot) => void;

let snapshot: EditorChangeSnapshot = {
  projectId: '',
  dirtyFileIds: [],
  changeStatsByPath: {},
  updatedAt: Date.now(),
};

const listeners = new Set<EditorChangeListener>();

const emit = () => {
  listeners.forEach(listener => listener(snapshot));
};

export const EditorChangeState = {
  getSnapshot: () => snapshot,

  subscribe(listener: EditorChangeListener) {
    listeners.add(listener);
    listener(snapshot);
    return () => {
      listeners.delete(listener);
    };
  },

  publish(projectId: string, dirtyFileIds: Iterable<string>, changeStatsByPath: EditorChangeStatsByPath) {
    snapshot = {
      projectId,
      dirtyFileIds: Array.from(new Set(dirtyFileIds)).filter(Boolean),
      changeStatsByPath: { ...changeStatsByPath },
      updatedAt: Date.now(),
    };
    emit();
  },

  clearProject(projectId: string) {
    if (snapshot.projectId !== projectId) return;
    snapshot = {
      projectId: '',
      dirtyFileIds: [],
      changeStatsByPath: {},
      updatedAt: Date.now(),
    };
    emit();
  },
};

