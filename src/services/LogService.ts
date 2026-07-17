export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'system';

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: number;
}

export type LogSubscriber = (logs: LogEntry[]) => void;

class LogServiceImpl {
  private logs: LogEntry[] = [];
  private subscribers: Set<LogSubscriber> = new Set();
  private maxLogs = 200; // Prevent memory leak

  addLog(level: LogLevel, message: string) {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      level,
      message,
      timestamp: Date.now()
    };
    
    this.logs.push(entry);
    
    if (this.logs.length > this.maxLogs) {
      this.logs.shift(); // Remove oldest
    }
    
    this.notifySubscribers();
  }

  clearLogs() {
    this.logs = [];
    this.notifySubscribers();
  }

  getLogs() {
    return this.logs;
  }

  subscribe(callback: LogSubscriber) {
    this.subscribers.add(callback);
    // Notify immediately with current state
    callback(this.logs);
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers() {
    this.subscribers.forEach(sub => sub(this.logs));
  }
}

export const LogService = new LogServiceImpl();
