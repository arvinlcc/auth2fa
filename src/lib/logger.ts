export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  timestamp: Date;
}

interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
}

class Logger {
  private config: LoggerConfig;
  private logHistory: LogEntry[] = [];
  private maxHistorySize = 100;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      minLevel: config?.minLevel ?? LogLevel.INFO,
      enableConsole: config?.enableConsole ?? true,
    };
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>) {
    if (level < this.config.minLevel) return;

    const entry: LogEntry = {
      level,
      message,
      context: this.sanitizeContext(context),
      timestamp: new Date(),
    };

    // Add to history
    this.logHistory.push(entry);
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }

    // Console output
    if (this.config.enableConsole) {
      const levelName = LogLevel[entry.level];
      const prefix = `[${levelName}] ${entry.timestamp.toISOString()}`;

      switch (entry.level) {
        case LogLevel.DEBUG:
          console.debug(prefix, entry.message, entry.context || '');
          break;
        case LogLevel.INFO:
          console.info(prefix, entry.message, entry.context || '');
          break;
        case LogLevel.WARN:
          console.warn(prefix, entry.message, entry.context || '');
          break;
        case LogLevel.ERROR:
          console.error(prefix, entry.message, entry.context || '');
          break;
      }
    }
  }

  private sanitizeContext(context?: Record<string, any>): Record<string, any> | undefined {
    if (!context) return undefined;

    const sanitized = { ...context };
    const sensitiveKeys = ['secret', 'secretKey', 'secret_key', 'password', 'token'];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        const value = sanitized[key];
        if (typeof value === 'string' && value.length > 8) {
          sanitized[key] = `${value.slice(0, 4)}***${value.slice(-4)}`;
        } else {
          sanitized[key] = '***';
        }
      }
    }

    return sanitized;
  }

  debug(message: string, context?: Record<string, any>) {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, any>) {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, any>) {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: Record<string, any>) {
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Get log history (useful for debugging)
   */
  getHistory(): LogEntry[] {
    return [...this.logHistory];
  }

  /**
   * Clear log history
   */
  clearHistory() {
    this.logHistory = [];
  }
}

/**
 * Global logger instance
 *
 * In development mode, logs at DEBUG level and above.
 * In production, logs at INFO level and above.
 */
export const logger = new Logger({
  minLevel: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.INFO,
  enableConsole: true,
});

// Expose logger to window in development for debugging
if (import.meta.env.DEV) {
  (window as any).logger = logger;
}
