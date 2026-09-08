export type DebugLevel = 'info' | 'warn' | 'error';
export type DebugSource = 'editor' | 'shell' | 'browser' | 'liveSync' | 'github' | 'ai' | 'runtime' | 'file' | 'system';
type LegacyDebugLevel = DebugLevel | 'debug' | 'warning' | 'critical';

export interface DebugEvent {
  id: string;
  timestamp: number;
  source: DebugSource;
  level: DebugLevel;
  message: string;
  context?: {
    project?: string;
    file?: string;
    line?: number;
    durationMs?: number;
    [key: string]: any;
  };
}

export class DebugService {
  private static events: DebugEvent[] = [];
  private static listeners: ((events: DebugEvent[]) => void)[] = [];
  private static readonly MAX_EVENTS = 500;
  private static readonly MAX_CONTEXT_VALUE_LENGTH = 500;
  private static notifyTimer: ReturnType<typeof setTimeout> | null = null;

  private static normalizeLevel(level: LegacyDebugLevel): DebugLevel {
    if (level === 'warning') return 'warn';
    if (level === 'critical') return 'error';
    if (level === 'debug') return 'info';
    return level;
  }

  private static sanitizeContext(context?: DebugEvent['context']): DebugEvent['context'] | undefined {
    if (!context) return undefined;
    const sanitized: DebugEvent['context'] = {};

    Object.entries(context).forEach(([key, value]) => {
      if (value === undefined) return;
      if (typeof value === 'string') {
        sanitized[key] = value.length > this.MAX_CONTEXT_VALUE_LENGTH
          ? `${value.slice(0, this.MAX_CONTEXT_VALUE_LENGTH)}...`
          : value;
        return;
      }
      if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        sanitized[key] = value;
        return;
      }
      try {
        const serialized = JSON.stringify(value);
        const normalized = serialized === undefined ? String(value) : serialized;
        sanitized[key] = normalized.length > this.MAX_CONTEXT_VALUE_LENGTH
          ? `${normalized.slice(0, this.MAX_CONTEXT_VALUE_LENGTH)}...`
          : normalized;
      } catch {
        const fallback = String(value);
        sanitized[key] = fallback.length > this.MAX_CONTEXT_VALUE_LENGTH
          ? `${fallback.slice(0, this.MAX_CONTEXT_VALUE_LENGTH)}...`
          : fallback;
      }
    });

    return sanitized;
  }

  public static log(source: DebugSource, level: LegacyDebugLevel, message: string, context?: DebugEvent['context']) {
    const event: DebugEvent = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      source,
      level: this.normalizeLevel(level),
      message,
      context: this.sanitizeContext(context),
    };

    this.events.unshift(event);
    if (this.events.length > this.MAX_EVENTS) {
      this.events.length = this.MAX_EVENTS;
    }

    this.scheduleNotify();
  }

  public static getEvents() {
    return [...this.events];
  }

  public static subscribe(listener: (events: DebugEvent[]) => void) {
    this.listeners.push(listener);
    listener([...this.events]);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private static scheduleNotify() {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      const snapshot = [...this.events];
      for (const listener of this.listeners) {
        listener(snapshot);
      }
    }, 50);
  }

  public static clear(projectId?: string | null) {
    if (projectId) {
      this.events = this.events.filter(event => event.context?.project !== projectId);
    } else {
      this.events = [];
    }
    this.scheduleNotify();
  }
}